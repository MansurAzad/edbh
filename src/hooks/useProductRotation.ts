/**
 * @file useProductRotation.ts
 * @module hooks/useProductRotation
 *
 * @description
 * Utilities and hooks that power the **time-based product-image rotation**
 * system shown on listing/grid pages.
 *
 * ## Architecture
 *
 * ```
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  useImageRotationTick()                                  │
 *  │    - Derives a "bucket index" from the wall clock        │
 *  │    - Bucket changes every TWO_HOURS_MS (2 h)             │
 *  │    - Uses a self-rescheduling setTimeout so the bucket   │
 *  │      flips exactly at the next 2-hour boundary           │
 *  └──────────┬───────────────────────────────────────────────┘
 *             │ tick (number)
 *  ┌──────────▼───────────────────────────────────────────────┐
 *  │  useRotatedImage()                                       │
 *  │    - Combines main + variant + gallery images            │
 *  │    - Picks one deterministically using a per-product     │
 *  │      hash XOR'd with the current tick                    │
 *  └──────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Time buckets
 * Dividing `Date.now()` by a fixed millisecond window gives an integer
 * "bucket" that is identical for every user viewing the site at the same
 * time, so all visitors see the same product image simultaneously — useful
 * for cohesive marketing snapshots.
 *
 * ## No localStorage / no server state
 * All rotation state is derived from `Date.now()` alone; nothing is persisted
 * between page loads.  The only async I/O is the Supabase query for alternate
 * image URLs, which is cached by React Query.
 *
 * ---
 * বাংলা: এই মডিউলটি পণ্যের ছবি প্রতি ২ ঘণ্টায় পরিবর্তন করে।
 * কোনো localStorage ব্যবহার হয় না — সময়ের উপর ভিত্তি করে ছবি নির্বাচন করা হয়।
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type Product, getProductImage } from "@/types/product";

// ---------------------------------------------------------------------------
// Time-window constants
// ---------------------------------------------------------------------------

/**
 * Length of a single image-rotation bucket in milliseconds (2 hours).
 *
 * `Math.floor(Date.now() / TWO_HOURS_MS)` produces a monotonically increasing
 * integer that increments once every 2 hours — this is the "tick" value.
 * All users online in the same 2-hour window share the same tick, so they
 * see the same rotated image without any server coordination.
 *
 * বাংলা: প্রতি ২ ঘণ্টায় ছবি পরিবর্তনের জন্য সময়-উইন্ডো (মিলিসেকেন্ডে)।
 */
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Length of a single shuffle-seed bucket in milliseconds (6 hours).
 *
 * Used by `useShuffleSeed()` to derive a number that changes four times per
 * day and can be fed into `seededShuffle()` to reorder product grids in a
 * deterministic, reproducible way.
 *
 * বাংলা: প্রতি ৬ ঘণ্টায় পণ্য তালিকার ক্রম পরিবর্তনের জন্য সময়-উইন্ডো।
 */
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Returns the current 2-hour bucket index ("tick") as reactive state.
 *
 * ### How the self-rescheduling timer works
 * 1. On mount the initial tick is read synchronously from `Date.now()`.
 * 2. We calculate how many milliseconds remain until the **next** bucket
 *    boundary: `TWO_HOURS_MS - (Date.now() % TWO_HOURS_MS)`.
 * 3. A `setTimeout` fires at that exact boundary (+100 ms buffer for clock
 *    jitter), updates `tick`, which triggers a re-render.
 * 4. The re-render re-runs the effect with the new tick, which schedules the
 *    *next* boundary timer — so the hook self-reschedules indefinitely.
 *
 * ### Cleanup
 * The effect returns `() => clearTimeout(t)` so the pending timer is always
 * cancelled before a new one is registered (prevents duplicate firings if the
 * component re-renders for an unrelated reason) and on unmount (prevents
 * calling `setState` on an unmounted component).
 *
 * @returns {number} Monotonically increasing bucket index; increments every 2 h.
 *
 * @example
 * ```tsx
 * // Inside a product card:
 * const tick = useImageRotationTick();
 * const img  = useRotatedImage(product, altImages, tick);
 * ```
 *
 * বাংলা: প্রতি ২ ঘণ্টায় পরিবর্তিত "টিক" মান রিটার্ন করে।
 * setTimeout cleanup নিশ্চিত করে যে unmount-এ কোনো মেমোরি লিক হয় না।
 */
