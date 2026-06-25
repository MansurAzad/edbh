import { Filter, Grid, List } from "lucide-react";
import SizeGuide from "@/components/shop/SizeGuide";

interface CategoryItem {
  name: string;
  name_bn: string | null;
  slug: string | null;
}

interface ShopToolbarProps {
  categories: CategoryItem[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  sortOptions: { value: string; label: string }[];
  showFilters: boolean;
  onToggleFilters: () => void;
  gridView: boolean;
  onSetGridView: (grid: boolean) => void;
}

/** Category chips + sort/filter/view toolbar. Controlled component. */
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
  const chip = (active: boolean) =>
    `px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-medium transition-all whitespace-nowrap ${
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
    }`;

  return (
    <div className="flex flex-col gap-3 mb-6 md:mb-8">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
        <button onClick={() => onSelectCategory("All")} className={chip(selectedCategory === "All")}>
          সব
        </button>
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => onSelectCategory(cat.name)}
            className={chip(selectedCategory.toLowerCase() === cat.name.toLowerCase())}
          >
            {cat.name_bn || cat.name}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="px-3 py-1.5 md:px-4 md:py-2 bg-muted rounded-lg text-xs md:text-sm border-0 focus:ring-2 focus:ring-primary flex-shrink-0"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          onClick={onToggleFilters}
          className={`flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm transition-colors flex-shrink-0 ${
            showFilters ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          <Filter className="w-3.5 h-3.5 md:w-4 md:h-4" />
          Filters
        </button>
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
export { type CategoryItem };
