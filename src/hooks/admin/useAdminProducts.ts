import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { AdminProduct, AdminProductInput } from "@/lib/admin/productHelpers";

export function useAdminProducts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: products = [], isLoading: loading } = useQuery({
    queryKey: ["admin-products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AdminProduct[];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const invalidateProducts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
    queryClient.invalidateQueries({ queryKey: ["admin-products-count"] });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async ({
      id,
      data,
      galleryUrls,
    }: {
      id: string | null;
      data: AdminProductInput;
      galleryUrls: string[];
    }) => {
      const productData = {
        ...data,
        price: Number(data.price),
        sale_price: data.sale_price ? Number(data.sale_price) : null,
        stock: Number(data.stock),
        sizes: data.sizes?.filter(Boolean) || [],
        colors: data.colors?.filter(Boolean) || [],
        material: data.material || null,
        video_url: data.video_url || null,
      };

      const validUrls = galleryUrls.map((u) => u.trim()).filter(Boolean);

      if (id) {
        const { error } = await supabase.from("products").update(productData).eq("id", id);
        if (error) throw error;

        if (validUrls.length > 0) {
          const { data: existing } = await supabase
            .from("product_images")
            .select("display_order")
            .eq("product_id", id)
            .order("display_order", { ascending: false })
            .limit(1);
          const startOrder = (existing?.[0]?.display_order ?? -1) + 1;
          await supabase
            .from("product_images")
            .insert(validUrls.map((url, i) => ({ product_id: id, image_url: url, display_order: startOrder + i })));
        }
      } else {
        const { data: newProduct, error } = await supabase.from("products").insert(productData).select().single();
        if (error) throw error;
        if (validUrls.length > 0 && newProduct) {
          await supabase
            .from("product_images")
            .insert(validUrls.map((url, i) => ({ product_id: newProduct.id, image_url: url, display_order: i })));
        }
      }
    },
    onSuccess: (_data, vars) => {
      toast({ title: "Success", description: vars.id ? "Product updated successfully" : "Product created successfully" });
      invalidateProducts();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Product deleted successfully" });
      invalidateProducts();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return { products, loading, invalidateProducts, saveMutation, deleteMutation };
}
