/**
 * @file ShopFilters.tsx
 * @module components/shop/ShopFilters
 *
 * @description
 * Animated expandable filter panel rendered below the {@link ShopToolbar}.
 * Contains two filter controls:
 *   1. **Price range** — dual-thumb Radix UI `<Slider>` from `components/ui/slider`.
 *   2. **Material / Fabric** — native `<select>` populated from the product catalogue.
 *      Label: "ম্যাটেরিয়াল / ফ্যাব্রিক" — Material / Fabric in Bengali
 *
 * A **Clear Filters** button appears only when at least one filter is non-default
 * (`hasActiveFilters`). The panel itself is toggled by the parent via
 * `<AnimatePresence>` — enter/exit animations are defined here.
 *
 * This component is **purely presentational**: it holds no internal filter state
 * and fires no queries. The parent (ShopPage) owns the filter state and passes
 * the current values and setter callbacks down.
 */

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Slider } from "@/components/ui/slider";

// ---------------------------------------------------------------------------
// Prop types
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link ShopFilters}.
 */
interface ShopFiltersProps {
  /**
   * Current price range as a two-element tuple `[min, max]`.
   * Both values are in BDT (Bangladeshi Taka, ৳).
   */
  priceRange: number[];
  /**
   * Called by the Slider when the user drags either thumb.
   * @param range - New `[min, max]` tuple.
   */
  onPriceRangeChange: (range: number[]) => void;
  /**
   * Upper bound of the slider, derived from the most expensive product.
   * Queried via {@link useShopMetadata}.
   */
  maxPrice: number;
  /**
   * De-duplicated list of material strings found in the product catalogue.
   * E.g. `["Cotton", "Polyester", "Chiffon"]`.
   */
  materials: string[];
  /**
   * Currently selected material.
   * `"All"` means no material filter is applied.
   */
  selectedMaterial: string;
  /**
   * Called when the user picks a new material from the dropdown.
   * @param m - The selected material string or `"All"`.
   */
  onMaterialChange: (m: string) => void;
  /**
   * `true` when any filter deviates from its default (price covers full range,
   * material is "All"). Controls visibility of the Clear button.
   */
  hasActiveFilters: boolean;
  /**
   * Resets all filters to their default values.
   * Called when the user clicks "Clear Filters".
   */
  onClear: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Expandable filter panel for the Shop page.
 *
 * @remarks
 * The panel is meant to be wrapped in Framer Motion's `<AnimatePresence>` by
 * the parent so that it animates in and out correctly when toggled. The motion
 * variants defined on the root `<motion.div>` handle `height: 0 → auto` for a
 * smooth accordion-style open/close.
 *
 * @param props - See {@link ShopFiltersProps}.
 * @returns The animated filter panel element.
 */
const ShopFilters = ({
  priceRange,
  onPriceRangeChange,
  maxPrice,
  materials,
  selectedMaterial,
  onMaterialChange,
  hasActiveFilters,
  onClear,
}: ShopFiltersProps) => (
  /*
   * Framer Motion accordion animation.
   * `height: 0 → "auto"` collapses / expands without a fixed pixel value.
   * `opacity` animates in tandem for a softer transition.
   */
  <motion.div
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: "auto" }}
    exit={{ opacity: 0, height: 0 }}
    className="mb-8 p-6 bg-card rounded-xl border border-border"
  >
    {/* flex-wrap allows the two controls to stack on narrow viewports */}
    <div className="flex flex-wrap items-end gap-8">

      {/* ── Price Range Slider ──────────────────────────────────────────── */}
      {/* flex-1 with a min-width ensures the slider never collapses too small */}
      <div className="flex-1 min-w-[250px]">
        {/*
         * Dynamic label shows the live range in Taka (৳) as the user drags.
         * `toLocaleString()` adds thousands separators for readability.
         */}
        <label className="block text-sm font-medium text-foreground mb-3">
          Price Range: ৳{priceRange[0].toLocaleString()} - ৳{priceRange[1].toLocaleString()}
        </label>
        {/*
         * Radix-based dual-thumb Slider.
         * `step={100}` snaps to 100 ৳ increments to avoid noisy filter churn.
         * `max` is dynamic — set to the highest product price via useShopMetadata.
         */}
        <Slider
          value={priceRange}
          onValueChange={onPriceRangeChange}
          min={0}
          max={maxPrice}
          step={100}
          className="w-full"
        />
      </div>

      {/* ── Material / Fabric Dropdown ──────────────────────────────────── */}
      <div className="min-w-[180px]">
        {/*
         * Label in Bengali — displayed to the user.
         * "ম্যাটেরিয়াল / ফ্যাব্রিক" = "Material / Fabric" in Bengali
         */}
        <label className="block text-sm font-medium text-foreground mb-3">ম্যাটেরিয়াল / ফ্যাব্রিক</label>
        <select
          value={selectedMaterial}
          onChange={(e) => onMaterialChange(e.target.value)}
          className="w-full px-3 py-2 bg-muted rounded-lg text-sm border-0 focus:ring-2 focus:ring-primary"
        >
          {/*
           * "সব ম্যাটেরিয়াল" = "All Materials" in Bengali — the reset/default option.
           * When selected, the material filter is treated as inactive.
           */}
          <option value="All">সব ম্যাটেরিয়াল</option>
          {/* Dynamic options populated from the de-duplicated materials list */}
          {materials.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/*
       * Clear Filters button — conditionally rendered.
       * Only visible when `hasActiveFilters` is true, i.e. the user has changed
       * at least one filter from its default value. Prevents a redundant button
       * being shown when everything is already at the default state.
       */}
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
          Clear Filters
        </button>
      )}
    </div>
  </motion.div>
);

export default ShopFilters;