export const useImageRotationTick = () => {
  // Lazy initialiser: read tick synchronously on first render so there is
  // no flash of the wrong image before the first effect fires.
  const [tick, setTick] = useState(() => Math.floor(Date.now() / TWO_HOURS_MS));

  useEffect(() => {
    // Calculate milliseconds remaining in the current 2-hour window.
    // Adding 100 ms guards against sub-millisecond clock imprecision.
    const ms = TWO_HOURS_MS - (Date.now() % TWO_HOURS_MS);

    // Schedule a one-shot timer to update tick at the next bucket boundary.
    // When tick changes this effect re-runs, scheduling the following boundary.
    const t = setTimeout(() => setTick(Math.floor(Date.now() / TWO_HOURS_MS)), ms + 100);

    // CLEANUP: cancel the pending timer to prevent:
    //  a) duplicate firings on intermediate re-renders, and
    //  b) setState calls after the component has unmounted.
    return () => clearTimeout(t);
  }, [tick]); // Re-run whenever tick advances, perpetuating the chain.

  return tick;
};

/**
 * Returns the current 6-hour shuffle-seed bucket index.
 *
 * This is a **non-reactive** helper — it reads `Date.now()` once at call time
 * and does not set up any timer.  Callers that need live updates should
 * combine it with `useMemo` / `useCallback` and re-derive when appropriate.
 *
 * The returned number is fed to `seededShuffle()` to produce a consistent
 * product ordering for all users in the same 6-hour window.
 *
 * @returns {number} Current 6-hour bucket index.
 *
 * বাংলা: প্রতি ৬ ঘণ্টায় পরিবর্তিত seed মান রিটার্ন করে।
 * পণ্য তালিকার ক্রম নির্ধারণে ব্যবহার হয়।
 */
export const useShuffleSeed = () => {
  // No state or effect needed — the seed only needs to be derived once per
  // render cycle and changes infrequently enough that a stale value is fine.
  return Math.floor(Date.now() / SIX_HOURS_MS);
};

// ---------------------------------------------------------------------------
// Data-fetching
// ---------------------------------------------------------------------------

/**
 * Fetches all alternate images (variant images + gallery images) for a given
 * list of product IDs and returns a `productId → URL[]` lookup map.
 *
 * ### Query strategy
 * Two Supabase queries run **in parallel** via `Promise.all`:
 *  1. `product_variants` — images for each colour/size variant.
 *  2. `product_images`   — explicitly ordered gallery images.
 *
 * Gallery images are inserted first so they take precedence in the dedup
 * step; variant images that are already present are skipped.
 *
 * ### React Query caching
 * | Option      | Value         | Rationale                                         |
 * |-------------|---------------|---------------------------------------------------|
 * | `staleTime` | 30 min        | Alternate images change rarely; avoid refetching  |
 * | `gcTime`    | 60 min        | Keep in cache for 1 hour after all subscribers leave |
 * | `enabled`   | productIds.length > 0 | Skip query when the list is empty        |
 *
 * The query key includes a **sorted** join of IDs so the cache entry is
 * independent of the order in which IDs are passed by the caller.
 *
 * @param productIds - Array of product UUID strings to fetch images for.
 * @returns React Query result whose `data` is `Record<string, string[]>`.
 *
 * @example
 * ```tsx
 * const ids = products.map(p => p.id);
 * const { data: altImages } = useProductAlternateImages(ids);
 * ```
 *
 * বাংলা: প্রতিটি পণ্যের বিকল্প ছবি (ভেরিয়েন্ট + গ্যালারি) Supabase থেকে লোড করে।
 * React Query 30 মিনিট পর্যন্ত ক্যাশ করে রাখে।
 */
