import { useEffect, useState } from "react";
import { trackInitiateCheckout } from "@/components/seo/AnalyticsTracker";
import type { CartItem } from "@/contexts/CartContext";

export function useCheckoutTracking(items: CartItem[], total: number) {
  const [tracked, setTracked] = useState(false);
  useEffect(() => {
    if (tracked || items.length === 0 || total <= 0) return;
    trackInitiateCheckout(
      total,
      items.map((i) => ({
        id: i.product_id || i.id,
        name: i.product?.name || "Product",
        price: Number(i.product?.sale_price || i.product?.price || 0),
        quantity: i.quantity,
      })),
    );
    setTracked(true);
  }, [items, total, tracked]);
}
