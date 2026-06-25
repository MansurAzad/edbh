/**
 * @file useBulkEditProducts.ts
 * @description
 *   State-management hook for the **Edit Products** panel of the admin
 *   bulk-products workflow.
 *
 *   Responsibilities:
 *   - On-demand loading of all existing products + their variants from Supabase.
 *   - Tracking which rows have been modified (`_dirty` flag).
 *   - Saving all dirty rows back to Supabase (full variant replace strategy).
 *   - Single-product and bulk multi-product deletion with cascading cleanup.
 *   - Client-side search filtering and page-based pagination.
 *
 * ## Bengali UI labels surfaced by this hook
 *   - "প্রোডাক্ট লোড করুন" / "রিফ্রেশ" → load / reload button label in panel.
 *   - "পরিবর্তিত"  → dirty-row badge on each `ProductRowCard`.
 *   - "সার্চ..."    → search input placeholder.
 *   - "পূর্ববর্তী" / "পরবর্তী" → pagination buttons.
 *   - Toast messages: "Xটি প্রোডাক্ট লোড হয়েছে", "Xটি প্রোডাক্ট ও Yটি ভেরিয়েন্ট আপডেট হয়েছে", etc.
 *
 * ## Variant save strategy
 *   On save the hook does a **full replace** per dirty product:
 *   1. `DELETE` all existing variants for `product_id`.
 *   2. Re-`INSERT` all current variants from the in-memory row.
 *   This is simpler than diffing old/new variants but causes transient
 *   downtime for that product's variants.  For high-traffic stores consider
 *   a diff-based upsert approach instead.
 *
 * ## Variant loading — chunk strategy
 *   Supabase's `.in()` filter has a practical limit (~1000 items in some
 *   drivers).  To be safe, product IDs are split into chunks of **50** when
 *   fetching variants, and results are merged into a single flat array before
 *   grouping by `product_id`.
 *
 * ## Pagination
 *   Page size is defined by `EDIT_PAGE_SIZE` (imported from `types.ts`).
 *   The displayed range and page buttons are computed from
 *   `filteredEditProducts` (post-search), not the full `editProducts` list,
 *   so navigating pages + typing in the search box both behave correctly.
 */

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  EDIT_PAGE_SIZE, createEmptyVariant, generateId,
  type ProductRow, type VariantRow,
} from "@/lib/admin/bulkProducts/types";

/**
 * Hook that encapsulates all state and actions for the "Edit Products" tab.
 *
 * Products are **not** loaded automatically on mount; the admin must click
 * "প্রোডাক্ট লোড করুন" which calls `loadExistingProducts()`.  This prevents
 * a potentially large payload from loading on every tab visit.
 *
 * @returns An object with:
 *   - **State** – `editProducts`, `editLoaded`, `editSaving`, `editSearch`,
 *     `deleteId`, `bulkDeleteIds`, `editPage`, `editTotalPages`,
 *     `filteredEditProducts`, `paginatedEditProducts`, `dirtyCount`.
 *   - **Setters** – `setEditSearch`, `setDeleteId`, `setEditPage`.
 *   - **Load** – `loadExistingProducts()`.
 *   - **Product mutation** – `updateEditProduct`, `toggleEditExpand`.
 *   - **Variant mutation** – `addEditVariant`, `updateEditVariant`,
 *     `removeEditVariant`, `autoGenerateEditVariants`.
 *   - **Persistence** – `saveEditedProducts`, `handleDeleteProduct`,
 *     `handleBulkDelete`.
 *   - **Selection** – `toggleBulkSelect`.
 */
