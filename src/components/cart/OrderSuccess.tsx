/**
 * @file OrderSuccess.tsx
 * @module components/cart
 *
 * @description
 * Post-order confirmation screen shown inside the FloatingCartSidebar after
 * a successful order placement. Displays a green success icon, a thank-you
 * heading, the short order ID, and two navigation buttons.
 *
 * Bengali strings:
 *  - "ধন্যবাদ! 🎉"                         — "Thank you!" — ধন্যবাদ বার্তা
 *  - "আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে।" — order accepted — অর্ডার গৃহীত বার্তা
 *  - "অর্ডার ট্র্যাক করুন"                  — "Track Order" — ট্র্যাক বাটন
 *  - "আরো শপিং করুন"                        — "Shop More"   — শপিং বাটন
 */

import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

/**
 * Props for OrderSuccess.
 */
interface OrderSuccessProps {
  /** UUID of the placed order. Displayed truncated to 8 uppercase chars. Null-safe. */
  orderId: string | null;
  /**
   * Called before navigating away so the parent can reset state and close
   * the drawer before React Router changes the route.
   */
  onAfterAction: () => void;
}

/**
 * OrderSuccess — post-checkout confirmation card rendered inside the cart drawer.
 *
 * @param props - {@link OrderSuccessProps}
 * @returns A centred column with a success icon, headings, order ID badge,
 *          and two action buttons (track order / keep shopping).
 */
const OrderSuccess = ({ orderId, onAfterAction }: OrderSuccessProps) => {
  const navigate = useNavigate();

  return (
    <div className="text-center py-8">
      {/* Green circle icon container — signals success visually */}
      <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
        <ShoppingBag className="w-8 h-8 text-green-600" />
      </div>

      {/* "ধন্যবাদ! 🎉" — Bengali: "Thank you!" — ধন্যবাদ বার্তা */}
      <h3 className="font-display text-xl font-bold mb-2">ধন্যবাদ! 🎉</h3>

      {/* "আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে।" — "Your order has been accepted." — অর্ডার গৃহীত বার্তা */}
      <p className="text-muted-foreground text-sm mb-1">
        আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে।
      </p>

      {/* Short order ID badge — only rendered when an orderId exists.
          Sliced to 8 chars and uppercased for a compact, readable reference. */}
      {orderId && (
        <p className="text-xs text-muted-foreground font-mono mb-4">
          Order ID: {orderId.slice(0, 8).toUpperCase()}
        </p>
      )}

      <div className="space-y-2">
        {/* "অর্ডার ট্র্যাক করুন" — "Track your order" — ট্র্যাক বাটন
            Calls onAfterAction first to reset sidebar state, then navigates. */}
        <Button onClick={() => { onAfterAction(); navigate("/order-tracking"); }} className="w-full">
          অর্ডার ট্র্যাক করুন
        </Button>

        {/* "আরো শপিং করুন" — "Shop more" — শপিং বাটন */}
        <Button variant="outline" onClick={() => { onAfterAction(); navigate("/shop"); }} className="w-full">
          আরো শপিং করুন
        </Button>
      </div>
    </div>
  );
};

export default OrderSuccess;
