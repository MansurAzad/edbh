import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface ShopFiltersProps {
  priceRange: number[];
  onPriceRangeChange: (range: number[]) => void;
  maxPrice: number;
  materials: string[];
  selectedMaterial: string;
  onMaterialChange: (m: string) => void;
  hasActiveFilters: boolean;
  onClear: () => void;
}

/** Expandable filter panel: price range + material + clear. */
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
  <motion.div
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: "auto" }}
    exit={{ opacity: 0, height: 0 }}
    className="mb-8 p-6 bg-card rounded-xl border border-border"
  >
    <div className="flex flex-wrap items-end gap-8">
      <div className="flex-1 min-w-[250px]">
        <label className="block text-sm font-medium text-foreground mb-3">
          Price Range: ৳{priceRange[0].toLocaleString()} - ৳{priceRange[1].toLocaleString()}
        </label>
        <Slider
          value={priceRange}
          onValueChange={onPriceRangeChange}
          min={0}
          max={maxPrice}
          step={100}
          className="w-full"
        />
      </div>
      <div className="min-w-[180px]">
        <label className="block text-sm font-medium text-foreground mb-3">ম্যাটেরিয়াল / ফ্যাব্রিক</label>
        <select
          value={selectedMaterial}
          onChange={(e) => onMaterialChange(e.target.value)}
          className="w-full px-3 py-2 bg-muted rounded-lg text-sm border-0 focus:ring-2 focus:ring-primary"
        >
          <option value="All">সব ম্যাটেরিয়াল</option>
          {materials.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
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
