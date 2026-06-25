import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

/** Fetches the custom mobile logo image URL from `site_content`. */
export const useMobileLogo = () => {
  return useQuery({
    queryKey: queryKeys.siteContent(["mobile_logo"]),
    queryFn: async () => {
      const { data } = await supabase
        .from("site_content")
        .select("image_url")
        .eq("section_key", "mobile_logo")
        .eq("is_active", true)
        .maybeSingle();
      return data?.image_url ?? null;
    },
    staleTime: 10 * 60 * 1000,
  });
};
