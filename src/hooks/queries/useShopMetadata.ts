// ============= Full file contents =============

/**
 * @file useShopMetadata.ts
 * @module hooks/queries/useShopMetadata
 *
 * @description
 * Composite hook that pre-fetches all static metadata required by the Shop
 * filter/sort UI in a single call site. It runs **four independent parallel
 * queries** via React Query and merges their results into one ergonomic object.
 *
 * ### Queries
 * | Key                | Table            | Purpose                                    |
 * |--------------------|------------------|--------------------------------------------|
 * | `shop-categories`  | `categories`     | Ordered list of active product categories  |
 * | `shop-ratings`     | `product_reviews`| Per-product average rating + review count  |
 * | `shop-materials`   | `products`       | Deduplicated, sorted list of materials     |
 * | `shop-max-price`   | `products`       | Highest product price (for range slider)   |
 *
 * ### Cache strategy
 * All queries use a 5-minute `staleTime` (max-price uses 10 min) because shop
 * metadata changes infrequently and re-fetching on every mount would be noisy.
 * `gcTime` on the ratings query is set to 10 min to keep aggregated data in
 * memory slightly longer since computing it is non-trivial.
 *
 * ### Ratings aggregation
 * The ratings query fetches all `(product_id, rating)` rows and aggregates
 * client-side into `{ [productId]: { avg, count } }` to avoid a custom RPC.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type RatingSummary } from "@/types/product";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * Represents a single product category row returned from the `categories`
 * table.
 *
 * `name_bn` is the Bengali localisation of the category name.
 * (বাংলা: পণ্যের বিভাগের নাম)
 */
export interface CategoryItem {
  /** English category name, e.g. "Sarees". */
  name: string;
  /**
   * Bengali localised name, e.g. "শাড়ি".
   * Null when the translation has not yet been added to the CMS.
   * (বাংলা: বিভাগের বাংলা নাম — অনুবাদ না থাকলে null)
   */
  name_bn: string | null;
  /** URL-friendly slug, e.g. "sarees". Used in filter query-params. */
  slug: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches and returns all static metadata needed by the Shop page filters.
 *
 * All four sub-queries run in parallel; the hook is safe to call on mount
 * because React Query deduplicates identical query keys globally.
 *
 * @returns An object with the following fields (all default to empty/zero
 *          while loading so callers need no extra loading guards):
 *
 * | Field        | Type                          | Default  |
 * |--------------|-------------------------------|----------|
 * | `categories` | `CategoryItem[]`              | `[]`     |
 * | `ratings`    | `Record<string, RatingSummary>` | `{}`   |
 * | `materials`  | `string[]`                    | `[]`     |
 * | `maxPrice`   | `number`                      | `50000`  |
 *
 * @example
 * const { categories, materials, maxPrice, ratings } = useShopMetadata();
 */
export const useShopMetadata = () => {

  // ── Query 1: Active product categories ─────────────────────────────────
  // Ordered by `display_order` so the filter sidebar matches the CMS order.
  const categoriesQuery = useQuery({
    queryKey: ["shop-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("name, name_bn, slug")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data as CategoryItem[]) || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — categories change infrequently
  });

  // ── Query 2: Per-product rating summaries ───────────────────────────────
  // Fetches raw (product_id, rating) rows then aggregates client-side.
  // The result shape mirrors RatingSummary: { avg: number; count: number }.
  const ratingsQuery = useQuery<Record<string, RatingSummary>>({
    queryKey: ["shop-ratings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("product_id, rating");
      if (error) throw error;

      // Accumulate total + count per product_id in a single pass
      const acc: Record<string, { total: number; count: number }> = {};
      (data || []).forEach((r) => {
        if (!acc[r.product_id]) acc[r.product_id] = { total: 0, count: 0 };
        acc[r.product_id].total += r.rating;
        acc[r.product_id].count += 1;
      });

      // Compute averages from the accumulated totals
      const out: Record<string, RatingSummary> = {};
      for (const [id, v] of Object.entries(acc)) {
        out[id] = { avg: v.total / v.count, count: v.count };
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,   // 5 minutes — review counts change moderately
    gcTime: 10 * 60 * 1000,     // keep aggregated data in memory for 10 min
  });

  // ── Query 3: Available materials ────────────────────────────────────────
  // Pulls all non-null material values from products, deduplicates with a Set,
  // and returns a sorted array for the material filter checkbox list.
  const materialsQuery = useQuery({
    queryKey: ["shop-materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("material")
        .not("material", "is", null); // exclude rows with no material set
      if (error) throw error;

      // Use a Set to deduplicate materials (e.g. multiple products may share "Cotton")
      const set = new Set<string>();
      (data || []).forEach((p) => { if (p.material) set.add(p.material); });
      return Array.from(set).sort(); // alphabetical order for consistent UI
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Query 4: Maximum product price ─────────────────────────────────────
  // Used to set the upper bound of the price range slider.
  // Falls back to 50 000 (BDT) if no products exist or the query fails.
  const maxPriceQuery = useQuery({
    queryKey: ["shop-max-price"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("price")
        .order("price", { ascending: false }) // highest price first
        .limit(1);                             // only need the maximum
      // Default 50 000 keeps the slider functional even with no products
      return data?.[0]?.price || 50000;
    },
    staleTime: 10 * 60 * 1000, // price ceiling changes rarely
  });

  // ── Merged return value ─────────────────────────────────────────────────
  // Safe defaults ensure callers can destructure immediately without guards.
  return {
    /** Active product categories ordered by `display_order`. */
    categories: categoriesQuery.data ?? [],
    /** Map of productId → { avg, count } for all reviewed products. */
    ratings: ratingsQuery.data ?? {},
    /** Alphabetically sorted list of unique materials across all products. */
    materials: materialsQuery.data ?? [],
    /** Highest product price; used as the max value of the price range slider. */
    maxPrice: maxPriceQuery.data ?? 50000,
  };
};
