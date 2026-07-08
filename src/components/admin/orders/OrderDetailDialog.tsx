// =============================================================================
// OrderDetailDialog.tsx
// Full-screen order detail panel rendered as a modal Dialog.
//
// Sections inside the dialog:
//   1. Shipping address block
//   2. Order summary (date, status, total)
//   3. Payment info panel (method, status, transaction ID, advance/due amounts,
//      verify-payment button, COD-collect button)
//   4. Tracking form (courier, tracking number, ETA)
//   5. Optional notes
//   6. Order items list with thumbnail, size/color chips, quantity, price
// =============================================================================

import { useEffect, useState } from "react";
import { RefreshCw, Zap, Download } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import TrackingForm from "./TrackingForm";
import ZoomableThumb from "@/components/admin/ZoomableThumb";
import {
  type AdminOrder,
  type AdminOrderItem,
  getStatusColor,
  getPaymentStatusColor,
} from "@/lib/admin/orderHelpers";
import {
  fetchWhatsAppShareEvents,
  type WhatsAppShareEvent,
} from "@/lib/checkout/whatsappShare";
import {
  retryWhatsAppShareForOrder,
  retryWithEscalation,
} from "@/lib/admin/adminWhatsAppRetry";
import { exportWhatsAppHistoryCSV } from "@/lib/admin/whatsappHistoryCsv";
import WhatsAppShareTimeline from "@/components/checkout/WhatsAppShareTimeline";
import OrderWhatsAppHistory from "@/components/admin/orders/OrderWhatsAppHistory";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for {@link OrderDetailDialog}.
 */
interface OrderDetailDialogProps {
  /**
   * The order to display. Pass `null` to keep the dialog mounted but hidden
   * (avoids unmounting animations while the dialog closes).
   */
  order: AdminOrder | null;
  /** Called when the dialog should be dismissed (e.g. clicking the X). */
  onClose: () => void;
  /**
   * Marks `orders.payment_verified = true` and sets `payment_status = "verified"`.
   * Only visible when the order has a `transaction_id` but is not yet verified.
   */
  onVerifyPayment: (orderId: string) => Promise<boolean> | void;
  /**
   * Marks `orders.cod_collected = true` and zeroes `due_amount`.
   * Only visible when `due_amount > 0` and `cod_collected` is false.
   */
  onCollectCOD: (orderId: string) => Promise<boolean> | void;
  /**
   * Saves courier / tracking / ETA fields on the order.
   * Closes the dialog after a successful save.
   */
  onUpdateTracking: (
    orderId: string,
    tracking: { tracking_number: string | null; courier_name: string | null; estimated_delivery: string | null }
  ) => Promise<boolean> | void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * **OrderDetailDialog** — Read-mostly order detail panel.
 *
 * Items are loaded lazily from `order_items` each time a different order is
 * selected (or on mount). This avoids over-fetching items in the main orders
 * list query.
 *
 * ### Bengali UI labels used
 * - "💳 পেমেন্ট তথ্য" = Payment Information
 * - "মেথড" = Method
 * - "স্ট্যাটাস" = Status
 * - "পেমেন্ট ফোন" = Payment Phone
 * - "অ্যাডভান্স" = Advance amount paid
 * - "বাকি" = Due / remaining amount
 * - "✅ পেমেন্ট ভেরিফাই" = Verify Payment
 * - "✅ ভেরিফাইড" = Verified
 * - "💰 COD কালেক্ট করুন" = Collect COD
 * - "💰 COD কালেক্টেড" = COD Collected
 * - "🚚 ট্র্যাকিং তথ্য" = Tracking Information
 * - "📦 আইটেম তালিকা" = Item List
 * - "সর্বমোট" = Grand Total
 */
const OrderDetailDialog = ({
  order,
  onClose,
  onVerifyPayment,
  onCollectCOD,
  onUpdateTracking,
}: OrderDetailDialogProps) => {
  // Items belonging to the selected order — fetched on demand.
  const [items, setItems] = useState<AdminOrderItem[]>([]);

  // -------------------------------------------------------------------------
  // Fetch order items whenever the selected order changes.
  // Resets to an empty array when the dialog closes (order === null).
  // -------------------------------------------------------------------------
  // WhatsApp share attempt log (append-only from whatsapp_share_events).
  const [waEvents, setWaEvents] = useState<WhatsAppShareEvent[]>([]);
  const [waRetrying, setWaRetrying] = useState(false);
  const { toast } = useToast();

  const loadWaEvents = async (orderId: string) => {
    const rows = await fetchWhatsAppShareEvents(orderId);
    setWaEvents(rows);
  };

  useEffect(() => {
    if (!order) {
      setItems([]);
      setWaEvents([]);
      return;
    }
    // Load items and hydrate each row with the product's image_url.
    (async () => {
      const { data: rawItems } = await supabase
        .from("order_items")
        .select("id, product_id, product_name, quantity, price, size, color")
        .eq("order_id", order.id);
      const rows = (rawItems ?? []) as Array<Omit<AdminOrderItem, "image_url">>;

      const productIds = Array.from(
        new Set(rows.map((r) => r.product_id).filter((v): v is string => !!v)),
      );
      let imageMap: Record<string, string | null> = {};
      if (productIds.length) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, image_url")
          .in("id", productIds);
        imageMap = Object.fromEntries((prods ?? []).map((p) => [p.id, p.image_url ?? null]));
      }
      setItems(rows.map((r) => ({ ...r, image_url: r.product_id ? imageMap[r.product_id] ?? null : null })));
    })();
    loadWaEvents(order.id);
  }, [order]);

