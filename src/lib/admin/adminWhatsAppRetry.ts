/**
 * @file adminWhatsAppRetry.ts
 * @description Admin retry helper with **escalation ladder**:
 *   1. `primary` — full receipt + image + links (default)
 *   2. `fallback_short` — trimmed template (no per-item detail, no image)
 *   3. `fallback_plain` — text-only, no URLs (survives link-rate-limits)
 *
 * `retryWithEscalation(orderId)` picks the next variant automatically based
 * on the last attempt's status and error_reason.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  shareOrderToWhatsApp,
  type ShareResult,
  type WhatsAppAttemptVariant,
} from "@/lib/checkout/whatsappShare";
import type { PaymentMethodId } from "@/lib/checkout/types";
import type { CartItem } from "@/contexts/CartContext";

/** Error patterns that indicate the message content itself was rejected — we
 *  should downgrade the template, not just retry as-is. */
const RATE_LIMIT_RE = /rate|limit|throttle|132\d\d|429/i;
const BLOCKED_RE = /block|spam|template|policy|opt.?out/i;

async function loadReceiptParams(orderId: string) {
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) throw new Error(orderErr?.message || "Order not found");

  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("id, product_id, product_name, quantity, price, size, color")
    .eq("order_id", orderId);
  if (itemsErr) throw new Error(itemsErr.message);

  // Enrich with product image_url when we can find it.
  const productIds = Array.from(new Set((items ?? []).map(i => i.product_id).filter(Boolean))) as string[];
  const imageMap = new Map<string, string>();
  if (productIds.length) {
    const { data: prods } = await supabase
      .from("products")
      .select("id, image_url")
      .in("id", productIds);
    for (const p of prods ?? []) if (p.image_url) imageMap.set(p.id, p.image_url);
  }

  const cartLike: CartItem[] = (items ?? []).map((it) => ({
    id: it.id,
    product_id: it.product_id ?? "",
    quantity: it.quantity,
    size: it.size ?? null,
    color: it.color ?? null,
    product: {
      id: it.product_id ?? "",
      name: it.product_name,
      price: Number(it.price),
      sale_price: 0,
      image_url: it.product_id ? imageMap.get(it.product_id) ?? "" : "",
      category: "",
    },
  })) as unknown as CartItem[];

  const subtotal = cartLike.reduce(
    (sum, it) => sum + Number(it.product.price) * it.quantity, 0,
  );
  const finalTotal = Number(order.total) || subtotal;
  const shippingCost = Math.max(0, finalTotal - subtotal);

  return {
    orderId: order.id,
    items: cartLike,
    shippingInfo: {
      fullName: order.guest_name || "Customer",
      phone: order.shipping_phone,
      email: order.guest_email || "",
      address: order.shipping_address,
      city: order.shipping_city || "",
      district: "",
      postalCode: "",
    },
    subtotal,
    discountAmount: 0,
    shippingCost,
    finalTotal,
    selectedPayment: (order.payment_method as PaymentMethodId) || "cod",
    advanceAmount: Number(order.advance_amount) || undefined,
    transactionId: order.transaction_id || undefined,
    paymentPhone: order.payment_phone || undefined,
  };
}

/** Simple retry (primary variant) — kept for backwards compatibility. */
export async function retryWhatsAppShareForOrder(
  orderId: string,
  opts: { variant?: WhatsAppAttemptVariant } = {},
): Promise<ShareResult> {
  const params = await loadReceiptParams(orderId);
  return shareOrderToWhatsApp(params, {
    isRetry: true,
    actor: "admin",
    variant: opts.variant ?? "primary",
  });
}

/**
 * Picks the next variant based on the last attempt's outcome and dispatches.
 * Rules:
 *   • primary failed with rate/block/policy error → fallback_short
 *   • fallback_short still failed                → fallback_plain
 *   • fallback_plain still failed                → retry fallback_plain
 *   • primary succeeded                          → retry primary
 */
export async function retryWithEscalation(orderId: string): Promise<ShareResult> {
  const { data: last } = await supabase
    .from("whatsapp_share_events")
    .select("attempt_variant, status, error, delivery_status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastVariant = (last?.attempt_variant as WhatsAppAttemptVariant) ?? "primary";
  const lastFailed = last?.status === "blocked" || last?.status === "failed"
    || last?.delivery_status === "failed";
  const errText = last?.error ?? "";

  let next: WhatsAppAttemptVariant = lastVariant;
  if (lastFailed) {
    const looksBlocked = BLOCKED_RE.test(errText) || RATE_LIMIT_RE.test(errText)
      || last?.status === "blocked";
    if (lastVariant === "primary" && looksBlocked) next = "fallback_short";
    else if (lastVariant === "fallback_short") next = "fallback_plain";
    else if (lastVariant === "fallback_plain") next = "fallback_plain";
    else next = lastVariant; // failed for a non-content reason — same variant
  }

  return retryWhatsAppShareForOrder(orderId, { variant: next });
}