export const useProductAlternateImages = (productIds: string[]) => {
  return useQuery({
    // Sort IDs so ["b","a"] and ["a","b"] share the same cache entry.
    queryKey: ["product-alternate-images", [...productIds].sort().join(",")],

    // Do not fire if there are no products to look up.
    enabled: productIds.length > 0,

    // Alternate images are stable; 30 min stale time avoids waterfall refetches
    // on every re-render of product grids.
    staleTime: 30 * 60 * 1000, // 30 minutes

    // Keep the cached data for 1 hour after the last subscriber unmounts,
    // so navigating away and back doesn't trigger a fresh network round-trip.
    gcTime: 60 * 60 * 1000, // 60 minutes

    queryFn: async () => {
      // Guard: should be unreachable due to `enabled`, but keeps types clean.
      if (productIds.length === 0) return {} as Record<string, string[]>;

      // Fire both Supabase queries concurrently to minimise latency.
      const [variantsRes, galleryRes] = await Promise.all([
        supabase
          .from("product_variants")
          .select("product_id, image_url")
          .in("product_id", productIds),

        supabase
          .from("product_images")
          .select("product_id, image_url, display_order")
          .in("product_id", productIds)
          .order("display_order"), // Respect the manually curated display order.
      ]);

      // Initialise an empty array for every requested product so callers
      // always get a map with all requested keys, even if a product has no
      // alternate images.
      const map: Record<string, string[]> = {};
      for (const id of productIds) map[id] = [];

      // Insert gallery images first (display_order is respected by Supabase).
      // Duplicate URLs are skipped to avoid showing the same image twice.
      (galleryRes.data || []).forEach((g) => {
        if (g.image_url && map[g.product_id] && !map[g.product_id].includes(g.image_url)) {
          map[g.product_id].push(g.image_url);
        }
      });

      // Append variant images that are not already in the gallery list.
      (variantsRes.data || []).forEach((v) => {
        if (v.image_url && map[v.product_id] && !map[v.product_id].includes(v.image_url)) {
          map[v.product_id].push(v.image_url);
        }
      });

      return map;
    },
  });
};

// ---------------------------------------------------------------------------
// Image selection
// ---------------------------------------------------------------------------

/**
 * Picks the image URL that should be displayed for a product in the current
 * time bucket.
 *
 * ### Selection algorithm
 * 1. Build `allImages = [mainImage, ...alternateImages]` (deduped).
 * 2. If only one image exists, return it immediately (no rotation).
 * 3. Compute a **stable per-product hash** of the product's UUID string using
 *    a polynomial rolling hash (base 31, bitwise truncated to 32 bits).
 * 4. Add the current `tick` to the hash and take modulo the image count.
 *
 * Because the hash is deterministic for a given product ID and the tick is
 * shared across all users, every visitor sees the same image for a product
 * during any given 2-hour window.
 *
 * ### Why base-31 polynomial hashing?
 * It's fast, produces a well-distributed 32-bit integer for UUID strings,
 * and is collision-resistant enough for this cosmetic use-case.
 *
 * @param product        - The product object (needs `id` and image fields).
 * @param alternateImages - Map from `useProductAlternateImages`; may be undefined
 *                          while the query is still loading (falls back gracefully).
 * @param tick           - Current rotation bucket from `useImageRotationTick()`.
 * @returns {string} The URL of the image to display.
 *
 * @example
 * ```tsx
 * const tick     = useImageRotationTick();
 * const { data } = useProductAlternateImages(ids);
 * const imgUrl   = useRotatedImage(product, data, tick);
 * ```
 *
 * বাংলা: পণ্যের ID-এর hash এবং বর্তমান টিক ব্যবহার করে কোন ছবি দেখাবে তা নির্বাচন করে।
 * সমস্ত ব্যবহারকারী একই সময়ে একই ছবি দেখবেন।
 */
