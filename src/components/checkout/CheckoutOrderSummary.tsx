/**
 * @file CheckoutOrderSummary.tsx
 * @module components/checkout
 *
 * @description
 * Sticky right-column order summary card used in the full /checkout page layout.
 * Shows a scrollable list of cart line items, price-breakdown rows (subtotal,
 * discount, shipping, estimated delivery, grand total), and the CouponInput widget.
 *
 * Distinguished from CartSummary (which is used inside the floating drawer)
 * by also rendering the full item list and the CouponInput inline.
 */

import CouponInput from "@/components/checkout/CouponInput";
import type { CartItem } from "@/contexts/CartContext";
import type { AppliedCoupon, DeliveryZone } from "@/lib/checkout/types";

/**
 * Props for CheckoutOrderSummary.
 */
interface Props {
  /** All cart items to render in the scrollable item list. */
  items: CartItem[];
  /** Raw cart subtotal in BDT before discount. */
  total: number;
  /** Applied coupon discount amount in BDT; 0 hides the row. */
  discountAmount: number;
  /** The currently applied coupon object, or null. */
  appliedCoupon: AppliedCoupon | null;
  /** Selected delivery zone — drives shipping cost and estimated-days rows. */
  selectedZone: DeliveryZone | null;
  /** Shipping charge for the selected zone in BDT. */
  shippingCost: number;
  /** Pre-calculated grand total (subtotal − discount + shipping). */
  finalTotal: number;
  /**
   * Called when a valid coupon is applied.
   * @param coupon - The validated coupon object from Supabase.
   * @param discount - Computed discount amount in BDT.
   */
  onApplyCoupon: (coupon: AppliedCoupon, discount: number) => void;
  /** Called when the user removes the currently applied coupon. */
  onRemoveCoupon: () => void;
}

/**
 * CheckoutOrderSummary — sticky right-column price summary for the checkout page.
 *
 * @param props - {@link Props}
 * @returns A `card-luxury` container with item list, totals breakdown, and coupon input.
 */
export default function CheckoutOrderSummary({
  items, total, discountAmount, appliedCoupon, selectedZone, shippingCost, finalTotal,
  onApplyCoupon, onRemoveCoupon,
}: Props) {
  return (
    // sticky top-24 keeps this card in view while the left column scrolls.
    <div className="card-luxury sticky top-24">
      <h3 className="font-display text-xl font-semibold text-foreground mb-6">Order Summary</h3>

      {/* ── Item list ─────────────────────────────────────────────────────── */}
      {items.length === 0 ? (
        // Edge case: cart emptied after navigating to checkout.
        <p className="text-muted-foreground text-sm mb-4">Your cart is empty</p>
      ) : (
        // max-h-60 + overflow-y-auto creates a scrollable item list without
        // pushing the totals section off-screen for large carts.
        <div className="space-y-4 border-b border-border pb-4 mb-4 max-h-60 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {/* Product name × quantity, with optional size and colour annotations */}
                {item.product.name} x {item.quantity}
                {item.size && ` (${item.size})`}
                {item.color && ` - ${item.color}`}
              </span>
              <span className="text-foreground">
                {/* Line total: prefer sale_price, fall back to regular price */}
                ৳{((item.product.sale_price || item.product.price) * item.quantity).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Price breakdown ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        {/* Subtotal row */}
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>৳{total.toLocaleString()}</span>
        </div>

        {/* Discount row — only visible when a coupon has been applied */}
        {discountAmount > 0 && (
          <div className="flex justify-between text-green-600">
            {/* Show coupon code in the label for clarity */}
            <span>Discount ({appliedCoupon?.code})</span>
            <span>-৳{discountAmount.toLocaleString()}</span>
          </div>
        )}

        {/* Shipping row — "Select city" shown when no zone is matched yet */}
        <div className="flex justify-between text-muted-foreground">
          <span>Shipping {selectedZone ? `(${selectedZone.zone_name})` : ""}</span>
          {/* Dash when cart is empty; "Select city" when zone not chosen */}
          <span>{total > 0 ? (selectedZone ? `৳${shippingCost}` : "Select city") : "—"}</span>
        </div>

        {/* Estimated delivery row — only shown when the zone has day data */}
        {selectedZone?.estimated_days && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Estimated Delivery</span>
            <span>{selectedZone.estimated_days} days</span>
          </div>
        )}

        {/* Grand total row — prominent styling to draw attention */}
        <div className="flex justify-between text-lg font-semibold text-foreground pt-2 border-t border-border">
          <span>Total</span>
          <span className="text-gradient-gold">৳{finalTotal.toLocaleString()}</span>
        </div>
      </div>

      {/* ── Coupon input ──────────────────────────────────────────────────── */}
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
