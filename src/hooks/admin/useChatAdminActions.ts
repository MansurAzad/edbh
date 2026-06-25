/**
 * @file useChatAdminActions.ts
 * @description Hook that encapsulates every admin-initiated mutation on a chat thread.
 *
 * All mutations share a common pattern:
 *   1. Set `saving = true` (disables UI buttons).
 *   2. Perform Supabase write(s).
 *   3. Show a Bengali toast on success/failure.
 *   4. Call `onUpdate()` so the parent can re-fetch / refresh state.
 *   5. Set `saving = false` in the `finally` block.
 *
 * Admin message convention:
 *   Every message injected by this hook into `chat_histories.messages[]` uses
 *   `role: "assistant"` with a "🛡️ **অ্যাডমিন রিপ্লাই:**" prefix so the chat UI
 *   (ChatDetail) can detect and visually distinguish admin messages from AI ones.
 *
 * Bengali UI strings used in toasts:
 *   রিপ্লাই পাঠানো হয়েছে ✅         = Reply sent
 *   রিপ্লাই পাঠাতে সমস্যা হয়েছে    = Problem sending reply
 *   {n}টি প্রোডাক্ট পাঠানো হয়েছে ✅ = {n} products sent
 *   অর্ডার তৈরি ও কনফার্ম হয়েছে ✅  = Order created and confirmed
 *   স্ট্যাটাস আপডেট: {label}        = Status updated: {label}
 *   ট্র্যাকিং তথ্য আপডেট হয়েছে 🚚   = Tracking info updated
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getStatusBengali, type ChatHistory, type ChatMessage } from "@/lib/admin/chatHelpers";

/**
 * A product as it sits in the admin cart.
 * Extends the `products` DB row with UI-level quantity and variant selections.
 */
interface SelectedProduct {
  id: string;
  name: string;
  price: number;
  /** null means no active sale price. */
  sale_price: number | null;
  stock: number;
  /** Optional array of size strings from the products.sizes column. */
  sizes?: string[];
  /** Optional array of colour strings from the products.colors column. */
  colors?: string[];
  /** Number of units chosen by the admin (default 1). */
  quantity: number;
  /** The size variant selected in the cart dropdown ("" = none). */
  selectedSize?: string;
  /** The colour variant selected in the cart dropdown ("" = none). */
  selectedColor?: string;
}

/** Shipping and payment fields collected in the order creation dialog. */
interface OrderForm {
  shipping_address: string;
  shipping_city: string;
  shipping_phone: string;
  /** Payment method key: "cod" | "bkash" | "nagad" | "rocket" */
  payment_method: string;
  notes: string;
}

/**
 * useChatAdminActions
 *
 * Returns a set of async action functions and a `saving` boolean that
 * components use to disable buttons during in-flight requests.
 *
 * @param chat     - The chat record being acted upon.
 * @param onUpdate - Callback fired after every successful mutation so the
 *                   parent list can re-fetch.
 */
