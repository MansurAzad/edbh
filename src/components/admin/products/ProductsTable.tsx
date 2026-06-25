import { AlertTriangle, Images, Layers, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LOW_STOCK_THRESHOLD, type AdminProduct } from "@/lib/admin/productHelpers";

interface Props {
  loading: boolean;
  products: AdminProduct[];
  visible: AdminProduct[];
  onZoom: (p: AdminProduct) => void;
  onGallery: (p: AdminProduct) => void;
  onVariants: (p: AdminProduct) => void;
  onEdit: (p: AdminProduct) => void;
  onDelete: (id: string) => void;
}

export default function ProductsTable({
  loading, products, visible, onZoom, onGallery, onVariants, onEdit, onDelete,
}: Props) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Image</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Category</TableHead>
            <TableHead>Price</TableHead>
            <TableHead className="hidden sm:table-cell">Stock</TableHead>
            <TableHead className="hidden lg:table-cell">Featured</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
          ) : products.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No products found</TableCell></TableRow>
          ) : (
            visible.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onZoom(product)}
                    className="block focus:outline-none focus:ring-2 focus:ring-primary rounded overflow-hidden"
                    title="ক্লিক করে জুম করুন"
                  >
                    <img
                      src={product.image_url || "/placeholder.svg"}
                      alt={product.name}
                      loading="lazy"
                      className="w-[45px] h-[60px] sm:w-[52px] sm:h-[68px] object-cover rounded border border-border bg-muted hover:opacity-80 transition cursor-zoom-in"
                    />
                  </button>
                </TableCell>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell className="hidden md:table-cell">{product.category}</TableCell>
                <TableCell>
                  {product.sale_price ? (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                      <span className="line-through text-muted-foreground text-xs sm:text-sm">৳{product.price}</span>
                      <span className="text-primary font-medium">৳{product.sale_price}</span>
                    </div>
                  ) : `৳${product.price}`}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center gap-2">
                    <span>{product.stock}</span>
                    {product.stock === 0 ? (
                      <Badge variant="destructive" className="text-xs">Out of stock</Badge>
                    ) : product.stock <= LOW_STOCK_THRESHOLD ? (
                      <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">
                        <AlertTriangle className="w-3 h-3 mr-1" /> Low
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {product.featured ? <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Yes</span> : "No"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end flex-wrap gap-0.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onGallery(product)} title="Manage Gallery">
                      <Images className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onVariants(product)} title="Manage Variants">
                      <Layers className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(product)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
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
