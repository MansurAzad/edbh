/**
 * @file AddProductsPanel.tsx
 * @description
 *   Top-level panel rendered inside the "নতুন যোগ করুন" (Add Products) tab
 *   of the admin bulk-products page.
 *
 *   Orchestrates three sub-areas:
 *   1. **QuickTemplateCard** – fills shared fields (category, price, etc.)
 *      across all rows at once.
 *   2. **Scrollable product list** – one `ProductRowCard` per product row,
 *      capped at 75 vh with overflow-auto.
 *   3. **Sticky footer card** – shows live counts and hosts the submit +
 *      preview buttons.
 *
 * ## Bengali UI labels in this component
 *   - "ডুপ্লিকেট চেক"  → Switch label; toggles fingerprint duplicate detection.
 *   - "খালি সরান"      → removes rows where `name` is blank.
 *   - "বৈধ"            → valid (name + category + price filled) product count.
 *   - "ভেরিয়েন্ট"       → total variant count across all rows.
 *   - "ডুপ্লিকেট"       → count of rows flagged as DB duplicates.
 *   - "প্রিভিউ"         → opens `PreviewDialog`.
 *   - "Xটি যুক্ত করুন" → submit button label showing net insertable count.
 *
 * ## Duplicate-check flow (summary)
 *   The `duplicates` Set (from `useBulkAddProducts`) holds client-side IDs of
 *   products whose 6-field fingerprint matches an existing DB row.  The badge
 *   count shown is `duplicates.size`; the submit button shows
 *   `validProducts.length - duplicates.size` as the net insertable count.
 *
 * @param props.state  - Full return value of `useBulkAddProducts()`, passed
 *                       from the parent page to keep the hook alive across tab
 *                       switches.
 * @param props.categories - Active category name strings from `useBulkCategories`.
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, PackagePlus, Plus, X } from "lucide-react";
import { useBulkAddProducts } from "@/hooks/admin/useBulkAddProducts";
import QuickTemplateCard from "./QuickTemplateCard";
import ProductRowCard from "./ProductRowCard";
import PreviewDialog from "./PreviewDialog";

interface Props {
  /** Return value of `useBulkAddProducts()` owned by the parent page. */
  state: ReturnType<typeof useBulkAddProducts>;
  /** Active category names for dropdowns. */
  categories: string[];
}

/**
 * Renders the full "Add Products" panel.
 *
 * The panel is intentionally **stateless** apart from `previewOpen` – all
 * product data lives in the `state` prop (hook) so the list survives tab
 * navigation without remounting.
 */
const AddProductsPanel = ({ state, categories }: Props) => {
  /** Controls visibility of the `PreviewDialog` modal. */
  const [previewOpen, setPreviewOpen] = useState(false);

  const {
    products, setProducts, submitting, progress,
    duplicateCheck, setDuplicateCheck,
    validProducts, duplicates, totalVariants,
    updateProduct, removeProduct, addProducts, duplicateProduct,
    toggleExpand, addVariant, updateVariant, removeVariant, autoGenerateVariants,
    submit,
  } = state;

  return (
    <div className="space-y-4">
      {/* Shared-field template – applies category/price/etc. to ALL rows at once */}
      <QuickTemplateCard categories={categories} setProducts={setProducts} />

      {/* Quick-add buttons (1, 10, 25, 50, 100 rows) + duplicate-check toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        {[1, 10, 25, 50, 100].map(n => (
          <Button key={n} variant="outline" size="sm" onClick={() => addProducts(n)}>
            <Plus className="w-3 h-3 mr-1" /> {n}
          </Button>
        ))}
        <div className="flex-1" />
        {/* "ডুপ্লিকেট চেক" switch – when on, rows matching existing DB products
            are flagged and excluded from the final insert. */}
        <div className="flex items-center gap-2">
          <Switch checked={duplicateCheck} onCheckedChange={setDuplicateCheck} id="dup" />
          <Label htmlFor="dup" className="text-xs">ডুপ্লিকেট চেক</Label>
        </div>
        {/* "খালি সরান" – removes rows where name is empty/whitespace */}
        <Button variant="outline" size="sm" onClick={() => setProducts(products.filter(p => p.name.trim()))}>
          <X className="w-3 h-3 mr-1" /> খালি সরান
        </Button>
      </div>

      {/* Summary badges: valid count, total variants, duplicate count */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{validProducts.length} বৈধ</Badge>
        <Badge variant="outline">{totalVariants} ভেরিয়েন্ট</Badge>
        {/* Destructive badge only shown when at least one duplicate exists */}
        {duplicates.size > 0 && <Badge variant="destructive">{duplicates.size} ডুপ্লিকেট</Badge>}
      </div>

      {/* Scrollable product list – max 75 vh keeps the sticky footer visible */}
      <div className="overflow-auto max-h-[75vh] border rounded-md p-2">
        <div className="space-y-3">
          {products.map((p, i) => (
            <ProductRowCard
              key={p.id}
              product={p}
              index={i}
              isEdit={false}
              categories={categories}
              isDuplicate={duplicates.has(p.id)}
              onUpdate={updateProduct}
              onExpand={toggleExpand}
              onAddVariant={addVariant}
              onUpdateVariant={updateVariant}
              onRemoveVariant={removeVariant}
              onAutoVariants={autoGenerateVariants}
              onDuplicate={duplicateProduct}
              onRemove={removeProduct}
            />
          ))}
        </div>
      </div>

      {/* Sticky footer – always visible at bottom of viewport during scroll */}
      <Card className="sticky bottom-4 z-10 border-2 border-primary/20 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm">
              <span className="font-semibold">{validProducts.length}</span> বৈধ
              {/* Show how many duplicates will be skipped */}
              {duplicates.size > 0 && <span className="text-destructive ml-2">({duplicates.size}টি বাদ)</span>}
              {totalVariants > 0 && <span className="ml-2">| {totalVariants} ভেরিয়েন্ট</span>}
            </div>
            <div className="flex gap-2">
              {/* Preview button opens read-only table of all valid products */}
              <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!validProducts.length}>প্রিভিউ</Button>
              {/* Submit: net count = validProducts - duplicates */}
              <Button onClick={submit} disabled={submitting || !validProducts.length} className="min-w-[160px]">
                {submitting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {progress}%</>
                  : <><PackagePlus className="w-4 h-4 mr-2" /> {validProducts.length - duplicates.size}টি যুক্ত করুন</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Read-only preview dialog; shows duplicate status per row */}
      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} validProducts={validProducts} duplicates={duplicates} />
    </div>
  );
};

export default AddProductsPanel;
