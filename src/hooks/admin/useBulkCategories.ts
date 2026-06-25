import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

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
      return (data || []).map(c => (c.name || "").trim()).filter(Boolean);
    },
    staleTime: 5 * 60 * 1000,
  });

  const allCategories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of q.data || []) {
      const k = c.toLowerCase();
      if (!seen.has(k) && c) { seen.add(k); out.push(c); }
    }
    return out;
  }, [q.data]);

  return { allCategories, isLoading: q.isLoading };
}

export interface ProductFingerprint {
  name: string;
  material: string;
  price: number;
  sale_price: number | null;
  category: string;
  image_url: string;
}

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
        sale_price: p.sale_price != null ? Number(p.sale_price) : null,
        category: (p.category || "").toLowerCase().trim(),
        image_url: (p.image_url || "").trim(),
      }));
    },
    staleTime: 2 * 60 * 1000,
  });
}
