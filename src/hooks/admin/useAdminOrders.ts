import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { AdminOrder } from "@/lib/admin/orderHelpers";

const ORDERS_KEY = ["admin-orders-list"];

/**
 * Admin orders data + mutations (status, bulk status, payment verify, COD
 * collect, delete, create). Centralizes Supabase access + cache invalidation +
 * toast handling so page components stay presentational.
 */
export const useAdminOrders = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ORDERS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AdminOrder[];
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  }, [queryClient]);

  const handleResult = (
    error: { message: string } | null,
    successTitle: string,
    successDesc?: string
  ) => {
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: successTitle, ...(successDesc ? { description: successDesc } : {}) });
    invalidate();
    return true;
  };

  const updateStatus = async (orderId: string, status: string) => {
    const order = (query.data || []).find((o) => o.id === orderId);
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: `Order status updated to ${status}` });
    invalidate();
    if (order) await sendStatusNotifications(order, status);
  };

  const sendStatusNotifications = async (order: AdminOrder, status: string) => {
    try {
      const { data: items } = await supabase
        .from("order_items")
        .select("product_name, quantity, price, size, color")
        .eq("order_id", order.id);

      let customerName = order.guest_name || "Customer";
      if (order.user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", order.user_id)
          .single();
        customerName = profile?.full_name || customerName;
      }

      if (order.guest_email) {
        await supabase.functions.invoke("send-order-notification", {
          body: {
            email: order.guest_email,
            orderId: order.id,
            customerName,
            status,
            total: order.total,
            items: (items || []).map((item) => ({
              name: item.product_name,
              quantity: item.quantity,
              price: Number(item.price) * item.quantity,
              size: item.size,
              color: item.color,
            })),
            shippingAddress: order.shipping_address,
            shippingCity: order.shipping_city,
            shippingPhone: order.shipping_phone,
          },
        });
        toast({ title: "📧", description: "Status update email sent to customer" });
      }

      if (order.shipping_phone) {
        const waResult = await supabase.functions.invoke("send-whatsapp-notification", {
          body: {
            phone: order.shipping_phone,
            customerName,
            orderId: order.id,
            status,
            total: order.total,
            trackingNumber: order.tracking_number,
            courierName: order.courier_name,
          },
        });
        if (waResult.data?.success) {
          toast({ title: "📱", description: "WhatsApp notification sent" });
        }
      }
    } catch (err) {
      console.error("Failed to send notifications:", err);
    }
  };

  const bulkUpdateStatus = async (ids: string[], status: string) => {
    if (ids.length === 0) return false;
    const { error } = await supabase.from("orders").update({ status }).in("id", ids);
    return handleResult(error, "Success", `${ids.length} orders updated to ${status}`);
  };

  const verifyPayment = async (orderId: string) => {
    const { error } = await supabase
      .from("orders")
      .update({
        payment_verified: true,
        payment_verified_at: new Date().toISOString(),
        payment_status: "verified",
      })
      .eq("id", orderId);
    return handleResult(error, "✅ পেমেন্ট ভেরিফাইড", "পেমেন্ট সফলভাবে যাচাই হয়েছে");
  };

  const collectCOD = async (orderId: string) => {
    const { error } = await supabase
      .from("orders")
      .update({
        cod_collected: true,
        cod_collected_at: new Date().toISOString(),
        payment_status: "paid",
        due_amount: 0,
      })
      .eq("id", orderId);
    return handleResult(error, "💰 COD কালেক্টেড", "ক্যাশ অন ডেলিভারি সংগৃহীত");
  };

  const deleteOrder = async (orderId: string) => {
    await supabase.from("order_items").delete().eq("order_id", orderId);
    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    return handleResult(error, "🗑️ অর্ডার ডিলিট হয়েছে");
  };

  const createOrder = async (payload: {
    guest_name: string;
    shipping_phone: string;
    shipping_address: string;
    shipping_city: string;
    total: number;
    payment_method: string;
    notes: string | null;
  }) => {
    const { error } = await supabase.from("orders").insert({
      ...payload,
      shipping_city: payload.shipping_city || "N/A",
      is_guest: true,
      status: "pending",
      payment_status: "unpaid",
    });
    return handleResult(error, "✅ অর্ডার তৈরি হয়েছে");
  };

  const updateTracking = async (
    orderId: string,
    tracking: { tracking_number: string | null; courier_name: string | null; estimated_delivery: string | null }
  ) => {
    const { error } = await supabase.from("orders").update(tracking).eq("id", orderId);
    return handleResult(error, "✅ ট্র্যাকিং আপডেট হয়েছে");
  };

  return {
    orders: query.data || [],
    loading: query.isLoading,
    invalidate,
    updateStatus,
    bulkUpdateStatus,
    verifyPayment,
    collectCOD,
    deleteOrder,
    createOrder,
    updateTracking,
  };
};
