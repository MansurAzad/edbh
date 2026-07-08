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

import { Search, AlertTriangle, ArrowDownWideNarrow } from "lucide-react";
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
  /** Current search query string. বাংলা: বর্তমান সার্চ টেক্সট। */
  searchQuery: string;
  /** Setter for search query. বাংলা: সার্চ সেটার। */
  setSearchQuery: (v: string) => void;
  /** Active category filter ("" = all). বাংলা: ক্যাটাগরি ফিল্টার। */
  categoryFilter: string;
  /** Setter for category filter. বাংলা: ক্যাটাগরি সেটার। */
  setCategoryFilter: (v: string) => void;
  /** Min price filter as string. বাংলা: সর্বনিম্ন মূল্য (স্ট্রিং)। */
  minPrice: string;
  /** Setter for min price. বাংলা: মিন প্রাইস সেটার। */
  setMinPrice: (v: string) => void;
  /** Max price filter as string. বাংলা: সর্বোচ্চ মূল্য (স্ট্রিং)। */
  maxPrice: string;
  /** Setter for max price. বাংলা: ম্যাক্স প্রাইস সেটার। */
  setMaxPrice: (v: string) => void;
  /** Unique category list for the dropdown. বাংলা: ড্রপডাউনের ক্যাটাগরি তালিকা। */
  categories: string[];
  /** Called after a successful CSV import to trigger list refresh. বাংলা: ইমপোর্ট শেষে রিফ্রেশ কলব্যাক। */
  onImportComplete: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ProductsFilters` — filter + import/export toolbar for the Products admin table.
 *
 * All controls are fully controlled via props; no internal state.
 * The wrapping `flex flex-wrap` layout gracefully stacks controls on small
 * screens without requiring explicit breakpoint media queries.
 *
 * ### Category select sentinel
 * The shadcn `<Select>` cannot hold an empty string as its value, so the
 * component uses `"all"` as a sentinel.  When `"all"` is selected,
 * `setCategoryFilter("")` is called so the parent sees the canonical empty value.
 *
 * @param {Props} props – See {@link Props}.
 * @returns {JSX.Element} A flex row of filter controls.
 *
 * বাংলা নোট:
 *  ক্যাটাগরি ড্রপডাউনে "All Categories" মানে কোনো ফিল্টার নেই।
 *  মূল্য ফিল্টারে শুধু সংখ্যা দিন (টাকায়)।
 */
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
}: Props) {
  return (
    /**
     * Flex row that wraps to the next line when viewport is narrow.
     * gap-3 gives consistent spacing between all controls.
     * বাংলা: ছোট স্ক্রিনে কন্ট্রোলগুলো নিচের লাইনে চলে যাবে।
     */
    <div className="flex items-center gap-3 flex-wrap">

      {/* ── Search input ──────────────────────────────────────────────── */}
      {/*
       * flex-1 + min/max width: grows to fill available space but stays
       * readable between 200 px and 384 px.
       * The Search icon is absolutely positioned inside the input padding.
       * বাংলা: সার্চ ইনপুট — পণ্যের নামে সার্চ করুন।
       */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10" /* left padding makes room for the Search icon */
        />
      </div>

      {/* ── Category select ───────────────────────────────────────────── */}
      {/*
       * Uses "all" as the internal sentinel for "no filter applied".
       * When the user picks "all", setCategoryFilter("") is called so the
       * parent sees an empty string (canonical no-filter value).
       * বাংলা: "All Categories" বেছে নিলে ক্যাটাগরি ফিল্টার বাতিল হয়।
       */}
      <Select
        value={categoryFilter || "all"}
        onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent>
          {/* Sentinel option — clears the category filter. বাংলা: সব ক্যাটাগরি দেখান। */}
          <SelectItem value="all">All Categories</SelectItem>
          {/*
           * One option per unique category string from the full product list.
           * `key` uses the category string itself since categories are unique.
           * বাংলা: প্রতিটি অনন্য ক্যাটাগরির জন্য একটি অপশন।
           */}
          {categories.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* ── Price range inputs ────────────────────────────────────────── */}
      {/*
       * Two numeric inputs separated by a dash. Both stored as strings to
       * avoid parsing issues while the user types.  The parent converts them
       * to numbers when applying the filter.
       * বাংলা: সর্বনিম্ন ও সর্বোচ্চ মূল্য ফিল্টার — টাকায় সংখ্যা দিন।
       */}
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Min ৳"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          className="w-24"
        />
        {/* Visual separator between min and max price inputs. */}
        <span className="text-muted-foreground">-</span>
        <Input
          type="number"
          placeholder="Max ৳"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          className="w-24"
        />
      </div>

      {/* ── Import / Export widget ────────────────────────────────────── */}
      {/*
       * Renders a CSV download button and a CSV upload input.
       * After a successful import it calls `onImportComplete` so the parent
       * re-fetches the product list from Supabase.
       * বাংলা: CSV ডাউনলোড ও আপলোড বাটন। ইমপোর্ট সফল হলে তালিকা রিফ্রেশ হয়।
       */}
      <ProductImportExport onImportComplete={onImportComplete} />

    </div>
  );
}
