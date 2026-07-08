/**
 * @file whatsappShare.ts
 * @description Builds a Bengali order-receipt message, opens WhatsApp with
 * the message pre-filled to the business number, and persists BOTH:
 *  1. The latest status on `orders` (whatsapp_share_status, ..._at, ..._error)
 *  2. A per-attempt row in `whatsapp_share_events` (audit trail for admin).
 */

import type { CartItem } from "@/contexts/CartContext";
import type { CheckoutShippingInfo, PaymentMethodId } from "@/lib/checkout/types";
import { supabase } from "@/integrations/supabase/client";

export const BUSINESS_WHATSAPP = "8801845853634";

export type WhatsAppShareStatus = "opened" | "blocked" | "failed" | "retried";
export type WhatsAppShareActor = "customer" | "admin" | "system";

export interface WhatsAppShareEvent {
  id: string;
  order_id: string;
  status: WhatsAppShareStatus;
  error: string | null;
  actor: WhatsAppShareActor;
  created_at: string;
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

export interface ShareResult {
  status: WhatsAppShareStatus;
  error?: string;
  url: string;
  /** Timestamp of the attempt (client clock). */
  timestamp: string;
  actor: WhatsAppShareActor;
}

const paymentLabel: Record<PaymentMethodId, string> = {
  cod: "সম্পূর্ণ ক্যাশ অন ডেলিভারি",
  advance_cod: "অ্যাডভান্স + COD",
  bkash: "bKash",
  nagad: "Nagad",
};

export function buildOrderReceiptText(p: OrderReceipt): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const trackUrl = `${origin}/order-tracking?id=${p.orderId}`;
  const shortId = p.orderId.slice(0, 8).toUpperCase();
  const firstImage = p.items[0]?.product?.image_url;

  const lines: string[] = [];
  lines.push(`🛍️ *নতুন অর্ডার* — #${shortId}`);
  lines.push("");
  lines.push(`👤 নাম: ${p.shippingInfo.fullName}`);
  lines.push(`📞 মোবাইল: ${p.shippingInfo.phone}`);
  lines.push(`📍 ঠিকানা: ${p.shippingInfo.address}`);
  if (p.shippingInfo.city) lines.push(`🏙️ শহর: ${p.shippingInfo.city}`);
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
  if (firstImage) {
    lines.push("");
    lines.push(`📷 প্রোডাক্ট: ${firstImage}`);
  }
  return lines.join("\n");
}

/**
 * Opens WhatsApp with the pre-filled receipt and persists the attempt to:
 *  - `orders` (latest status)
 *  - `whatsapp_share_events` (append-only log)
 */
export async function shareOrderToWhatsApp(
  params: OrderReceipt,
  opts: { isRetry?: boolean; actor?: WhatsAppShareActor } = {},
): Promise<ShareResult> {
  const text = buildOrderReceiptText(params);
  const url = `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(text)}`;
  const actor: WhatsAppShareActor = opts.actor ?? "customer";
  const timestamp = new Date().toISOString();

  let status: WhatsAppShareStatus = "opened";
  let error: string | undefined;

  try {
    if (typeof window === "undefined") {
      status = "failed";
      error = "SSR context — window unavailable";
    } else {
      // Mobile vs desktop split:
      //   • Mobile (Android/iOS): async popup.open() is unreliable AND desktop-
      //     style popup blockers kill it; wa.me is a system intent, so an
      //     anchor click launches the WhatsApp app directly with no popup
      //     prompt. This is the reliable path the user requested for phones.
      //   • Desktop: try window.open first. Popup blockers usually reject it
      //     because we're outside a direct user gesture (order insert is
      //     async), so we detect the block and surface a manual retry button
      //     — that reshare click IS a user gesture and always succeeds.
      const ua = navigator.userAgent || "";
      const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(ua);

      if (isMobile) {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener,noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
        status = opts.isRetry ? "retried" : "opened";
      } else {
        const win = window.open(url, "_blank", "noopener,noreferrer");
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

  // 2. Append to the event log
  try {
    await supabase.from("whatsapp_share_events").insert({
      order_id: params.orderId,
      status,
      error: error ?? null,
      actor,
    });
  } catch (e) {
    console.warn("Failed to log WhatsApp share event:", e);
  }

  return { status, error, url, timestamp, actor };
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
