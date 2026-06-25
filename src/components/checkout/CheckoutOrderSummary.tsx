import CouponInput from "@/components/checkout/CouponInput";
import type { CartItem } from "@/contexts/CartContext";
import type { AppliedCoupon, DeliveryZone } from "@/lib/checkout/types";

interface Props {
  items: CartItem[];
  total: number;
  discountAmount: number;
  appliedCoupon: AppliedCoupon | null;
  selectedZone: DeliveryZone | null;
  shippingCost: number;
  finalTotal: number;
  onApplyCoupon: (coupon: AppliedCoupon, discount: number) => void;
  onRemoveCoupon: () => void;
}

export default function CheckoutOrderSummary({
  items, total, discountAmount, appliedCoupon, selectedZone, shippingCost, finalTotal,
  onApplyCoupon, onRemoveCoupon,
}: Props) {
  return (
    <div className="card-luxury sticky top-24">
      <h3 className="font-display text-xl font-semibold text-foreground mb-6">Order Summary</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm mb-4">Your cart is empty</p>
      ) : (
        <div className="space-y-4 border-b border-border pb-4 mb-4 max-h-60 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {item.product.name} x {item.quantity}
                {item.size && ` (${item.size})`}
                {item.color && ` - ${item.color}`}
              </span>
              <span className="text-foreground">
                ৳{((item.product.sale_price || item.product.price) * item.quantity).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>৳{total.toLocaleString()}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount ({appliedCoupon?.code})</span>
            <span>-৳{discountAmount.toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <span>Shipping {selectedZone ? `(${selectedZone.zone_name})` : ""}</span>
          <span>{total > 0 ? (selectedZone ? `৳${shippingCost}` : "Select city") : "—"}</span>
        </div>
        {selectedZone?.estimated_days && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Estimated Delivery</span>
            <span>{selectedZone.estimated_days} days</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-semibold text-foreground pt-2 border-t border-border">
          <span>Total</span>
          <span className="text-gradient-gold">৳{finalTotal.toLocaleString()}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <CouponInput
          subtotal={total}
          appliedCoupon={appliedCoupon}
          onApplyCoupon={onApplyCoupon}
          onRemoveCoupon={onRemoveCoupon}
        />
      </div>
    </div>
  );
}
