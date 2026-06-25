/**
 * @file useAdminOrders.ts
 * @description Custom React hook that owns ALL admin order data-fetching and
 * mutations.  Components that consume this hook remain fully presentational —
 * they never import `supabase` directly.
 *
 * ----------------------------------------------------------------------------
 * Supabase tables touched
 * ----------------------------------------------------------------------------
 *  • orders           – primary CRUD target (RLS: admin-role required)
 *  • order_items      – read for notification payloads; delete on order delete
 *  • profiles         – read customer name for notifications (RLS: own row or admin)
 *
 * ----------------------------------------------------------------------------
 * Query keys
 * ----------------------------------------------------------------------------
 *  • ["admin-orders-list"]  – list of all orders (used here)
 *  • ["admin-orders"]       – legacy key also invalidated for compatibility
 *
 * ----------------------------------------------------------------------------
 * Mutation invalidation map
 * ----------------------------------------------------------------------------
 *  updateStatus      → invalidates ["admin-orders-list"], ["admin-orders"]
 *  bulkUpdateStatus  → invalidates ["admin-orders-list"], ["admin-orders"]
 *  verifyPayment     → invalidates ["admin-orders-list"], ["admin-orders"]
 *  collectCOD        → invalidates ["admin-orders-list"], ["admin-orders"]
 *  deleteOrder       → invalidates ["admin-orders-list"], ["admin-orders"]
 *  createOrder       → invalidates ["admin-orders-list"], ["admin-orders"]
 *  updateTracking    → invalidates ["admin-orders-list"], ["admin-orders"]
 *
 * বাংলা নোট: এই হুকটি অর্ডার পেজের সমস্ত ডেটা ও একশন পরিচালনা করে।
 * কম্পোনেন্টগুলো শুধু UI দেখায়; ব্যবসায়িক লজিক এখানেই থাকে।
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { AdminOrder } from "@/lib/admin/orderHelpers";

// ---------------------------------------------------------------------------
// Query key – kept as a module-level constant so all invalidation calls are
// always in sync with the fetch declaration.
// ---------------------------------------------------------------------------
const ORDERS_KEY = ["admin-orders-list"];

/**
 * `useAdminOrders` – admin orders data + mutations.
 *
 * Centralises all Supabase access, cache invalidation and toast feedback so
 * page components remain purely presentational.
 *
 * @returns {{
 *   orders:           AdminOrder[]   – full, sorted (newest first) order list
 *   loading:          boolean        – true while the initial fetch is in-flight
 *   invalidate:       () => void     – manually bust both orders query keys
 *   updateStatus:     (id, status) => Promise<void>
 *   bulkUpdateStatus: (ids, status) => Promise<boolean>
 *   verifyPayment:    (id) => Promise<boolean>
 *   collectCOD:       (id) => Promise<boolean>
 *   deleteOrder:      (id) => Promise<boolean>
 *   createOrder:      (payload) => Promise<boolean>
 *   updateTracking:   (id, tracking) => Promise<boolean>
 * }}
 *
 * @example
 * const { orders, loading, updateStatus } = useAdminOrders();
 */
