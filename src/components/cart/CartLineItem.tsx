/**
 * @file CartLineItem.tsx
 * @module components/cart
 *
 * @description
 * Renders a single product row inside the floating cart drawer.
 * Each row shows:
 *  - A product thumbnail (falls back to "/placeholder.svg" if no image URL).
 *  - Product name, selected size and/or colour as a compact sub-line.
 *  - A quantity stepper (– / count / +) that calls parent handlers.
 *  - The calculated line total (unit price × qty) formatted in BDT (৳).
 *  - A trash icon button to remove the item entirely from the cart.
 *
 * This component is purely presentational — all state lives in the parent
 * (FloatingCartSidebar) which passes callbacks down via props.
 */

import { memo } from "react";
import { Trash2, Plus, Minus } from "lucide-react";
import type { CartItem } from "@/contexts/CartContext";

/**
 * Props for the CartLineItem component.
 */
interface CartLineItemProps {
  /** The cart item object containing product data, selected options, and quantity. */
  item: CartItem;
  /** Called when the user taps the "+" button to increase quantity by 1. */
  onIncrement: (item: CartItem) => void;
  /**
   * Called when the user taps the "–" button.
   * The parent is responsible for enforcing a minimum of 1 (or removing
   * the item when quantity would drop to 0).
   */
  onDecrement: (item: CartItem) => void;
  /**
   * Called with the item's unique `id` string when the trash icon is clicked.
   * Triggers full removal from the cart, regardless of current quantity.
   */
  onRemove: (itemId: string) => void;
}

/**
 * CartLineItem — a single row in the cart drawer.
 *
 * @param props - {@link CartLineItemProps}
 * @returns A styled `<div>` containing the product thumbnail, details,
 *          quantity controls, line total, and a remove button.
 *
 * @example
 * <CartLineItem
 *   item={cartItem}
 *   onIncrement={handleIncrement}
 *   onDecrement={handleDecrement}
 *   onRemove={handleRemove}
 * />
 */
const CartLineItem = ({ item, onIncrement, onDecrement, onRemove }: CartLineItemProps) => {
  // Prefer sale_price when available; fall back to the regular price.
  // This mirrors what the order-placement logic bills the customer.
  const unitPrice = item.product.sale_price || item.product.price;

  return (
    // Outer card: muted background + subtle border keeps items visually separated.
    <div className="flex gap-3 p-3 rounded-xl bg-muted/50 border border-border">

      {/* Product thumbnail ─ fixed 64×64 square, object-cover crops it cleanly */}
      <img
        src={item.product.image_url || "/placeholder.svg"}
        alt={item.product.name}
        className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
      />

      {/* Main content column — min-w-0 allows truncation of long product names */}
      <div className="flex-1 min-w-0">

        {/* Product name — truncated with ellipsis when it overflows */}
        <h4 className="text-sm font-medium text-foreground truncate">{item.product.name}</h4>

        {/* Size / colour sub-line — only rendered when the relevant option exists.
            The ` | ` separator is inserted only when BOTH size and colour are present. */}
        <p className="text-xs text-muted-foreground">
          {item.size && `Size: ${item.size}`}
          {item.size && item.color && " | "}
          {item.color && `Color: ${item.color}`}
        </p>

        {/* Bottom row: quantity stepper on the left, line total on the right */}
        <div className="flex items-center justify-between mt-1">

          {/* Quantity stepper ─ three elements: decrement · count · increment */}
          <div className="flex items-center gap-1">
            {/* Decrement button — calls onDecrement; parent handles min-qty logic */}
            <button
              onClick={() => onDecrement(item)}
              aria-label="Decrease quantity"
              className="w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>

            {/* Current quantity displayed in a fixed-width span for visual stability */}
            <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>

            {/* Increment button — calls onIncrement */}
            <button
              onClick={() => onIncrement(item)}
              aria-label="Increase quantity"
              className="w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Line total: unitPrice × quantity, locale-formatted with ৳ prefix (Bangladeshi Taka) */}
          <span className="text-sm font-bold text-primary">
            ৳{(unitPrice * item.quantity).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Remove button — anchored to the top-right of the card via self-start */}
      <button
        onClick={() => onRemove(item.id)}
        aria-label="Remove item"
        className="text-muted-foreground hover:text-destructive transition-colors self-start"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};

/**
 * Memoised export — cart rows only re-render when their `item` or callback
 * identity changes. Parents should stabilise callbacks with useCallback to
 * realise the benefit (FloatingCartSidebar already does).
 */
export default memo(CartLineItem);
