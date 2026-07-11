/**
 * @file useAdminProducts.ts
 * @description Custom React hook that owns all Supabase data-fetching and
 * mutations for the admin products feature.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture summary
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This hook wraps TanStack Query (`useQuery` / `useMutation`) around the two
 * Supabase tables involved in product management:
 *
 *  • `products`       – main product catalogue (scalar fields)
 *  • `product_images` – gallery image rows linked via `product_id` FK
 *
 * It is the single source of truth for the products list used by
 * `ProductsTable`, `ProductsFilters`, and `ProductsPagination`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase queries performed
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  [READ] `useQuery` → queryKey: ["admin-products-list"]
 *    SELECT * FROM products ORDER BY created_at DESC
 *    RLS: admin JWT required (is_admin claim).
 *    staleTime : 2 min  (avoids refetch on every tab focus)
 *    gcTime    : 10 min (keeps data in cache while user navigates)
 *
 *  [WRITE – UPDATE] `saveMutation` when `id` is non-null
 *    UPDATE products SET ... WHERE id = <id>
 *    Then conditionally:
 *    INSERT INTO product_images (product_id, image_url, display_order)
 *      — only when new gallery URLs are provided
 *      — appends after the highest existing display_order (monotonic)
 *
 *  [WRITE – INSERT] `saveMutation` when `id` is null
 *    INSERT INTO products (...) RETURNING *  → returns the new row's id
 *    Then conditionally:
 *    INSERT INTO product_images (product_id, image_url, display_order)
 *      — only when gallery URLs are provided
 *      — display_order starts at 0 for a brand-new product
 *
 *  [WRITE – DELETE] `deleteMutation`
 *    DELETE FROM products WHERE id = <id>
 *    Cascade: product_images rows are deleted by FK ON DELETE CASCADE in DB.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Cache invalidation
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  `invalidateProducts()` invalidates both:
 *    • ["admin-products-list"]  – triggers re-fetch of the full list
 *    • ["admin-products-count"] – triggers re-fetch of the count badge
 *                                 (used by the sidebar / dashboard stats)
 *
 *  Called automatically in `onSuccess` of both `saveMutation` and
 *  `deleteMutation` so the UI always reflects the latest DB state.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RLS (Row-Level Security) notes
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  • `products`       SELECT: public.   INSERT/UPDATE/DELETE: admin only.
 *  • `product_images` SELECT: public.   INSERT/UPDATE/DELETE: admin only.
 *
 *  The Supabase client sends the authenticated session JWT automatically;
 *  no manual header injection is needed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Return value
 * ─────────────────────────────────────────────────────────────────────────────
 *  products          AdminProduct[]   – all products, newest first
 *  loading           boolean          – true while the initial fetch is in-flight
 *  invalidateProducts () => void      – manually bust both product cache keys
 *  saveMutation      UseMutationResult – create-or-update a product + gallery
 *  deleteMutation    UseMutationResult – delete a product by id
 *
 * বাংলা নোট:
 *  এই হুক প্রোডাক্ট সংক্রান্ত সব Supabase কল পরিচালনা করে।
 *  সেভ বা ডিলিটের পরে cache invalidate হয়ে UI স্বয়ংক্রিয়ভাবে আপডেট হয়।
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { AdminProduct, AdminProductInput } from "@/lib/admin/productHelpers";

/**
 * `useAdminProducts` – primary data hook for the admin products management page.
 *
 * Encapsulates:
 *  1. Fetching all products ordered newest-first (`useQuery`).
 *  2. Creating or updating a product and its gallery images (`saveMutation`).
 *  3. Deleting a product by UUID (`deleteMutation`).
 *  4. Invalidating the products query cache after any mutation.
 *
 * @example
 * ```tsx
 * const { products, loading, saveMutation, deleteMutation } = useAdminProducts();
 *
 * // Create a new product
 * saveMutation.mutate({ id: null, data: formData, galleryUrls });
 *
 * // Update an existing product
 * saveMutation.mutate({ id: existingProduct.id, data: formData, galleryUrls });
 *
 * // Delete a product
 * deleteMutation.mutate(product.id);
 * ```
 *
 * বাংলা: প্রোডাক্ট ফেচ, তৈরি, আপডেট ও ডিলিটের জন্য প্রধান হুক।
 */
