/**
 * @file ShopToolbar.tsx
 * @module components/shop/ShopToolbar
 *
 * @description
 * Controlled toolbar rendered above the product grid on the Shop page.
 * Contains two rows:
 *   1. **Category chips** — horizontally scrollable pill buttons; "সব" = "All" in Bengali.
 *   2. **Sort / Filter / View row** — sort `<select>`, filter toggle, grid/list toggle.
 *
 * Purely presentational — all state lives in the parent (ShopPage).
 */

import { Filter, Grid, List } from "lucide-react";
import SizeGuide from "@/components/shop/SizeGuide";

// ---------------------------------------------------------------------------
// Prop types
// ---------------------------------------------------------------------------

/**
 * A single category entry from the `categories` table.
 * Re-exported so consumers can type their category arrays uniformly.
 */
interface CategoryItem {
  /** English category name (used as the filter key). */
  name: string;
  /** Bengali category name shown in the UI, or `null` if not localised. */
  name_bn: string | null;
  /** URL-safe slug, or `null` when not set. */
  slug: string | null;
}

/**
 * Props accepted by {@link ShopToolbar}.
 */
interface ShopToolbarProps {
  /** List of active categories from the database, ordered by `display_order`. */
  categories: CategoryItem[];
  /** Currently active category name. `"All"` means no category filter applied. */
  selectedCategory: string;
  /**
   * Called when the user clicks a category chip.
   * @param category - The English `name` of the category, or `"All"`.
   */
  onSelectCategory: (category: string) => void;
  /** Current sort option value, e.g. `"price_asc"`. */
  sortBy: string;
  /**
   * Called when the user changes the sort dropdown.
   * @param value - The selected sort option value.
   */
  onSortChange: (value: string) => void;
  /** Available sort options rendered as `<option>` elements. */
  sortOptions: { value: string; label: string }[];
  /** Whether the {@link ShopFilters} panel is currently expanded. */
  showFilters: boolean;
  /** Toggles the filter panel open/closed. */
  onToggleFilters: () => void;
  /** `true` = grid view (portrait cards); `false` = list view (horizontal rows). */
  gridView: boolean;
  /**
   * Sets the layout mode.
   * @param grid - `true` for grid, `false` for list.
   */
  onSetGridView: (grid: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Category chip strip + sort/filter/view-toggle toolbar for the Shop page.
 *
 * @param props - See {@link ShopToolbarProps}.
 * @returns Two-row toolbar element.
 */
const ShopToolbar = ({
  categories,
  selectedCategory,
  onSelectCategory,
  sortBy,
  onSortChange,
  sortOptions,
  showFilters,
  onToggleFilters,
  gridView,
  onSetGridView,
}: ShopToolbarProps) => {
  /**
   * Returns a Tailwind class string for a category chip.
   * Active chips use the primary brand colour; inactive chips use the muted surface.
   *
   * @param active - Whether this chip represents the current selection.
   * @returns Tailwind class string.
   */
  const chip = (active: boolean) =>
    `px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-medium transition-all whitespace-nowrap ${
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
    }`;

  return (
    <div className="flex flex-col gap-3 mb-6 md:mb-8">

      {/* ── Row 1: Category chips ──────────────────────────────────────────
          Negative horizontal margin (-mx-4 / px-4) on small screens lets the
          strip bleed to the edge and scroll without a visible scrollbar
          (`scrollbar-hide` utility).                                          */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">

        {/* "All" chip — clears the category filter. "সব" = "All" in Bengali */}
        <button onClick={() => onSelectCategory("All")} className={chip(selectedCategory === "All")}>
          সব
        </button>

        {/* Dynamic category chips from the DB, preferring the Bengali name */}
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => onSelectCategory(cat.name)}
            // Case-insensitive comparison guards against casing inconsistencies in the DB
            className={chip(selectedCategory.toLowerCase() === cat.name.toLowerCase())}
          >
            {/* Show Bengali name when available, otherwise fall back to English */}
            {cat.name_bn || cat.name}
          </button>
        ))}
      </div>

      {/* ── Row 2: Sort / Filter / View controls ──────────────────────────── */}
      <div className="flex items-center gap-2 md:gap-3 flex-wrap">

        {/* Sort dropdown — value controlled by parent */}
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="px-3 py-1.5 md:px-4 md:py-2 bg-muted rounded-lg text-xs md:text-sm border-0 focus:ring-2 focus:ring-primary flex-shrink-0"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/*
         * Filter toggle button — highlights with primary colour when the filter
         * panel is open (`showFilters`).
         */}
        <button
          onClick={onToggleFilters}
          className={`flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm transition-colors flex-shrink-0 ${
            showFilters ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          <Filter className="w-3.5 h-3.5 md:w-4 md:h-4" />
          Filters
        </button>

        {/*
         * Grid / List view toggle — pushed to the right via `ml-auto`.
         * The active button uses the primary colour; inactive uses muted surface.
         */}
        <div className="flex border border-border rounded-lg overflow-hidden flex-shrink-0 ml-auto">
          <button
            onClick={() => onSetGridView(true)}
            aria-label="Grid view"
            className={`p-1.5 md:p-2 ${gridView ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            <Grid className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
          <button
            onClick={() => onSetGridView(false)}
            aria-label="List view"
            className={`p-1.5 md:p-2 ${!gridView ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            <List className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShopToolbar;

// Named type export so sibling modules (e.g. ShopPage, useShopMetadata) can
// share the same CategoryItem shape without duplicating the interface.
export { type CategoryItem };
