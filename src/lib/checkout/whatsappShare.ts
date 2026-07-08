/**
 * @file whatsappShare.ts
 * @description Builds a Bengali order-receipt for WhatsApp and dispatches it
 * through one of two channels:
 *   1. **Cloud API** (`whatsapp-send` edge function) when Meta WhatsApp
 *      Business credentials are configured. This returns a real
 *      `wa_message_id` that the `whatsapp-webhook` delivery-status callback
 *      updates to `sent | delivered | read | failed`.
 *   2. **wa.me click-to-chat** fallback when the Cloud API is not available
 *      or explicitly opted out — pre-fills the receipt in the WhatsApp app
 *      and records a heuristic `opened / blocked / failed` status.
 *
 * Every attempt is persisted to:
 *   • `orders` (latest status snapshot)
 *   • `whatsapp_share_events` (append-only audit trail with attempt_variant,
 *     payload_snapshot, wa_message_id, delivery_status)
 */

import type { CartItem } from "@/contexts/CartContext";
import type { CheckoutShippingInfo, PaymentMethodId } from "@/lib/checkout/types";
import { supabase } from "@/integrations/supabase/client";

export const BUSINESS_WHATSAPP = "8801845853634";

export type WhatsAppShareStatus = "opened" | "blocked" | "failed" | "retried" | "queued";
export type WhatsAppShareActor = "customer" | "admin" | "system";
export type WhatsAppDeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed";
export type WhatsAppAttemptVariant = "primary" | "fallback_short" | "fallback_plain";

export interface WhatsAppShareEvent {
  id: string;
  order_id: string;
  status: WhatsAppShareStatus;
  error: string | null;
  actor: WhatsAppShareActor;
  created_at: string;
  wa_message_id?: string | null;
  delivery_status?: WhatsAppDeliveryStatus | null;
  delivery_updated_at?: string | null;
  attempt_variant?: WhatsAppAttemptVariant | null;
  payload_snapshot?: { text?: string; image_url?: string | null; images?: string[] } | null;
}

export interface OrderReceipt {
  orderId: string;
  items: CartItem[];
  shippingInfo: CheckoutShippingInfo;
  subtotal: number;
  discountAmount: number;
  shippingCost: number;
  finalTotal: number;
  selectedPayment: PaymentMethodId;
  advanceAmount?: number;
  transactionId?: string;
  paymentPhone?: string;
  deliveryNotes?: string;
}

/** Structured payload returned by the builder — ready to preview or send. */
export interface WhatsAppPayload {
  /** Full Bengali receipt text (used both for preview and wa.me `?text=`). */
  text: string;
  /** Shortened variant — used when the primary attempt is blocked. */
  shortText: string;
  /** Plain no-links variant — final fallback. */
  plainText: string;
  /** Every product image URL, in item order. First is the "primary" thumb. */
  imageUrls: string[];
  /** Destination WhatsApp number (E.164, no plus). */
  phone: string;
  /** Deep link for wa.me click-to-chat fallback. */
  waMeUrl: string;
  meta: {
    orderId: string;
    shortId: string;
    customer: string;
    mobile: string;
    address: string;
    itemCount: number;
    total: number;
  };
}

export interface ShareResult {
  status: WhatsAppShareStatus;
  error?: string;
  url: string;
  timestamp: string;
  actor: WhatsAppShareActor;
  eventId?: string;
  waMessageId?: string | null;
  variant: WhatsAppAttemptVariant;
  channel: "cloud_api" | "wa_me";
}

const paymentLabel: Record<PaymentMethodId, string> = {
  cod: "সম্পূর্ণ ক্যাশ অন ডেলিভারি",
  advance_cod: "অ্যাডভান্স + COD",
  bkash: "bKash",
  nagad: "Nagad",
};

/**
 * Build the full structured WhatsApp payload from an OrderReceipt.
 * Always includes: full name, mobile, complete address, per-item sizes,
 * per-item product image thumbnail links, totals.
 */