  const handleAdminRetryWa = async (mode: "primary" | "escalate" = "primary") => {
    if (!order) return;
    setWaRetrying(true);
    try {
      const res = mode === "escalate"
        ? await retryWithEscalation(order.id)
        : await retryWhatsAppShareForOrder(order.id);
      toast({
        title:
          res.status === "opened" || res.status === "retried"
            ? "WhatsApp আবার খোলা হয়েছে"
            : "WhatsApp শেয়ার হয়নি",
        description: res.error || `স্ট্যাটাস: ${res.status} · variant: ${res.variant}`,
        variant:
          res.status === "opened" || res.status === "retried"
            ? "default"
            : "destructive",
      });
      await loadWaEvents(order.id);
    } catch (e) {
      toast({
        title: "রি-শেয়ার ব্যর্থ",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setWaRetrying(false);
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Order Details #{order?.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>


        {/* Only render body content once an order is available */}
        {order && (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto">

            {/* ----------------------------------------------------------------
                Section 1 — Shipping address + high-level order info
            ---------------------------------------------------------------- */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left: recipient details */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Shipping Address</h4>
                <p>{order.guest_name}</p>
                <p>{order.shipping_address}</p>
                <p>{order.shipping_city}</p>
                <p>{order.shipping_phone}</p>
              </div>

              {/* Right: date, status badge, total */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Order Info</h4>
                <p>Date: {new Date(order.created_at).toLocaleString()}</p>
                <p>
                  Status:{" "}
                  {/* getStatusColor returns a Tailwind class string for the given status */}
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                </p>
                <p className="font-semibold mt-2">Total: ৳{Number(order.total).toLocaleString()}</p>
              </div>
            </div>

            {/* ----------------------------------------------------------------
                Section 2 — Payment information panel
                "💳 পেমেন্ট তথ্য" = Payment Information
            ---------------------------------------------------------------- */}
            <div className="p-4 border rounded-lg bg-muted/50">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">💳 পেমেন্ট তথ্য</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {/* Payment method (cod, bkash, nagad …) */}
                {/* "মেথড" = Method */}
                <p>মেথড: <span className="font-medium">{order.payment_method}</span></p>

                {/* Payment status pill — getPaymentStatusColor maps to Tailwind classes */}
                {/* "স্ট্যাটাস" = Status */}
                <p>
                  স্ট্যাটাস:{" "}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getPaymentStatusColor(order.payment_status)}`}>
                    {order.payment_status}
                  </span>
                </p>

                {/* Transaction ID — only present for bKash/Nagad/Rocket/bank */}
                {order.transaction_id && (
                  <p>TxID: <span className="font-mono font-medium">{order.transaction_id}</span></p>
                )}

                {/* Phone used for mobile payment */}
                {/* "পেমেন্ট ফোন" = Payment Phone */}
                {order.payment_phone && <p>পেমেন্ট ফোন: {order.payment_phone}</p>}

                {/* Advance paid upfront (partial payment) */}
                {/* "অ্যাডভান্স" = Advance amount */}
                {Number(order.advance_amount) > 0 && (
                  <p>
                    অ্যাডভান্স:{" "}
                    <span className="font-semibold text-green-700">
                      ৳{Number(order.advance_amount).toLocaleString()}
                    </span>
                  </p>
                )}

                {/* Remaining amount due on delivery */}
                {/* "বাকি" = Due / remaining */}
                {Number(order.due_amount) > 0 && (
                  <p>
                    বাকি:{" "}
                    <span className="font-semibold text-red-700">
                      ৳{Number(order.due_amount).toLocaleString()}
                    </span>
                  </p>
                )}
              </div>

              {/* ---- Action buttons for payment management ---- */}
              <div className="flex gap-2 mt-4">
                {/* Verify payment — shown when a TxID exists but isn't verified yet */}
                {/* "✅ পেমেন্ট ভেরিফাই" = Verify Payment */}
                {!order.payment_verified && order.transaction_id && (
                  <Button
                    size="sm"
                    onClick={() => onVerifyPayment(order.id)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    ✅ পেমেন্ট ভেরিফাই
                  </Button>
                )}

                {/* Verified badge + timestamp — shown after verification */}
                {/* "✅ ভেরিফাইড" = Verified */}
                {order.payment_verified && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    ✅ ভেরিফাইড{" "}
                    {order.payment_verified_at &&
                      `(${new Date(order.payment_verified_at).toLocaleDateString()})`}
                  </span>
                )}

                {/* Collect COD — shown when due_amount > 0 and not yet collected */}
                {/* "💰 COD কালেক্ট করুন" = Collect COD */}
                {Number(order.due_amount) > 0 && !order.cod_collected && (
                  <Button size="sm" variant="outline" onClick={() => onCollectCOD(order.id)}>
                    💰 COD কালেক্ট করুন (৳{Number(order.due_amount).toLocaleString()})
                  </Button>
                )}

                {/* COD collected badge + timestamp */}
                {/* "💰 COD কালেক্টেড" = COD Collected */}
                {order.cod_collected && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    💰 COD কালেক্টেড{" "}
                    {order.cod_collected_at &&
                      `(${new Date(order.cod_collected_at).toLocaleDateString()})`}
                  </span>
                )}
              </div>
            </div>

            {/* ----------------------------------------------------------------
                Section 2b — WhatsApp receipt share status
            ---------------------------------------------------------------- */}
            {(order.whatsapp_share_status || waEvents.length > 0) && (
              <div className={`p-4 border rounded-lg text-sm ${
                order.whatsapp_share_status === "opened" || order.whatsapp_share_status === "retried"
                  ? "border-green-500/40 bg-green-500/5"
                  : order.whatsapp_share_status === "blocked"
                  ? "border-amber-500/40 bg-amber-500/5"
                  : order.whatsapp_share_status
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border bg-muted/30"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    📱 WhatsApp রিসিট শেয়ার
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdminRetryWa("primary")}
                      disabled={waRetrying}
                      data-testid="admin-wa-retry"
                      aria-busy={waRetrying}
                      className="gap-1.5 h-7 text-xs"
                    >
                      <RefreshCw className={`w-3 h-3 ${waRetrying ? "animate-spin" : ""}`} />
                      {waRetrying ? "চেষ্টা করা হচ্ছে..." : "Resend WhatsApp"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAdminRetryWa("escalate")}
                      disabled={waRetrying}
                      data-testid="admin-wa-retry-escalate"
                      className="gap-1.5 h-7 text-xs"
                      title="Escalate with a shorter fallback template"
                    >
                      <Zap className="w-3 h-3" /> Escalate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportWhatsAppHistoryCSV(order.id, waEvents)}
                      disabled={waEvents.length === 0}
                      data-testid="admin-wa-export-csv"
                      className="gap-1.5 h-7 text-xs"
                    >
                      <Download className="w-3 h-3" /> CSV
                    </Button>
                  </div>
                </div>

                {order.whatsapp_share_status && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">
                      স্ট্যাটাস:{" "}
                      <span className="uppercase font-mono text-xs">
                        {order.whatsapp_share_status}
                      </span>
                    </span>
                    {order.whatsapp_shared_at && (
                      <span className="text-xs text-muted-foreground">
                        সময়: {new Date(order.whatsapp_shared_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
                {order.whatsapp_share_error && (
                  <p className="mt-1 text-xs text-destructive">
                    কারণ: {order.whatsapp_share_error}
                  </p>
                )}

                <div className="mt-3 pt-3 border-t border-border/40">
                  <OrderWhatsAppHistory orderId={order.id} />
                </div>
              </div>
            )}


            {/* ----------------------------------------------------------------
                Section 3 — Tracking information
                "🚚 ট্র্যাকিং তথ্য" = Tracking Information
                TrackingForm manages its own local state pre-populated from the
                order; saving calls onUpdateTracking and then closes the dialog.
            ---------------------------------------------------------------- */}
            <div className="p-4 border rounded-lg bg-muted/50">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">🚚 ট্র্যাকিং তথ্য</h4>
              <TrackingForm
                order={order}
                onSave={async (tracking) => {
                  const ok = await onUpdateTracking(order.id, tracking);
                  // Close the detail dialog after a successful tracking update.
                  if (ok) onClose();
                  return ok;
                }}
              />
            </div>

            {/* ----------------------------------------------------------------
                Section 4 — Optional order notes
            ---------------------------------------------------------------- */}
            {order.notes && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Notes</h4>
                <p>{order.notes}</p>
              </div>
            )}

            {/* ----------------------------------------------------------------
                Section 5 — Order items list
                "📦 আইটেম তালিকা" = Item List
                Items are loaded asynchronously via the useEffect above.
            ---------------------------------------------------------------- */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                📦 আইটেম তালিকা ({items.length})
              </h4>
              <div className="border rounded-lg divide-y">
                {items.map((item) => (
                  <div key={item.id} className="p-3 flex items-center gap-3">
                    {/* Product thumbnail — real image_url with click-to-zoom */}
                    <ZoomableThumb src={item.image_url} alt={item.product_name} sizeClass="w-14 h-14" />

                    {/* Product name + size/color chips + quantity */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.product_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {/* Size chip — only rendered when a size exists */}
                        {item.size && (
                          <span className="text-xs px-1.5 py-0.5 bg-muted rounded">{item.size}</span>
                        )}
                        {/* Color chip with a small color swatch */}
                        {item.color && (
                          <span className="text-xs px-1.5 py-0.5 bg-muted rounded flex items-center gap-1">
                            <span
                              className="w-2.5 h-2.5 rounded-full border"
                              style={{ backgroundColor: item.color.toLowerCase() }}
                            />
                            {item.color}
                          </span>
                        )}
                        {/* Quantity multiplier */}
                        <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                      </div>
                    </div>

                    {/* Per-unit price + line total */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">
                        ৳{Number(item.price).toLocaleString()} each
                      </p>
                      <p className="font-semibold text-sm">
                        ৳{(Number(item.price) * item.quantity).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Grand total footer — mirrors order.total */}
              {/* "সর্বমোট" = Grand Total */}
              <div className="flex justify-between items-center mt-3 pt-3 border-t">
                <span className="text-sm font-medium text-muted-foreground">সর্বমোট</span>
                <span className="text-lg font-bold text-primary">
                  ৳{Number(order.total).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetailDialog;