export const useRotatedImage = (
  product: Product,
  alternateImages: Record<string, string[]> | undefined,
  tick: number
): string => {
  // Derive the main image URL through the shared product-image resolver.
  const mainImage = getProductImage(product);

  // Gather any alternate images for this product (empty array while loading).
  const alts = alternateImages?.[product.id] || [];

  // Build a deduplicated image pool: main image is always index 0.
  // Alternate images that duplicate the main image are excluded.
  const allImages = [mainImage, ...alts.filter((u) => u && u !== mainImage)];

  // Fast path: skip hashing if there is nothing to rotate.
  if (allImages.length <= 1) return mainImage;

  // --- Polynomial rolling hash of product.id (UUID string) ---
  // Each character's code point is incorporated with a multiplier of 31.
  // The bitwise OR with 0 truncates to a signed 32-bit integer, preventing
  // floating-point precision loss on very long strings.
  let hash = 0;
  for (let i = 0; i < product.id.length; i++) {
    hash = (hash * 31 + product.id.charCodeAt(i)) | 0;
  }

  // Combine the per-product hash with the time-bucket tick so the selected
  // index advances by one position each time the tick increments.
  // Math.abs guards against negative hash values before the modulo operation.
  const idx = Math.abs(hash + tick) % allImages.length;
  return allImages[idx];
};

// ---------------------------------------------------------------------------
// Shuffle utility
// ---------------------------------------------------------------------------

/**
 * Performs a **deterministic** Fisher-Yates shuffle of an array using a
 * Linear Congruential Generator (LCG) as the random source.
 *
 * ### LCG parameters
 * The parameters `a = 9301`, `c = 49297`, `m = 233280` are a classic,
 * widely-cited LCG configuration with acceptable distribution for non-
 * cryptographic UI purposes (e.g. product grid reordering).
 *
 * ### Determinism guarantee
 * Given the same `seed` and the same input `arr`, this function always
 * produces the same output array.  This means:
 *  - Server-side and client-side renders agree on product order (no
 *    hydration mismatch).
 *  - Two users visiting at the same time (same `useShuffleSeed()` value)
 *    see the same product ordering.
 *
 * The original `arr` is **not mutated** — a shallow copy is made first.
 *
 * @template T - Element type of the array.
 * @param arr  - The array to shuffle.
 * @param seed - Integer seed; values ≤ 0 are normalised to 1 to keep the
 *               LCG sequence valid (avoids a degenerate all-zero stream).
 * @returns {T[]} A new shuffled array (shallow copy of elements).
 *
 * @example
 * ```ts
 * const seed     = useShuffleSeed();            // changes every 6 h
 * const shuffled = seededShuffle(products, seed);
 * ```
 *
 * বাংলা: একটি নির্ধারিত seed ব্যবহার করে array-এর উপাদানগুলো shuffle করে।
 * একই seed-এ সবসময় একই ফলাফল আসে, তাই সব ব্যবহারকারী একই ক্রম দেখেন।
 */
export const seededShuffle = <T>(arr: T[], seed: number): T[] => {
  // Shallow copy — never mutate the original array passed by the caller.
  const result = [...arr];

  // Normalise seed: LCG with s=0 produces a degenerate constant sequence.
  let s = seed || 1;

  // Fisher-Yates (Knuth) shuffle — iterate from the last element backwards.
  for (let i = result.length - 1; i > 0; i--) {
    // Advance the LCG state: s(n+1) = (s(n) * a + c) mod m
    s = (s * 9301 + 49297) % 233280;

    // Map the LCG output [0, m) to a valid swap index [0, i].
    const j = Math.floor((s / 233280) * (i + 1));

    // Swap elements i and j in place (destructuring assignment).
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
};
