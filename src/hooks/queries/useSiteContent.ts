// ============= Full file contents =============

/**
 * @file useSiteContent.ts
 * @module hooks/queries/useSiteContent
 *
 * @description
 * Centralised React Query hook for reading CMS content from the `site_content`
 * Supabase table. It **replaces ad-hoc `useEffect` + direct `supabase` calls**
 * that were previously scattered across components.
 *
 * ### Why centralise?
 * - React Query deduplicates identical query keys globally, so multiple
 *   components requesting the same `section_key` set share one network request.
 * - A single stale-time policy (`10 min`) is enforced consistently.
 * - The returned `map` shape is ergonomic: `map["hero_title"]` instead of
 *   finding the row in an array each time.
 *
 * ### Database query
 * ```sql
 * SELECT section_key, content, is_active
 * FROM   site_content
 * WHERE  is_active = true
 *   [AND section_key IN (:sectionKeys)]  -- only when keys are provided
 * ```
 *
 * ### Return shape
 * ```ts
 * { [section_key: string]: string }
 * // e.g. { hero_title: "Welcome", hero_subtitle: "Shop now" }
 * ```
 * Only rows with a non-empty `content` value are included in the map.
 */

// Centralised site_content fetch — replaces ad-hoc useEffect + supabase blocks.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * Shape of a raw row returned from the `site_content` table.
 *
 * `content` holds the CMS text/HTML value for the given section.
 * `is_active` controls visibility — inactive rows are filtered at the query
 * level so they never reach the client.
 */
export interface SiteContentRow {
  /** Unique CMS key identifying the content section, e.g. `"hero_title"`. */
  section_key: string;
  /**
   * The actual CMS content value (plain text or HTML).
   * Null when the field has been left blank in the admin panel.
   */
  content: string | null;
  /**
   * Whether this row is currently published.
   * Only `true` rows are fetched; this field exists in the type for
   * completeness when the raw row needs to be referenced externally.
   */
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches active `site_content` rows and returns them as a key→value map.
 *
 * @param sectionKeys - Optional allowlist of `section_key` values to fetch.
 *   - **Omit or pass `undefined`** to fetch **all** active rows.
 *   - **Pass an array** (e.g. `["hero_title", "hero_subtitle"]`) to fetch only
 *     those specific keys — reduces data transfer for focused components.
 *
 * @returns A React Query result whose `data` is `Record<string, string>`:
 *   ```ts
 *   { hero_title: "Welcome to Our Store", promo_banner: "Sale on now!" }
 *   ```
 *   Returns `undefined` while loading and an empty object `{}` when no rows
 *   match (query succeeded but no active content configured yet).
 *
 * @example
 * // Fetch all active site content
 * const { data: content } = useSiteContent();
 * const title = content?.["hero_title"] ?? "Default Title";
 *
 * @example
 * // Fetch only specific keys (more efficient)
 * const { data } = useSiteContent(["hero_title", "hero_subtitle"]);
 */
export function useSiteContent(sectionKeys?: string[]) {
  return useQuery({
    // Query key includes the requested keys so different key sets are cached
    // independently — fetching ["hero_title"] won't collide with fetching all.
    queryKey: queryKeys.siteContent(sectionKeys),

    queryFn: async () => {
      // Start with base query: only active rows, selecting the minimum fields
      let q = supabase
        .from("site_content")
        .select("section_key, content, is_active")
        .eq("is_active", true);

      // Narrow to specific keys when an allowlist is provided
      if (sectionKeys?.length) q = q.in("section_key", sectionKeys);

      const { data, error } = await q;
      if (error) throw error;

      // Build a flat key→value map; rows with null/empty content are skipped
      // so callers never receive empty strings from the CMS.
      const map: Record<string, string> = {};
      (data as SiteContentRow[] | null)?.forEach((row) => {
        // trim() removes accidental leading/trailing whitespace from CMS input
        if (row.content) map[row.section_key] = row.content.trim();
      });
      return map;
    },

    // 10-minute stale window — site content (titles, banners) changes rarely
    staleTime: 10 * 60 * 1000,
  });
}
