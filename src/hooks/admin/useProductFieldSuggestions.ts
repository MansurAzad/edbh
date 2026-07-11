/**
 * useProductFieldSuggestions
 * Fetches distinct category / subcategory / fabric / work_type / colors values
 * from the existing `products` table so admin tools (AI Product Studio,
 * ProductFormDialog, etc.) can offer the same option pool the manual "Add
 * Product" form exposes. Values are deduped, trimmed and sorted.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductFieldSuggestions {
  categories: string[];
  subcategoriesByCategory: Record<string, string[]>;
  fabrics: string[];
  workTypes: string[];
  colors: string[];
}

const FALLBACK: ProductFieldSuggestions = {
  categories: ["Abaya", "Borka", "Hijab", "Kaftan", "Scarf", "Fabric"],
  subcategoriesByCategory: {},
  fabrics: ["Nida", "Chiffon", "Barbie", "Georgette", "Crepe", "Organza", "Silk", "Jorjet"],
  workTypes: ["Embroidery", "Karchupi", "Stone", "Beaded", "Applique", "Plain"],
  colors: ["Black", "White", "Gold", "Silver", "Navy", "Maroon", "Beige", "Brown"],
};

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v || "").trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function useProductFieldSuggestions() {
  return useQuery({
    queryKey: ["product-field-suggestions"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProductFieldSuggestions> => {
      const { data, error } = await supabase
        .from("products")
        .select("category, subcategory, fabric, material, work_type, colors")
        .limit(2000);
      if (error) throw error;
      const rows = data || [];

      const categories = uniqueSorted([...FALLBACK.categories, ...rows.map((r: any) => r.category)]);
      const fabrics = uniqueSorted([
        ...FALLBACK.fabrics,
        ...rows.map((r: any) => r.fabric),
        ...rows.map((r: any) => r.material),
      ]);
      const workTypes = uniqueSorted([...FALLBACK.workTypes, ...rows.map((r: any) => r.work_type)]);
      const allColors: string[] = [];
      for (const r of rows as any[]) {
        if (Array.isArray(r.colors)) allColors.push(...r.colors);
      }
      const colors = uniqueSorted([...FALLBACK.colors, ...allColors]);

      const subcategoriesByCategory: Record<string, string[]> = {};
      for (const r of rows as any[]) {
        const cat = (r.category || "").trim();
        const sub = (r.subcategory || "").trim();
        if (!cat || !sub) continue;
        (subcategoriesByCategory[cat] ||= []).push(sub);
      }
      for (const k of Object.keys(subcategoriesByCategory)) {
        subcategoriesByCategory[k] = uniqueSorted(subcategoriesByCategory[k]);
      }

      return { categories, subcategoriesByCategory, fabrics, workTypes, colors };
    },
  });
}