export function buildWhatsAppPayload(p: OrderReceipt): WhatsAppPayload {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const trackUrl = `${origin}/order-tracking?id=${p.orderId}`;
  const shortId = p.orderId.slice(0, 8).toUpperCase();
  const imageUrls = p.items
    .map((it) => it.product?.image_url)
    .filter((u): u is string => !!u);

  const fullAddress = [p.shippingInfo.address, p.shippingInfo.city, p.shippingInfo.district, p.shippingInfo.postalCode]
    .filter(Boolean)
    .join(", ");

  const lines: string[] = [];
  lines.push(`🛍️ *নতুন অর্ডার* — #${shortId}`);
  lines.push("");
  lines.push(`👤 নাম: ${p.shippingInfo.fullName}`);
  lines.push(`📞 মোবাইল: ${p.shippingInfo.phone}`);
  lines.push(`📍 ঠিকানা: ${fullAddress}`);
  if (p.deliveryNotes) lines.push(`📝 নোট: ${p.deliveryNotes}`);
  lines.push("");
  lines.push("*প্রোডাক্ট বিবরণ:*");
  p.items.forEach((it, idx) => {
    const price = it.product.sale_price || it.product.price;
    const parts = [`${idx + 1}. ${it.product.name}`];
    if (it.size) parts.push(`সাইজ: ${it.size}`);
    if (it.color) parts.push(`রঙ: ${it.color}`);
    parts.push(`পরিমাণ: ${it.quantity}`);
    parts.push(`দাম: ৳${(price * it.quantity).toLocaleString()}`);
    lines.push(parts.join(" | "));
    if (it.product?.image_url) {
      lines.push(`   🖼️ ${it.product.image_url}`);
    }
  });
  lines.push("");
  lines.push(`সাব-টোটাল: ৳${p.subtotal.toLocaleString()}`);
  if (p.discountAmount > 0) lines.push(`ডিসকাউন্ট: -৳${p.discountAmount.toLocaleString()}`);
  lines.push(`ডেলিভারি চার্জ: ৳${p.shippingCost.toLocaleString()}`);
  lines.push(`*মোট: ৳${p.finalTotal.toLocaleString()}*`);
  lines.push("");
  lines.push(`💳 পেমেন্ট: ${paymentLabel[p.selectedPayment] || p.selectedPayment}`);
  if (p.selectedPayment === "advance_cod" && p.advanceAmount) {
    lines.push(`অ্যাডভান্স: ৳${p.advanceAmount.toLocaleString()}`);
    lines.push(`ডেলিভারিতে দিতে হবে: ৳${(p.finalTotal - p.advanceAmount).toLocaleString()}`);
  }
  if (p.transactionId) lines.push(`TxID: ${p.transactionId}`);
  if (p.paymentPhone) lines.push(`পেমেন্ট নং: ${p.paymentPhone}`);
  lines.push("");
  lines.push(`🧾 রিসিট: ${trackUrl}`);

  const text = lines.join("\n");

  // Shortened fallback — used when the primary attempt returns a block/limit
  // error. Trims image links and product-line detail but keeps the essentials
  // an admin needs to fulfil the order.
  const shortLines = [
    `🛍️ অর্ডার #${shortId}`,
    `${p.shippingInfo.fullName} — ${p.shippingInfo.phone}`,
    fullAddress,
    `আইটেম: ${p.items.length}, মোট: ৳${p.finalTotal.toLocaleString()}`,
    `রিসিট: ${trackUrl}`,
  ];
  const shortText = shortLines.join("\n");

  // Plain no-links final fallback — some numbers get rate-limited on messages
  // that contain URLs. This version strips all URLs.
  const plainText = shortLines
    .filter((l) => !l.startsWith("রিসিট:"))
    .concat([`Track ID: ${shortId}`])
    .join("\n");

  const waMeUrl = `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(text)}`;

  return {
    text,
    shortText,
    plainText,
    imageUrls,
    phone: BUSINESS_WHATSAPP,
    waMeUrl,
    meta: {
      orderId: p.orderId,
      shortId,
      customer: p.shippingInfo.fullName,
      mobile: p.shippingInfo.phone,
      address: fullAddress,
      itemCount: p.items.length,
      total: p.finalTotal,
    },
  };
}

/** Back-compat alias — same string the original builder produced. */
export function buildOrderReceiptText(p: OrderReceipt): string {
  return buildWhatsAppPayload(p).text;
}

function pickText(payload: WhatsAppPayload, variant: WhatsAppAttemptVariant): string {
  if (variant === "fallback_short") return payload.shortText;
  if (variant === "fallback_plain") return payload.plainText;
  return payload.text;
}

function pickWaMe(payload: WhatsAppPayload, variant: WhatsAppAttemptVariant): string {
  const text = pickText(payload, variant);
  return `https://wa.me/${payload.phone}?text=${encodeURIComponent(text)}`;
}

/**
 * Send via Meta WhatsApp Business Cloud API (through the `whatsapp-send`
 * edge function). Returns `{ waMessageId }` on success.
 */
async function sendViaCloudApi(
  orderId: string,
  payload: WhatsAppPayload,
  variant: WhatsAppAttemptVariant,
): Promise<{ waMessageId: string }> {
  const body = {
    orderId,
    to: payload.phone,
    text: pickText(payload, variant),
    imageUrl: variant === "primary" ? payload.imageUrls[0] ?? null : null,
    variant,
  };
  const { data, error } = await supabase.functions.invoke("whatsapp-send", { body });
  if (error) throw new Error(error.message || "whatsapp-send failed");
  const wid = (data as { wa_message_id?: string } | null)?.wa_message_id;
  if (!wid) throw new Error("whatsapp-send returned no message id");
  return { waMessageId: wid };
}

