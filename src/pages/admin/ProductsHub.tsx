import AdminHub from "@/components/admin/AdminHub";

/**
 * Products hub — surfaces the main catalog plus the bulk/description tools
 * that used to live under Settings, so admins manage products from one place.
 * Existing routes remain valid for deep links and backward compatibility.
 */
export default function ProductsHub() {
  return (
    <AdminHub
      title="Products"
      description="Catalog, bulk add, bulk edit এবং AI descriptions — সব এক জায়গায়।"
      tabs={[
        { id: "catalog", label: "Catalog", path: "/admin/products-catalog" },
        { id: "bulk-add", label: "Bulk Add", path: "/admin/bulk-add" },
        { id: "bulk-edit", label: "Bulk Edit", path: "/admin/bulk-edit" },
        { id: "descriptions", label: "Descriptions", path: "/admin/product-descriptions" },
      ]}
    />
  );
}
