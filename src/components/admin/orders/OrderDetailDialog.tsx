import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import TrackingForm from "./TrackingForm";
import {
  type AdminOrder,
  type AdminOrderItem,
  getStatusColor,
  getPaymentStatusColor,
} from "@/lib/admin/orderHelpers";

interface OrderDetailDialogProps {
  order: AdminOrder | null;
  onClose: () => void;
  onVerifyPayment: (orderId: string) => Promise<boolean> | void;
  onCollectCOD: (orderId: string) => Promise<boolean> | void;
  onUpdateTracking: (
    orderId: string,
    tracking: { tracking_number: string | null; courier_name: string | null; estimated_delivery: string | null }
  ) => Promise<boolean> | void;
}

/** Read-only-ish detail panel: address, payment, tracking edit, items list. */
const OrderDetailDialog = ({
  order,
  onClose,
  onVerifyPayment,
  onCollectCOD,
  onUpdateTracking,
}: OrderDetailDialogProps) => {
  const [items, setItems] = useState<AdminOrderItem[]>([]);

  useEffect(() => {
    if (!order) {
      setItems([]);
      return;
    }
    supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id)
      .then(({ data }) => setItems((data as AdminOrderItem[]) || []));
  }, [order]);

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Order Details #{order?.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        {order && (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Shipping Address</h4>
                <p>{order.guest_name}</p>
                <p>{order.shipping_address}</p>
                <p>{order.shipping_city}</p>
                <p>{order.shipping_phone}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Order Info</h4>
                <p>Date: {new Date(order.created_at).toLocaleString()}</p>
                <p>
                  Status:{" "}
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                </p>
                <p className="font-semibold mt-2">Total: ৳{Number(order.total).toLocaleString()}</p>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-muted/50">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">💳 পেমেন্ট তথ্য</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p>মেথড: <span className="font-medium">{order.payment_method}</span></p>
                <p>
                  স্ট্যাটাস:{" "}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getPaymentStatusColor(order.payment_status)}`}>
                    {order.payment_status}
                  </span>
                </p>
                {order.transaction_id && (
                  <p>TxID: <span className="font-mono font-medium">{order.transaction_id}</span></p>
                )}
                {order.payment_phone && <p>পেমেন্ট ফোন: {order.payment_phone}</p>}
                {Number(order.advance_amount) > 0 && (
                  <p>
                    অ্যাডভান্স:{" "}
                    <span className="font-semibold text-green-700">
                      ৳{Number(order.advance_amount).toLocaleString()}
                    </span>
                  </p>
                )}
                {Number(order.due_amount) > 0 && (
                  <p>
                    বাকি:{" "}
                    <span className="font-semibold text-red-700">
                      ৳{Number(order.due_amount).toLocaleString()}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                {!order.payment_verified && order.transaction_id && (
                  <Button
                    size="sm"
                    onClick={() => onVerifyPayment(order.id)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    ✅ পেমেন্ট ভেরিফাই
                  </Button>
                )}
                {order.payment_verified && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    ✅ ভেরিফাইড{" "}
                    {order.payment_verified_at &&
                      `(${new Date(order.payment_verified_at).toLocaleDateString()})`}
                  </span>
                )}
                {Number(order.due_amount) > 0 && !order.cod_collected && (
                  <Button size="sm" variant="outline" onClick={() => onCollectCOD(order.id)}>
                    💰 COD কালেক্ট করুন (৳{Number(order.due_amount).toLocaleString()})
                  </Button>
                )}
                {order.cod_collected && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    💰 COD কালেক্টেড{" "}
                    {order.cod_collected_at &&
                      `(${new Date(order.cod_collected_at).toLocaleDateString()})`}
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-muted/50">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">🚚 ট্র্যাকিং তথ্য</h4>
              <TrackingForm
                order={order}
                onSave={async (tracking) => {
                  const ok = await onUpdateTracking(order.id, tracking);
                  if (ok) onClose();
                  return ok;
                }}
              />
            </div>

            {order.notes && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Notes</h4>
                <p>{order.notes}</p>
              </div>
            )}

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                📦 আইটেম তালিকা ({items.length})
              </h4>
              <div className="border rounded-lg divide-y">
                {items.map((item) => (
                  <div key={item.id} className="p-3 flex items-center gap-3">
                    <div className="w-14 h-14 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
                      <img
                        src="/placeholder.svg"
                        alt={item.product_name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.product_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.size && (
                          <span className="text-xs px-1.5 py-0.5 bg-muted rounded">{item.size}</span>
                        )}
                        {item.color && (
                          <span className="text-xs px-1.5 py-0.5 bg-muted rounded flex items-center gap-1">
                            <span
                              className="w-2.5 h-2.5 rounded-full border"
                              style={{ backgroundColor: item.color.toLowerCase() }}
                            />
                            {item.color}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                      </div>
                    </div>
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
