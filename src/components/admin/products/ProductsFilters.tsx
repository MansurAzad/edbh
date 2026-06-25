import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductImportExport from "@/components/admin/ProductImportExport";

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
}

export default function ProductsFilters({
  searchQuery, setSearchQuery, categoryFilter, setCategoryFilter,
  minPrice, setMinPrice, maxPrice, setMaxPrice, categories, onImportComplete,
}: Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
      </div>
      <Select value={categoryFilter || "all"} onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Input type="number" placeholder="Min ৳" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="w-24" />
        <span className="text-muted-foreground">-</span>
        <Input type="number" placeholder="Max ৳" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-24" />
      </div>
      <ProductImportExport onImportComplete={onImportComplete} />
    </div>
  );
}