export function useAdminProducts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ───────────────────────────────────────────────────────────────────────────
  // READ – Fetch all products
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Supabase query:
   *   SELECT * FROM products ORDER BY created_at DESC
   *
   * RLS: SELECT is public; no auth required to read the catalogue.
   * The admin dashboard still shows this data — the admin RLS restriction
   * applies only to mutating operations.
   *
   * staleTime (2 min): prevents unnecessary re-fetches on window focus while
   * the admin is actively working in other parts of the dashboard.
   * gcTime (10 min): keeps the data in memory when the user navigates away
   * so there is no loading flash on return.
   *
   * বাংলা: সব প্রোডাক্ট নতুন থেকে পুরনো ক্রমে লোড করা হয়।
   */
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
    staleTime: 2 * 60 * 1000,  // 2 minutes
    gcTime:    10 * 60 * 1000, // 10 minutes
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Cache invalidation helper
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Invalidates both product-related query keys so TanStack Query schedules
   * a background re-fetch.
   *
   * Keys invalidated:
   *  • `["admin-products-list"]`  – the full list used by this hook
   *  • `["admin-products-count"]` – the count badge shown in the sidebar /
   *                                  dashboard stats card
   *
   * Wrapped in `useCallback` to maintain a stable reference and avoid
   * unnecessary re-renders in consumer components that receive it as a prop.
   *
   * বাংলা: মিউটেশনের পরে প্রোডাক্ট লিস্ট ও কাউন্ট cache রিফ্রেশ করে।
   */
  const invalidateProducts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
    queryClient.invalidateQueries({ queryKey: ["admin-products-count"] });
  }, [queryClient]);

  // ───────────────────────────────────────────────────────────────────────────
  // WRITE – Save (create or update) a product
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * `saveMutation` – upserts a product and optionally appends gallery images.
   *
   * Arguments (`vars`):
   *  - `id`          – `null` → INSERT a new product; string UUID → UPDATE
   *  - `data`        – {@link AdminProductInput} form payload
   *  - `galleryUrls` – array of image URL strings to add to `product_images`
   *
   * ── UPDATE flow (id is a UUID string) ──────────────────────────────────────
   *   1. Normalise `productData` (coerce numbers, filter empty array entries,
   *      convert empty strings to null for nullable columns).
   *   2. UPDATE products SET <productData> WHERE id = <id>
   *      RLS: requires admin JWT.
   *   3. If `validUrls` is non-empty:
   *      a. SELECT display_order FROM product_images WHERE product_id = <id>
   *         ORDER BY display_order DESC LIMIT 1
   *         → determines where to start the new images' order counter.
   *      b. INSERT INTO product_images (product_id, image_url, display_order)
   *         VALUES ... (one row per URL, monotonically increasing order)
   *         This appends new gallery images without touching existing ones.
   *
   * ── INSERT flow (id is null) ────────────────────────────────────────────────
   *   1. Same normalisation as UPDATE.
   *   2. INSERT INTO products (...) RETURNING *
   *      → `.select().single()` returns the new row including the Postgres-
   *        assigned UUID.
   *   3. If `validUrls` is non-empty and `newProduct` is defined:
   *      INSERT INTO product_images (product_id, image_url, display_order)
   *      VALUES ... (display_order starts at 0 for a fresh product)
   *
   * onSuccess: shows a success toast and calls `invalidateProducts()`.
   * onError:   shows a destructive toast with the Supabase error message.
   *
   * বাংলা: নতুন প্রোডাক্ট INSERT করে অথবা বিদ্যমান প্রোডাক্ট UPDATE করে।
   * গ্যালারি ছবি আলাদা `product_images` টেবিলে সংরক্ষিত হয়।
   */
  const saveMutation = useMutation({
    mutationFn: async ({
      id,
      data,
      galleryUrls,
    }: {
      /** Null for INSERT; existing product UUID for UPDATE. */
      id: string | null;
      /** Full product form payload (excluding `id`). */
      data: AdminProductInput;
      /** Additional gallery image URLs to append to `product_images`. */
      galleryUrls: string[];
    }) => {
      // ── Normalise payload ──────────────────────────────────────────────────
      // Coerce price/sale_price/stock to numbers (form values may be strings).
      // Filter falsy values from sizes/colors arrays.
      // Convert empty strings to null for nullable columns to avoid storing "".
      const productData = {
        ...data,
        price:     Number(data.price),
        sale_price: data.sale_price ? Number(data.sale_price) : null,
        stock:     Number(data.stock),
        sizes:     data.sizes?.filter(Boolean) || [],
        colors:    data.colors?.filter(Boolean) || [],
        image_url: data.image_url?.trim() || null,
        description: data.description?.trim() || null,
        material:  data.material?.trim()  || null,
        video_url: data.video_url?.trim() || null,
        sku: data.sku?.trim() || null,
        subcategory: data.subcategory?.trim() || null,
        fabric: data.fabric?.trim() || null,
        work_type: data.work_type?.trim() || null,
        part: data.part?.trim() || null,
        image_alt_text: data.image_alt_text?.trim() || null,
        meta_title: data.meta_title?.trim() || null,
        meta_description: data.meta_description?.trim() || null,
        purchase_cost: data.purchase_cost ? Number(data.purchase_cost) : null,
      };

      // Sanitise gallery URLs (trim whitespace, drop empty strings)
      const validUrls = galleryUrls.map((u) => u.trim()).filter(Boolean);

      if (id) {
        // ── UPDATE existing product ──────────────────────────────────────────
        // Supabase: UPDATE products SET <productData> WHERE id = id
        // RLS: admin JWT required.
        const { error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", id);
        if (error) throw error;

        if (validUrls.length > 0) {
          // Find the current highest display_order for this product's gallery
          // so that new images are appended after all existing ones.
          //
          // Supabase:
          //   SELECT display_order FROM product_images
          //   WHERE product_id = id
          //   ORDER BY display_order DESC
          //   LIMIT 1
          const { data: existing } = await supabase
            .from("product_images")
            .select("display_order")
            .eq("product_id", id)
            .order("display_order", { ascending: false })
            .limit(1);

          // If no existing images, start at 0; otherwise increment from max.
          const startOrder = (existing?.[0]?.display_order ?? -1) + 1;

          // Supabase:
          //   INSERT INTO product_images (product_id, image_url, display_order)
          //   VALUES (<id>, <url>, <startOrder + i>), ...
          await supabase
            .from("product_images")
            .insert(
              validUrls.map((url, i) => ({
                product_id:    id,
                image_url:     url,
                display_order: startOrder + i,
              }))
            );
        }
      } else {
        // ── INSERT new product ───────────────────────────────────────────────
        // Supabase:
        //   INSERT INTO products (...) RETURNING *
        // `.select().single()` unwraps the single returned row.
        // RLS: admin JWT required.
        const { data: newProduct, error } = await supabase
          .from("products")
          .insert(productData)
          .select()
          .single();
        if (error) throw error;

        if (validUrls.length > 0 && newProduct) {
          // Supabase:
          //   INSERT INTO product_images (product_id, image_url, display_order)
          //   VALUES (<newProduct.id>, <url>, <i>), ...
          // display_order starts at 0 for a brand-new product.
          await supabase
            .from("product_images")
            .insert(
              validUrls.map((url, i) => ({
                product_id:    newProduct.id,
                image_url:     url,
                display_order: i,
              }))
            );
        }
      }
    },

    /**
     * Success handler: shows a contextual toast and invalidates the cache.
     * `vars.id` distinguishes "created" vs "updated" for the toast message.
     *
     * বাংলা: সফল হলে toast দেখায় এবং product list রিফ্রেশ করে।
     */
    onSuccess: (_data, vars) => {
      toast({
        title:       "Success",
        description: vars.id
          ? "Product updated successfully"
          : "Product created successfully",
      });
      invalidateProducts();
    },

    /**
     * Error handler: shows the raw Supabase error message so the admin can
     * diagnose RLS violations, constraint failures, etc.
     *
     * বাংলা: ত্রুটি হলে Supabase-এর বার্তা সহ error toast দেখায়।
     */
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ───────────────────────────────────────────────────────────────────────────
  // WRITE – Delete a product
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * `deleteMutation` – permanently deletes a product row by UUID.
   *
   * Supabase query:
   *   DELETE FROM products WHERE id = <id>
   *
   * RLS: admin JWT required.
   *
   * Cascade behaviour: `product_images` rows for this product are deleted
   * automatically via the FK `ON DELETE CASCADE` constraint defined in the
   * Supabase migration.  No explicit `product_images` DELETE is needed here.
   *
   * onSuccess: shows a success toast and invalidates the product cache.
   * onError:   shows a destructive toast with the Supabase error message.
   *
   * @param id – UUID of the product to delete.
   *
   * বাংলা: একটি প্রোডাক্ট স্থায়ীভাবে মুছে ফেলে।
   * DB-তে CASCADE আছে, তাই গ্যালারি ছবিও স্বয়ংক্রিয়ভাবে মুছে যায়।
   */
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Product deleted successfully" });
      invalidateProducts();
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  return {
    /** All products fetched from Supabase, newest first. Default: `[]`. */
    products,
    /** True while the initial product list fetch is in-flight. */
    loading,
    /**
     * Manually invalidate the product list and count caches.
     * Useful after external mutations (e.g. bulk import via `ProductImportExport`).
     *
     * বাংলা: বাইরে থেকে cache রিসেট করার ফাংশন।
     */
    invalidateProducts,
    /** TanStack `UseMutationResult` for creating or updating a product. */
    saveMutation,
    /** TanStack `UseMutationResult` for deleting a product by UUID. */
    deleteMutation,
  };
}
