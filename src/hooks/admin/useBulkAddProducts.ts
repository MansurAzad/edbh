/**
 * @file useBulkAddProducts.ts
 * @description
 *   Core state-management hook for the **Add Products** panel of the admin
 *   bulk-products workflow.
 *
 *   Responsibilities:
 *   - Maintains the in-memory list of `ProductRow` objects the admin is building.
 *   - Computes `validProducts` (name + category + price all present) and
 *     `duplicates` (cross-checked against the DB fingerprint list).
 *   - Drives the multi-step batch-insert into Supabase's `products` and
 *     `product_variants` tables, reporting live progress percentage.
 *
 * ## Batch-insert sizing
 *   Products are sent to Supabase in chunks of `BATCH_SIZE` rows at a time
 *   (imported from `types.ts`).  After each product batch is inserted, the
 *   returned `id` values are mapped back to the original product names so the
 *   correct `product_id` foreign-key is used when inserting variants.
 *   Variants themselves are chunked in sub-batches of **100** rows to stay
 *   well within Supabase's row-limit per request.
 *
 * ## Duplicate-detection flow
 *   1. `useExistingFingerprints()` fetches normalised snapshots of every
 *      existing product (cached 2 min, see `useBulkCategories`).
 *   2. `duplicates` (useMemo) iterates `validProducts` and, for each one,
 *      constructs the same 6-field fingerprint that `useExistingFingerprints`
 *      stores (lowercase name, lowercase material, numeric price, nullable
 *      sale_price, lowercase category, trimmed image_url).
 *   3. If a match is found the product's client-side `id` is added to the
 *      `duplicates` Set.  This Set is passed down to `ProductRowCard` (red
 *      border) and `PreviewDialog` (destructive badge).
 *   4. During `submit()`, if `duplicateCheck` is enabled, only products
 *      **not** in `duplicates` are sent to the DB.
 *
 * ## Bengali UI labels (referenced in this hook's return values)
 *   - "ডুপ্লিকেট চেক"  → the toggle Switch label in `AddProductsPanel`
 *   - "বৈধ"            → valid product count badge
 *   - "ভেরিয়েন্ট"       → variant count badge
 *   - "কোনো বৈধ প্রোডাক্ট নেই" → toast when nothing to submit
 */

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BATCH_SIZE, createEmptyProduct, createEmptyVariant, generateId,
  type ProductRow, type SubmitResults, type VariantRow,
} from "@/lib/admin/bulkProducts/types";
import { useExistingFingerprints } from "./useBulkCategories";

/**
 * Hook that encapsulates all state and actions for the "Add Products" tab.
 *
 * @returns An object with:
 *   - **State** – `products`, `submitting`, `progress`, `results`,
 *     `duplicateCheck`, `validProducts`, `duplicates`, `totalVariants`.
 *   - **Product actions** – `setProducts`, `updateProduct`, `removeProduct`,
 *     `addProducts`, `duplicateProduct`, `toggleExpand`.
 *   - **Variant actions** – `addVariant`, `updateVariant`, `removeVariant`,
 *     `autoGenerateVariants`.
 *   - **Submit** – `submit()` runs the batch-insert pipeline.
 *
 * @example
 * ```tsx
 * const state = useBulkAddProducts();
 * // Pass directly to AddProductsPanel:
 * <AddProductsPanel state={state} categories={allCategories} />
 * ```
 */
