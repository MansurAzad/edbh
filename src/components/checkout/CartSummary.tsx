/**
 * @file CartSummary.tsx
 * @module components/checkout
 *
 * @description
 * Pure presentational component that renders a compact price-breakdown table:
 * subtotal, optional coupon discount, optional shipping charge, and grand total.
 *
 * Used in both the FloatingCartSidebar footer and the full CheckoutPage layout.
 *
 * Bengali strings:
 *  - "সাবটোটাল" — "Subtotal"  — সাবটোটাল লেবেল
 *  - "ডিসকাউন্ট" — "Discount" — ডিসকাউন্ট লেবেল
 *  - "শিপিং"     — "Shipping" — শিপিং লেবেল
 *  - "শহর দিন"   — "Enter city" (shown when zone not yet selected) — শহর না দিলে বার্তা
 *  - "মোট"       — "Total"    — মোট লেবেল
 */

/**
 * Props for CartSummary.
 */
interface CartSummaryProps {
  /** Raw cart subtotal in BDT before any discount. */
  subtotal: number;
  /** Coupon discount amount in BDT; row hidden when 0. */
  discount: number;
  /** Shipping charge for the selected zone in BDT. */
  shippingCost: number;
  /**
   * Pre-calculated grand total passed from the parent.
   * The parent decides whether to include shipping (e.g. cart mode vs checkout mode).
   */
  total: number;
  /** When false the shipping row is not rendered (cart mode). */
  showShipping: boolean;
  /**
   * When false and showShipping is true, the shipping cell shows "শহর দিন"
   * prompting the user to enter their city so a zone can be matched.
   */
  hasZone: boolean;
}

/**
 * CartSummary — price-breakdown rows displayed in the cart drawer footer
 * and the checkout sidebar.
 *
 * @param props - {@link CartSummaryProps}
 * @returns A `<div>` with stacked label-value rows and a bold total line.
 */
const CartSummary = ({
  subtotal,
  discount,
  shippingCost,
  total,
  showShipping,
  hasZone,
}: CartSummaryProps) => (
  <div className="space-y-1 text-sm">
    {/* Subtotal row — "সাবটোটাল" always visible — সাবটোটাল সারি */}
    <div className="flex justify-between text-muted-foreground">
      <span>সাবটোটাল</span>
      <span>৳{subtotal.toLocaleString()}</span>
    </div>

    {/* Discount row — "ডিসকাউন্ট" — only shown when a coupon has been applied (discount > 0) — ডিসকাউন্ট সারি */}
    {discount > 0 && (
      <div className="flex justify-between text-green-600">
        <span>ডিসকাউন্ট</span>
        {/* Negative prefix (−৳) makes the saving immediately clear */}
        <span>-৳{discount.toLocaleString()}</span>
      </div>
    )}

    {/* Shipping row — "শিপিং" — only shown when in checkout mode */}
    {showShipping && (
      <div className="flex justify-between text-muted-foreground">
        <span>শিপিং</span>
        {/* "শহর দিন" — "Enter your city" — shown when no zone matched yet — শহর না দিলে বার্তা */}
        <span>{hasZone ? `৳${shippingCost}` : "শহর দিন"}</span>
      </div>
    )}

    {/* Grand total row — "মোট" — always shown, bold with primary colour — মোট সারি */}
    <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border">
      <span>মোট</span>
      <span className="text-primary">৳{total.toLocaleString()}</span>
    </div>
  </div>
);

export default CartSummary;
