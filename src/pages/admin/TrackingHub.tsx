import AdminHub from "@/components/admin/AdminHub";

export default function TrackingHub() {
  return (
    <AdminHub
      title="Tracking & Analytics"
      description="Meta Pixel, Google Analytics, conversion funnel এবং সংশ্লিষ্ট setup guides — একই জায়গায়।"
      tabs={[
        { id: "meta-pixel", label: "Meta Pixel", path: "/admin/meta-pixel" },
        { id: "ga", label: "Google Analytics", path: "/admin/google-analytics" },
        { id: "audit", label: "Tracking Audit", path: "/admin/tracking-audit" },
        { id: "funnel", label: "Conversion Funnel", path: "/admin/tracking-funnel" },
        { id: "guide", label: "Tracking Guide", path: "/admin/tracking-guide" },
        { id: "sgtm", label: "sGTM Setup", path: "/admin/sgtm-setup" },
      ]}
    />
  );
}