export function useBulkAddProducts() {
  const queryClient = useQueryClient();

  /**
   * The live list of product rows displayed in the panel.
   * Initialised with 5 empty rows so the admin can start filling immediately.
   */
  const [products, setProducts] = useState<ProductRow[]>(() => Array.from({ length: 5 }, createEmptyProduct));

  /** True while the batch-insert pipeline is running. Disables the submit button. */
  const [submitting, setSubmitting] = useState(false);

  /**
   * Insert progress 0–100, updated after every product-batch completes.
   * Displayed as "XX%" next to the spinner in the sticky footer.
   * Bengali UI: shown in the submit Button as "{progress}%" during save.
   */
  const [progress, setProgress] = useState(0);

  /** Aggregate results from the last submit; null if no submit has run yet. */
  const [results, setResults] = useState<SubmitResults | null>(null);

  /**
   * Controls whether the fingerprint-based duplicate check runs.
   * Bound to the "ডুপ্লিকেট চেক" Switch in `AddProductsPanel`.
   * When false, `duplicates` is always an empty Set and all valid products
   * are submitted regardless of DB matches.
   */
  const [duplicateCheck, setDuplicateCheck] = useState(true);

  /**
   * Existing product fingerprints fetched from the DB (2-min cache).
   * Used by the `duplicates` useMemo.
   * @see useBulkCategories.useExistingFingerprints
   */
  const { data: existingProducts = [] } = useExistingFingerprints();

  // ---------------------------------------------------------------------------
  // Product-level actions (all memoised with useCallback to keep child renders
  // stable when only unrelated products change)
  // ---------------------------------------------------------------------------

  /**
   * Updates a single field on a product by its client-side `id`.
   * The `field` argument is a `keyof ProductRow` string; using `any` for
   * `value` keeps the call sites concise (all inputs map via `e.target.value`).
   */
  const updateProduct = useCallback((id: string, field: string, value: any) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }, []);

  /** Removes a product from the list by its client-side `id`. */
  const removeProduct = useCallback((id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  /**
   * Appends `count` new empty product rows to the bottom of the list.
   * The "1 / 10 / 25 / 50 / 100" quick-add buttons in `AddProductsPanel`
   * call this.
   */
  const addProducts = useCallback((count: number) => {
    setProducts(prev => [...prev, ...Array.from({ length: count }, createEmptyProduct)]);
  }, []);

  /**
   * Clones an existing product, assigning fresh client-side IDs to both the
   * product and all its variants.  The copy appended to the list carries the
   * suffix " (কপি)" in Bengali ("Copy") to help distinguish it visually.
   * `_dbId` and `_dirty` are cleared so the duplicate is treated as a new row.
   */
  const duplicateProduct = useCallback((product: ProductRow) => {
    const copy: ProductRow = {
      ...product, id: generateId(), name: product.name + " (কপি)",
      variants: product.variants.map(v => ({ ...v, id: generateId() })),
      _dbId: undefined, _dirty: undefined,
    };
    setProducts(prev => [...prev, copy]);
  }, []);

  /** Toggles the expanded/collapsed state of the detail section for a product. */
  const toggleExpand = useCallback((id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, expanded: !p.expanded } : p));
  }, []);

  // ---------------------------------------------------------------------------
  // Variant-level actions
  // ---------------------------------------------------------------------------

  /**
   * Appends an empty variant row to a product and auto-expands it so the
   * variant editor is immediately visible.
   */
  const addVariant = useCallback((productId: string) => {
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, variants: [...p.variants, createEmptyVariant()], expanded: true } : p));
  }, []);

  /** Updates a single field on a specific variant of a specific product. */
  const updateVariant = useCallback((productId: string, variantId: string, field: string, value: any) => {
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, variants: p.variants.map(v => v.id === variantId ? { ...v, [field]: value } : v) } : p));
  }, []);

  /** Removes a variant by ID from its parent product. */
  const removeVariant = useCallback((productId: string, variantId: string) => {
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, variants: p.variants.filter(v => v.id !== variantId) } : p));
  }, []);

  /**
   * Auto-generates the cartesian product of `sizes × colors` as variant rows.
   *
   * ### Algorithm
   * - `sizes` and `colors` strings are split on commas and trimmed.
   * - If **both** are present: every (size, color) combination is created.
   * - If only `sizes`: one variant per size with empty color.
   * - If only `colors`: one variant per color with empty size.
   * - If neither: toast error "সাইজ বা কালার দিন আগে" and abort.
   *
   * Each generated variant inherits the parent product's current `stock`
   * (defaulting to 10 if stock is 0) and starts with blank SKU, 0 price
   * adjustment, and empty image.
   *
   * The product is auto-expanded after generation.
   * Toast: "Xটি ভেরিয়েন্ট তৈরি হয়েছে"
   */
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

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  /**
   * Products that satisfy the minimum required fields for DB insertion:
   *   - `name` is non-empty after trimming
   *   - `category` is non-empty after trimming
   *   - `price > 0`
   *
   * Memoised so re-computation only occurs when `products` changes.
   */
  const validProducts = useMemo(
    () => products.filter(p => p.name.trim() && p.category.trim() && p.price > 0),
    [products],
  );

  /**
   * Set of **client-side IDs** of valid products that are considered duplicates.
   *
   * ### Fingerprint matching (6-tuple comparison)
   * For each valid product the following normalised values are computed and
   * compared against every entry in `existingProducts`:
   *
   * | Field        | Normalisation                          |
   * |--------------|----------------------------------------|
   * | `name`       | `.toLowerCase().trim()`                |
   * | `material`   | `.toLowerCase().trim()`, `""` if null  |
   * | `price`      | `Number(p.price) \|\| 0`               |
   * | `sale_price` | `Number()` or `null`                   |
   * | `category`   | `.toLowerCase().trim()`                |
   * | `image_url`  | `.trim()`                              |
   *
   * **All six fields** must match for a product to be flagged; partial matches
   * are intentionally not flagged (e.g. same name + different price is OK).
   *
   * When `duplicateCheck` is false this returns an empty Set immediately,
   * skipping the comparison loop entirely.
   */
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

  /**
   * Total count of variants across **all** rows (valid or not).
   * Displayed as a badge "Xটি ভেরিয়েন্ট" in the panel header.
   */
  const totalVariants = products.reduce((sum, p) => sum + p.variants.length, 0);

  // ---------------------------------------------------------------------------
  // submit  – the batch-insert pipeline
  // ---------------------------------------------------------------------------

  /**
   * Inserts all valid, non-duplicate products (and their variants) into
   * Supabase via chunked batch requests.
   *
   * ### Step-by-step
   * 1. **Filter** – `toSubmit = validProducts` minus duplicates (when check enabled).
   * 2. **Product batch loop** – iterate `toSubmit` in slices of `BATCH_SIZE`:
   *    a. Build `productData` array (trimmed strings, null-coerced optionals,
   *       sizes/colors split from comma strings to arrays).
   *    b. `supabase.from("products").insert(productData).select("id, name")`.
   *    c. On success build a `nameToId` map (`{ [name]: dbId }`).
   *       ⚠️ Edge case: if two products in the same batch share the same name,
   *       the second will overwrite the first in `nameToId`, causing the first
   *       product's variants to receive the wrong `product_id`. Admins should
   *       ensure unique names within a batch.
   *    d. Collect variant rows for all products in the batch that have at
   *       least one of `size` or `color` set.
   * 3. **Variant sub-batch loop** – insert collected variants in chunks of
   *    **100** rows to stay within Supabase request size limits.
   * 4. **Progress** – updated as a percentage after each product-batch:
   *    `Math.round(((i + batch.length) / toSubmit.length) * 100)`.
   * 5. **Cache invalidation** – on any success, four query keys are
   *    invalidated so counts, lists, and fingerprints refresh immediately.
   * 6. Toast: "Xটি প্রোডাক্ট ও Yটি ভেরিয়েন্ট যুক্ত হয়েছে!"
   */
  const submit = async () => {
    const toSubmit = duplicateCheck ? validProducts.filter(p => !duplicates.has(p.id)) : validProducts;
    if (toSubmit.length === 0) { toast.error("কোনো বৈধ প্রোডাক্ট নেই"); return; }

    setSubmitting(true); setProgress(0); setResults(null);
    const res: SubmitResults = { success: 0, failed: 0, variants: 0, errors: [] };

    for (let i = 0; i < toSubmit.length; i += BATCH_SIZE) {
      const batch = toSubmit.slice(i, i + BATCH_SIZE);

      // Build the payload; comma-separated size/color strings are exploded into
      // string arrays as expected by the Supabase `products` table schema.
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

        // Map returned DB IDs back to local product names so variants can
        // reference the correct `product_id` foreign-key.
        // ⚠️ Duplicate names within the same batch will cause last-wins collision
        // in this map – avoid submitting batches with non-unique product names.
        const nameToId = Object.fromEntries((data || []).map(d => [d.name, d.id]));

        // Collect all variants for this product batch into one flat array.
        const variantsToInsert: any[] = [];
        for (const p of batch) {
          const productId = nameToId[p.name.trim()];
          if (!productId) continue; // Product insert failed / name mismatch.
          for (const v of p.variants) {
            // Skip fully empty variant rows (both size and color are blank).
            if (!v.size && !v.color) continue;
            variantsToInsert.push({
              product_id: productId, size: v.size || null, color: v.color || null,
              stock: v.stock, sku: v.sku || null, price_adjustment: v.price_adjustment || 0,
              image_url: v.image_url || null,
            });
          }
        }

        // Sub-batch variant inserts in chunks of 100.
        if (variantsToInsert.length > 0) {
          for (let vi = 0; vi < variantsToInsert.length; vi += 100) {
            const vBatch = variantsToInsert.slice(vi, vi + 100);
            const { data: vData, error: vError } = await supabase.from("product_variants").insert(vBatch).select();
            if (vError) res.errors.push(`ভেরিয়েন্ট: ${vError.message}`);
            else res.variants += (vData || []).length;
          }
        }
      }

      // Update UI progress bar after each product-batch completes.
      setProgress(Math.round(((i + batch.length) / toSubmit.length) * 100));
    }

    setResults(res); setSubmitting(false);
    if (res.success > 0) {
      // Bust all related caches so sibling panels and counters stay in sync.
      queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-products-count"] });
      queryClient.invalidateQueries({ queryKey: ["admin-bulk-products"] });
      // Bust fingerprints so the next duplicate check sees the new products.
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