export const useAdminOrders = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // -------------------------------------------------------------------------
  // Primary data query
  // Supabase shape: orders.*  (all columns)
  // Sorted by created_at DESC so newest order appears first.
  // staleTime = 60 s → avoids redundant re-fetches when navigating between tabs.
  // -------------------------------------------------------------------------
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
    staleTime: 60 * 1000,       // 1 minute before considered stale
    gcTime: 5 * 60 * 1000,      // 5 minutes garbage-collection window
    refetchOnWindowFocus: false, // avoids disruptive re-fetches mid-workflow
  });

  // -------------------------------------------------------------------------
  // invalidate – bust both query keys so any other hook consuming
  // ["admin-orders"] (legacy) is also refreshed.
  // -------------------------------------------------------------------------
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  }, [queryClient]);

  // -------------------------------------------------------------------------
  // handleResult – shared toast + invalidation helper used by every mutation
  // that follows the simple (error | null) → boolean pattern.
  //
  // @param error        – Supabase error object or null
  // @param successTitle – toast title on success
  // @param successDesc  – optional toast description on success
  // @returns boolean    – true = success, false = failure
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // updateStatus – change a single order's `status` column.
  // After DB update it also fires optional email + WhatsApp notifications via
  // Supabase Edge Functions `send-order-notification` and
  // `send-whatsapp-notification`.
  //
  // Supabase mutation: orders.update({ status }).eq("id", orderId)
  // Invalidates: ORDERS_KEY, ["admin-orders"]
  //
  // বাংলা: একটি অর্ডারের স্ট্যাটাস পরিবর্তন করে এবং কাস্টমারকে নোটিফিকেশন পাঠায়।
  // -------------------------------------------------------------------------
  const updateStatus = async (orderId: string, status: string) => {
    // Pre-load the order from cache to use in notification payload
    const order = (query.data || []).find((o) => o.id === orderId);
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: `Order status updated to ${status}` });
    invalidate();
    // Fire-and-forget notifications; failures are caught internally
    if (order) await sendStatusNotifications(order, status);
  };

  // -------------------------------------------------------------------------
  // sendStatusNotifications – internal helper that sends email and WhatsApp
  // messages when an order status changes.
  //
  // Reads from:
  //   • order_items  (select product_name, quantity, price, size, color)
  //   • profiles     (select full_name for registered users)
  // Calls Edge Functions:
  //   • send-order-notification    (email)
  //   • send-whatsapp-notification (WhatsApp)
  //
  // Errors are swallowed so a notification failure never blocks the UI.
  // -------------------------------------------------------------------------
  const sendStatusNotifications = async (order: AdminOrder, status: string) => {
    try {
      // Fetch order line-items for the email body
      const { data: items } = await supabase
        .from("order_items")
        .select("product_name, quantity, price, size, color")
        .eq("order_id", order.id);

      // Resolve customer display name: prefer registered profile over guest_name
      let customerName = order.guest_name || "Customer";
      if (order.user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", order.user_id)
          .single();
        customerName = profile?.full_name || customerName;
      }

      // --- Email notification (only for orders that have a guest_email) ---
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
              // price stored per-unit in DB; multiply for line total
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

      // --- WhatsApp notification (only for orders with a shipping_phone) ---
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
      // Non-critical: log but never surface to the user
      console.error("Failed to send notifications:", err);
    }
  };

  // -------------------------------------------------------------------------
  // bulkUpdateStatus – apply the same `status` to multiple orders atomically.
  //
  // Supabase mutation: orders.update({ status }).in("id", ids)
  // Returns false early if ids array is empty to avoid a no-op DB call.
  // Invalidates: ORDERS_KEY, ["admin-orders"]
  //
  // বাংলা: একসাথে একাধিক অর্ডারের স্ট্যাটাস আপডেট করে।
  // -------------------------------------------------------------------------
  const bulkUpdateStatus = async (ids: string[], status: string) => {
    if (ids.length === 0) return false;
    const { error } = await supabase.from("orders").update({ status }).in("id", ids);
    return handleResult(error, "Success", `${ids.length} orders updated to ${status}`);
  };

  // -------------------------------------------------------------------------
  // verifyPayment – mark an order's payment as admin-verified.
  //
  // Columns updated on `orders`:
  //   payment_verified    → true
  //   payment_verified_at → ISO timestamp (now)
  //   payment_status      → "verified"
  //
  // Invalidates: ORDERS_KEY, ["admin-orders"]
  // বাংলা: পেমেন্ট ভেরিফাই করে এবং তারিখ রেকর্ড করে।
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // collectCOD – record that cash-on-delivery has been physically collected.
  //
  // Columns updated on `orders`:
  //   cod_collected    → true
  //   cod_collected_at → ISO timestamp (now)
  //   payment_status   → "paid"
  //   due_amount       → 0  (clears any outstanding balance)
  //
  // Invalidates: ORDERS_KEY, ["admin-orders"]
  // বাংলা: ক্যাশ অন ডেলিভারি সংগ্রহ নিশ্চিত করে।
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // deleteOrder – hard-delete an order and all its line-items.
  //
  // Step 1: order_items.delete().eq("order_id", orderId)   (child rows first)
  // Step 2: orders.delete().eq("id", orderId)              (parent row)
  //
  // Child rows are deleted first to avoid FK constraint violations.
  // Invalidates: ORDERS_KEY, ["admin-orders"]
  //
  // বাংলা: অর্ডার এবং সংশ্লিষ্ট আইটেমগুলো স্থায়ীভাবে মুছে ফেলে।
  // -------------------------------------------------------------------------
  const deleteOrder = async (orderId: string) => {
    await supabase.from("order_items").delete().eq("order_id", orderId);
    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    return handleResult(error, "🗑️ অর্ডার ডিলিট হয়েছে");
  };

  // -------------------------------------------------------------------------
  // createOrder – insert a new manual (admin-created) order.
  //
  // Hardcoded defaults:
  //   is_guest       → true   (manual orders are always guest orders)
  //   status         → "pending"
  //   payment_status → "unpaid"
  //   shipping_city  → falls back to "N/A" if empty string supplied
  //
  // Supabase mutation: orders.insert({ ...payload, ... })
  // Invalidates: ORDERS_KEY, ["admin-orders"]
  //
  // বাংলা: অ্যাডমিন প্যানেল থেকে ম্যানুয়ালি অর্ডার তৈরি করে।
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // updateTracking – save courier / tracking information on an order.
  //
  // Columns updated on `orders`:
  //   tracking_number    – courier parcel number (nullable)
  //   courier_name       – courier company name (nullable)
  //   estimated_delivery – expected delivery date string (nullable)
  //
  // Invalidates: ORDERS_KEY, ["admin-orders"]
  // বাংলা: ট্র্যাকিং নম্বর ও কুরিয়ার তথ্য আপডেট করে।
  // -------------------------------------------------------------------------
  const updateTracking = async (
    orderId: string,
    tracking: { tracking_number: string | null; courier_name: string | null; estimated_delivery: string | null }
  ) => {
    const { error } = await supabase.from("orders").update(tracking).eq("id", orderId);
    return handleResult(error, "✅ ট্র্যাকিং আপডেট হয়েছে");
  };

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  return {
    /** Full list of orders, newest first. Empty array while loading. */
    orders: query.data || [],
    /** True during the initial data fetch. */
    loading: query.isLoading,
    /** Manually invalidate the orders cache (both query keys). */
    invalidate,
    /** Update a single order's lifecycle status and send customer notifications. */
    updateStatus,
    /** Apply the same status to an array of order IDs in one DB call. */
    bulkUpdateStatus,
    /** Mark payment as admin-verified; sets payment_verified_at timestamp. */
    verifyPayment,
    /** Record COD collection; zeroes due_amount and sets payment_status="paid". */
    collectCOD,
    /** Hard-delete an order and its child order_items rows. */
    deleteOrder,
    /** Insert a new manual guest order with status="pending". */
    createOrder,
    /** Persist courier name, tracking number, and estimated delivery date. */
    updateTracking,
  };
};
