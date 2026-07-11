import AdminHub from "@/components/admin/AdminHub";

export default function MarketingHub() {
  return (
    <AdminHub
      title="Marketing & Communications"
      description="Email campaigns, notifications, referrals, social proof এবং customer conversations — একই জায়গায়।"
      tabs={[
        { id: "email", label: "Email Campaigns", path: "/admin/email-campaigns" },
        { id: "notifications", label: "Notifications", path: "/admin/notifications" },
        { id: "referrals", label: "Referrals", path: "/admin/referrals" },
        { id: "social-proof", label: "Social Proof", path: "/admin/social-proof" },
        { id: "segments", label: "Customer Segments", path: "/admin/segments" },
        { id: "chat", label: "Chat Histories", path: "/admin/chat-histories" },
        { id: "whatsapp", label: "WhatsApp Events", path: "/admin/whatsapp-events" },
      ]}
    />
  );
}
