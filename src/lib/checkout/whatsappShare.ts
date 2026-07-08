/**
 * @file whatsappShare.ts
 * @description Builds a Bengali order-receipt message and opens WhatsApp with
 * the message pre-filled to the business number. Also persists the share
 * attempt result to `orders.whatsapp_share_status` so admins can see whether
 * the customer's receipt was successfully forwarded.
 */

import type { CartItem } from "@/contexts/CartContext";
import type { CheckoutShippingInfo, PaymentMethodId } from "@/lib/checkout/types";
import { supabase } from "@/integrations/supabase/client";

/** Business WhatsApp number (same as WhatsAppOrderButton). */
export const BUSINESS_WHATSAPP = "8801845853634";

export type WhatsAppShareStatus = "opened" | "blocked" | "failed" | "retried";

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
 * Attempts to open WhatsApp with the pre-filled receipt and persists the
 * result to the order row. Returns a status the UI can display.
 */
export async function shareOrderToWhatsApp(
  params: OrderReceipt,
  opts: { isRetry?: boolean } = {},
): Promise<ShareResult> {
  const text = buildOrderReceiptText(params);
  const url = `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(text)}`;

  let status: WhatsAppShareStatus = "opened";
  let error: string | undefined;

  try {
    if (typeof window === "undefined") {
      status = "failed";
      error = "SSR context — window unavailable";
    } else {
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win || win.closed || typeof win.closed === "undefined") {
        status = "blocked";
        error = "ব্রাউজার popup ব্লক করেছে";
      } else if (opts.isRetry) {
        status = "retried";
      }
    }
  } catch (e: unknown) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }

  // Persist to DB (best-effort — never blocks the UI).
  try {
    await supabase
      .from("orders")
      .update({
        whatsapp_share_status: status,
        whatsapp_shared_at: new Date().toISOString(),
        whatsapp_share_error: error ?? null,
      })
      .eq("id", params.orderId);
  } catch (persistErr) {
    console.warn("Failed to persist WhatsApp share status:", persistErr);
  }

  return { status, error, url };
}
