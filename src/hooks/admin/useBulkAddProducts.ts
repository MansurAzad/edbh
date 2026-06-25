import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BATCH_SIZE, createEmptyProduct, createEmptyVariant, generateId,
  type ProductRow, type SubmitResults, type VariantRow,
} from "@/lib/admin/bulkProducts/types";
import { useExistingFingerprints } from "./useBulkCategories";

export function useBulkAddProducts() {
  const queryClient = useQueryClient();
  const [products, setProducts] = useState<ProductRow[]>(() => Array.from({ length: 5 }, createEmptyProduct));
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SubmitResults | null>(null);
  const [duplicateCheck, setDuplicateCheck] = useState(true);

  const { data: existingProducts = [] } = useExistingFingerprints();

  const updateProduct = useCallback((id: string, field: string, value: any) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }, []);
  const removeProduct = useCallback((id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);
  const addProducts = useCallback((count: number) => {
    setProducts(prev => [...prev, ...Array.from({ length: count }, createEmptyProduct)]);
  }, []);
  const duplicateProduct = useCallback((product: ProductRow) => {
    const copy: ProductRow = {
      ...product, id: generateId(), name: product.name + " (কপি)",
      variants: product.variants.map(v => ({ ...v, id: generateId() })),
      _dbId: undefined, _dirty: undefined,
    };
    setProducts(prev => [...prev, copy]);
  }, []);
  const toggleExpand = useCallback((id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, expanded: !p.expanded } : p));
  }, []);
  const addVariant = useCallback((productId: string) => {
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, variants: [...p.variants, createEmptyVariant()], expanded: true } : p));
  }, []);
  const updateVariant = useCallback((productId: string, variantId: string, field: string, value: any) => {
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, variants: p.variants.map(v => v.id === variantId ? { ...v, [field]: value } : v) } : p));
  }, []);
  const removeVariant = useCallback((productId: string, variantId: string) => {
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, variants: p.variants.filter(v => v.id !== variantId) } : p));
  }, []);
  const autoGenerateVariants = useCallback((productId: string) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const sizes = p.sizes ? p.sizes.split(",").map(s => s.trim()).filter(Boolean) : [];
      const colors = p.colors ? p.colors.split(",").map(c => c.trim()).filter(Boolean) : [];
      if (!sizes.length && !colors.length) { toast.error("সাইজ বা কালার দিন আগে"); return p; }
      const newV: VariantRow[] = [];
      const add = (s: string, c: string) => newV.push({ id: generateId(), size: s, color: c, stock: p.stock || 10, sku: "", price_adjustment: 0, image_url: "" });
      if (sizes.length && colors.length) sizes.forEach(s => colors.forEach(c => add(s, c)));
      else if (sizes.length) sizes.forEach(s => add(s, ""));
      else colors.forEach(c => add("", c));
      toast.success(`${newV.length}টি ভেরিয়েন্ট তৈরি হয়েছে`);
      return { ...p, variants: newV, expanded: true };
    }));
  }, []);

  const validProducts = useMemo(
    () => products.filter(p => p.name.trim() && p.category.trim() && p.price > 0),
    [products],
  );

  const duplicates = useMemo(() => {
    if (!duplicateCheck) return new Set<string>();
    return new Set(validProducts.filter(p => {
      const pName = p.name.toLowerCase().trim();
      const pMaterial = (p.material || "").toLowerCase().trim();
      const pPrice = Number(p.price) || 0;
      const pSalePrice = p.sale_price != null ? Number(p.sale_price) : null;
      const pCategory = (p.category || "").toLowerCase().trim();
      const pImage = (p.image_url || "").trim();
      return existingProducts.some(ep =>
        ep.name === pName && ep.material === pMaterial && ep.price === pPrice &&
        ep.sale_price === pSalePrice && ep.category === pCategory && ep.image_url === pImage);
    }).map(p => p.id));
  }, [validProducts, existingProducts, duplicateCheck]);

  const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);

  const submit = async () => {
    const toSubmit = duplicateCheck ? validProducts.filter(p => !duplicates.has(p.id)) : validProducts;
    if (toSubmit.length === 0) { toast.error("কোনো বৈধ প্রোডাক্ট নেই"); return; }

    setSubmitting(true); setProgress(0); setResults(null);
    const res: SubmitResults = { success: 0, failed: 0, variants: 0, errors: [] };

    for (let i = 0; i < toSubmit.length; i += BATCH_SIZE) {
      const batch = toSubmit.slice(i, i + BATCH_SIZE);
      const productData = batch.map(p => ({
        name: p.name.trim(), category: p.category.trim(), price: p.price,
        sale_price: p.sale_price || null, stock: p.stock,
        description: p.description || null, material: p.material || null,
        sizes: p.sizes ? p.sizes.split(",").map(s => s.trim()).filter(Boolean) : [],
        colors: p.colors ? p.colors.split(",").map(c => c.trim()).filter(Boolean) : [],
        featured: p.featured, image_url: p.image_url || null,
      }));

      const { data, error } = await supabase.from("products").insert(productData as any).select("id, name");
      if (error) {
        res.failed += batch.length;
        res.errors.push(`ব্যাচ ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        res.success += (data || []).length;
        const nameToId = Object.fromEntries((data || []).map(d => [d.name, d.id]));
        const variantsToInsert: any[] = [];
        for (const p of batch) {
          const productId = nameToId[p.name.trim()];
          if (!productId) continue;
          for (const v of p.variants) {
            if (!v.size && !v.color) continue;
            variantsToInsert.push({
              product_id: productId, size: v.size || null, color: v.color || null,
              stock: v.stock, sku: v.sku || null, price_adjustment: v.price_adjustment || 0,
              image_url: v.image_url || null,
            });
          }
        }
        if (variantsToInsert.length > 0) {
          for (let vi = 0; vi < variantsToInsert.length; vi += 100) {
            const vBatch = variantsToInsert.slice(vi, vi + 100);
            const { data: vData, error: vError } = await supabase.from("product_variants").insert(vBatch).select();
            if (vError) res.errors.push(`ভেরিয়েন্ট: ${vError.message}`);
            else res.variants += (vData || []).length;
          }
        }
      }
      setProgress(Math.round(((i + batch.length) / toSubmit.length) * 100));
    }

    setResults(res); setSubmitting(false);
    if (res.success > 0) {
      queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-products-count"] });
      queryClient.invalidateQueries({ queryKey: ["admin-bulk-products"] });
      queryClient.invalidateQueries({ queryKey: ["existing-product-fingerprints"] });
      toast.success(`${res.success}টি প্রোডাক্ট ও ${res.variants}টি ভেরিয়েন্ট যুক্ত হয়েছে!`);
    }
  };

  return {
    products, setProducts,
    submitting, progress, results,
    duplicateCheck, setDuplicateCheck,
    validProducts, duplicates, totalVariants,
    updateProduct, removeProduct, addProducts, duplicateProduct,
    toggleExpand, addVariant, updateVariant, removeVariant, autoGenerateVariants,
    submit,
  };
}
