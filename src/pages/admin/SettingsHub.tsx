import AdminHub from "@/components/admin/AdminHub";

/**
 * Settings & Tools hub — General settings + rarely-used admin utilities
 * (staff permissions, security, backup, cloudinary, inventory sync, content
 * editor, product descriptions, bulk product tools).
 */
export default function SettingsHub() {
  return (
    <AdminHub
      title="Settings & Tools"
      description="General settings + কম-ব্যবহৃত admin utilities একই জায়গায়।"
      tabs={[
        { id: "general", label: "General", path: "/admin/settings-page" },
        { id: "staff", label: "Staff Permissions", path: "/admin/staff-permissions" },
        { id: "security", label: "Security", path: "/admin/security" },
        { id: "backup", label: "Backup & Reset", path: "/admin/backup" },
        { id: "cloudinary", label: "Cloudinary", path: "/admin/cloudinary" },
        { id: "inventory-sync", label: "Inventory Sync", path: "/admin/inventory-sync" },
        { id: "content", label: "Content Editor", path: "/admin/content" },
        { id: "descriptions", label: "Product Descriptions", path: "/admin/product-descriptions" },
        { id: "bulk-edit", label: "Bulk Edit", path: "/admin/bulk-edit" },
        { id: "bulk-add", label: "Bulk Add", path: "/admin/bulk-add" },
      ]}
    />
  );
}
