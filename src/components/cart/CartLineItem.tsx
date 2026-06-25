import { Trash2, Plus, Minus } from "lucide-react";
import type { CartItem } from "@/contexts/CartContext";

interface CartLineItemProps {
  item: CartItem;
  onIncrement: (item: CartItem) => void;
  onDecrement: (item: CartItem) => void;
  onRemove: (itemId: string) => void;
}

/** A single row in the cart drawer: thumbnail, options, qty stepper, line total. */
const CartLineItem = ({ item, onIncrement, onDecrement, onRemove }: CartLineItemProps) => {
  const unitPrice = item.product.sale_price || item.product.price;
  return (
    <div className="flex gap-3 p-3 rounded-xl bg-muted/50 border border-border">
      <img
        src={item.product.image_url || "/placeholder.svg"}
        alt={item.product.name}
        className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-foreground truncate">{item.product.name}</h4>
        <p className="text-xs text-muted-foreground">
          {item.size && `Size: ${item.size}`}
          {item.size && item.color && " | "}
          {item.color && `Color: ${item.color}`}
        </p>
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDecrement(item)}
              aria-label="Decrease quantity"
              className="w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
            <button
              onClick={() => onIncrement(item)}
              aria-label="Increase quantity"
              className="w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <span className="text-sm font-bold text-primary">
            ৳{(unitPrice * item.quantity).toLocaleString()}
          </span>
        </div>
      </div>
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

export default CartLineItem;
