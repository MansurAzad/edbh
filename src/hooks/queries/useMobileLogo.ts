// ============= Full file contents =============

/**
 * @file useMobileLogo.ts
 * @module hooks/queries/useMobileLogo
 *
 * @description
 * React Query hook that fetches the **mobile logo** image URL from the
 * `site_content` Supabase table.
 *
 * ### Database query
 * ```sql
 * SELECT image_url
 * FROM   site_content
 * WHERE  section_key = 'mobile_logo'
 *   AND  is_active   = true
 * LIMIT  1;            -- maybeSingle()
 * ```
 *
 * ### Cache strategy
 * - `staleTime: 10 min` — logo assets rarely change; prevents unnecessary
 *   re-fetches on every component mount during a normal browsing session.
 *
 * ### Return value
 * The resolved `image_url` string, or `null` when:
 * - No row matches the filter (key not yet configured in the CMS), or
 * - The matched row has no `image_url` value set.
 *
 * Callers should fall back to a default/static logo asset when `null` is
 * returned.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches the custom mobile logo image URL from the `site_content` CMS table.
 *
 * @returns A React Query result object whose `data` field is either a URL
 *          string (e.g. `"https://…/mobile-logo.png"`) or `null`.
 *
 * @example
 * const { data: mobileLogoUrl } = useMobileLogo();
 *
 * return (
 *   <img
 *     src={mobileLogoUrl ?? "/fallback-logo.svg"}
 *     alt="Site logo"
 *   />
 * );
 */
export const useMobileLogo = () => {
  return useQuery({
    // Scoped query key — invalidating siteContent("mobile_logo") will refetch
    queryKey: queryKeys.siteContent(["mobile_logo"]),

    queryFn: async () => {
      // Fetch a single active row matching the "mobile_logo" section key.
      // `maybeSingle()` returns null (not an error) when no row is found,
      // which is the expected state before the CMS entry is configured.
      const { data } = await supabase
        .from("site_content")
        .select("image_url")
        .eq("section_key", "mobile_logo")
        .eq("is_active", true)
        .maybeSingle();

      // Normalise: return null if the row doesn't exist or has no image set
      return data?.image_url ?? null;
    },

    // 10-minute stale window — logo assets change infrequently
    staleTime: 10 * 60 * 1000,
  });
};
