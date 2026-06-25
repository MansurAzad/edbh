/**
 * @file useRecentlyViewed.ts
 * @module hooks/useRecentlyViewed
 *
 * @description
 * Persists and exposes the list of recently-viewed product IDs using
 * **localStorage** so the history survives page refreshes and tab closes.
 *
 * ## localStorage contract
 * | Key                      | Type       | Value                                  |
 * |--------------------------|------------|----------------------------------------|
 * | `recentlyViewedProducts` | `string`   | JSON-encoded `string[]` of product IDs |
 *
 * The list is capped at `MAX_ITEMS` (10) entries.  When a product is added
 * that already exists, it is moved to the front (most-recent-first order).
 *
 * ## Hydration
 * On mount a `useEffect` reads localStorage once and seeds React state.
 * Subsequent writes happen inside `addToRecentlyViewed`, which updates both
 * React state and localStorage atomically inside the `setState` callback to
 * avoid stale-closure bugs.
 *
 * ## No cross-tab sync
 * This hook does NOT listen to the `storage` window event, so changes made
 * in another tab are not reflected until the user navigates back and the
 * component remounts.
 *
 * ---
 * বাংলা: সম্প্রতি দেখা পণ্যের ID গুলো localStorage-এ সংরক্ষণ করা হয়।
 * পেজ রিফ্রেশ করলেও তালিকা হারিয়ে যায় না।
 * সর্বোচ্চ ১০টি পণ্য রাখা হয়, নতুনটি সবার আগে থাকে।
 */

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * localStorage key under which the array of recently-viewed product IDs is
 * stored as a JSON string.
 *
 * Using a descriptive, namespaced key avoids collisions with other data that
 * might be stored by third-party scripts or browser extensions.
 *
 * বাংলা: localStorage-এ ডেটা সংরক্ষণের চাবিকাঠি (key)।
 */
const STORAGE_KEY = "recentlyViewedProducts";

/**
 * Maximum number of product IDs retained in the recently-viewed list.
 * When the list exceeds this length after an addition, the oldest entries
 * (tail of the array) are silently dropped via `Array.prototype.slice`.
 *
 * বাংলা: সর্বোচ্চ ১০টি পণ্য সংরক্ষণ করা হয়।
 */
const MAX_ITEMS = 10;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook that tracks and persists the visitor's recently-viewed product IDs.
 *
 * ### State initialisation (hydration from localStorage)
 * `useEffect` runs once on mount (empty-ish dep array).  It reads
 * `localStorage.getItem(STORAGE_KEY)` and attempts `JSON.parse`.  If the
 * stored value is malformed (e.g. corrupted by a browser extension or a
 * previous bug), the catch block resets the in-memory list to `[]` without
 * touching localStorage — keeping the UI functional while avoiding a crash.
 *
 * ### Adding a product (`addToRecentlyViewed`)
 * The updater function passed to `setRecentlyViewed` receives the **current**
 * state value (guaranteed fresh even if multiple calls are batched), so there
 * is no stale-closure risk.  The new list is written back to localStorage
 * inside that same callback to keep React state and persisted state in sync.
 *
 * ### Deduplication and ordering
 * ```
 * [productId, ...prev.filter(id => id !== productId)].slice(0, MAX_ITEMS)
 * ```
 * - Prepend the new ID.
 * - Filter out any existing occurrence (moves-to-front semantics).
 * - Slice to `MAX_ITEMS` to evict the oldest entry if necessary.
 *
 * @returns {{ recentlyViewed: string[], addToRecentlyViewed: (id: string) => void }}
 *   - `recentlyViewed`       – Ordered array of product IDs (newest first).
 *   - `addToRecentlyViewed`  – Stable callback (memoised with `useCallback`)
 *                              to record a product view.
 *
 * @example
 * ```tsx
 * const { recentlyViewed, addToRecentlyViewed } = useRecentlyViewed();
 *
 * // Record a view when the user opens a product detail page:
 * useEffect(() => { addToRecentlyViewed(product.id); }, [product.id]);
 *
 * // Render the strip:
 * recentlyViewed.map(id => <ProductCard key={id} id={id} />)
 * ```
 *
 * বাংলা: এই hook ব্যবহার করে পণ্যের ID যোগ করুন এবং সম্প্রতি দেখা তালিকা পড়ুন।
 */
export function useRecentlyViewed() {
  // In-memory React state, initially empty; hydrated from localStorage on mount.
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);

  // ---------------------------------------------------------------------------
  // Hydration effect — runs once on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // READ from localStorage: retrieve the previously saved JSON string.
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      try {
        // Parse the JSON string back into a string array and seed React state.
        // If the shape is unexpected (e.g. not an array), downstream code
        // degrades gracefully because array methods still work on the value.
        setRecentlyViewed(JSON.parse(stored));
      } catch {
        // JSON.parse failed — the stored value is corrupt or was written by
        // incompatible code.  Reset to an empty list so the UI remains usable.
        // We intentionally do NOT clear localStorage here so the user's data
        // is preserved for debugging purposes.
        setRecentlyViewed([]);
      }
    }
    // Empty dependency array: this effect must only run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Imperative add callback
  // ---------------------------------------------------------------------------

  /**
   * Records a product view by prepending `productId` to the recently-viewed
   * list and persisting the updated list to localStorage.
   *
   * Wrapped in `useCallback` with an empty dependency array so the function
   * reference is stable across renders — safe to include in child `useEffect`
   * dependency arrays without causing infinite loops.
   *
   * @param productId - The UUID string of the product the user just viewed.
   *
   * @sideEffects
   *  - Updates React state via `setRecentlyViewed`.
   *  - Writes the new list to `localStorage` (synchronous, blocking).
   *
   * বাংলা: নতুন পণ্যের ID তালিকার শুরুতে যোগ করে এবং localStorage-এ সংরক্ষণ করে।
   * একই পণ্য দ্বিতীয়বার যোগ হলে, পুরনো এন্ট্রি সরিয়ে নতুন করে সামনে আনা হয়।
   */
  const addToRecentlyViewed = useCallback((productId: string) => {
    // Use the functional form of setState to guarantee we operate on the
    // latest state value even if React has batched multiple updates.
    setRecentlyViewed((prev) => {
      // 1. Prepend the new ID.
      // 2. Remove any prior occurrence of the same ID (moves-to-front).
      // 3. Truncate to MAX_ITEMS so the list never grows unbounded.
      const updated = [productId, ...prev.filter((id) => id !== productId)].slice(0, MAX_ITEMS);

      // WRITE to localStorage: serialise the updated array as JSON.
      // This is a synchronous operation; keep it fast by avoiding large arrays
      // (MAX_ITEMS cap ensures the payload stays tiny).
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      // Return the new array to React so state and storage stay in sync.
      return updated;
    });
  }, []); // Stable reference — no external dependencies captured in closure.

  return { recentlyViewed, addToRecentlyViewed };
}
