/**
 * @file adminWhatsAppRetry.ts
 * @description Admin helper: rebuild an order's receipt from Supabase rows
 * and re-attempt the WhatsApp share. Logs the attempt with actor='admin'.
 */

import { supabase } from "@/integrations/supabase/client";
import { shareOrderToWhatsApp, type ShareResult } from "@/lib/checkout/whatsappShare";
import type { PaymentMethodId } from "@/lib/checkout/types";
import type { CartItem } from "@/contexts/CartContext";

/**
 * Fetches an order + its items and re-attempts the WhatsApp receipt share.
 * Records the attempt in whatsapp_share_events with actor='admin'.
 */
export async function retryWhatsAppShareForOrder(orderId: string): Promise<ShareResult> {
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

  // Build minimal CartItem-shaped payload for buildOrderReceiptText.
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
      image_url: "",
      category: "",
    },
  })) as unknown as CartItem[];

  const subtotal = cartLike.reduce(
    (sum, it) => sum + Number(it.product.price) * it.quantity,
    0,
  );
  const finalTotal = Number(order.total) || subtotal;
  const shippingCost = Math.max(0, finalTotal - subtotal);

  return shareOrderToWhatsApp(
    {
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
    },
    { isRetry: true, actor: "admin" },
  );
}
