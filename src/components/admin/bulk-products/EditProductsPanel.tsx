/**
 * @file EditProductsPanel.tsx
 * @description Admin panel for loading, searching, paginating, editing, and
 * deleting existing products from the Supabase database.
 *
 * ── Overview ──────────────────────────────────────────────────────────────────
 *
 * This component is a "dumb" presentational shell: all business logic lives
 * in the `useBulkEditProducts` hook, which is passed in via `props.state`.
 * The panel's only jobs are:
 *   1. Render the toolbar (load/refresh, search, dirty/bulk counters).
 *   2. Render paginated `<ProductRowCard>` rows.
 *   3. Render the sticky save bar when there are unsaved edits (`dirtyCount > 0`).
 *   4. Render the delete confirmation `<AlertDialog>`.
 *
 * ── Dirty state ──────────────────────────────────────────────────────────────
 *
 * Each `ProductRow` in `editProducts` carries a `_dirty` boolean flag.
 * `updateEditProduct` in the hook sets `_dirty = true` on any field change.
 * `dirtyCount` is `editProducts.filter(p => p._dirty).length`.
 * Only dirty rows are sent as UPDATE queries when "সব পরিবর্তন সেভ" is clicked.
 *
 * The sticky save bar (`position: sticky; bottom: 1rem`) only renders when
 * `dirtyCount > 0`, giving the admin a persistent CTA after scrolling.
 *
 * ── Pagination logic ─────────────────────────────────────────────────────────
 *
 * Products are loaded fully into memory (all pages) and paginated client-side.
 * Pagination relies on three derived values from the hook:
 *   • `filteredEditProducts` — full list after applying `editSearch` filter.
 *   • `paginatedEditProducts` — slice of `filteredEditProducts` for the current
 *     page: `filteredEditProducts.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)`.
 *   • `editTotalPages` — `Math.ceil(filteredEditProducts.length / PAGE_SIZE)`.
 *
 * The page number displayed on each `ProductRowCard` is:
 *   `i + (editPage - 1) * EDIT_PAGE_SIZE`
 * where `i` is the 0-based index within the current page slice, producing a
 * correct continuous serial number across pages (e.g. page 2 starts at index 20).
 *
 * Smart page button window (max 7 buttons):
 *   - Total pages ≤ 7   → show all pages (1, 2, … N).
 *   - Current page ≤ 4  → show pages 1–7.
 *   - Current page ≥ N-3 → show pages N-6 to N.
 *   - Otherwise         → show current-3 to current+3 (current in the middle).
 * This avoids a bloated pagination bar for large catalogues while always keeping
 * the current page visible.
 *
 * When the search term changes, `setEditPage(1)` is called immediately to
 * prevent the user from being stuck on page 5 of a now-smaller result set.
 *
 * ── Bulk delete ──────────────────────────────────────────────────────────────
 *
 * The `bulkDeleteIds` Set tracks product IDs checked for bulk deletion.
 * `toggleBulkSelect(id)` adds or removes an ID from the set.
 * The "Xটি ডিলিট" button appears in the toolbar only when `bulkDeleteIds.size > 0`
 * and calls `handleBulkDelete()` which fires a single batched Supabase DELETE.
 *
 * ── Single delete ────────────────────────────────────────────────────────────
 *
 * `onRemove` on ProductRowCard calls `setDeleteId(id)`, which sets the
 * `deleteId` state, opening the `<AlertDialog>` confirmation modal.
 * On confirm, `handleDeleteProduct()` deletes by `_dbId` and clears `deleteId`.
 *
 * ── Bengali UI strings used ───────────────────────────────────────────────────
 * • "রিফ্রেশ"                  → button label after initial load (refresh)
 * • "প্রোডাক্ট লোড করুন"        → initial load button label
 * • "সার্চ..."                  → search input placeholder
 * • "প্রোডাক্ট"                 → unit label in count badge ("N products")
 * • "পরিবর্তিত"                 → dirty count badge ("N modified")
 * • "টি ডিলিট"                  → bulk delete button suffix ("Delete N")
 * • "পূর্ববর্তী / পরবর্তী"      → previous / next page buttons
 * • "সব পরিবর্তন সেভ"          → save bar button label
 * • "সেভ হচ্ছে..."              → save bar loading state label
 * • "প্রোডাক্ট ডিলিট করবেন?"   → delete dialog title
 * • "বাতিল / ডিলিট"             → cancel / confirm labels in delete dialog
 *
 * @module EditProductsPanel
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBulkEditProducts } from "@/hooks/admin/useBulkEditProducts";
import ProductRowCard from "./ProductRowCard";
import { EDIT_PAGE_SIZE } from "@/lib/admin/bulkProducts/types";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for {@link EditProductsPanel}.
 */
