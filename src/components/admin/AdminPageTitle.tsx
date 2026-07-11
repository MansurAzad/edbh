/**
 * AdminPageTitle — resolves a human-readable title for the current admin
 * route (hub-tab label > sidebar item label > document.title fallback) and
 * renders it as the pinned page title inside the sticky admin header.
 *
 * Pages don't need to opt-in; the title is derived from the route table
 * so every admin page automatically shows a fixed title bar.
 */
import { useLocation } from "react-router-dom";
import { findHubLocation, findHubGroupByPath } from "@/lib/admin/hubGroups";

const SIDEBAR_LABELS: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/business-audit": "Business Audit",
  "/admin/homepage": "Homepage Sections",
  "/admin/blog": "Blog Posts",
  "/admin/products": "Products",
  "/admin/orders": "Orders",
  "/admin/customers": "Customers",
  "/admin/reports": "Advanced Reports",
  "/admin/shipping-hub": "Shipping & Courier",
  "/admin/marketing-hub": "Marketing & Comms",
  "/admin/tracking-hub": "Tracking & Analytics",
  "/admin/settings": "Settings & Tools",
};

export function resolveAdminPageTitle(pathname: string): string {
  const { group, tab } = findHubLocation(pathname);
  if (tab) return tab.label;
  if (group) return group.title;
  if (SIDEBAR_LABELS[pathname]) return SIDEBAR_LABELS[pathname];
  const hub = findHubGroupByPath(pathname);
  if (hub) return hub.title;
  // Fallback: humanize the last path segment.
  const seg = pathname.split("/").filter(Boolean).pop() || "Admin";
  return seg
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminPageTitle() {
  const { pathname } = useLocation();
  const title = resolveAdminPageTitle(pathname);
  return (
    <h1
      data-testid="admin-page-title"
      data-route={pathname}
      className="font-display text-lg md:text-xl font-bold text-foreground truncate"
    >
      {title}
    </h1>
  );
}