export interface ShareOptions {
  isRetry?: boolean;
  actor?: WhatsAppShareActor;
  /** Which text variant to send. Escalation ladder controls this. */
  variant?: WhatsAppAttemptVariant;
  /**
   * When true, skip Cloud API even if configured — used by the "Send anyway"
   * button in the preview when the admin wants the wa.me path.
   */
  forceWaMe?: boolean;
}

/**
 * Opens WhatsApp with the pre-filled receipt (or dispatches through the
 * Cloud API when available) and persists the attempt.
 */
export async function shareOrderToWhatsApp(
  params: OrderReceipt,
  opts: ShareOptions = {},
): Promise<ShareResult> {
  const payload = buildWhatsAppPayload(params);
  const variant: WhatsAppAttemptVariant = opts.variant ?? "primary";
  const actor: WhatsAppShareActor = opts.actor ?? "customer";
  const timestamp = new Date().toISOString();
  const waMeUrl = pickWaMe(payload, variant);

  let status: WhatsAppShareStatus = "opened";
  let error: string | undefined;
  let waMessageId: string | null = null;
  let channel: ShareResult["channel"] = "wa_me";
  let deliveryStatus: WhatsAppDeliveryStatus | null = null;

  // Try Cloud API first (real delivery receipts) unless caller opted out.
  if (!opts.forceWaMe) {
    try {
      const res = await sendViaCloudApi(params.orderId, payload, variant);
      waMessageId = res.waMessageId;
      status = opts.isRetry ? "retried" : "queued";
      channel = "cloud_api";
      deliveryStatus = "sent";
    } catch (e) {
      // Cloud API not configured or upstream error — fall through to wa.me.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/not configured|META_WHATSAPP/i.test(msg)) {
        console.warn("whatsapp-send failed, falling back to wa.me:", msg);
      }
    }
  }

  if (channel === "wa_me") {
    try {
      if (typeof window === "undefined") {
        status = "failed";
        error = "SSR context — window unavailable";
      } else {
        const ua = navigator.userAgent || "";
        const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(ua);
        if (isMobile) {
          const a = document.createElement("a");
          a.href = waMeUrl;
          a.target = "_blank";
          a.rel = "noopener,noreferrer";
          document.body.appendChild(a);
          a.click();
          a.remove();
          status = opts.isRetry ? "retried" : "opened";
        } else {
          const win = window.open(waMeUrl, "_blank", "noopener,noreferrer");
          if (!win || win.closed || typeof win.closed === "undefined") {
            status = "blocked";
            error = "ব্রাউজার popup ব্লক করেছে — নিচের বাটনে ক্লিক করে ম্যানুয়ালি খুলুন";
          } else if (opts.isRetry) {
            status = "retried";
          }
        }
      }
    } catch (e: unknown) {
      status = "failed";
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // 1. Latest status on the order row
  try {
    await supabase
      .from("orders")
      .update({
        whatsapp_share_status: status,
        whatsapp_shared_at: timestamp,
        whatsapp_share_error: error ?? null,
      })
      .eq("id", params.orderId);
  } catch (e) {
    console.warn("Failed to persist WhatsApp share status:", e);
  }

  // 2. Append to the event log with snapshot + variant + wa_message_id
  let eventId: string | undefined;
  try {
    const { data } = await supabase
      .from("whatsapp_share_events")
      .insert({
        order_id: params.orderId,
        status,
        error: error ?? null,
        actor,
        wa_message_id: waMessageId,
        delivery_status: deliveryStatus,
        delivery_updated_at: deliveryStatus ? timestamp : null,
        attempt_variant: variant,
        payload_snapshot: {
          text: pickText(payload, variant),
          image_url: payload.imageUrls[0] ?? null,
          images: payload.imageUrls,
        },
      })
      .select("id")
      .maybeSingle();
    eventId = data?.id;
  } catch (e) {
    console.warn("Failed to log WhatsApp share event:", e);
  }

  return {
    status,
    error,
    url: waMeUrl,
    timestamp,
    actor,
    eventId,
    waMessageId,
    variant,
    channel,
  };
}

/** Fetches the full audit trail of share attempts for a single order. */
export async function fetchWhatsAppShareEvents(
  orderId: string,
): Promise<WhatsAppShareEvent[]> {
  const { data, error } = await supabase
    .from("whatsapp_share_events")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Failed to fetch share events:", error);
    return [];
  }
  return (data ?? []) as WhatsAppShareEvent[];
}
