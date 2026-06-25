/**
 * @file useCachedData.ts
 * @module hooks/useCachedData
 *
 * @description
 * Collection of aggressively-cached React Query hooks for data that is
 * read-heavy, rarely updated, and shared across many components.
 *
 * Design rationale — shared query keys:
 *  Every hook in this file uses a single, stable query key so that all
 *  consumers across the component tree share ONE network request and ONE
 *  cached result.  Without this, N components mounting simultaneously would
 *  each trigger their own fetch.
 *
 * Cache windows:
 *  | Hook                    | staleTime  | gcTime    |
 *  |-------------------------|------------|-----------|
 *  | useActiveCategories     | 30 minutes | 60 minutes|
 *  | useActiveCoupons        | 10 minutes | 30 minutes|
 *  | useSocialProofMessages  | 30 minutes | 60 minutes|
 *
 * Staleness vs garbage-collection:
 *  - `staleTime` — window in which cached data is served without a background
 *    refetch.  After this, the next consumer mount triggers a background fetch.
 *  - `gcTime` — how long an *unused* (no active subscribers) cache entry is
 *    kept in memory before being discarded.
 *
 * No auth requirement — all three hooks fetch publicly visible data.
 * No localStorage usage — data lives only in React Query's in-memory cache.
 *
 * Exported query-key constants (CATEGORIES_KEY, COUPONS_KEY,
 * SOCIAL_PROOF_KEY) allow other parts of the app (e.g. admin mutations) to
 * invalidate these caches without string-coupling.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Shared constant
// ---------------------------------------------------------------------------

/** Milliseconds in one minute — used to build readable cache windows. */
const ONE_MIN = 60 * 1000;

// ===========================================================================
// Active categories
// ===========================================================================

/**
 * Stable React Query cache key for the active categories list.
 * Import this constant when you need to invalidate category data after a
 * mutation (e.g. `queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY })`).
 *
 * @type {readonly ["active-categories"]}
 */
export const CATEGORIES_KEY = ["active-categories"] as const;

/**
 * Fetches all active product categories ordered by their `display_order`.
 *
 * Cache behaviour: stale after 30 minutes, garbage-collected after 60 minutes
 * of inactivity.  Suitable for navigation menus and filter sidebars that do
 * not need real-time accuracy.
 *
 * @example
 * ```tsx
 * const { data: categories = [], isLoading } = useActiveCategories();
 * ```
 *
 * @returns React Query result wrapping an array of category rows from the
 *   `categories` table (`is_active = true`, ordered by `display_order`).
 *
 * @sideEffects Executes a Supabase query on first mount (or after staleTime).
 */
export const useActiveCategories = () =>
  useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
    // Serve cached data for 30 minutes without a background refetch.
    staleTime: 30 * ONE_MIN,
    // Keep unused cache entry in memory for 60 minutes.
    gcTime: 60 * ONE_MIN,
  });

// ===========================================================================
// Active coupons (public)
// ===========================================================================

/**
 * Stable React Query cache key for the public active-coupons list.
 * Import when you need to invalidate coupon data (e.g. after an admin creates
 * or deactivates a coupon).
 *
 * @type {readonly ["active-coupons-public"]}
 */
export const COUPONS_KEY = ["active-coupons-public"] as const;

/**
 * Public-facing coupon data shape returned by `useActiveCoupons`.
 * Deliberately omits internal fields (e.g. `id`, `created_by`).
 */
export interface PublicCoupon {
  /** The coupon code string shown to customers (e.g. "SAVE10"). */
  code: string;
  /** Optional marketing description displayed in the coupon list UI. */
  description: string | null;
  /** "percentage" | "fixed" — determines how `discount_value` is applied. */
  discount_type: string;
  /** Numeric discount amount (percent or fixed BDT depending on `discount_type`). */
  discount_value: number;
  /** How many times this coupon has already been redeemed. */
  current_uses: number;
  /** Maximum allowed redemptions; `null` means unlimited. */
  max_uses: number | null;
  /** ISO-8601 datetime from which the coupon is valid; `null` = no start limit. */
  valid_from: string | null;
  /** ISO-8601 datetime after which the coupon expires; `null` = never expires. */
  valid_until: string | null;
}

/**
 * Fetches the 10 most recently created active coupons for display in the
 * storefront (e.g. a "Available Offers" panel).
 *
 * Cache behaviour: stale after 10 minutes, garbage-collected after 30 minutes.
 * Shorter window than categories because coupon validity is more time-sensitive.
 *
 * @example
 * ```tsx
 * const { data: coupons = [] } = useActiveCoupons();
 * ```
 *
 * @returns React Query result wrapping a `PublicCoupon[]` array (max 10 items).
 *
 * @sideEffects Executes a Supabase query on first mount (or after staleTime).
 */
