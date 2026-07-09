/**
 * @file ProductsFilters.tsx
 * @description Toolbar row rendered above the products table in the admin panel.
 * Provides four filter controls (search, category, min price, max price) plus
 * the {@link ProductImportExport} widget for bulk CSV operations.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Controls (left → right)
 * ────────────────────────────────────────────────────────────────────────────
 *  1. Search input       – free-text search against product name / description
 *  2. Category select    – dropdown of unique category strings; "all" = no filter
 *  3. Min price input    – numeric lower bound (BDT ৳)
 *  4. Max price input    – numeric upper bound (BDT ৳)
 *  5. Import/Export      – {@link ProductImportExport} (CSV download + upload)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Layout
 * ────────────────────────────────────────────────────────────────────────────
 *  `flex flex-wrap gap-3` — controls wrap to the next line on narrow viewports.
 *  The search input grows (`flex-1`) up to a max width of `sm` (384 px).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Data flow
 * ────────────────────────────────────────────────────────────────────────────
 *  All state lives in the parent (`useAdminProducts` hook / page component).
 *  This component is fully controlled — it only reads props and fires setters.
 *  The parent derives the filtered product list from these values.
 *
 * বাংলা নোট:
 *  এই কম্পোনেন্টে কোনো স্টেট নেই। সব মান প্রপস হিসেবে আসে এবং
 *  পরিবর্তন হলে সেটার কলব্যাক প্যারেন্টকে জানায়।
 *
 * @module ProductsFilters
 */

