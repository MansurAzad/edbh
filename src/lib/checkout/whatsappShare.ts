/**
 * @file whatsappShare.ts
 * @description Builds a Bengali order-receipt message and opens WhatsApp with
 * the message pre-filled to the business number. Called immediately after a
 * successful order placement on the checkout page.
 */

import type { CartItem } from "@/contexts/CartContext";
import type { CheckoutShippingInfo, PaymentMethodId } from "@/lib/checkout/types";

/** Business WhatsApp number (same as WhatsAppOrderButton). */
export const BUSINESS_WHATSAPP = "8801845853634";

interface BuildOrderReceiptParams {
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

const paymentLabel: Record<PaymentMethodId, string> = {
  cod: "সম্পূর্ণ ক্যাশ অন ডেলিভারি",
  advance_cod: "অ্যাডভান্স + COD",
  bkash: "bKash",
  nagad: "Nagad",
};

/**
 * Build a plaintext Bengali receipt suitable for a WhatsApp message.
 * First product image URL is placed on its own line so WhatsApp auto-previews it.
 */
export function buildOrderReceiptText(p: BuildOrderReceiptParams): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const trackUrl = `${origin}/order-tracking?id=${p.orderId}`;
  const shortId = p.orderId.slice(0, 8).toUpperCase();

  const firstImage = p.items[0]?.product?.image_url || p.items[0]?.product?.images?.[0];

  const lines: string[] = [];
  lines.push(`🛍️ *নতুন অর্ডার* — #${shortId}`);
  lines.push("");
  lines.push(`👤 নাম: ${p.shippingInfo.fullName}`);
  lines.push(`📞 মোবাইল: ${p.shippingInfo.phone}`);
  lines.push(`📍 ঠিকানা: ${p.shippingInfo.address}`);
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

/** Open WhatsApp with the receipt message to the business number. */
export function shareOrderToWhatsApp(params: BuildOrderReceiptParams): void {
  const text = buildOrderReceiptText(params);
  const url = `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(text)}`;
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
