interface CartSummaryProps {
  subtotal: number;
  discount: number;
  shippingCost: number;
  total: number;
  showShipping: boolean;
  hasZone: boolean;
}

/** Compact totals block: subtotal, discount, shipping, total. */
const CartSummary = ({
  subtotal,
  discount,
  shippingCost,
  total,
  showShipping,
  hasZone,
}: CartSummaryProps) => (
  <div className="space-y-1 text-sm">
    <div className="flex justify-between text-muted-foreground">
      <span>সাবটোটাল</span>
      <span>৳{subtotal.toLocaleString()}</span>
    </div>
    {discount > 0 && (
      <div className="flex justify-between text-green-600">
        <span>ডিসকাউন্ট</span>
        <span>-৳{discount.toLocaleString()}</span>
      </div>
    )}
    {showShipping && (
      <div className="flex justify-between text-muted-foreground">
        <span>শিপিং</span>
        <span>{hasZone ? `৳${shippingCost}` : "শহর দিন"}</span>
      </div>
    )}
    <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border">
      <span>মোট</span>
      <span className="text-primary">৳{total.toLocaleString()}</span>
    </div>
  </div>
);

export default CartSummary;
