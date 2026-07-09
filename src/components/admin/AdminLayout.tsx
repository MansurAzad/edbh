import { ReactNode, useState, memo, useCallback, forwardRef, lazy, Suspense, useMemo, useEffect } from "react";
import { Link, useLocation, Navigate } from "react-router-dom";
import {
  LayoutDashboard, Package, ShoppingCart, Users, Star, Settings,
  LogOut, ChevronLeft, Tag, Mail, BarChart3, RotateCcw, Truck,
  FileText, Menu, X, MapPin, Bell, MessageCircle, Shield, Edit3, Route, Gift, ShoppingBag,
  HardDrive, ScrollText, Cloud, Activity, BookOpen, TrendingUp, Server, Plug,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ROUTE_PERMISSIONS } from "@/lib/permissions";

const AdminAIChat = lazy(() => import("@/components/admin/AdminAIChat"));

interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/admin/homepage", icon: FileText, label: "Homepage Sections" },
  { path: "/admin/categories", icon: Tag, label: "Categories" },
  { path: "/admin/blog", icon: FileText, label: "Blog Posts" },
  { path: "/admin/products", icon: Package, label: "Products" },
  { path: "/admin/orders", icon: ShoppingCart, label: "Orders" },
  { path: "/admin/customers", icon: Users, label: "Customers" },
  { path: "/admin/reviews", icon: Star, label: "Reviews" },
  { path: "/admin/coupons", icon: Tag, label: "Coupons" },
  { path: "/admin/email-campaigns", icon: Mail, label: "Email Campaigns" },
  { path: "/admin/reports", icon: BarChart3, label: "Advanced Reports" },
  { path: "/admin/returns", icon: RotateCcw, label: "Returns" },
  { path: "/admin/shipping", icon: Truck, label: "Shipping" },
  { path: "/admin/delivery-zones", icon: MapPin, label: "Delivery Zones" },
  { path: "/admin/content", icon: FileText, label: "Content Editor" },
  { path: "/admin/segments", icon: Users, label: "Customer Segments" },
  { path: "/admin/notifications", icon: Bell, label: "Notifications" },
  { path: "/admin/chat-histories", icon: MessageCircle, label: "Chat Histories" },
  { path: "/admin/whatsapp-events", icon: MessageCircle, label: "WhatsApp Events" },
  { path: "/admin/bulk-edit", icon: Edit3, label: "Bulk Edit" },
  { path: "/admin/bulk-add", icon: Package, label: "Bulk Add Products" },
  { path: "/admin/staff-permissions", icon: Shield, label: "Staff Permissions" },
  { path: "/admin/courier-integration", icon: Route, label: "Courier Integration" },
  { path: "/admin/steadfast", icon: Truck, label: "Steadfast Courier" },
  { path: "/admin/courier-audit", icon: ScrollText, label: "Courier Audit Logs" },
  { path: "/admin/referrals", icon: Gift, label: "Referral Dashboard" },
  { path: "/admin/social-proof", icon: ShoppingBag, label: "Social Proof" },
  { path: "/admin/backup", icon: HardDrive, label: "Backup & Reset" },
  { path: "/admin/cloudinary", icon: Cloud, label: "Cloudinary" },
  { path: "/admin/meta-pixel", icon: BarChart3, label: "Meta Pixel" },
  { path: "/admin/google-analytics", icon: BarChart3, label: "Google Analytics" },
  { path: "/admin/tracking-audit", icon: Activity, label: "Tracking Audit" },
  { path: "/admin/tracking-funnel", icon: TrendingUp, label: "Conversion Funnel" },
  { path: "/admin/tracking-guide", icon: BookOpen, label: "Tracking Guide" },
  { path: "/admin/sgtm-setup", icon: Server, label: "sGTM Setup Guide" },
  { path: "/admin/inventory-sync", icon: Plug, label: "Inventory Sync API" },
  { path: "/admin/security", icon: Shield, label: "Security Center" },
  { path: "/admin/settings", icon: Settings, label: "Settings" },
];

const NavItem = memo(forwardRef<HTMLAnchorElement, {
  path: string; icon: any; label: string; isActive: boolean; onClick: () => void;
}>(({ path, icon: Icon, label, isActive, onClick }, ref) => (
  <Link
    ref={ref}
    to={path}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
      isActive
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    )}
  >
    <Icon className="w-5 h-5 flex-shrink-0" />
    {label}
  </Link>
)));
NavItem.displayName = "NavItem";

const AdminLayout = memo(({ children }: AdminLayoutProps) => {
  const { isStaff, isAdmin, hasPermission, loading } = useAdminAuth();
  const { signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const panelTitle = isAdmin ? "Admin Panel" : "Moderator Panel";

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  // Auto-close sidebar on route change (mobile back/forward, programmatic nav)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile sidebar is open; restore on close/unmount
  useEffect(() => {
    if (!sidebarOpen) return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  const visibleNavItems = useMemo(() => {
    if (isAdmin) return navItems;
    return navItems.filter((item) => {
      const required = ROUTE_PERMISSIONS[item.path];
      if (!required) return true;
      if (required === "admin_only") return false;
      return hasPermission(required);
    });
  }, [isAdmin, hasPermission]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex bg-muted/30">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[70] lg:hidden animate-fade-in"
          onClick={closeSidebar}
          onPointerDown={closeSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-[80] h-dvh w-[min(82vw,20rem)] max-w-[calc(100vw-2rem)] bg-card border-r border-border flex flex-col transition-transform duration-300 ease-in-out lg:h-auto lg:w-64 lg:max-w-none lg:translate-x-0 will-change-transform overflow-hidden",
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        )}
        onTouchStart={(e) => {
          const t = e.touches[0];
          (e.currentTarget as any)._swipe = { x: t.clientX, y: t.clientY };
        }}
        onTouchMove={(e) => {
          const start = (e.currentTarget as any)._swipe;
          if (!start) return;
          const t = e.touches[0];
          const dx = t.clientX - start.x;
          const dy = Math.abs(t.clientY - start.y);
          if (dx < -50 && dy < 60) {
            (e.currentTarget as any)._swipe = null;
            closeSidebar();
          }
        }}
        onTouchEnd={(e) => { (e.currentTarget as any)._swipe = null; }}
      >
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-gradient-gold">{panelTitle}</h1>
            <p className="text-xs text-muted-foreground mt-1">Dubai Borka House</p>
          </div>
          <button onClick={closeSidebar} className="lg:hidden p-1 hover:bg-muted rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto overscroll-contain">
          {visibleNavItems.map((item) => (
            <NavItem
              key={item.path}
              {...item}
              isActive={location.pathname === item.path}
              onClick={closeSidebar}
            />
          ))}
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <Link
            to="/"
            onClick={closeSidebar}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            Back to Store
          </Link>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto min-w-0">
        <div className="lg:hidden sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={openSidebar} className="p-2 hover:bg-muted rounded-lg">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-display text-lg font-bold text-gradient-gold">{panelTitle}</h1>
        </div>
        <div key={location.pathname} className="p-4 md:p-8 animate-fade-in" style={{ animationDuration: '150ms' }}>
          {children}
        </div>
      </main>

      <Suspense fallback={null}>
        <AdminAIChat />
      </Suspense>
    </div>
  );
});
AdminLayout.displayName = "AdminLayout";

export default AdminLayout;