interface Props {
  /**
   * The full return value of the `useBulkEditProducts` hook.
   * Passed in from the parent tab so state is owned at a higher level and
   * survives panel switching without re-fetching.
   */
  state: ReturnType<typeof useBulkEditProducts>;

  /**
   * Available category strings (e.g. "Borkas", "Hijabs") used to populate the
   * category `<Select>` in each `ProductRowCard`.
   * Fetched once from Supabase by the parent and shared across all panels.
   */
  categories: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `EditProductsPanel` — read/edit/delete panel for existing Supabase products.
 *
 * Renders three main sections:
 *   1. **Toolbar** — load/refresh button, search input, count badges, bulk-delete
 *      button.
 *   2. **Product list** — scrollable container of `<ProductRowCard>` rows with
 *      client-side pagination controls below.
 *   3. **Sticky save bar** — shown only when `dirtyCount > 0`; triggers
 *      `saveEditedProducts()` which UPDATEs only dirty rows.
 *
 * When `editLoaded` is false (initial state), shows an empty-state placeholder
 * card prompting the admin to click "প্রোডাক্ট লোড করুন".
 *
 * @param props - {@link Props}
 * @returns The edit panel JSX tree.
 *
 * @example
 * const editState = useBulkEditProducts();
 * <EditProductsPanel state={editState} categories={cats} />
 */
const EditProductsPanel = ({ state, categories }: Props) => {
  // Destructure all state and actions from the hook for convenience.
  const {
    /** Whether products have been fetched from Supabase at least once. */
    editLoaded,
    /** Whether a save (UPDATE) operation is in progress. */
    editSaving,
    /** Current search query string for client-side name filtering. */
    editSearch,
    /** Setter for editSearch; resets page to 1 on change. */
    setEditSearch,
    /** Full in-memory array of all loaded products (unfiltered). */
    editProducts,
    /** Product ID currently pending single-product delete confirmation, or null. */
    deleteId,
    /** Opens/closes the single-delete AlertDialog by setting deleteId. */
    setDeleteId,
    /** Set of product IDs selected for bulk delete. */
    bulkDeleteIds,
    /** Toggles a product ID in/out of the bulkDeleteIds Set. */
    toggleBulkSelect,
    /** Current page number (1-based) in the client-side pagination. */
    editPage,
    /** Setter for the current page number. */
    setEditPage,
    /** Total page count: ceil(filteredEditProducts.length / EDIT_PAGE_SIZE). */
    editTotalPages,
    /**
     * Filtered product list (search applied, no pagination).
     * Used for the pagination range label "X–Y / Z".
     */
    filteredEditProducts,
    /**
     * Paginated slice of filteredEditProducts for the current page.
     * Length ≤ EDIT_PAGE_SIZE (= 20).
     */
    paginatedEditProducts,
    /** Number of products with `_dirty === true` (have unsaved field edits). */
    dirtyCount,
    /** Fetches all products from Supabase and loads them into editProducts. */
    loadExistingProducts,
    /**
     * Updates a single field on a product row and sets `_dirty = true`.
     * Signature: (productId, fieldName, newValue) → void
     */
    updateEditProduct,
    /** Toggles the `expanded` flag on a product row. */
    toggleEditExpand,
    /** Appends a blank VariantRow to a product and sets _dirty. */
    addEditVariant,
    /** Updates a field on a variant row and sets the parent product _dirty. */
    updateEditVariant,
    /** Removes a variant row from a product and sets _dirty. */
    removeEditVariant,
    /**
     * Auto-generates variants by cross-joining the product's comma-separated
     * sizes and colors arrays, then sets _dirty.
     */
    autoGenerateEditVariants,
    /** Sends UPDATE queries for all `_dirty` rows, then clears dirty flags. */
    saveEditedProducts,
    /** Deletes the product matching `deleteId` from Supabase and local state. */
    handleDeleteProduct,
    /** Deletes all products whose IDs are in `bulkDeleteIds` from Supabase. */
    handleBulkDelete,
  } = state;

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/*
         * Load / Refresh button.
         * - Before first load (`!editLoaded`): "default" variant, label "প্রোডাক্ট
         *   লোড করুন" (Load Products) — prompts admin to fetch data.
         * - After first load (`editLoaded`): "outline" variant, label "রিফ্রেশ"
         *   (Refresh) — re-fetches from Supabase, discarding unsaved edits.
         */}
        <Button
          onClick={loadExistingProducts}
          variant={editLoaded ? "outline" : "default"}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          {/* Bengali: "Refresh" if loaded, "Load Products" if not yet loaded */}
          {editLoaded ? "রিফ্রেশ" : "প্রোডাক্ট লোড করুন"}
        </Button>

