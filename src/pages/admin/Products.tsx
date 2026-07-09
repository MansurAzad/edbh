import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
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
import DuplicateCompareDialog from "@/components/admin/products/DuplicateCompareDialog";
import { useAdminProducts } from "@/hooks/admin/useAdminProducts";
import {
  DESCRIPTION_VERIFY_META, computeMaxNameSimilarity, emptyProduct,
  getDescriptionVerifyStatus, PRODUCTS_PER_PAGE, sortAdminProducts,
  type AdminProduct, type AdminProductInput, type DescriptionVerifyStatus, type ProductSortMode,
} from "@/lib/admin/productHelpers";
import { buildProductAuditCsv } from "@/lib/admin/productAuditCsv";

const Products = () => {
  const { products, loading, invalidateProducts, saveMutation, deleteMutation } = useAdminProducts();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [sortMode, setSortMode] = useState<"newest" | "stock_asc" | "stock_desc" | "margin_asc" | "margin_desc">("newest");
  const [bulkInventoryOpen, setBulkInventoryOpen] = useState(false);
  const [auditFilter, setAuditFilter] = useState<string>(""); // slow|dead|oos|low_stock|duplicates
  const [verifyFilter, setVerifyFilter] = useState<"" | DescriptionVerifyStatus>("");
  const [compareFocus, setCompareFocus] = useState<AdminProduct | null>(null);

  // Deep-link support from Business Audit: /admin/products?filter=oos&sort=margin_desc
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const f = searchParams.get("filter") || "";
    const s = searchParams.get("sort");
    const v = searchParams.get("verify");
    if (f) setAuditFilter(f);
    if (f === "low_stock" || f === "oos") setLowStockOnly(f === "low_stock");
    if (s === "margin_asc" || s === "margin_desc" || s === "stock_asc" || s === "stock_desc") {
      setSortMode(s);
    }
    if (v === "pass" || v === "attention" || v === "fail") setVerifyFilter(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const clearAuditFilter = () => {
    setAuditFilter("");
    setVerifyFilter("");
    const next = new URLSearchParams(searchParams);
    next.delete("filter");
    next.delete("sort");
    next.delete("verify");
    setSearchParams(next, { replace: true });
  };
  const toggleVerify = (v: DescriptionVerifyStatus) => {
    const nextVal = verifyFilter === v ? "" : v;
    setVerifyFilter(nextVal);
    const next = new URLSearchParams(searchParams);
    if (nextVal) next.set("verify", nextVal); else next.delete("verify");
    setSearchParams(next, { replace: true });
    setCurrentPage(1);
  };

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

  const marginOf = (p: AdminProduct) => {
    const cost = Number((p as any).purchase_cost ?? 0);
    const sell = Number(p.sale_price || p.price || 0);
    if (!cost || !sell) return -Infinity;
    return ((sell - cost) / sell) * 100;
  };

  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    if (categoryFilter) filtered = filtered.filter((p) => p.category === categoryFilter);
    if (minPrice) filtered = filtered.filter((p) => (p.sale_price || p.price) >= Number(minPrice));
    if (maxPrice) filtered = filtered.filter((p) => (p.sale_price || p.price) <= Number(maxPrice));
    if (lowStockOnly) filtered = filtered.filter((p) => (p.stock ?? 0) <= lowStockThreshold);

    // Business Audit deep-link filters
    if (auditFilter === "oos") filtered = filtered.filter((p) => (p.stock ?? 0) <= 0);
    if (auditFilter === "low_stock") filtered = filtered.filter((p) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5);
    if (auditFilter === "duplicates") {
      const counts = new Map<string, number>();
      products.forEach((p) => {
        const k = p.name.trim().toLowerCase().replace(/\s+/g, " ");
        counts.set(k, (counts.get(k) || 0) + 1);
      });
      filtered = filtered.filter((p) => (counts.get(p.name.trim().toLowerCase().replace(/\s+/g, " ")) || 0) > 1);
    }
    // Description render-verify filter (independent of audit filter)
    if (verifyFilter) {
      filtered = filtered.filter((p) => getDescriptionVerifyStatus(p.description) === verifyFilter);
    }
    // slow/dead can't be computed from products alone; leave list intact and rely on the
    // banner to point the admin to Business Audit for the authoritative list.

    if (sortMode !== "newest") {
      filtered = [...filtered].sort((a, b) => {
        if (sortMode === "stock_asc" || sortMode === "stock_desc") {
          const sa = a.stock ?? 0;
          const sb = b.stock ?? 0;
          return sortMode === "stock_asc" ? sa - sb : sb - sa;
        }
        const ma = marginOf(a);
        const mb = marginOf(b);
        return sortMode === "margin_asc" ? ma - mb : mb - ma;
      });
    }
    return filtered;
  }, [products, searchQuery, categoryFilter, minPrice, maxPrice, lowStockOnly, lowStockThreshold, sortMode, auditFilter, verifyFilter]);

  /** Count-by-verify-status for banner chip labels. */
  const verifyCounts = useMemo(() => {
    const acc: Record<DescriptionVerifyStatus, number> = { pass: 0, attention: 0, fail: 0 };
    products.forEach((p) => { acc[getDescriptionVerifyStatus(p.description)] += 1; });
    return acc;
  }, [products]);

  const lowStockCount = useMemo(
    () => products.filter((p) => (p.stock ?? 0) <= lowStockThreshold).length,
    [products, lowStockThreshold],
  );

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

  /**
   * Download the currently filtered + sorted product list as CSV.
   * When an audit filter (oos / low_stock / duplicates) is active, the CSV is
   * an audit-scoped report with only the columns relevant to that report —
   * otherwise it uses the full import/export serializer.
   */
  const handleExportFiltered = useCallback(() => {
    const stamp = new Date().toISOString().slice(0, 10);
    let csv: string;
    let filename: string;

    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const priceOf = (p: AdminProduct) => Number(p.sale_price || p.price || 0);

    if (auditFilter === "oos" || auditFilter === "low_stock") {
      const header = ["id", "name", "sku", "category", "subcategory", "stock", "price", "sale_price", "verify_status"];
      const rows = filteredProducts.map((p) => [
        p.id, p.name, p.sku ?? "", p.category, p.subcategory ?? "",
        p.stock ?? 0, p.price, p.sale_price ?? "",
        getDescriptionVerifyStatus(p.description),
      ].map(esc).join(","));
      csv = [header.join(","), ...rows].join("\n");
      filename = `products-audit-${auditFilter}-${stamp}.csv`;
    } else if (auditFilter === "duplicates") {
      // Group duplicate rows so the report clearly shows which items share a name.
      const groups = new Map<string, AdminProduct[]>();
      filteredProducts.forEach((p) => {
        const k = p.name.trim().toLowerCase().replace(/\s+/g, " ");
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(p);
      });
      const header = ["duplicate_group", "id", "name", "sku", "category", "subcategory", "price", "stock", "verify_status"];
      const rows: string[] = [];
      let gi = 0;
      for (const [, group] of groups) {
        gi += 1;
        group.forEach((p) => {
          rows.push([
            `G${gi}`, p.id, p.name, p.sku ?? "", p.category, p.subcategory ?? "",
            priceOf(p), p.stock ?? 0,
            getDescriptionVerifyStatus(p.description),
          ].map(esc).join(","));
        });
      }
      csv = [header.join(","), ...rows].join("\n");
      filename = `products-audit-duplicates-${stamp}.csv`;
    } else {
      csv = productsToCsv(filteredProducts as unknown as Record<string, any>[]);
      filename = verifyFilter
        ? `products-verify-${verifyFilter}-${stamp}.csv`
        : `products-filtered-${stamp}.csv`;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredProducts, auditFilter, verifyFilter]);

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

        {/* Report banner: audit filter + description verify chips + audit CSV export */}
        {(auditFilter || verifyFilter || true) && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Report</span>
                {auditFilter ? (
                  <span>
                    Business Audit filter: <b>{auditFilter.replace("_", " ")}</b>
                    {(auditFilter === "slow" || auditFilter === "dead") && (
                      <span className="text-muted-foreground"> — showing full catalog; see Business Audit for the authoritative list.</span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No audit filter active</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(auditFilter === "oos" || auditFilter === "low_stock" || auditFilter === "duplicates") && (
                  <Button size="sm" variant="outline" onClick={handleExportFiltered}>
                    Download {auditFilter.replace("_", " ")} CSV ({filteredProducts.length})
                  </Button>
                )}
                {(auditFilter || verifyFilter) && (
                  <Button size="sm" variant="ghost" onClick={clearAuditFilter}>Clear</Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Description verify:</span>
              {(["pass", "attention", "fail"] as DescriptionVerifyStatus[]).map((s) => {
                const meta = DESCRIPTION_VERIFY_META[s];
                const active = verifyFilter === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleVerify(s)}
                    className={`text-xs px-2 py-1 rounded border transition ${meta.badge} ${active ? "ring-2 ring-offset-1 ring-primary" : "opacity-80 hover:opacity-100"}`}
                    aria-pressed={active}
                  >
                    {meta.label} · {verifyCounts[s]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
          lowStockOnly={lowStockOnly}
          setLowStockOnly={onFilterChange(setLowStockOnly)}
          lowStockThreshold={lowStockThreshold}
          setLowStockThreshold={onFilterChange(setLowStockThreshold)}
          sortMode={sortMode}
          setSortMode={onFilterChange(setSortMode)}
          lowStockCount={lowStockCount}
          onOpenBulkInventory={() => setBulkInventoryOpen(true)}
          onExportFiltered={handleExportFiltered}
          filteredCount={filteredProducts.length}
        />

        <BulkInventoryDialog
          open={bulkInventoryOpen}
          onOpenChange={setBulkInventoryOpen}
          products={filteredProducts}
          onSaved={invalidateProducts}
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
          onCompareDuplicates={auditFilter === "duplicates" ? setCompareFocus : undefined}
        />

        <DuplicateCompareDialog
          focus={compareFocus}
          allProducts={products}
          onOpenChange={(open) => { if (!open) setCompareFocus(null); }}
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
