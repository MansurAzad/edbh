/**
 * @file useFeaturedProducts.ts
 * @module hooks/useFeaturedProducts
 *
 * @description
 * Fetches and caches the list of featured products shown on the homepage.
 *
 * Three exports are provided:
 *  1. `fetchFeaturedProducts` – raw async fetcher (reusable outside React Query).
 *  2. `useFeaturedProducts`   – React Query hook for component-level subscription.
 *  3. `prefetchFeaturedProducts` – call at module-eval time to warm the cache
 *     before any React component mounts, eliminating the loading spinner in
 *     most cases.
 *
 * Cache key: `["featured-products-home"]` (FEATURED_PRODUCTS_KEY)
 * staleTime: 5 minutes  — product listings change infrequently enough that a
 *   5-minute window avoids redundant fetches across normal browsing sessions.
 * gcTime:    15 minutes — keeps data in memory well past the stale window so
 *   navigating away and back does not trigger a new network request.
 *
 * Column selection (`SELECT` constant):
 *   Only the columns required to render product cards are fetched.
 *   `description` and `video_url` are intentionally excluded — they can be
 *   large and are not displayed in card view.
 *
 * Auth requirement: none — featured products are public.
 * No localStorage or subscription side-effects.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type Product } from "@/types/product";
import { queryClient } from "@/lib/query-client";

/**
 * Stable React Query cache key for the featured-products query.
 * Import this constant to invalidate the cache after a product mutation
 * (e.g. `queryClient.invalidateQueries({ queryKey: FEATURED_PRODUCTS_KEY })`).
 *
 * @type {readonly ["featured-products-home"]}
 */
export const FEATURED_PRODUCTS_KEY = ["featured-products-home"] as const;

/**
 * Slim column projection — enough to render product cards without pulling
 * heavy fields like `description` or `video_url`.
 */
const SELECT = "id, name, price, sale_price, image_url, category, sizes, colors, slug, stock";

/**
 * Fetches up to 12 featured products from Supabase.
 *
 * Exported as a standalone async function so it can be reused by
 * `prefetchFeaturedProducts` and any SSR/loader context that needs the data
 * outside of a React component tree.
 *
 * @returns {Promise<Product[]>} Array of featured products (max 12).
 * @throws Supabase `PostgrestError` if the query fails.
 */
export const fetchFeaturedProducts = async (): Promise<Product[]> => {
  const { data, error } = await supabase
    .from("products")
    .select(SELECT)
    .eq("featured", true)
    .limit(12);
  if (error) throw error;
  return (data || []) as Product[];
};

/**
 * React Query hook that subscribes a component to the featured-products cache.
 *
 * Multiple components calling this hook share a single network request and
 * cache entry thanks to the stable `FEATURED_PRODUCTS_KEY`.
 *
 * @example
 * ```tsx
 * const { data: products = [], isLoading } = useFeaturedProducts();
 * ```
 *
 * @returns React Query result wrapping a `Product[]` array.
 *
 * @sideEffects Executes `fetchFeaturedProducts` on first mount or after
 *   the 5-minute stale window expires.
 */
export const useFeaturedProducts = () =>
  useQuery({
    queryKey: FEATURED_PRODUCTS_KEY,
    queryFn: fetchFeaturedProducts,
    staleTime: 5 * 60 * 1000,  // 5 minutes
    gcTime: 15 * 60 * 1000,    // 15 minutes
  });

/**
 * Warms the React Query cache with featured-products data as early as
 * possible — ideally at module-evaluation time, before React mounts.
 *
 * Call this at the top of the homepage module (outside any component) so
 * that by the time the FeaturedProducts section renders, the data is already
 * in cache and no loading state is shown to the user.
 *
 * @example
 * ```ts
 * // homepage.tsx (top level, outside component)
 * prefetchFeaturedProducts();
 * ```
 *
 * @sideEffects Dispatches a background Supabase query via `queryClient`.
 *   No-ops if fresh data is already cached (respects `staleTime`).
 */
export const prefetchFeaturedProducts = () => {
  queryClient.prefetchQuery({
    queryKey: FEATURED_PRODUCTS_KEY,
    queryFn: fetchFeaturedProducts,
    staleTime: 5 * 60 * 1000,
  });
};