        {/* Controls shown only after at least one successful load */}
        {editLoaded && (
          <>
            {/*
             * Search input — filters product list by name (case-insensitive,
             * client-side).  Resets editPage to 1 to avoid being stuck on an
             * out-of-range page after the result count shrinks.
             * Bengali placeholder: "সার্চ..." (Search...)
             */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="সার্চ..."
                value={editSearch}
                onChange={e => {
                  setEditSearch(e.target.value);
                  // Reset to page 1 when the search changes so the admin is
                  // not left on an empty page (e.g. was on page 5, now only 1
                  // result matches).
                  setEditPage(1);
                }}
                className="pl-10 h-9"
              />
            </div>

            {/* Total product count badge. Bengali: "N প্রোডাক্ট" */}
            <Badge variant="outline">{editProducts.length} প্রোডাক্ট</Badge>

            {/*
             * Dirty count badge — visible only when at least one product has
             * unsaved edits.  Primary-coloured border/text to draw attention.
             * Bengali: "N পরিবর্তিত" (N modified)
             */}
            {dirtyCount > 0 && (
              <Badge
                variant="outline"
                className="border-primary text-primary"
              >
                {dirtyCount} পরিবর্তিত
              </Badge>
            )}

            {/*
             * Bulk delete button — only shown when at least one row is checked.
             * Calls handleBulkDelete() which batches all bulkDeleteIds into a
             * single Supabase DELETE WHERE id IN (...) call.
             * Bengali: "Xটি ডিলিট" (Delete X)
             */}
            {bulkDeleteIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                {bulkDeleteIds.size}টি ডিলিট
              </Button>
            )}
          </>
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      {editLoaded ? (
        <>
          {/*
           * Scrollable product list container.
           * max-h-[75vh] + overflow-auto keeps the panel within the viewport
           * even for large catalogues.  The sticky save bar outside this
           * container remains visible while scrolling within.
           */}
          <div className="overflow-auto max-h-[75vh] border rounded-md p-2">
            <div className="space-y-3">
              {paginatedEditProducts.map((p, i) => (
                /**
                 * ProductRowCard for each product on the current page.
                 *
                 * `key={p.id}` — client-side temporary ID (never the DB UUID)
                 * ensures stable React reconciliation.
                 *
                 * `index` — continuous 0-based serial number across pages:
                 *   i + (editPage - 1) * EDIT_PAGE_SIZE
                 * e.g. on page 2 (editPage=2), the first card shows index 20.
                 *
                 * `isEdit={true}` — switches the card into edit mode:
                 *   - Shows bulk-select checkbox.
                 *   - Shows "_dirty" badge instead of "duplicate" badge.
                 *   - onRemove triggers setDeleteId (opens confirmation dialog)
                 *     instead of directly removing from local state.
                 */
                <ProductRowCard
                  key={p.id}
                  product={p}
                  index={i + (editPage - 1) * EDIT_PAGE_SIZE}
                  isEdit
                  categories={categories}
                  isBulkSelected={bulkDeleteIds.has(p.id)}
                  onToggleBulk={toggleBulkSelect}
                  onUpdate={updateEditProduct}
                  onExpand={toggleEditExpand}
                  onAddVariant={addEditVariant}
                  onUpdateVariant={updateEditVariant}
                  onRemoveVariant={removeEditVariant}
                  onAutoVariants={autoGenerateEditVariants}
                  onRemove={setDeleteId}
                />
              ))}
            </div>
          </div>

          {/*
           * ── Pagination controls ────────────────────────────────────────
           * Only rendered when there is more than one page.
           *
           * Range label: "X–Y / Z"
           *   X = (editPage - 1) * EDIT_PAGE_SIZE + 1  (first item on page)
           *   Y = min(editPage * EDIT_PAGE_SIZE, filteredEditProducts.length)
           *   Z = filteredEditProducts.length (total filtered count)
           *
           * Smart 7-button window algorithm (prevents unbounded button row):
           *   - Total pages ≤ 7  → show ALL pages (indices 0..N-1).
           *   - Current page ≤ 4 → show pages 1–7 (start-anchored window).
           *   - Current page ≥ N-3 → show pages N-6..N (end-anchored window).
           *   - Otherwise         → show current-3..current+3 (centered).
           *
           * Bengali: "পূর্ববর্তী" = Previous, "পরবর্তী" = Next
           */}
          {editTotalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              {/* Range indicator: "1–20 / 87" */}
              <p className="text-sm text-muted-foreground">
                {(editPage - 1) * EDIT_PAGE_SIZE + 1}–
                {Math.min(
                  editPage * EDIT_PAGE_SIZE,
                  filteredEditProducts.length
                )}{" "}
                / {filteredEditProducts.length}
              </p>

              <div className="flex items-center gap-1">
                {/* Previous page button — disabled on the first page */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={editPage <= 1}
                  onClick={() => setEditPage(p => p - 1)}
                >
                  পূর্ববর্তী
                </Button>

                {/*
                 * Numbered page buttons — at most 7 visible at a time.
                 *
                 * The window calculation:
                 *   if N <= 7          → page = i + 1          (show all)
                 *   if cur <= 4        → page = i + 1          (start-anchored)
                 *   if cur >= N - 3    → page = N - 6 + i      (end-anchored)
                 *   else               → page = cur - 3 + i    (centered)
                 */}
                {Array.from(
                  { length: Math.min(editTotalPages, 7) },
                  (_, i) => {
                    let page: number;
                    if (editTotalPages <= 7) {
                      page = i + 1;
                    } else if (editPage <= 4) {
                      page = i + 1;
                    } else if (editPage >= editTotalPages - 3) {
                      page = editTotalPages - 6 + i;
                    } else {
                      page = editPage - 3 + i;
                    }
                    return (
                      <Button
                        key={page}
                        variant={editPage === page ? "default" : "outline"}
                        size="sm"
                        className="w-9 h-8 text-xs"
                        onClick={() => setEditPage(page)}
                      >
                        {page}
                      </Button>
                    );
                  }
                )}

                {/* Next page button — disabled on the last page */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={editPage >= editTotalPages}
                  onClick={() => setEditPage(p => p + 1)}
                >
                  পরবর্তী
                </Button>
              </div>
            </div>
          )}

          {/*
           * ── Sticky save bar ───────────────────────────────────────────
           * Rendered only when dirtyCount > 0 (at least one product has an
           * unsaved field change).
           *
           * `sticky bottom-4 z-10` keeps this bar visible even when the admin
           * has scrolled down the product list — it floats above the content.
           * `border-primary/20 shadow-lg` provide visual emphasis.
           *
           * Clicking "সব পরিবর্তন সেভ" calls `saveEditedProducts()` which:
           *   1. Collects all `_dirty` products.
           *   2. Sends an UPDATE per dirty product (parallel Promises).
           *   3. Clears `_dirty` flags on success.
           *   4. Shows a toast with the count of saved/failed products.
           *
           * During saving, the button shows a spinner and "সেভ হচ্ছে..."
           * (Bengali: "Saving...").
           */}
          {dirtyCount > 0 && (
            <Card className="sticky bottom-4 z-10 border-2 border-primary/20 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  {/* Bengali: "N products modified" */}
                  <span className="text-sm">
                    <span className="font-semibold">{dirtyCount}</span>
                    টি প্রোডাক্ট পরিবর্তিত
                  </span>

                  <Button
                    onClick={saveEditedProducts}
                    disabled={editSaving}
                  >
                    {editSaving ? (
                      /* Bengali: "Saving..." */
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        সেভ হচ্ছে...
                      </>
                    ) : (
                      /* Bengali: "Save all changes" */
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        সব পরিবর্তন সেভ
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        /*
         * Empty state — shown before the admin has loaded products.
         * Border-dashed card with a Pencil icon and instruction text.
         * Bengali: "Click 'Load Products' to edit, update and delete
         *           existing products"
         */
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-muted-foreground">
            <Pencil className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>
              "প্রোডাক্ট লোড করুন" বাটনে ক্লিক করে বিদ্যমান প্রোডাক্ট এডিট,
              আপডেট ও ডিলিট করুন
            </p>
          </CardContent>
        </Card>
      )}

      {/*
       * ── Single-product delete confirmation dialog ─────────────────────
       *
       * `open={!!deleteId}` — dialog is open whenever a non-null deleteId is
       * set (set by ProductRowCard's onRemove → setDeleteId).
       * `onOpenChange={() => setDeleteId(null)}` — clicking the backdrop or
       * pressing Escape clears deleteId, closing the dialog without deleting.
       *
       * On confirm: `handleDeleteProduct()` deletes by `_dbId` from Supabase,
       * removes the row from local state, and sets deleteId back to null.
       *
       * Bengali strings:
       *   Title:       "প্রোডাক্ট ডিলিট করবেন?" (Delete this product?)
       *   Description: "এই প্রোডাক্ট ও এর সব ভেরিয়েন্ট স্থায়ীভাবে মুছে যাবে।"
       *                (This product and all its variants will be permanently
       *                deleted.)
       *   Cancel:      "বাতিল" (Cancel)
       *   Confirm:     "ডিলিট" (Delete)
       */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            {/* Bengali: "Delete this product?" */}
            <AlertDialogTitle>প্রোডাক্ট ডিলিট করবেন?</AlertDialogTitle>
            {/* Bengali: "This product and all its variants will be permanently deleted." */}
            <AlertDialogDescription>
              এই প্রোডাক্ট ও এর সব ভেরিয়েন্ট স্থায়ীভাবে মুছে যাবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Bengali: "Cancel" */}
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            {/* Bengali: "Delete" — destructive styling */}
            <AlertDialogAction
              onClick={handleDeleteProduct}
              className="bg-destructive text-destructive-foreground"
            >
              ডিলিট
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EditProductsPanel;
