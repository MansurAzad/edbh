/**
 * @file useBulkCategories.ts
 * @description
 *   React-Query hooks that supply:
 *   1. The active category list for the bulk-product UI dropdowns.
 *   2. "Fingerprint" snapshots of every existing product used for
 *      server-side duplicate detection.
 *
 * ## Bengali UI notes
 *   - Hook results feed `CategorySelectContent` which renders labels like
 *     "কোনো ক্যাটাগরি পাওয়া যায়নি।" when the array is empty.
 *   - `useBulkAddProducts` toasts "ডুপ্লিকেট চেক" feedback driven by
 *     the fingerprint data returned here.
 *
 * ## Duplicate-detection strategy
 *   A *fingerprint* is the 6-tuple:
 *     (name_lc, material_lc, price, sale_price, category_lc, image_url)
 *   All string fields are lowercased + trimmed before storage so comparisons
 *   are case-insensitive.  The candidate product (from the form) is normalised
 *   the same way in `useBulkAddProducts` before performing an `Array.some`
 *   check against this list.
 *
 * ## Stale-time rationale
 *   - `useBulkCategories`   → 5 min stale-time: categories change rarely.
 *   - `useExistingFingerprints` → 2 min stale-time: products are added more
 *     frequently; a shorter window reduces false-negative duplicate misses
 *     right after a successful bulk insert.
 *   After a successful insert `useBulkAddProducts.submit` manually calls
 *   `queryClient.invalidateQueries({ queryKey: ["existing-product-fingerprints"] })`
 *   to bust the cache immediately.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

// ---------------------------------------------------------------------------
// useBulkCategories
// ---------------------------------------------------------------------------

/**
 * Fetches the list of **active** category names ordered by `display_order`.
 *
 * ### Edge cases handled
 * - Supabase may return `name: null` for rows with no name set; these are
 *   filtered out via `.filter(Boolean)` after trimming.
 * - Case-insensitive de-duplication is performed client-side with a `Set`
 *   keyed on `name.toLowerCase()`.  This prevents identical-looking items
 *   that differ only in casing from appearing twice in the dropdown.
 *   Example: "Kurti" and "kurti" would both survive the DB query but only
 *   the first encountered is kept.
 *
 * @returns `{ allCategories, isLoading }`
 *   - `allCategories` – deduplicated, display-ready category name strings.
 *     Empty array `[]` while loading or on error.
 *   - `isLoading` – true while the initial fetch is in-flight.
 *
 * @example
 * ```tsx
 * const { allCategories } = useBulkCategories();
 * // → ["Saree", "Kurti", "Panjabi", ...]
 * ```
 */
export function useBulkCategories() {
  const q = useQuery({
    queryKey: ["bulk-add-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("name, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      // Trim and remove any null / empty-string names that could pollute the
      // dropdown with blank <SelectItem> entries.
      return (data || []).map(c => (c.name || "").trim()).filter(Boolean);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  /**
   * Case-insensitive de-duplication pass.
   * Memoised so re-renders of consumers don't re-run the loop unnecessarily.
   */
  const allCategories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of q.data || []) {
      const k = c.toLowerCase();
      // Only add if this lowercase key hasn't been seen before.
      if (!seen.has(k) && c) { seen.add(k); out.push(c); }
    }
    return out;
  }, [q.data]);

  return { allCategories, isLoading: q.isLoading };
}

// ---------------------------------------------------------------------------
// ProductFingerprint  (type)
// ---------------------------------------------------------------------------

/**
 * A normalised snapshot of an existing product used exclusively for
 * **duplicate detection** during bulk-add operations.
 *
 * All string fields are stored **lowercase + trimmed** so comparisons are
 * case-insensitive.  Numeric fields are coerced via `Number()` so `"10"` and
 * `10` compare equal.
 *
 * @see `useExistingFingerprints` – populates these from the DB.
 * @see `useBulkAddProducts` – consumes them inside the `duplicates` useMemo.
 */
export interface ProductFingerprint {
  /** Lowercase, trimmed product name. e.g. "floral saree" */
  name: string;
  /** Lowercase, trimmed material string. Empty string if null in DB. */
  material: string;
  /** Numeric price; 0 when DB value is null/non-numeric. */
  price: number;
  /** Numeric sale price, or `null` when no sale is active. */
  sale_price: number | null;
  /** Lowercase, trimmed category name. */
  category: string;
  /** Raw image URL (not lowercased – URLs are case-sensitive). */
  image_url: string;
}

// ---------------------------------------------------------------------------
// useExistingFingerprints
// ---------------------------------------------------------------------------

/**
 * Fetches lightweight fingerprint data for **all** existing products from
 * Supabase and normalises the fields for fast duplicate detection.
 *
 * ### Why not use the full products list?
 * We only need 6 fields per product to detect duplicates.  Fetching `*` would
 * waste bandwidth on descriptions, timestamps, etc. that are irrelevant here.
 *
 * ### Normalisation applied
 * | Field        | Transformation                                        |
 * |--------------|-------------------------------------------------------|
 * | `name`       | `.toLowerCase().trim()`                               |
 * | `material`   | `.toLowerCase().trim()`, defaults to `""` if null     |
 * | `price`      | `Number(p.price) \|\| 0`                              |
 * | `sale_price` | `Number(p.sale_price)` or `null` if DB value is null  |
 * | `category`   | `.toLowerCase().trim()`                               |
 * | `image_url`  | `.trim()` (no lowercasing – URLs are case-sensitive)  |
 *
 * ### Cache invalidation
 * After a successful bulk-insert `useBulkAddProducts.submit()` calls:
 * ```ts
 * queryClient.invalidateQueries({ queryKey: ["existing-product-fingerprints"] });
 * ```
 * This ensures newly added products appear in the fingerprint list on the
 * next duplicate check within the same admin session.
 *
 * @returns A React-Query `UseQueryResult<ProductFingerprint[]>`.
 *   Destructure `{ data }` to get the fingerprint array (defaults to `[]`
 *   via `const { data: existingProducts = [] } = useExistingFingerprints()`).
 */
export function useExistingFingerprints() {
  return useQuery({
    queryKey: ["existing-product-fingerprints"],
    queryFn: async (): Promise<ProductFingerprint[]> => {
      const { data } = await supabase.from("products")
        .select("name, material, price, sale_price, category, image_url");
      return (data || []).map(p => ({
        name: (p.name || "").toLowerCase().trim(),
        material: (p.material || "").toLowerCase().trim(),
        price: Number(p.price) || 0,
        // Preserve null to distinguish "no sale" from "sale_price = 0".
        sale_price: p.sale_price != null ? Number(p.sale_price) : null,
        category: (p.category || "").toLowerCase().trim(),
        image_url: (p.image_url || "").trim(),
      }));
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
