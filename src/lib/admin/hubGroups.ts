/**
 * Hub group definitions — plain in-app tab navigation.
 * Each group has:
 *  - a landing route (hubPath) that redirects to `defaultPath`
 *  - a list of tabs; on any member path the top tab bar renders
 *  - an optional list of `sections` used to visually group tabs under labels
 *
 * The sidebar highlights the hub whenever the user is on any member path.
 */
export interface HubTabDef {
  label: string;
  path: string;
}

export interface HubSectionDef {
  label: string;
  tabs: HubTabDef[];
}

export interface HubGroup {
  id: string;
  hubPath: string;
  title: string;
  defaultPath: string;
  tabs: HubTabDef[];
  /** Optional visual grouping for the tab bar (labels + subsets of `tabs`). */
  sections?: HubSectionDef[];
}

const marketingSections: HubSectionDef[] = [
  {
    label: "Marketing Commands",
    tabs: [
      { label: "Email Campaigns", path: "/admin/email-campaigns" },
      { label: "Notifications", path: "/admin/notifications" },
      { label: "Hot Sale", path: "/admin/hot-sale" },
    ],
  },
  {
    label: "Marketing Automations",
    tabs: [
      { label: "Referrals", path: "/admin/referrals" },
      { label: "Social Proof", path: "/admin/social-proof" },
      { label: "Customer Segments", path: "/admin/segments" },
    ],
  },
  {
    label: "Comms",
    tabs: [
      { label: "Chat Histories", path: "/admin/chat-histories" },
      { label: "WhatsApp Events", path: "/admin/whatsapp-events" },
    ],
  },
];

const settingsSections: HubSectionDef[] = [
  {
    label: "Settings",
    tabs: [
      { label: "General", path: "/admin/settings-page" },
      { label: "Staff Permissions", path: "/admin/staff-permissions" },
      { label: "Security", path: "/admin/security" },
      { label: "Backup & Reset", path: "/admin/backup" },
    ],
  },
  {
    label: "Tools",
    tabs: [
      { label: "Cloudinary", path: "/admin/cloudinary" },
      { label: "Inventory Sync", path: "/admin/inventory-sync" },
      { label: "Content Editor", path: "/admin/content" },
    ],
  },
];

export const HUB_GROUPS: HubGroup[] = [
  {
    id: "products",
    hubPath: "/admin/products",
    title: "Products",
    defaultPath: "/admin/products-catalog",
    tabs: [
      { label: "Catalog", path: "/admin/products-catalog" },
      { label: "Categories", path: "/admin/categories" },
      { label: "Bulk Add", path: "/admin/bulk-add" },
      { label: "Bulk Edit", path: "/admin/bulk-edit" },
      { label: "AI Product Studio", path: "/admin/ai-product-studio" },
      { label: "Descriptions", path: "/admin/product-descriptions" },
    ],
  },
  {
    id: "customers",
    hubPath: "/admin/customers",
    title: "Customers",
    defaultPath: "/admin/customers-list",
    tabs: [
      { label: "Customers", path: "/admin/customers-list" },
      { label: "Reviews", path: "/admin/reviews" },
      { label: "Coupons", path: "/admin/coupons" },
      { label: "Customer Insights", path: "/admin/customer-insights" },
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
      { label: "Returns", path: "/admin/returns" },
    ],
  },
  {
    id: "marketing",
    hubPath: "/admin/marketing-hub",
    title: "Marketing & Comms",
    defaultPath: "/admin/email-campaigns",
    tabs: marketingSections.flatMap((s) => s.tabs),
    sections: marketingSections,
  },
  {
    id: "tracking",
    hubPath: "/admin/tracking-hub",
    title: "Tracking & Analytics",
    defaultPath: "/admin/tracking-funnel",
    tabs: [
      { label: "Conversion Funnel", path: "/admin/tracking-funnel" },
      { label: "Tracking Audit", path: "/admin/tracking-audit" },
      { label: "Performance", path: "/admin/performance" },
      { label: "Meta Pixel", path: "/admin/meta-pixel" },
      { label: "Google Analytics", path: "/admin/google-analytics" },
      { label: "sGTM Setup", path: "/admin/sgtm-setup" },
      { label: "Tracking Guide", path: "/admin/tracking-guide" },
      { label: "SEO Debug", path: "/admin/seo-debug" },
      { label: "Indexing Issues", path: "/admin/indexing-issues" },
      { label: "SEO Keyword Coverage", path: "/admin/seo-keywords" },

    ],
  },
  {
    id: "settings",
    hubPath: "/admin/settings",
    title: "Settings & Tools",
    defaultPath: "/admin/settings-page",
    tabs: settingsSections.flatMap((s) => s.tabs),
    sections: settingsSections,
  },
];

/** Find the hub group that owns a given pathname (either the hub root or a tab member). */
export function findHubGroupByPath(pathname: string): HubGroup | undefined {
  return HUB_GROUPS.find(
    (g) => g.hubPath === pathname || g.tabs.some((t) => t.path === pathname),
  );
}

/** Find the specific tab (and its section, if any) that matches a pathname. */
export function findHubLocation(pathname: string): {
  group?: HubGroup;
  section?: HubSectionDef;
  tab?: HubTabDef;
} {
  const group = findHubGroupByPath(pathname);
  if (!group) return {};
  const tab = group.tabs.find((t) => t.path === pathname);
  if (!tab) return { group };
  const section = group.sections?.find((s) =>
    s.tabs.some((t) => t.path === pathname),
  );
  return { group, section, tab };
}