export const useActiveCoupons = () =>
  useQuery({
    queryKey: COUPONS_KEY,
    queryFn: async () => {
      const { data } = await supabase
        .from("coupons")
        .select("code, description, discount_type, discount_value, current_uses, max_uses, valid_from, valid_until")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(10); // Cap to 10 — the UI only displays a handful of offers.
      return (data || []) as PublicCoupon[];
    },
    staleTime: 10 * ONE_MIN,
    gcTime: 30 * ONE_MIN,
  });

// ===========================================================================
// Social-proof messages
// ===========================================================================

/**
 * Stable React Query cache key for social-proof (FOMO) messages.
 *
 * @type {readonly ["social-proof-messages"]}
 */
export const SOCIAL_PROOF_KEY = ["social-proof-messages"] as const;

/**
 * A single social-proof notification item shown on the storefront
 * (e.g. "Someone from Dhaka bought [product] 5 minutes ago").
 */
export interface SocialProofItem {
  /**
   * Product name shown in the notification.
   * বাংলা: পণ্যের নাম যা নোটিফিকেশনে দেখানো হয়।
   */
  product_name: string;
  /**
   * City of the buyer.
   * বাংলা: ক্রেতার শহর।
   */
  city: string;
  /**
   * Human-readable elapsed time string in Bengali, e.g. "৫ মিনিট আগে".
   * বাংলা: কেনার কত সময় আগে হয়েছে তার বর্ণনা (বাংলায়)।
   */
  time_ago: string;
  /** Template message string (may contain `{product}` placeholder). */
  message: string;
}

/**
 * Fetches social-proof messages for the live-purchase notification widget.
 *
 * Waterfall data strategy:
 *  1. First checks `social_proof_messages` for admin-curated custom messages
 *     (`is_active = true`, ordered by `display_order`).
 *  2. If none exist, falls back to the 20 most recent real orders and derives
 *     Bengali time-ago strings ("X মিনিট আগে" / "X ঘণ্টা আগে" / "X দিন আগে")
 *     from the order's `created_at` timestamp.
 *
 * Cache behaviour: stale after 30 minutes, garbage-collected after 60 minutes.
 *
 * @example
 * ```tsx
 * const { data: messages = [] } = useSocialProofMessages();
 * ```
 *
 * @returns React Query result wrapping a `SocialProofItem[]` array.
 *
 * @sideEffects
 *  - Executes up to two Supabase queries per cache window (custom messages,
 *    then orders if custom messages are empty).
 */
export const useSocialProofMessages = () =>
  useQuery<SocialProofItem[]>({
    queryKey: SOCIAL_PROOF_KEY,
    queryFn: async () => {
      // --- Step 1: try admin-curated messages first ---
      const { data: custom } = await supabase
        .from("social_proof_messages")
        .select("product_name, city, time_ago, message")
        .eq("is_active", true)
        .order("display_order");

      // If any custom entries exist, use them directly — no order query needed.
      if (custom && custom.length > 0) return custom as SocialProofItem[];

      // --- Step 2: derive notifications from real recent orders ---
      const { data } = await supabase
        .from("orders")
        .select("shipping_city, created_at, order_items(product_name)")
        .order("created_at", { ascending: false })
        .limit(20);

      return (data || [])
        .filter((o: any) => o.order_items?.length > 0) // Skip orders with no items.
        .map((o: any) => {
          // Calculate elapsed minutes since the order was placed.
          const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);

          // Format Bengali time-ago string:
          //  < 60 min  → "X মিনিট আগে"   (X minutes ago)
          //  < 24 h    → "X ঘণ্টা আগে"   (X hours ago)
          //  ≥ 24 h    → "X দিন আগে"     (X days ago)
          const time_ago =
            mins < 60
              ? `${mins} মিনিট আগে`
              : mins < 1440
              ? `${Math.floor(mins / 60)} ঘণ্টা আগে`
              : `${Math.floor(mins / 1440)} দিন আগে`;

          return {
            product_name: o.order_items[0].product_name,
            city: o.shipping_city,
            time_ago,
            // Template; `{product}` can be substituted by the rendering component.
            message: "কেউ একজন {product} কিনেছেন!",
          };
        });
    },
    staleTime: 30 * ONE_MIN,
    gcTime: 60 * ONE_MIN,
  });
