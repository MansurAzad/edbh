/**
 * routePrefetch — hover/focus-triggered dynamic imports for admin routes.
 *
 * Vite dedupes dynamic imports by module id, so calling `import("./pages/...")`
 * here produces the exact same chunk as App.tsx's lazy() call. Kicking the
 * import when the user hovers or focuses a nav link starts downloading the
 * page's JS *before* the click, making navigation feel instant.
 *
 * Each import is cached in a Set so we never fire the same request twice.
 */

type Loader = () => Promise<unknown>;

// Map of admin route path -> dynamic import. Keys must match the paths used
// by AdminLayout's sidebar and HubTabsBar so onPointerEnter/onFocus can find
// the right module without any extra plumbing.
const ADMIN_ROUTE_LOADERS: Record<string, Loader> = {
  "/admin": () => import("@/pages/admin/Dashboard"),
  "/admin/business-audit": () => import("@/pages/admin/BusinessAudit"),
  "/admin/homepage": () => import("@/pages/admin/HomepageSections"),
  "/admin/blog": () => import("@/pages/admin/BlogPosts"),
  "/admin/products": () => import("@/pages/admin/ProductsHub"),
  "/admin/products-catalog": () => import("@/pages/admin/Products"),
  "/admin/categories": () => import("@/pages/admin/Categories"),
  "/admin/bulk-add": () => import("@/pages/admin/BulkAddProducts"),
  "/admin/bulk-edit": () => import("@/pages/admin/BulkProductEdit"),
  "/admin/product-descriptions": () => import("@/pages/admin/ProductDescriptions"),
  "/admin/orders": () => import("@/pages/admin/Orders"),
  "/admin/customers": () => import("@/pages/admin/CustomersHub"),
  "/admin/customers-list": () => import("@/pages/admin/Customers"),
  "/admin/reviews": () => import("@/pages/admin/Reviews"),
  "/admin/coupons": () => import("@/pages/admin/Coupons"),
  "/admin/customer-insights": () => import("@/pages/admin/CustomerInsights"),
  "/admin/reports": () => import("@/pages/admin/AdvancedReports"),
  "/admin/shipping-hub": () => import("@/pages/admin/ShippingHub"),
  "/admin/shipping": () => import("@/pages/admin/Shipping"),
  "/admin/delivery-zones": () => import("@/pages/admin/DeliveryZones"),
  "/admin/courier-integration": () => import("@/pages/admin/CourierIntegration"),
  "/admin/steadfast": () => import("@/pages/admin/SteadfastCourier"),
  "/admin/courier-audit": () => import("@/pages/admin/CourierAuditLogs"),
  "/admin/returns": () => import("@/pages/admin/Returns"),
  "/admin/marketing-hub": () => import("@/pages/admin/MarketingHub"),
  "/admin/email-campaigns": () => import("@/pages/admin/EmailCampaigns"),
  "/admin/notifications": () => import("@/pages/admin/Notifications"),
  "/admin/hot-sale": () => import("@/pages/admin/HotSaleAdmin"),
  "/admin/referrals": () => import("@/pages/admin/ReferralDashboard"),
  "/admin/social-proof": () => import("@/pages/admin/SocialProofMessages"),
  "/admin/segments": () => import("@/pages/admin/CustomerSegments"),
  "/admin/chat-histories": () => import("@/pages/admin/ChatHistories"),
  "/admin/whatsapp-events": () => import("@/pages/admin/WhatsAppShareEvents"),
  "/admin/tracking-hub": () => import("@/pages/admin/TrackingHub"),
  "/admin/tracking-funnel": () => import("@/pages/admin/TrackingFunnel"),
  "/admin/tracking-audit": () => import("@/pages/admin/TrackingAudit"),
  "/admin/performance": () => import("@/pages/admin/PerformanceBudget"),
  "/admin/meta-pixel": () => import("@/pages/admin/MetaPixel"),
  "/admin/google-analytics": () => import("@/pages/admin/GoogleAnalytics"),
  "/admin/sgtm-setup": () => import("@/pages/admin/SgtmSetupGuide"),
  "/admin/tracking-guide": () => import("@/pages/admin/TrackingGuide"),
  "/admin/seo-debug": () => import("@/pages/admin/SeoDebug"),
  "/admin/settings": () => import("@/pages/admin/SettingsHub"),
  "/admin/settings-page": () => import("@/pages/admin/Settings"),
  "/admin/staff-permissions": () => import("@/pages/admin/StaffPermissions"),
  "/admin/security": () => import("@/pages/admin/SecurityCenter"),
  "/admin/backup": () => import("@/pages/admin/BackupRestore"),
  "/admin/cloudinary": () => import("@/pages/admin/CloudinarySettings"),
  "/admin/inventory-sync": () => import("@/pages/admin/InventorySync"),
  "/admin/content": () => import("@/pages/admin/ContentEditor"),
};

const started = new Set<string>();

/**
 * Prefetch the JS chunk for a route. Idempotent — subsequent calls for the
 * same path are no-ops. Silent on failure: prefetch failures should never
 * bubble up (the real navigation will surface any real error).
 */
export function prefetchAdminRoute(path: string): void {
  if (started.has(path)) return;
  const loader = ADMIN_ROUTE_LOADERS[path];
  if (!loader) return;
  started.add(path);
  loader().catch(() => {
    // Allow a retry on next hover if the initial prefetch failed.
    started.delete(path);
  });
}

/** Test-only: reset the prefetch cache. */
export function _resetPrefetchCacheForTests(): void {
  started.clear();
}
