import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getStatusBengali, type ChatHistory, type ChatMessage } from "@/lib/admin/chatHelpers";

interface SelectedProduct {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  stock: number;
  sizes?: string[];
  colors?: string[];
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
}

interface OrderForm {
  shipping_address: string;
  shipping_city: string;
  shipping_phone: string;
  payment_method: string;
  notes: string;
}

export function useChatAdminActions(chat: ChatHistory, onUpdate: () => void) {
  const [saving, setSaving] = useState(false);

  const appendMessage = async (newMessage: ChatMessage, extra: Record<string, unknown> = {}) => {
    const updatedMessages = [...chat.messages, newMessage];
    const { error } = await supabase
      .from("chat_histories")
      .update({
        messages: updatedMessages as any,
        updated_at: new Date().toISOString(),
        ...extra,
      })
      .eq("id", chat.id);
    if (error) throw error;
  };

  const sendAdminReply = async (replyText: string) => {
    if (!replyText.trim()) return;
    setSaving(true);
    try {
      const newMessage: ChatMessage = {
        role: "assistant",
        content: `🛡️ **অ্যাডমিন রিপ্লাই:**\n\n${replyText.trim()}`,
        timestamp: new Date().toISOString(),
      };
      await appendMessage(newMessage);
      toast({ title: "রিপ্লাই পাঠানো হয়েছে ✅" });
      onUpdate();
      return true;
    } catch {
      toast({ title: "রিপ্লাই পাঠাতে সমস্যা হয়েছে", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const sendProductsToChat = async (products: SelectedProduct[], total: number) => {
    if (products.length === 0) return false;
    setSaving(true);
    try {
      let content = "🛡️ **অ্যাডমিন রিপ্লাই:**\n\n📦 **আপনার জন্য প্রোডাক্ট সিলেকশন:**\n\n";
      products.forEach((p, i) => {
        const price = p.sale_price || p.price;
        content += `**${i + 1}. ${p.name}**\n`;
        content += `   💰 মূল্য: ৳${price.toLocaleString()}`;
        if (p.sale_price && p.sale_price < p.price) content += ` ~~৳${p.price.toLocaleString()}~~`;
        content += `\n`;
        if (p.selectedSize) content += `   📏 সাইজ: ${p.selectedSize}\n`;
        if (p.selectedColor) content += `   🎨 কালার: ${p.selectedColor}\n`;
        content += `   📊 স্টক: ${p.stock > 0 ? `${p.stock}টি আছে ✅` : "স্টক আউট ❌"}\n\n`;
      });
      if (products.length > 1) content += `💵 **সর্বমোট: ৳${total.toLocaleString()}**\n`;
      content += `\nঅর্ডার করতে চাইলে জানান! 🛒`;

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

  const createOrderFromChat = async (products: SelectedProduct[], form: OrderForm, total: number) => {
    if (products.length === 0 || !form.shipping_phone || !form.shipping_address) return false;
    setSaving(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: null, is_guest: true,
          guest_name: chat.customer_name || "চ্যাট কাস্টমার",
          guest_email: null,
          shipping_address: form.shipping_address,
          shipping_city: form.shipping_city || "ঢাকা",
          shipping_phone: form.shipping_phone,
          payment_method: form.payment_method,
          total,
          notes: form.notes || `চ্যাট থেকে অর্ডার (Chat ID: ${chat.id.slice(0, 8)})`,
          status: "pending",
        } as any)
        .select("id")
        .single();

      if (orderError) throw orderError;

      const orderItems = products.map((p) => ({
        order_id: order.id,
        product_id: p.id,
        product_name: p.name,
        quantity: p.quantity || 1,
        price: p.sale_price || p.price,
        size: p.selectedSize || null,
        color: p.selectedColor || null,
      }));
      await supabase.from("order_items").insert(orderItems);

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

      toast({ title: "অর্ডার তৈরি ও কনফার্ম হয়েছে! ✅" });
      onUpdate();
      return true;
    } catch (err: any) {
      toast({ title: `অর্ডার তৈরিতে সমস্যা: ${err.message}`, variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

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

  const updateTracking = async (trackingNumber: string, courierName: string) => {
    if (!chat.order_id || !trackingNumber) return false;
    setSaving(true);
    try {
      await supabase.from("orders").update({
        tracking_number: trackingNumber,
        courier_name: courierName || null,
        status: "shipped",
      }).eq("id", chat.order_id);

      const trackMsg: ChatMessage = {
        role: "assistant",
        content: `🛡️ **অ্যাডমিন রিপ্লাই:**\n\n🚚 **ট্র্যাকিং তথ্য:**\n\n🆔 অর্ডার: #${chat.order_id.slice(0, 8).toUpperCase()}\n📦 ট্র্যাকিং নং: **${trackingNumber}**${courierName ? `\n🏢 কুরিয়ার: **${courierName}**` : ""}\n\nআপনার অর্ডার শিপ করা হয়েছে! ডেলিভারি শীঘ্রই পৌঁছে যাবে। 📬`,
        timestamp: new Date().toISOString(),
      };
      await appendMessage(trackMsg, { order_status: "shipped" });
      toast({ title: "ট্র্যাকিং তথ্য আপডেট হয়েছে 🚚" });
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