import { Search, AlertTriangle, ArrowDownWideNarrow, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ProductImportExport from "@/components/admin/ProductImportExport";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for {@link ProductsFilters}.
 *
 * @interface Props
 *
 * @property {string} searchQuery
 *   Current free-text search string.  Empty string means no active search.
 *   বাংলা: বর্তমান সার্চ টেক্সট; খালি মানে কোনো ফিল্টার নেই।
 *
 * @property {(v: string) => void} setSearchQuery
 *   Setter — called on every keystroke in the search input.
 *   বাংলা: সার্চ ইনপুটে টাইপ করলে এই সেটার কল হয়।
 *
 * @property {string} categoryFilter
 *   Active category filter value, or `""` for "all categories".
 *   বাংলা: সক্রিয় ক্যাটাগরি ফিল্টার; খালি মানে সব ক্যাটাগরি।
 *
 * @property {(v: string) => void} setCategoryFilter
 *   Setter — called when the Select value changes.  The component normalises
 *   the special "all" sentinel back to `""` before calling this.
 *   বাংলা: ড্রপডাউন পরিবর্তনে কল হয়; "all" নির্বাচনে `""` পাঠানো হয়।
 *
 * @property {string} minPrice
 *   String representation of the minimum price filter (empty = no lower bound).
 *   Kept as string so the `<input type="number">` stays controlled without
 *   parsing edge cases on every keystroke.
 *   বাংলা: সর্বনিম্ন মূল্য স্ট্রিং হিসেবে; খালি মানে কোনো সীমা নেই।
 *
 * @property {(v: string) => void} setMinPrice – Setter for minPrice.
 *
 * @property {string} maxPrice
 *   String representation of the maximum price filter (empty = no upper bound).
 *   বাংলা: সর্বোচ্চ মূল্য স্ট্রিং হিসেবে; খালি মানে কোনো সীমা নেই।
 *
 * @property {(v: string) => void} setMaxPrice – Setter for maxPrice.
 *
 * @property {string[]} categories
 *   Unique category strings derived from the full product list.  Used to
 *   populate the category `<Select>` dropdown options.
 *   বাংলা: সব অনন্য ক্যাটাগরির তালিকা — ড্রপডাউনের অপশন তৈরি করতে ব্যবহৃত।
 *
 * @property {() => void} onImportComplete
 *   Callback forwarded to {@link ProductImportExport}.  Called after a
 *   successful CSV import so the parent can re-fetch the product list.
 *   বাংলা: CSV ইমপোর্ট সফল হলে প্যারেন্ট রিফ্রেশ করার জন্য কলব্যাক।
 */
interface Props {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  minPrice: string;
  setMinPrice: (v: string) => void;
  maxPrice: string;
  setMaxPrice: (v: string) => void;
  categories: string[];
  onImportComplete: () => void;
  /** Show only products at or below the configured low-stock threshold. */
  lowStockOnly: boolean;
  setLowStockOnly: (v: boolean) => void;
  /** Numeric stock threshold used for the "low stock only" filter and badge. */
  lowStockThreshold: number;
  setLowStockThreshold: (v: number) => void;
  /** Current sort mode for the products list. */
  sortMode: "newest" | "stock_asc" | "stock_desc" | "margin_asc" | "margin_desc" | "verify_worst" | "verify_best" | "similarity_desc";
  setSortMode: (v: "newest" | "stock_asc" | "stock_desc" | "margin_asc" | "margin_desc" | "verify_worst" | "verify_best" | "similarity_desc") => void;
  /** Number of products currently at or below the threshold. */
  lowStockCount: number;
  /** Export the current filtered/sorted list as CSV. */
  onExportFiltered: () => void;
  /** Count of currently visible (filtered) products for the export button label. */
  filteredCount: number;
  /** Open the bulk inventory update modal. */
  onOpenBulkInventory: () => void;
}

export default function ProductsFilters({
  searchQuery,
  setSearchQuery,
  categoryFilter,
  setCategoryFilter,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  categories,
  onImportComplete,
  lowStockOnly,
  setLowStockOnly,
  lowStockThreshold,
  setLowStockThreshold,
  sortMode,
  setSortMode,
  lowStockCount,
  onOpenBulkInventory,
  onExportFiltered,
  filteredCount,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select
          value={categoryFilter || "all"}
          onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min ৳"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-24"
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number"
            placeholder="Max ৳"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-24"
          />
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={onExportFiltered}
          disabled={filteredCount === 0}
          title="Download the current filtered/sorted list as CSV"
        >
          <Download className="w-4 h-4 mr-2" />
          Export {filteredCount > 0 ? `${filteredCount} ` : ""}CSV
        </Button>

        <ProductImportExport onImportComplete={onImportComplete} />
      </div>

      {/* ── Inventory row: low-stock filter, threshold, sort, bulk action ─── */}
      <div className="flex items-center gap-3 flex-wrap p-3 rounded-md border border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden="true" />
          <Label htmlFor="low-stock-toggle" className="text-sm font-medium">
            Low stock only
          </Label>
          <Switch
            id="low-stock-toggle"
            checked={lowStockOnly}
            onCheckedChange={setLowStockOnly}
          />
          {lowStockCount > 0 && (
            <Badge variant="destructive" data-testid="low-stock-count">
              {lowStockCount}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="low-stock-threshold" className="text-xs text-muted-foreground">
            Threshold ≤
          </Label>
          <Input
            id="low-stock-threshold"
            type="number"
            min={0}
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(Math.max(0, Number(e.target.value) || 0))}
            className="w-20"
            aria-label="Low stock threshold"
          />
        </div>

        <div className="flex items-center gap-2">
          <ArrowDownWideNarrow className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as Props["sortMode"])}>
            <SelectTrigger className="w-[170px]" aria-label="Sort products">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="stock_asc">Stock: low → high</SelectItem>
              <SelectItem value="stock_desc">Stock: high → low</SelectItem>
              <SelectItem value="margin_desc">Margin: high → low</SelectItem>
              <SelectItem value="margin_asc">Margin: low → high</SelectItem>
              <SelectItem value="verify_worst">Desc verify: fail first</SelectItem>
              <SelectItem value="verify_best">Desc verify: pass first</SelectItem>
              <SelectItem value="similarity_desc">Similarity: most alike first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto">
          <Button size="sm" variant="secondary" onClick={onOpenBulkInventory}>
            Bulk inventory update
          </Button>
        </div>
      </div>
    </div>
  );
}