export function useBulkEditProducts() {
  const queryClient = useQueryClient();

  /** Text typed into the search box; filters by name and category. */
  const [editSearch, setEditSearch] = useState("");

  /**
   * The full in-memory list of products loaded from the DB.
   * Each row uses a **client-side** `id` (from `generateId()`) as the React
   * key; the actual Supabase row primary key is stored in `_dbId`.
   */
  const [editProducts, setEditProducts] = useState<ProductRow[]>([]);

  /** Whether the initial (or most recent) load has completed successfully. */
  const [editLoaded, setEditLoaded] = useState(false);

  /** True while the bulk-save `supabase.update` calls are in flight. */
  const [editSaving, setEditSaving] = useState(false);

  /**
   * Client-side `id` of the product currently pending single deletion,
   * or `null` when no deletion dialog is open.
   * Bound to the `<AlertDialog open={!!deleteId}>` in `EditProductsPanel`.
   */
  const [deleteId, setDeleteId] = useState<string | null>(null);

  /**
   * Set of client-side IDs selected for bulk deletion.
   * Drives the checkbox state in each `ProductRowCard` (edit mode).
   * Cleared to an empty Set after `handleBulkDelete` completes.
   */
  const [bulkDeleteIds, setBulkDeleteIds] = useState<Set<string>>(new Set());

  /** Current page number (1-indexed) for the paginated product list. */
  const [editPage, setEditPage] = useState(1);

  // ---------------------------------------------------------------------------
  // loadExistingProducts
  // ---------------------------------------------------------------------------

  /**
   * Fetches all products ordered by `created_at DESC`, then fetches all their
   * variants in chunks of 50 IDs per query, and merges everything into a flat
   * `ProductRow[]` stored in `editProducts`.
   *
   * ### Data mapping
   * - `p.sizes` (string[]) → `sizes.join(", ")` (comma string for the Input).
   * - `p.colors` (string[]) → `colors.join(", ")` (comma string for the Input).
   * - Each product gets a fresh client-side `id` via `generateId()`; the DB
   *   primary key is kept in `_dbId` for later UPDATE/DELETE calls.
   * - Variants likewise get fresh client IDs; DB IDs go into `variant._dbId`.
   * - `_dirty` is initialised to `false`; any field edit sets it to `true`.
   *
   * ### Chunk strategy for variant loading
   * Supabase's `.in("product_id", ids)` can be slow or fail for very large
   * ID arrays.  IDs are therefore batched in slices of **50**:
   * ```
   * for (let i = 0; i < productIds.length; i += 50) { ... }
   * ```
   *
   * Toast: "Xটি প্রোডাক্ট লোড হয়েছে"
   */
  const loadExistingProducts = async () => {
    setEditLoaded(false);
    const { data: prods, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }

    const productIds = (prods || []).map(p => p.id);
    const allVariants: any[] = [];

    // Fetch variants in chunks of 50 to avoid overly large .in() clauses.
    if (productIds.length > 0) {
      for (let i = 0; i < productIds.length; i += 50) {
        const chunk = productIds.slice(i, i + 50);
        const { data: vars } = await supabase.from("product_variants").select("*").in("product_id", chunk);
        if (vars) allVariants.push(...vars);
      }
    }

    // Group flat variant array by product_id for O(1) lookup during mapping.
    const variantsByProduct: Record<string, any[]> = {};
    allVariants.forEach(v => {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push(v);
    });

    // Map DB rows to the `ProductRow` shape used by the UI components.
    const mapped: ProductRow[] = (prods || []).map(p => ({
      id: generateId(),    // Client-side key (stable across re-renders)
      _dbId: p.id,         // DB primary key used in UPDATE/DELETE
      name: p.name, category: p.category, price: p.price,
      sale_price: p.sale_price, stock: p.stock || 0,
      description: p.description || "", material: p.material || "",
      // DB stores sizes/colors as string arrays; convert to comma strings for text inputs.
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

  // ---------------------------------------------------------------------------
  // Product-level mutations (memoised)
  // ---------------------------------------------------------------------------

  /**
   * Updates a single field on a product and marks it dirty (`_dirty: true`).
   * The dirty flag causes the sticky "সব পরিবর্তন সেভ" footer to appear and
   * the product card to show the "পরিবর্তিত" badge.
   */
  const updateEditProduct = useCallback((id: string, field: string, value: any) => {
    setEditProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value, _dirty: true } : p));
  }, []);

  /** Toggles the expanded/collapsed detail section without marking dirty. */
  const toggleEditExpand = useCallback((id: string) => {
    setEditProducts(prev => prev.map(p => p.id === id ? { ...p, expanded: !p.expanded } : p));
  }, []);

  // ---------------------------------------------------------------------------
  // Variant-level mutations (all mark parent product as dirty)
  // ---------------------------------------------------------------------------

  /** Appends an empty variant and auto-expands the product; marks dirty. */
  const addEditVariant = useCallback((productId: string) => {
    setEditProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, variants: [...p.variants, createEmptyVariant()], expanded: true, _dirty: true } : p));
  }, []);

  /** Updates a single variant field; marks parent product dirty. */
  const updateEditVariant = useCallback((productId: string, variantId: string, field: string, value: any) => {
    setEditProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, _dirty: true, variants: p.variants.map(v => v.id === variantId ? { ...v, [field]: value } : v) } : p));
  }, []);

  /** Removes a variant; marks parent product dirty. */
  const removeEditVariant = useCallback((productId: string, variantId: string) => {
    setEditProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, _dirty: true, variants: p.variants.filter(v => v.id !== variantId) } : p));
  }, []);

  /**
   * Same cartesian-product auto-generation as `useBulkAddProducts.autoGenerateVariants`
   * but additionally marks the parent product dirty.
   *
   * Replaces the product's entire variant list; existing variants are discarded.
   * Toast: "Xটি ভেরিয়েন্ট তৈরি হয়েছে"
   * Error toast when sizes & colors are both empty: "সাইজ বা কালার দিন"
   */
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

  // ---------------------------------------------------------------------------
  // saveEditedProducts
  // ---------------------------------------------------------------------------

  /**
   * Persists all `_dirty` products to Supabase using the **full variant
   * replace** strategy:
   *
   * For each dirty product:
   * 1. `UPDATE products SET ... WHERE id = _dbId`
   * 2. `DELETE FROM product_variants WHERE product_id = _dbId`
   * 3. `INSERT INTO product_variants (...) VALUES ...` (filtered: at least
   *    one of `size` / `color` must be non-empty to skip blank stub rows).
   *
   * ### Size/color serialisation
   * Comma strings → string arrays (same as the add pipeline):
   * `p.sizes.split(",").map(s => s.trim()).filter(Boolean)`
   *
   * On completion:
   * - `_dirty` is reset to `false` on all rows.
   * - `admin-products-list` and `admin-bulk-products` query caches invalidated.
   * - Toast: "Xটি প্রোডাক্ট ও Yটি ভেরিয়েন্ট আপডেট হয়েছে"
   */
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
        // Explode comma strings back to string[] for DB storage.
        sizes: p.sizes ? p.sizes.split(",").map(s => s.trim()).filter(Boolean) : [],
        colors: p.colors ? p.colors.split(",").map(c => c.trim()).filter(Boolean) : [],
        featured: p.featured, image_url: p.image_url || null,
      }).eq("id", p._dbId!);
      if (error) { toast.error(`${p.name}: ${error.message}`); continue; }
      savedCount++;

      // Full replace: delete all existing variants then re-insert current set.
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
    // Reset dirty flags after successful save.
    setEditProducts(prev => prev.map(p => ({ ...p, _dirty: false })));
  };

  // ---------------------------------------------------------------------------
  // handleDeleteProduct  (single)
  // ---------------------------------------------------------------------------

  /**
   * Deletes the product identified by `deleteId` from the DB.
   *
   * ### Cascade order
   * 1. `DELETE FROM product_variants WHERE product_id = _dbId`
   * 2. `DELETE FROM product_images   WHERE product_id = _dbId`
   * 3. `DELETE FROM products         WHERE id = _dbId`
   *
   * The explicit cascade is required because foreign-key `ON DELETE CASCADE`
   * may not be set on all tables.  Variants and images are removed first to
   * avoid constraint violations.
   *
   * On success the row is removed from `editProducts` and `deleteId` is cleared.
   * Toast: "প্রোডাক্ট ডিলিট হয়েছে"
   */
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

  // ---------------------------------------------------------------------------
  // handleBulkDelete  (multi-select)
  // ---------------------------------------------------------------------------

  /**
   * Deletes all products in `bulkDeleteIds` sequentially.
   *
   * Each deletion cascades the same way as `handleDeleteProduct`:
   *   variants → images → product.
   *
   * After all deletions the selected rows are removed from `editProducts`,
   * `bulkDeleteIds` is cleared, and the list query cache is invalidated.
   * Toast: "Xটি প্রোডাক্ট ডিলিট হয়েছে"
   *
   * ⚠️ Network errors on individual rows are silently swallowed (only the
   * success counter is decremented).  Consider adding per-row error toasts
   * for production hardening.
   */
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

  // ---------------------------------------------------------------------------
  // toggleBulkSelect
  // ---------------------------------------------------------------------------

  /**
   * Toggles the inclusion of a product ID in the `bulkDeleteIds` Set.
   * Follows the immutable-Set pattern: a new Set is created each time to
   * ensure React detects the state change.
   */
  const toggleBulkSelect = useCallback((id: string) => {
    setBulkDeleteIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Derived / memoised state
  // ---------------------------------------------------------------------------

  /**
   * Products whose `name` or `category` contains the search query
   * (case-insensitive substring match).
   * When `editSearch` is empty the full `editProducts` list is returned
   * directly without any filtering overhead.
   */
  const filteredEditProducts = useMemo(() => {
    if (!editSearch) return editProducts;
    const q = editSearch.toLowerCase();
    return editProducts.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [editProducts, editSearch]);

  /** Total number of pages given the current filtered result set. */
  const editTotalPages = Math.ceil(filteredEditProducts.length / EDIT_PAGE_SIZE);

  /**
   * The slice of `filteredEditProducts` for the current `editPage`.
   * Computed as: `filteredEditProducts.slice(start, start + EDIT_PAGE_SIZE)`
   * where `start = (editPage - 1) * EDIT_PAGE_SIZE`.
   */
  const paginatedEditProducts = useMemo(() => {
    const start = (editPage - 1) * EDIT_PAGE_SIZE;
    return filteredEditProducts.slice(start, start + EDIT_PAGE_SIZE);
  }, [filteredEditProducts, editPage]);

  /** Count of products with unsaved changes. Drives the sticky footer visibility. */
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
