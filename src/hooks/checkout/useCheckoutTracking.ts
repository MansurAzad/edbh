/**
 * @fileoverview Analytics tracking hook for the checkout flow.
 *
 * Fires the "Initiate Checkout" pixel/analytics event exactly once per
 * checkout session — regardless of how many times the component re-renders.
 *
 * চেকআউট ফ্লোর জন্য অ্যানালিটিক্স ট্র্যাকিং হুক।
 * "Initiate Checkout" ইভেন্ট একটি চেকআউট সেশনে মাত্র একবার পাঠানো হয়।
 *
 * @module hooks/checkout/useCheckoutTracking
 */

import { useEffect, useState } from "react";
import { trackInitiateCheckout } from "@/components/seo/AnalyticsTracker";
import type { CartItem } from "@/contexts/CartContext";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fires a single "Initiate Checkout" analytics event when the user first
 * arrives at the checkout page with a non-empty cart and a positive total.
 *
 * গ্রাহক যখন প্রথমবার চেকআউট পেজে আসেন তখন একটি "Initiate Checkout"
 * অ্যানালিটিক্স ইভেন্ট পাঠায়। একবারের বেশি পাঠানো হয় না।
 *
 * ### Firing conditions / ইভেন্ট পাঠানোর শর্ত
 * The event is sent only when **all** of the following are true:
 * 1. The event has **not** been sent during this render lifecycle (`tracked === false`).
 * 2. The cart has **at least one item** (`items.length > 0`).
 * 3. The order total is **positive** (`total > 0`).
 *
 * ### Idempotency / একবারই পাঠানো
 * The `tracked` flag is set to `true` after the first successful fire and is
 * never reset, so navigating between checkout steps does not re-fire the event.
 * `tracked` একবার `true` হলে আর কখনো `false` হয় না।
 *
 * @param {CartItem[]} items - Current cart line items to include in the event payload.
 *   কার্টের আইটেমগুলো — অ্যানালিটিক্স পেলোডে পাঠানো হয়।
 * @param {number} total - Grand total of the order in BDT (including shipping).
 *   অর্ডারের মোট মূল্য (শিপিং সহ, বাংলাদেশি টাকায়)।
 * @returns {void} This hook has no return value; it operates via side effects.
 *   এই হুকের কোনো রিটার্ন ভ্যালু নেই।
 *
 * @example
 * // Inside the root Checkout page component:
 * // চেকআউট পেজ কম্পোনেন্টে ব্যবহার:
 * useCheckoutTracking(cartItems, orderTotal);
 */
export function useCheckoutTracking(items: CartItem[], total: number): void {
  /**
   * Local flag to prevent duplicate event fires within the same component
   * lifecycle (e.g. due to parent re-renders or React StrictMode double-invoke).
   *
   * একই lifecycle-এ duplicate ইভেন্ট আটকানোর জন্য লোকাল ফ্ল্যাগ।
   * React StrictMode-এ double-invoke হলেও দ্বিতীয়বার পাঠাবে না।
   */
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    // ── Guard: skip if already tracked, cart is empty, or total is zero ──
    // শর্ত পূরণ না হলে কিছু করা হবে না।
    if (tracked || items.length === 0 || total <= 0) return;

    // ── Build the product array expected by the analytics helper ──────────
    // অ্যানালিটিক্স পেলোডের জন্য প্রতিটি কার্ট আইটেমকে রূপান্তর করা হচ্ছে।
    trackInitiateCheckout(
      total,
      items.map((i) => ({
        // Prefer product_id (Supabase FK) over cart-level id as the canonical SKU.
        // Supabase FK থাকলে সেটি ব্যবহার করা হয়, না হলে cart-level id।
        id: i.product_id || i.id,

        // Fall back to a generic label if the product join is missing.
        // প্রোডাক্ট নাম না পেলে ডিফল্ট "Product" ব্যবহার করা হয়।
        name: i.product?.name || "Product",

        // Use sale_price if available, otherwise regular price. Default 0.
        // সেল প্রাইস থাকলে সেটি, না হলে নিয়মিত মূল্য ব্যবহার করা হয়।
        price: Number(i.product?.sale_price || i.product?.price || 0),

        quantity: i.quantity,
      })),
    );

    // Mark as tracked so this effect never fires again in this session.
    // একবার পাঠানোর পর ফ্ল্যাগ true করা হয়।
    setTracked(true);
  }, [items, total, tracked]); // Re-evaluate if cart items, total, or flag changes
                               // কার্ট, মোট বা ফ্ল্যাগ পরিবর্তন হলে effect চলবে
}
