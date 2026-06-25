import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type RatingSummary } from "@/types/product";

export interface CategoryItem {
  name: string;
  name_bn: string | null;
  slug: string | null;
}

/** Shop's static metadata: categories, available materials, max price, product ratings. */
export const useShopMetadata = () => {
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
    staleTime: 5 * 60 * 1000,
  });

  const ratingsQuery = useQuery<Record<string, RatingSummary>>({
    queryKey: ["shop-ratings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("product_id, rating");
      if (error) throw error;
      const acc: Record<string, { total: number; count: number }> = {};
      (data || []).forEach((r) => {
        if (!acc[r.product_id]) acc[r.product_id] = { total: 0, count: 0 };
        acc[r.product_id].total += r.rating;
        acc[r.product_id].count += 1;
      });
      const out: Record<string, RatingSummary> = {};
      for (const [id, v] of Object.entries(acc)) {
        out[id] = { avg: v.total / v.count, count: v.count };
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const materialsQuery = useQuery({
    queryKey: ["shop-materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("material")
        .not("material", "is", null);
      if (error) throw error;
      const set = new Set<string>();
      (data || []).forEach((p) => { if (p.material) set.add(p.material); });
      return Array.from(set).sort();
    },
    staleTime: 5 * 60 * 1000,
  });

  const maxPriceQuery = useQuery({
    queryKey: ["shop-max-price"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("price")
        .order("price", { ascending: false })
        .limit(1);
      return data?.[0]?.price || 50000;
    },
    staleTime: 10 * 60 * 1000,
  });

  return {
    categories: categoriesQuery.data ?? [],
    ratings: ratingsQuery.data ?? {},
    materials: materialsQuery.data ?? [],
    maxPrice: maxPriceQuery.data ?? 50000,
  };
};
