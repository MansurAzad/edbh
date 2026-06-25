import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  EDIT_PAGE_SIZE, createEmptyVariant, generateId,
  type ProductRow, type VariantRow,
} from "@/lib/admin/bulkProducts/types";

export function useBulkEditProducts() {
  const queryClient = useQueryClient();
  const [editSearch, setEditSearch] = useState("");
  const [editProducts, setEditProducts] = useState<ProductRow[]>([]);
  const [editLoaded, setEditLoaded] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<Set<string>>(new Set());
  const [editPage, setEditPage] = useState(1);

  const loadExistingProducts = async () => {
    setEditLoaded(false);
    const { data: prods, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }

    const productIds = (prods || []).map(p => p.id);
    const allVariants: any[] = [];
    if (productIds.length > 0) {
      for (let i = 0; i < productIds.length; i += 50) {
        const chunk = productIds.slice(i, i + 50);
        const { data: vars } = await supabase.from("product_variants").select("*").in("product_id", chunk);
        if (vars) allVariants.push(...vars);
      }
    }

    const variantsByProduct: Record<string, any[]> = {};
    allVariants.forEach(v => {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push(v);
    });

    const mapped: ProductRow[] = (prods || []).map(p => ({
      id: generateId(), _dbId: p.id,
      name: p.name, category: p.category, price: p.price,
      sale_price: p.sale_price, stock: p.stock || 0,
      description: p.description || "", material: p.material || "",
      sizes: (p.sizes || []).join(", "), colors: (p.colors || []).join(", "),
      featured: p.featured || false, image_url: p.image_url || "",
      expanded: false, _dirty: false,
      variants: (variantsByProduct[p.id] || []).map(v => ({
        id: generateId(), _dbId: v.id,
        size: v.size || "", color: v.color || "",
        stock: v.stock || 0, sku: v.sku || "",
        price_adjustment: v.price_adjustment || 0,
        image_url: v.image_url || "",
      })),
    }));

    setEditProducts(mapped);
    setEditLoaded(true);
    toast.success(`${mapped.length}টি প্রোডাক্ট লোড হয়েছে`);
  };

  const updateEditProduct = useCallback((id: string, field: string, value: any) => {
    setEditProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value, _dirty: true } : p));
  }, []);
  const toggleEditExpand = useCallback((id: string) => {
    setEditProducts(prev => prev.map(p => p.id === id ? { ...p, expanded: !p.expanded } : p));
  }, []);
  const addEditVariant = useCallback((productId: string) => {
    setEditProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, variants: [...p.variants, createEmptyVariant()], expanded: true, _dirty: true } : p));
  }, []);
  const updateEditVariant = useCallback((productId: string, variantId: string, field: string, value: any) => {
    setEditProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, _dirty: true, variants: p.variants.map(v => v.id === variantId ? { ...v, [field]: value } : v) } : p));
  }, []);
  const removeEditVariant = useCallback((productId: string, variantId: string) => {
    setEditProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, _dirty: true, variants: p.variants.filter(v => v.id !== variantId) } : p));
  }, []);
  const autoGenerateEditVariants = useCallback((productId: string) => {
    setEditProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const sizes = p.sizes ? p.sizes.split(",").map(s => s.trim()).filter(Boolean) : [];
      const colors = p.colors ? p.colors.split(",").map(c => c.trim()).filter(Boolean) : [];
      if (!sizes.length && !colors.length) { toast.error("সাইজ বা কালার দিন"); return p; }
      const newV: VariantRow[] = [];
      const add = (s: string, c: string) => newV.push({ id: generateId(), size: s, color: c, stock: p.stock || 10, sku: "", price_adjustment: 0, image_url: "" });
      if (sizes.length && colors.length) sizes.forEach(s => colors.forEach(c => add(s, c)));
      else if (sizes.length) sizes.forEach(s => add(s, ""));
      else colors.forEach(c => add("", c));
      toast.success(`${newV.length}টি ভেরিয়েন্ট তৈরি হয়েছে`);
      return { ...p, variants: newV, expanded: true, _dirty: true };
    }));
  }, []);

  const saveEditedProducts = async () => {
    const dirty = editProducts.filter(p => p._dirty && p._dbId);
    if (!dirty.length) { toast.error("কোনো পরিবর্তন নেই"); return; }
    setEditSaving(true);
    let savedCount = 0;
    let variantCount = 0;
    for (const p of dirty) {
      const { error } = await supabase.from("products").update({
        name: p.name.trim(), category: p.category.trim(), price: p.price,
        sale_price: p.sale_price || null, stock: p.stock,
        description: p.description || null, material: p.material || null,
        sizes: p.sizes ? p.sizes.split(",").map(s => s.trim()).filter(Boolean) : [],
        colors: p.colors ? p.colors.split(",").map(c => c.trim()).filter(Boolean) : [],
        featured: p.featured, image_url: p.image_url || null,
      }).eq("id", p._dbId!);
      if (error) { toast.error(`${p.name}: ${error.message}`); continue; }
      savedCount++;
      await supabase.from("product_variants").delete().eq("product_id", p._dbId!);
      const newVariants = p.variants.filter(v => v.size || v.color).map(v => ({
        product_id: p._dbId!, size: v.size || null, color: v.color || null, stock: v.stock,
        sku: v.sku || null, price_adjustment: v.price_adjustment || 0,
        image_url: v.image_url || null,
      }));
      if (newVariants.length > 0) {
        const { data: vData } = await supabase.from("product_variants").insert(newVariants).select();
        variantCount += (vData || []).length;
      }
    }
    setEditSaving(false);
    queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
    queryClient.invalidateQueries({ queryKey: ["admin-bulk-products"] });
    toast.success(`${savedCount}টি প্রোডাক্ট ও ${variantCount}টি ভেরিয়েন্ট আপডেট হয়েছে`);
    setEditProducts(prev => prev.map(p => ({ ...p, _dirty: false })));
  };

  const handleDeleteProduct = async () => {
    if (!deleteId) return;
    const product = editProducts.find(p => p.id === deleteId);
    if (!product?._dbId) { setDeleteId(null); return; }
    await supabase.from("product_variants").delete().eq("product_id", product._dbId);
    await supabase.from("product_images").delete().eq("product_id", product._dbId);
    const { error } = await supabase.from("products").delete().eq("id", product._dbId);
    if (error) { toast.error(error.message); } else {
      setEditProducts(prev => prev.filter(p => p.id !== deleteId));
      queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
      toast.success("প্রোডাক্ট ডিলিট হয়েছে");
    }
    setDeleteId(null);
  };

  const handleBulkDelete = async () => {
    const toDelete = editProducts.filter(p => bulkDeleteIds.has(p.id) && p._dbId);
    if (!toDelete.length) return;
    let deleted = 0;
    for (const p of toDelete) {
      await supabase.from("product_variants").delete().eq("product_id", p._dbId!);
      await supabase.from("product_images").delete().eq("product_id", p._dbId!);
      const { error } = await supabase.from("products").delete().eq("id", p._dbId!);
      if (!error) deleted++;
    }
    setEditProducts(prev => prev.filter(p => !bulkDeleteIds.has(p.id)));
    setBulkDeleteIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
    toast.success(`${deleted}টি প্রোডাক্ট ডিলিট হয়েছে`);
  };

  const toggleBulkSelect = useCallback((id: string) => {
    setBulkDeleteIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const filteredEditProducts = useMemo(() => {
    if (!editSearch) return editProducts;
    const q = editSearch.toLowerCase();
    return editProducts.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [editProducts, editSearch]);

  const editTotalPages = Math.ceil(filteredEditProducts.length / EDIT_PAGE_SIZE);
  const paginatedEditProducts = useMemo(() => {
    const start = (editPage - 1) * EDIT_PAGE_SIZE;
    return filteredEditProducts.slice(start, start + EDIT_PAGE_SIZE);
  }, [filteredEditProducts, editPage]);

  const dirtyCount = editProducts.filter(p => p._dirty).length;

  return {
    editProducts, editLoaded, editSaving,
    editSearch, setEditSearch,
    deleteId, setDeleteId,
    bulkDeleteIds, toggleBulkSelect,
    editPage, setEditPage, editTotalPages,
    filteredEditProducts, paginatedEditProducts, dirtyCount,
    loadExistingProducts, updateEditProduct, toggleEditExpand,
    addEditVariant, updateEditVariant, removeEditVariant, autoGenerateEditVariants,
    saveEditedProducts, handleDeleteProduct, handleBulkDelete,
  };
}
