import AdminHub from "@/components/admin/AdminHub";

export default function ShippingHub() {
  return (
    <AdminHub
      title="Shipping & Courier"
      description="Shipping settings, delivery zones, courier integrations এবং audit logs — একই জায়গায়।"
      tabs={[
        { id: "shipping", label: "Shipping Settings", path: "/admin/shipping" },
        { id: "zones", label: "Delivery Zones", path: "/admin/delivery-zones" },
        { id: "courier", label: "Courier Integration", path: "/admin/courier-integration" },
        { id: "steadfast", label: "Steadfast", path: "/admin/steadfast" },
        { id: "audit", label: "Courier Audit Logs", path: "/admin/courier-audit" },
      ]}
    />
  );
}
