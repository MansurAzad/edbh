/**
 * @file useHomepageSections.ts
 * @module hooks/useHomepageSections
 *
 * @description
 * Fetches active homepage content sections from the `site_content` Supabase
 * table and exposes them via React Query for use by homepage layout components.
 *
 * Each row in `site_content` represents a configurable section of the homepage
 * (e.g. hero banner, promotional strip, about blurb).  Sections are ordered by
 * `display_order` and filtered to `is_active = true` so that draft or disabled
 * sections are never rendered.
 *
 * Cache key:  `["homepage-sections"]`
 * staleTime:  5 minutes — content is managed by admins and rarely changes
 *             mid-session; a 5-minute window avoids unnecessary refetches.
 * gcTime:     15 minutes — keeps data alive after the homepage unmounts so
 *             navigating back does not flash a loading state.
 *
 * Auth requirement: none — homepage sections are publicly visible.
 * No localStorage usage, no subscriptions, no intervals.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Represents a single configurable section of the homepage, sourced from the
 * `site_content` database table.
 */
export interface HomepageSection {
  /** Primary key UUID of the section row. */
  id: string;
  /**
   * Machine-readable identifier used by the frontend to determine which
   * React component renders this section (e.g. `"hero"`, `"promo_banner"`).
   */
  section_key: string;
  /**
   * Optional display title rendered as a heading.
   * বাংলা: সেকশনের শিরোনাম (ঐচ্ছিক)।
   */
  title: string | null;
  /**
   * Optional supporting subtitle rendered below the title.
   * বাংলা: শিরোনামের নিচে প্রদর্শিত সহায়ক পাঠ্য।
   */
  subtitle: string | null;
  /** Rich-text or plain-text body content for the section. */
  content: string | null;
  /** URL of the section's primary image asset. */
  image_url: string | null;
  /** Whether this section is currently published and visible. */
  is_active: boolean;
  /** Numeric sort key; lower values appear higher on the page. */
  display_order: number;
}

/**
 * Fetches all active homepage sections ordered for display.
 *
 * Results are served from React Query cache for up to 5 minutes before a
 * background refetch is triggered.  All components consuming this hook share
 * the same `["homepage-sections"]` cache entry.
 *
 * @example
 * ```tsx
 * const { data: sections = [], isLoading } = useHomepageSections();
 * return sections.map(s => <SectionRenderer key={s.id} section={s} />);
 * ```
 *
 * @returns React Query result wrapping a `HomepageSection[]` array sorted by
 *   `display_order` ascending.  Defaults to an empty array when data is
 *   unavailable.
 *
 * @sideEffects Executes a Supabase query on first mount or after the 5-minute
 *   stale window expires.
 */
export const useHomepageSections = () => {
  return useQuery({
    queryKey: ["homepage-sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_content")
        .select("*")
        .eq("is_active", true)           // Only published sections.
        .order("display_order", { ascending: true }); // Top-to-bottom page order.
      if (error) throw error;
      return (data || []) as HomepageSection[];
    },
    staleTime: 5 * 60 * 1000,   // 5 minutes
    gcTime: 15 * 60 * 1000,     // 15 minutes
  });
};
