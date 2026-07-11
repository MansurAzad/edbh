/**
 * Hub group definitions — replaces the old iframe embed approach with
 * plain in-app navigation. Each group has:
 *  - a landing route (hubPath) that redirects to `defaultPath`
 *  - a list of tabs; landing on any member path renders the tab bar
 *
 * Sidebar highlights the hub when the user is on any member path.
 */
export interface HubTabDef {
  label: string;
  path: string;
}

export interface HubGroup {
  id: string;
  hubPath: string;
  title: string;
  defaultPath: string;
  tabs: HubTabDef[];
}

export const HUB_GROUPS: HubGroup[] = [
  {
    id: "products",
    hubPath: "/admin/products",
    title: "Products",
    defaultPath: "/admin/products-catalog",
    tabs: [
      { label: "Catalog", path: "/admin/products-catalog" },
      { label: "Bulk Add", path: "/admin/bulk-add" },
      { label: "Bulk Edit", path: "/admin/bulk-edit" },
      { label: "Descriptions", path: "/admin/product-descriptions" },
    ],
  },
  {
    id: "shipping",
    hubPath: "/admin/shipping-hub",
    title: "Shipping & Courier",
    defaultPath: "/admin/shipping",
    tabs: [
      { label: "Shipping Settings", path: "/admin/shipping" },
      { label: "Delivery Zones", path: "/admin/delivery-zones" },
      { label: "Courier Integration", path: "/admin/courier-integration" },
      { label: "Steadfast", path: "/admin/steadfast" },
      { label: "Courier Audit Logs", path: "/admin/courier-audit" },
    ],
  },
  {
    id: "marketing",
    hubPath: "/admin/marketing-hub",
    title: "Marketing & Communications",
    defaultPath: "/admin/email-campaigns",
    tabs: [
      { label: "Email Campaigns", path: "/admin/email-campaigns" },
      { label: "Notifications", path: "/admin/notifications" },
      { label: "Referrals", path: "/admin/referrals" },
      { label: "Social Proof", path: "/admin/social-proof" },
      { label: "Customer Segments", path: "/admin/segments" },
      { label: "Chat Histories", path: "/admin/chat-histories" },
      { label: "WhatsApp Events", path: "/admin/whatsapp-events" },
    ],
  },
  {
    id: "tracking",
    hubPath: "/admin/tracking-hub",
    title: "Tracking & Analytics",
    defaultPath: "/admin/meta-pixel",
    tabs: [
      { label: "Meta Pixel", path: "/admin/meta-pixel" },
      { label: "Google Analytics", path: "/admin/google-analytics" },
      { label: "Tracking Audit", path: "/admin/tracking-audit" },
      { label: "Conversion Funnel", path: "/admin/tracking-funnel" },
      { label: "Tracking Guide", path: "/admin/tracking-guide" },
      { label: "sGTM Setup", path: "/admin/sgtm-setup" },
    ],
  },
  {
    id: "settings",
    hubPath: "/admin/settings",
    title: "Settings & Tools",
    defaultPath: "/admin/settings-page",
    tabs: [
      { label: "General", path: "/admin/settings-page" },
      { label: "Staff Permissions", path: "/admin/staff-permissions" },
      { label: "Security", path: "/admin/security" },
      { label: "Backup & Reset", path: "/admin/backup" },
      { label: "Cloudinary", path: "/admin/cloudinary" },
      { label: "Inventory Sync", path: "/admin/inventory-sync" },
      { label: "Content Editor", path: "/admin/content" },
    ],
  },
];

/** Find the hub group that owns a given pathname (either the hub root or a tab member). */
export function findHubGroupByPath(pathname: string): HubGroup | undefined {
  return HUB_GROUPS.find(
    (g) => g.hubPath === pathname || g.tabs.some((t) => t.path === pathname),
  );
}
