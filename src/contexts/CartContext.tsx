import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { useToast } from "@/hooks/use-toast";
import { trackAddToCart } from "@/components/seo/AnalyticsTracker";

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  size: string | null;
  color: string | null;
  product: {
    id: string;
    name: string;
    price: number;
    sale_price: number | null;
    image_url: string | null;
    category: string;
  };
}

interface CartContextType {
  items: CartItem[];
  loading: boolean;
  itemCount: number;
  total: number;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (productId: string, quantity: number, size?: string, color?: string) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
}

const GUEST_CART_KEY = "guest_cart_items";

interface GuestCartEntry {
  id: string;
  product_id: string;
  quantity: number;
  size: string | null;
  color: string | null;
}

const getGuestCart = (): GuestCartEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(GUEST_CART_KEY) || "[]");
  } catch { return []; }
};

const saveGuestCart = (entries: GuestCartEntry[]) => {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(entries));
};

export const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch product details for guest cart entries
  const hydrateGuestCart = async (entries: GuestCartEntry[]): Promise<CartItem[]> => {
    if (entries.length === 0) return [];
    const productIds = [...new Set(entries.map(e => e.product_id))];
    const { data: products } = await supabase
      .from("products")
      .select("id, name, price, sale_price, image_url, category")
      .in("id", productIds);
    if (!products) return [];
    const productMap = new Map(products.map(p => [p.id, p]));
    return entries
      .filter(e => productMap.has(e.product_id))
      .map(e => ({ ...e, product: productMap.get(e.product_id)! }));
  };

  // Migrate guest cart to DB on login
  const migrateGuestCart = async (userId: string) => {
    const guestEntries = getGuestCart();
    if (guestEntries.length === 0) return;
    for (const entry of guestEntries) {
      // Check if already in DB cart
      const { data: existing } = await supabase
        .from("cart_items")
        .select("id, quantity")
        .eq("user_id", userId)
        .eq("product_id", entry.product_id)
        .eq("size", entry.size ?? "")
        .eq("color", entry.color ?? "")
        .maybeSingle();
      if (existing) {
        await supabase.from("cart_items").update({ quantity: existing.quantity + entry.quantity }).eq("id", existing.id);
      } else {
        await supabase.from("cart_items").insert({
          user_id: userId,
          product_id: entry.product_id,
          quantity: entry.quantity,
          size: entry.size,
          color: entry.color,
        });
      }
    }
    localStorage.removeItem(GUEST_CART_KEY);
  };

  const fetchCart = async () => {
    if (!user) {
      // Guest cart from localStorage
      const entries = getGuestCart();
      const hydrated = await hydrateGuestCart(entries);
      setItems(hydrated);
      setLoading(false);
      return;
    }

    try {
      // Migrate guest cart on login
      await migrateGuestCart(user.id);

      const { data, error } = await supabase
        .from("cart_items")
        .select(`id, product_id, quantity, size, color, product:products (id, name, price, sale_price, image_url, category)`)
        .eq("user_id", user.id);

      if (error) throw error;
      setItems((data as unknown as CartItem[]) || []);
    } catch (error) {
      console.error("Error fetching cart:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCart();
  }, [user]);

  const addToCart = useCallback(async (productId: string, quantity: number, size?: string, color?: string) => {
    // Fire analytics for EVERY add to cart (guest + logged-in) — funnel tracking
    const fireTracking = async () => {
      try {
        // Try from current items first
        let p: { id: string; name: string; price: number; sale_price: number | null; category: string } | undefined =
          items.find(i => i.product_id === productId)?.product as any;
        if (!p) {
          const { data } = await supabase
            .from("products")
            .select("id, name, price, sale_price, category")
            .eq("id", productId)
            .maybeSingle();
          if (data) p = data as any;
        }
        if (p) {
          const price = p.sale_price ?? p.price;
          trackAddToCart({ id: p.id, name: p.name, price, category: p.category }, quantity);
        }
      } catch (err) {
        console.warn("AddToCart tracking failed:", err);
      }
    };

    if (!user) {
      // Guest: use localStorage
      const entries = getGuestCart();
      const existing = entries.find(
        e => e.product_id === productId && e.size === (size || null) && e.color === (color || null)
      );
      if (existing) {
        existing.quantity += quantity;
      } else {
        entries.push({ id: crypto.randomUUID(), product_id: productId, quantity, size: size || null, color: color || null });
      }
      saveGuestCart(entries);
      const hydrated = await hydrateGuestCart(entries);
      setItems(hydrated);
      toast({ title: "Added to cart", description: "Item has been added to your cart" });
      setCartOpen(true);
      void fireTracking();
      return;
    }

    try {
      const existing = items.find(
        item => item.product_id === productId && item.size === (size || null) && item.color === (color || null)
      );
      if (existing) {
        await updateQuantity(existing.id, existing.quantity + quantity);
      } else {
        const { error } = await supabase.from("cart_items").insert({
          user_id: user.id, product_id: productId, quantity, size: size || null, color: color || null,
        });
        if (error) throw error;
        await fetchCart();
      }
      toast({ title: "Added to cart", description: "Item has been added to your cart" });
      setCartOpen(true);
      void fireTracking();
    } catch (error) {
      console.error("Error adding to cart:", error);
      toast({ title: "Error", description: "Failed to add item to cart", variant: "destructive" });
    }
  }, [user, items, toast]);

  const updateQuantity = useCallback(async (itemId: string, quantity: number) => {
    if (quantity < 1) { await removeItem(itemId); return; }

    if (!user) {
      const entries = getGuestCart();
      const entry = entries.find(e => e.id === itemId);
      if (entry) entry.quantity = quantity;
      saveGuestCart(entries);
      const hydrated = await hydrateGuestCart(entries);
      setItems(hydrated);
      return;
    }

    try {
      const { error } = await supabase.from("cart_items").update({ quantity }).eq("id", itemId);
      if (error) throw error;
      await fetchCart();
    } catch (error) {
      console.error("Error updating cart:", error);
      toast({ title: "Error", description: "Failed to update cart", variant: "destructive" });
    }
  }, [user, toast]);

  const removeItem = useCallback(async (itemId: string) => {
    if (!user) {
      const entries = getGuestCart().filter(e => e.id !== itemId);
      saveGuestCart(entries);
      const hydrated = await hydrateGuestCart(entries);
      setItems(hydrated);
      toast({ title: "Removed", description: "Item removed from cart" });
      return;
    }

    try {
      const { error } = await supabase.from("cart_items").delete().eq("id", itemId);
      if (error) throw error;
      await fetchCart();
      toast({ title: "Removed", description: "Item removed from cart" });
    } catch (error) {
      console.error("Error removing item:", error);
      toast({ title: "Error", description: "Failed to remove item", variant: "destructive" });
    }
  }, [user, toast]);

  const clearCart = useCallback(async () => {
    if (!user) {
      localStorage.removeItem(GUEST_CART_KEY);
      setItems([]);
      return;
    }
    try {
      const { error } = await supabase.from("cart_items").delete().eq("user_id", user.id);
      if (error) throw error;
      setItems([]);
    } catch (error) {
      console.error("Error clearing cart:", error);
    }
  }, [user]);

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const total = useMemo(() => items.reduce((sum, item) => {
    const price = item.product.sale_price || item.product.price;
    return sum + price * item.quantity;
  }, 0), [items]);

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const value = useMemo(() => ({ items, loading, itemCount, total, cartOpen, openCart, closeCart, addToCart, updateQuantity, removeItem, clearCart, refreshCart: fetchCart }), [items, loading, itemCount, total, cartOpen, openCart, closeCart, addToCart, updateQuantity, removeItem, clearCart]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