export function useChatAdminActions(chat: ChatHistory, onUpdate: () => void) {
  /** True while any async mutation is in flight — used to disable UI. */
  const [saving, setSaving] = useState(false);

  /**
   * Low-level helper: appends a new message to the chat's messages array
   * and optionally merges extra columns (e.g. order_id, order_status).
   *
   * This does a full array replace (`updatedMessages`) rather than a Postgres
   * array append because jsonb column updates require the full new value.
   *
   * @param newMessage - The chat message object to append.
   * @param extra      - Additional columns to update in the same write.
   * @throws Supabase error on failure.
   */
  const appendMessage = async (newMessage: ChatMessage, extra: Record<string, unknown> = {}) => {
    const updatedMessages = [...chat.messages, newMessage];
    const { error } = await supabase
      .from("chat_histories")
      .update({
        messages: updatedMessages as any, // jsonb column — cast required.
        updated_at: new Date().toISOString(),
        ...extra,
      })
      .eq("id", chat.id);
    if (error) throw error;
  };

  /**
   * Sends a plain-text admin reply into the chat thread.
   * The message is prefixed with "🛡️ **অ্যাডমিন রিপ্লাই:**" so ChatDetail
   * can apply the distinct accent bubble style.
   *
   * @param replyText - The admin's reply text (trimmed before use).
   * @returns `true` on success, `false` on failure.
   */
  const sendAdminReply = async (replyText: string) => {
    if (!replyText.trim()) return;
    setSaving(true);
    try {
      const newMessage: ChatMessage = {
        role: "assistant",
        // Sentinel prefix "🛡️ **অ্যাডমিন রিপ্লাই:**" detected in ChatDetail
        // for visual distinction. (অ্যাডমিন রিপ্লাই = Admin Reply)
        content: `🛡️ **অ্যাডমিন রিপ্লাই:**\n\n${replyText.trim()}`,
        timestamp: new Date().toISOString(),
      };
      await appendMessage(newMessage);
      toast({ title: "রিপ্লাই পাঠানো হয়েছে ✅" }); // "Reply sent"
      onUpdate();
      return true;
    } catch {
      toast({ title: "রিপ্লাই পাঠাতে সমস্যা হয়েছে", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Sends a formatted Markdown product catalogue message into the chat.
   * Also updates `chat_histories.products_discussed` with the new products
   * so they appear as badges in ChatDetail.
   *
   * Message format (Markdown):
   *   🛡️ **অ্যাডমিন রিপ্লাই:**
   *   📦 **আপনার জন্য প্রোডাক্ট সিলেকশন:**
   *   **1. Product Name**
   *      💰 মূল্য: ৳2500 ~~৳3000~~   (sale / original price with strikethrough)
   *      📏 সাইজ: M                   (if selected)
   *      🎨 কালার: Black              (if selected)
   *      📊 স্টক: 20টি আছে ✅          (or স্টক আউট ❌)
   *
   * @param products - Cart items to send.
   * @param total    - Pre-computed grand total (sale_price || price) × qty.
   * @returns `true` on success, `false` on failure.
   */
  const sendProductsToChat = async (products: SelectedProduct[], total: number) => {
    if (products.length === 0) return false;
    setSaving(true);
    try {
      // Build Markdown string for each product in the cart.
      let content = "🛡️ **অ্যাডমিন রিপ্লাই:**\n\n📦 **আপনার জন্য প্রোডাক্ট সিলেকশন:**\n\n";
      products.forEach((p, i) => {
        const price = p.sale_price || p.price;
        content += `**${i + 1}. ${p.name}**\n`;
        content += `   💰 মূল্য: ৳${price.toLocaleString()}`;
        // Show strikethrough original price when there is an active sale.
        if (p.sale_price && p.sale_price < p.price) content += ` ~~৳${p.price.toLocaleString()}~~`;
        content += `\n`;
        if (p.selectedSize) content += `   📏 সাইজ: ${p.selectedSize}\n`;  // সাইজ = Size
        if (p.selectedColor) content += `   🎨 কালার: ${p.selectedColor}\n`; // কালার = Color
        // স্টক আউট = Stock out; আছে = available
        content += `   📊 স্টক: ${p.stock > 0 ? `${p.stock}টি আছে ✅` : "স্টক আউট ❌"}\n\n`;
      });
      if (products.length > 1) content += `💵 **সর্বমোট: ৳${total.toLocaleString()}**\n`; // সর্বমোট = Grand total
      content += `\nঅর্ডার করতে চাইলে জানান! 🛒`; // "Let us know if you want to order!"

      // Append new product refs to the existing products_discussed array.
      const productsDiscussed = products.map((p) => ({
        name: p.name, price: p.price, sale_price: p.sale_price,
        quantity: p.quantity, size: p.selectedSize, color: p.selectedColor,
      }));

      await appendMessage(
        { role: "assistant", content, timestamp: new Date().toISOString() },
        { products_discussed: [...(chat.products_discussed || []), ...productsDiscussed] as any },
      );

      toast({ title: `${products.length}টি প্রোডাক্ট পাঠানো হয়েছে ✅` });
      onUpdate();
      return true;
    } catch {
      toast({ title: "সমস্যা হয়েছে", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Creates a real guest order from the chat cart and shipping form.
   *
   * DB writes (in order):
   *   1. INSERT into `orders` — guest order (user_id: null, is_guest: true).
   *   2. INSERT into `order_items` — one row per cart product.
   *   3. UPDATE `chat_histories` — attaches order_id, order_status, order_total
   *      and appends a confirmation message.
   *
   * @param products - Cart items.
   * @param form     - Shipping / payment form values.
   * @param total    - Grand total (pre-computed).
   * @returns `true` on success, `false` on failure.
   */
  const createOrderFromChat = async (products: SelectedProduct[], form: OrderForm, total: number) => {
    if (products.length === 0 || !form.shipping_phone || !form.shipping_address) return false;
    setSaving(true);
    try {
      // Step 1: insert the parent order row.
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: null,
          is_guest: true,
          guest_name: chat.customer_name || "চ্যাট কাস্টমার", // "Chat customer"
          guest_email: null,
          shipping_address: form.shipping_address,
          shipping_city: form.shipping_city || "ঢাকা", // Default city: Dhaka
          shipping_phone: form.shipping_phone,
          payment_method: form.payment_method,
          total,
          notes: form.notes || `চ্যাট থেকে অর্ডার (Chat ID: ${chat.id.slice(0, 8)})`,
          status: "pending",
        } as any)
        .select("id")
        .single();

      if (orderError) throw orderError;

      // Step 2: insert order_items — one row per cart item.
      const orderItems = products.map((p) => ({
        order_id: order.id,
        product_id: p.id,
        product_name: p.name,
        quantity: p.quantity || 1,
        price: p.sale_price || p.price, // Effective price at time of order.
        size: p.selectedSize || null,
        color: p.selectedColor || null,
      }));
      await supabase.from("order_items").insert(orderItems);

      // Step 3: append confirmation message and link order to chat.
      const confirmMsg: ChatMessage = {
        role: "assistant",
        content: `🛡️ **অ্যাডমিন রিপ্লাই:**\n\n✅ **অর্ডার কনফার্ম হয়েছে!**\n\n🆔 অর্ডার নং: **#${order.id.slice(0, 8).toUpperCase()}**\n💰 মোট: **৳${total.toLocaleString()}**\n📍 ঠিকানা: ${form.shipping_address}, ${form.shipping_city}\n📞 ফোন: ${form.shipping_phone}\n💳 পেমেন্ট: ${form.payment_method === "cod" ? "ক্যাশ অন ডেলিভারি" : form.payment_method}\n\n📦 **প্রোডাক্ট:**\n${products.map((p, i) => `${i + 1}. ${p.name} x${p.quantity || 1} — ৳${((p.sale_price || p.price) * (p.quantity || 1)).toLocaleString()}`).join("\n")}\n\nধন্যবাদ! আপনার অর্ডার শীঘ্রই প্রসেস করা হবে। 🎉`,
        timestamp: new Date().toISOString(),
      };
      await appendMessage(confirmMsg, {
        order_id: order.id,
        order_status: "pending",
        order_total: total,
      });

      toast({ title: "অর্ডার তৈরি ও কনফার্ম হয়েছে! ✅" }); // "Order created and confirmed!"
      onUpdate();
      return true;
    } catch (err: any) {
      toast({ title: `অর্ডার তৈরিতে সমস্যা: ${err.message}`, variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Updates the linked order's status and appends a customer-facing status
   * change notification to the chat thread.
   *
   * DB writes:
   *   1. UPDATE `orders` SET status = newStatus.
   *   2. UPDATE `chat_histories` via appendMessage (order_status + message).
   *
   * @param newStatus - Target status string ("confirmed" | "processing" | "shipped" | "delivered" | "cancelled").
   * @returns `true` on success, `false` on failure.
   */
  const updateOrderStatus = async (newStatus: string) => {
    if (!chat.order_id || !newStatus) return false;
    setSaving(true);
    try {
      await supabase.from("orders").update({ status: newStatus }).eq("id", chat.order_id);
      const statusMsg: ChatMessage = {
        role: "assistant",
        content: `🛡️ **অ্যাডমিন রিপ্লাই:**\n\n📋 **অর্ডার স্ট্যাটাস আপডেট:**\n\n🆔 #${chat.order_id.slice(0, 8).toUpperCase()}\n🔄 নতুন স্ট্যাটাস: **${getStatusBengali(newStatus)}**\n\n${newStatus === "shipped" ? "🚚 আপনার অর্ডার শিপ করা হয়েছে!" : newStatus === "delivered" ? "✅ আপনার অর্ডার ডেলিভারি সম্পন্ন!" : newStatus === "cancelled" ? "❌ অর্ডার বাতিল করা হয়েছে।" : "আপনার অর্ডার প্রসেস হচ্ছে।"}`,
        timestamp: new Date().toISOString(),
      };
      await appendMessage(statusMsg, { order_status: newStatus });
      toast({ title: `স্ট্যাটাস আপডেট: ${getStatusBengali(newStatus)}` });
      onUpdate();
      return true;
    } catch {
      toast({ title: "আপডেটে সমস্যা", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Saves tracking number + courier name to the linked order and auto-notifies
   * the customer via a chat message.  Also sets order status to "shipped".
   *
   * DB writes:
   *   1. UPDATE `orders` SET tracking_number, courier_name, status="shipped".
   *   2. UPDATE `chat_histories` via appendMessage (order_status + message).
   *
   * @param trackingNumber - The courier tracking ID string.
   * @param courierName    - Courier company name (e.g. "Pathao", "Steadfast").
   * @returns `true` on success, `false` on failure.
   */
  const updateTracking = async (trackingNumber: string, courierName: string) => {
    if (!chat.order_id || !trackingNumber) return false;
    setSaving(true);
    try {
      await supabase.from("orders").update({
        tracking_number: trackingNumber,
        courier_name: courierName || null,
        status: "shipped", // Setting tracking implies the order has shipped.
      }).eq("id", chat.order_id);

      const trackMsg: ChatMessage = {
        role: "assistant",
        content: `🛡️ **অ্যাডমিন রিপ্লাই:**\n\n🚚 **ট্র্যাকিং তথ্য:**\n\n🆔 অর্ডার: #${chat.order_id.slice(0, 8).toUpperCase()}\n📦 ট্র্যাকিং নং: **${trackingNumber}**${courierName ? `\n🏢 কুরিয়ার: **${courierName}**` : ""}\n\nআপনার অর্ডার শিপ করা হয়েছে! ডেলিভারি শীঘ্রই পৌঁছে যাবে। 📬`,
        timestamp: new Date().toISOString(),
      };
      await appendMessage(trackMsg, { order_status: "shipped" });
      toast({ title: "ট্র্যাকিং তথ্য আপডেট হয়েছে 🚚" }); // "Tracking info updated"
      onUpdate();
      return true;
    } catch {
      toast({ title: "আপডেটে সমস্যা", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    saving,
    sendAdminReply,
    sendProductsToChat,
    createOrderFromChat,
    updateOrderStatus,
    updateTracking,
  };
}

export type { SelectedProduct, OrderForm };
