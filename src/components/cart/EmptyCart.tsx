/**
 * @file EmptyCart.tsx
 * @module components/cart
 *
 * @description
 * Stateless placeholder rendered inside the floating cart drawer when the
 * user's cart contains no items. It shows a bag icon, a Bengali message
 * telling the user the cart is empty, and a button to dismiss the drawer
 * and continue shopping.
 *
 * Bengali strings present in this file:
 *  - "আপনার কার্ট খালি" — "Your cart is empty"  — খালি কার্টের বার্তা
 *  - "শপিং করুন"        — "Continue Shopping"    — শপিং বাটন
 */

import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * EmptyCart — zero-item placeholder for the cart drawer.
 *
 * Displayed when `items.length === 0` in {@link FloatingCartSidebar}.
 * Calling `onClose` dismisses the sidebar so the user can browse products.
 *
 * @param props.onClose - Callback to close the parent cart drawer.
 * @returns A centred column with an icon, a message, and a CTA button.
 *
 * @example
 * {items.length === 0 && <EmptyCart onClose={closeDrawer} />}
 */
const EmptyCart = ({ onClose }: { onClose: () => void }) => (
  // Generous vertical padding centres the content in the visible drawer area.
  <div className="text-center py-12">
    {/* Shopping-bag icon serves as a visual cue that the cart section is empty */}
    <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-3" />

    {/* "আপনার কার্ট খালি" — Bengali: "Your cart is empty" — খালি কার্টের বার্তা */}
    <p className="text-muted-foreground text-sm">আপনার কার্ট খালি</p>

    {/* "শপিং করুন" — Bengali: "Shop now / Continue Shopping" — শপিং বাটন
        Clicking closes the sidebar so the user can browse the catalogue. */}
    <Button variant="outline" onClick={onClose} className="mt-4">শপিং করুন</Button>
  </div>
);

export default EmptyCart;
