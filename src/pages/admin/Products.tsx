import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MultiImageUpload from "@/components/admin/MultiImageUpload";
import VariantManager from "@/components/admin/VariantManager";
import ProductsFilters from "@/components/admin/products/ProductsFilters";
import ProductsTable from "@/components/admin/products/ProductsTable";
import ProductsPagination from "@/components/admin/products/ProductsPagination";
import ProductFormDialog from "@/components/admin/products/ProductFormDialog";
import BulkInventoryDialog from "@/components/admin/products/BulkInventoryDialog";
import { useAdminProducts } from "@/hooks/admin/useAdminProducts";
import {
  emptyProduct, PRODUCTS_PER_PAGE,
  type AdminProduct, type AdminProductInput,
} from "@/lib/admin/productHelpers";

const Products = () => {
  const { products, loading, invalidateProducts, saveMutation, deleteMutation } = useAdminProducts();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [sortMode, setSortMode] = useState<"newest" | "stock_asc" | "stock_desc">("newest");
  const [bulkInventoryOpen, setBulkInventoryOpen] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [formData, setFormData] = useState<AdminProductInput>(emptyProduct);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [variantProduct, setVariantProduct] = useState<AdminProduct | null>(null);
  const [galleryProduct, setGalleryProduct] = useState<AdminProduct | null>(null);
  const [galleryImages, setGalleryImages] = useState<any[]>([]);
  const [zoomImage, setZoomImage] = useState<{ url: string; name: string } | null>(null);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [products]);

  // Distinct subcategories from existing products, filtered by the category
  // currently selected in the form. Falls back to all subcategories when no
  // category is picked so admins can still discover the full list.
  const subcategorySuggestions = useMemo(() => {
    const chosen = formData.category?.trim().toLowerCase();
    const pool = chosen
      ? products.filter((p) => (p.category || "").trim().toLowerCase() === chosen)
      : products;
    const set = new Set(
      pool.map((p) => (p.subcategory || "").trim()).filter((s): s is string => Boolean(s)),
    );
    return Array.from(set).sort();
  }, [products, formData.category]);

  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    if (categoryFilter) filtered = filtered.filter((p) => p.category === categoryFilter);
    if (minPrice) filtered = filtered.filter((p) => (p.sale_price || p.price) >= Number(minPrice));
    if (maxPrice) filtered = filtered.filter((p) => (p.sale_price || p.price) <= Number(maxPrice));
    return filtered;
  }, [products, searchQuery, categoryFilter, minPrice, maxPrice]);

  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(start, start + PRODUCTS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const onFilterChange = useCallback(<T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setCurrentPage(1);
  }, []);

  const openCreateDialog = () => {
    setEditingProduct(null);
    setFormData(emptyProduct);
    setGalleryUrls([]);
    setIsDialogOpen(true);
  };

  const openEditDialog = (product: AdminProduct) => {
    setEditingProduct(product);
    setGalleryUrls([]);
    setFormData({
      name: product.name,
      category: product.category,
      price: product.price,
      sale_price: product.sale_price,
      stock: product.stock || 0,
      featured: product.featured || false,
      image_url: product.image_url || "",
      description: product.description || "",
      sizes: product.sizes || [],
      colors: product.colors || [],
      material: product.material || "",
      video_url: product.video_url || "",
      sku: product.sku ?? "",
      subcategory: product.subcategory ?? "",
      fabric: product.fabric ?? product.material ?? "",
      work_type: product.work_type ?? "",
      part: product.part ?? "",
      hijab_included: product.hijab_included ?? false,
      inner_included: product.inner_included ?? false,
      purchase_cost: product.purchase_cost ?? null,
      image_alt_text: product.image_alt_text ?? "",
      meta_title: product.meta_title ?? "",
      meta_description: product.meta_description ?? "",
    });

    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(
      { id: editingProduct?.id ?? null, data: formData, galleryUrls },
      { onSuccess: () => setIsDialogOpen(false) },
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
  };

  const openGallery = async (product: AdminProduct) => {
    setGalleryProduct(product);
    const { data } = await supabase
      .from("product_images")
      .select("*")
      .eq("product_id", product.id)
      .order("display_order");
    setGalleryImages(data || []);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Products</h1>
            <p className="text-muted-foreground">Manage your product catalog</p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" /> Add Product
          </Button>
        </div>

        <ProductsFilters
          searchQuery={searchQuery}
          setSearchQuery={onFilterChange(setSearchQuery)}
          categoryFilter={categoryFilter}
          setCategoryFilter={onFilterChange(setCategoryFilter)}
          minPrice={minPrice}
          setMinPrice={onFilterChange(setMinPrice)}
          maxPrice={maxPrice}
          setMaxPrice={onFilterChange(setMaxPrice)}
          categories={categories}
          onImportComplete={invalidateProducts}
        />

        <ProductsTable
          loading={loading}
          products={filteredProducts}
          visible={paginatedProducts}
          onZoom={(p) => setZoomImage({ url: p.image_url || "/placeholder.svg", name: p.name })}
          onGallery={openGallery}
          onVariants={setVariantProduct}
          onEdit={openEditDialog}
          onDelete={setDeleteId}
        />

        <ProductsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          total={filteredProducts.length}
          perPage={PRODUCTS_PER_PAGE}
          onChange={setCurrentPage}
        />
      </div>

      <ProductFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editing={editingProduct}
        formData={formData}
        setFormData={setFormData}
        galleryUrls={galleryUrls}
        setGalleryUrls={setGalleryUrls}
        onSubmit={handleSubmit}
        submitting={saveMutation.isPending}
        categorySuggestions={categories}
        subcategorySuggestions={subcategorySuggestions}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the product.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!variantProduct} onOpenChange={() => setVariantProduct(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Manage Variants</DialogTitle></DialogHeader>
          {variantProduct && (
            <VariantManager
              productId={variantProduct.id}
              productName={variantProduct.name}
              availableSizes={variantProduct.sizes || ['50"', '52"', '54"', '56"', '58"', '60"']}
              availableColors={variantProduct.colors || ["Black", "White", "Navy", "Red"]}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!galleryProduct} onOpenChange={() => setGalleryProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Product Gallery — {galleryProduct?.name}</DialogTitle></DialogHeader>
          {galleryProduct && (
            <MultiImageUpload
              productId={galleryProduct.id}
              images={galleryImages}
              onImagesChange={setGalleryImages}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!zoomImage} onOpenChange={() => setZoomImage(null)}>
        <DialogContent className="max-w-md p-4">
          <DialogHeader>
            <DialogTitle className="text-base truncate">{zoomImage?.name}</DialogTitle>
          </DialogHeader>
          {zoomImage && (
            <div className="flex justify-center">
              <img
                src={zoomImage.url}
                alt={zoomImage.name}
                className="max-h-[75vh] w-auto object-contain rounded-lg border border-border"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default Products;
