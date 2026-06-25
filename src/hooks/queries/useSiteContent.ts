// Centralized site_content fetch — replaces ad-hoc useEffect + supabase blocks.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

export interface SiteContentRow {
  section_key: string;
  content: string | null;
  is_active: boolean;
}

/**
 * Fetch active rows from site_content. Pass section_keys to limit; omit for all.
 * Returns a map keyed by section_key for ergonomic consumption.
 */
export function useSiteContent(sectionKeys?: string[]) {
  return useQuery({
    queryKey: queryKeys.siteContent(sectionKeys),
    queryFn: async () => {
      let q = supabase
        .from("site_content")
        .select("section_key, content, is_active")
        .eq("is_active", true);
      if (sectionKeys?.length) q = q.in("section_key", sectionKeys);
      const { data, error } = await q;
      if (error) throw error;
      const map: Record<string, string> = {};
      (data as SiteContentRow[] | null)?.forEach((row) => {
        if (row.content) map[row.section_key] = row.content.trim();
      });
      return map;
    },
    staleTime: 10 * 60 * 1000, // site content rarely changes
  });
}
