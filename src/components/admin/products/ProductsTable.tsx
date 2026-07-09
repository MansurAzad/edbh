/**
 * @file ProductsTable.tsx
 * @description Admin Products listing table. Pure presentational — receives the
 * full sliced product page plus action callbacks from the parent. Logic-free.
 *
 * Layout: Image | Name | Category (md+) | Price | Stock (sm+) | Featured (lg+) | Actions
 * - Columns progressively hide on smaller breakpoints to keep mobile usable.
 * - Stock cell shows a destructive "Out of stock" or warning "Low" badge
 *   based on {@link LOW_STOCK_THRESHOLD} from productHelpers.
 * - Price column shows sale price with original struck through when discounted.
 *
 * Bengali UI strings: image button tooltip "ক্লিক করে জুম করুন" (click to zoom).
 * All other labels remain English to match the rest of the admin shell.
 */
import { AlertTriangle, GitCompare, Images, Layers, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DESCRIPTION_VERIFY_META,
  getDescriptionVerifyStatus,
  LOW_STOCK_THRESHOLD,
  type AdminProduct,
} from "@/lib/admin/productHelpers";

/**
 * Props for {@link ProductsTable}.
 */
interface Props {
  /** Loading flag — when true the body shows a single "Loading..." row. */
  loading: boolean;
  /** Full unfiltered product collection (used only for the empty-state check). */
  products: AdminProduct[];
  /** Already-paginated/filtered slice that is actually rendered. */
  visible: AdminProduct[];
  /** Open the image zoom viewer for a product — ছবি বড় করে দেখাও. */
  onZoom: (p: AdminProduct) => void;
  /** Open the gallery (multi-image) manager — গ্যালারি ব্যবস্থাপনা. */
  onGallery: (p: AdminProduct) => void;
  /** Open the variants (size/color) editor — ভ্যারিয়েন্ট সম্পাদনা. */
  onVariants: (p: AdminProduct) => void;
  /** Open the edit dialog for a product — পণ্য সম্পাদনা. */
  onEdit: (p: AdminProduct) => void;
  /** Delete a product by id — confirmation is handled upstream. */
  onDelete: (id: string) => void;
  /** When set, renders a "Compare" button that opens a near-duplicate details modal. */
  onCompareDuplicates?: (p: AdminProduct) => void;
}

/**
 * Renders the admin products table.
 *
 * @param props - See {@link Props}.
 * @returns A bordered, horizontally scrollable table of products with row actions.
 *
 * @remarks
 * Pure render: all data shaping, sorting, and pagination is the parent's job.
 * The three-way body state (loading → empty → rows) lives here only because
 * it is a presentation concern.
 */
export default function ProductsTable({
  loading, products, visible, onZoom, onGallery, onVariants, onEdit, onDelete, onCompareDuplicates,
}: Props) {
  const colSpan = 8; // Image, Name, Category, Price, Stock, Desc verify, Featured, Actions
  return (
    // overflow-x-auto allows the table to scroll horizontally on narrow viewports
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Image</TableHead>
            <TableHead>Name</TableHead>
            {/* Category hidden below md — low priority on mobile */}
            <TableHead className="hidden md:table-cell">Category</TableHead>
            <TableHead>Price</TableHead>
            {/* Stock hidden below sm — shown via Featured/Actions on tiny screens */}
            <TableHead className="hidden sm:table-cell">Stock</TableHead>
            {/* Description render-verify: pass / attention / fail — hidden below md */}
            <TableHead className="hidden md:table-cell">Desc.</TableHead>
            {/* Featured flag hidden below lg — rarely consulted on mobile */}
            <TableHead className="hidden lg:table-cell">Featured</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={colSpan} className="text-center py-8">Loading...</TableCell></TableRow>
          ) : products.length === 0 ? (
            <TableRow><TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">No products found</TableCell></TableRow>
          ) : visible.length === 0 ? (
            <TableRow><TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">এই ফিল্টারে কোন প্রোডাক্ট মেলেনি।</TableCell></TableRow>
          ) : (
            // Render the paginated slice; key by product id for stable reconciliation
            visible.map((product) => (
              <TableRow key={product.id}>
                {/* Image cell — clickable thumbnail that opens the zoom viewer */}
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onZoom(product)}
                    className="block focus:outline-none focus:ring-2 focus:ring-primary rounded overflow-hidden"
                    title="ক্লিক করে জুম করুন" /* Bengali tooltip — "click to zoom" */
                  >
                    <img
                      src={product.image_url || "/placeholder.svg"} /* fallback when no image */
                      alt={product.name}
                      loading="lazy" /* defer offscreen thumbnails */
                      className="w-[45px] h-[60px] sm:w-[52px] sm:h-[68px] object-cover rounded border border-border bg-muted hover:opacity-80 transition cursor-zoom-in"
                    />
                  </button>
                </TableCell>
                {/* Name cell — bold for primary scan target */}
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell className="hidden md:table-cell">{product.category}</TableCell>
                {/* Price cell — shows discounted vs regular pricing.
                    NOTE: This view shows BASE prices only; final cart price also
                    includes variant price_adjustment (see pricing memory). */}
                <TableCell>
                  {product.sale_price ? (
                    // Discounted: struck-through original + emphasised sale price
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                      <span className="line-through text-muted-foreground text-xs sm:text-sm">৳{product.price}</span>
                      <span className="text-primary font-medium">৳{product.sale_price}</span>
                    </div>
                  ) : `৳${product.price}` /* Plain price when no sale */}
                </TableCell>
                {/* Stock cell — numeric stock plus contextual badge */}
                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center gap-2">
                    <span>{product.stock}</span>
                    {product.stock === 0 ? (
                      // Hard out-of-stock — destructive variant draws the eye
                      <Badge variant="destructive" className="text-xs">Out of stock</Badge>
                    ) : product.stock <= LOW_STOCK_THRESHOLD ? (
                      // Low-stock warning band — orange outline + alert icon
                      <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">
                        <AlertTriangle className="w-3 h-3 mr-1" /> Low
                      </Badge>
                    ) : null /* Healthy stock — no badge */}
                  </div>
                </TableCell>
                {/* Featured cell — pill when true, plain "No" otherwise */}
                <TableCell className="hidden lg:table-cell">
                  {product.featured ? <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Yes</span> : "No"}
                </TableCell>
                {/* Actions cell — icon buttons for Gallery / Variants / Edit / Delete */}
                <TableCell className="text-right">
                  <div className="flex justify-end flex-wrap gap-0.5">
                    {/* Gallery — manage additional product images */}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onGallery(product)} title="Manage Gallery">
                      <Images className="w-4 h-4" />
                    </Button>
                    {/* Variants — manage size/colour and per-variant pricing/stock */}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onVariants(product)} title="Manage Variants">
                      <Layers className="w-4 h-4" />
                    </Button>
                    {/* Edit — open the product form dialog */}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(product)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {/* Delete — parent shows the confirm dialog before hard-deleting */}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(product.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
