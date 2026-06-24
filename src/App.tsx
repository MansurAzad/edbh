import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import AnalyticsTracker from "@/components/seo/AnalyticsTracker";
import ScrollToTop from "@/components/seo/ScrollToTop";
import FloatingCartSidebar from "@/components/cart/FloatingCartSidebar";
import { useCart } from "@/contexts/CartContext";
import { queryClient } from "@/lib/query-client";
import { prefetchFeaturedProducts } from "@/hooks/useFeaturedProducts";

// Kick off the products fetch at JS-parse time, BEFORE React mounts.
// By the time the homepage section renders, data is usually already cached.
prefetchFeaturedProducts();


// Eager load: Index (landing page)
import Index from "./pages/Index";

// Lazy load all other pages
const Shop = lazy(() => import("./pages/Shop"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Categories = lazy(() => import("./pages/Categories"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Auth = lazy(() => import("./pages/Auth"));
const Profile = lazy(() => import("./pages/Profile"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const Blog = lazy(() => import("./pages/Blog"));
const OrderTracking = lazy(() => import("./pages/OrderTracking"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ReturnPolicy = lazy(() => import("./pages/ReturnPolicy"));
const FAQ = lazy(() => import("./pages/FAQ"));

// Admin pages - lazy loaded
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminProducts = lazy(() => import("./pages/admin/Products"));
const AdminOrders = lazy(() => import("./pages/admin/Orders"));
const AdminCustomers = lazy(() => import("./pages/admin/Customers"));
const AdminReviews = lazy(() => import("./pages/admin/Reviews"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminCoupons = lazy(() => import("./pages/admin/Coupons"));
const EmailCampaigns = lazy(() => import("./pages/admin/EmailCampaigns"));
const AdvancedReports = lazy(() => import("./pages/admin/AdvancedReports"));
const AdminReturns = lazy(() => import("./pages/admin/Returns"));
const AdminShipping = lazy(() => import("./pages/admin/Shipping"));
const ContentEditor = lazy(() => import("./pages/admin/ContentEditor"));
const CustomerSegments = lazy(() => import("./pages/admin/CustomerSegments"));
const HomepageSections = lazy(() => import("./pages/admin/HomepageSections"));
const BlogPosts = lazy(() => import("./pages/admin/BlogPosts"));
const DeliveryZones = lazy(() => import("./pages/admin/DeliveryZones"));
const AdminNotifications = lazy(() => import("./pages/admin/Notifications"));
const ChatHistories = lazy(() => import("./pages/admin/ChatHistories"));
const BulkProductEdit = lazy(() => import("./pages/admin/BulkProductEdit"));
const BulkAddProducts = lazy(() => import("./pages/admin/BulkAddProducts"));
const StaffPermissions = lazy(() => import("./pages/admin/StaffPermissions"));
const CourierIntegration = lazy(() => import("./pages/admin/CourierIntegration"));
const ReferralDashboard = lazy(() => import("./pages/admin/ReferralDashboard"));
const MetaPixel = lazy(() => import("./pages/admin/MetaPixel"));
const GoogleAnalytics = lazy(() => import("./pages/admin/GoogleAnalytics"));
const AdminCategories = lazy(() => import("./pages/admin/Categories"));
const SocialProofMessages = lazy(() => import("./pages/admin/SocialProofMessages"));
const BackupRestore = lazy(() => import("./pages/admin/BackupRestore"));
const SteadfastCourier = lazy(() => import("./pages/admin/SteadfastCourier"));
const CourierAuditLogs = lazy(() => import("./pages/admin/CourierAuditLogs"));
const CloudinarySettings = lazy(() => import("./pages/admin/CloudinarySettings"));
const TrackingAudit = lazy(() => import("./pages/admin/TrackingAudit"));
const TrackingGuide = lazy(() => import("./pages/admin/TrackingGuide"));
const TrackingFunnel = lazy(() => import("./pages/admin/TrackingFunnel"));
import PermissionGuard from "@/components/admin/PermissionGuard";

// Marketing components - deferred to avoid query storms on initial load
const DeferredMarketing = lazy(() => import("@/components/marketing/DeferredMarketing"));
const BlockedUserWarning = lazy(() => import("@/components/security/BlockedUserWarning"));

// Fast page loading fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-2">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  </div>
);

const CartSidebarWrapper = () => {
  const { cartOpen, closeCart } = useCart();
  return <FloatingCartSidebar open={cartOpen} onClose={closeCart} />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AnalyticsTracker />
              <ScrollToTop />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/shop" element={<Shop />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/categories" element={<Categories />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/product/:id" element={<ProductDetail />} />
                  <Route path="/p/:id" element={<ProductDetail />} />
                  <Route path="/wishlist" element={<Wishlist />} />
                  <Route path="/blog" element={<Blog />} />
                  <Route path="/track/:id?" element={<OrderTracking />} />
                  <Route path="/order-tracking" element={<OrderTracking />} />
                  <Route path="/admin" element={<PermissionGuard><AdminDashboard /></PermissionGuard>} />
                  <Route path="/admin/homepage" element={<PermissionGuard><HomepageSections /></PermissionGuard>} />
                  <Route path="/admin/categories" element={<PermissionGuard><AdminCategories /></PermissionGuard>} />
                  <Route path="/admin/blog" element={<PermissionGuard><BlogPosts /></PermissionGuard>} />
                  <Route path="/admin/products" element={<PermissionGuard><AdminProducts /></PermissionGuard>} />
                  <Route path="/admin/orders" element={<PermissionGuard><AdminOrders /></PermissionGuard>} />
                  <Route path="/admin/customers" element={<PermissionGuard><AdminCustomers /></PermissionGuard>} />
                  <Route path="/admin/reviews" element={<PermissionGuard><AdminReviews /></PermissionGuard>} />
                  <Route path="/admin/settings" element={<PermissionGuard><AdminSettings /></PermissionGuard>} />
                  <Route path="/admin/coupons" element={<PermissionGuard><AdminCoupons /></PermissionGuard>} />
                  <Route path="/admin/email-campaigns" element={<PermissionGuard><EmailCampaigns /></PermissionGuard>} />
                  <Route path="/admin/reports" element={<PermissionGuard><AdvancedReports /></PermissionGuard>} />
                  <Route path="/admin/returns" element={<PermissionGuard><AdminReturns /></PermissionGuard>} />
                  <Route path="/admin/shipping" element={<PermissionGuard><AdminShipping /></PermissionGuard>} />
                  <Route path="/admin/content" element={<PermissionGuard><ContentEditor /></PermissionGuard>} />
                  <Route path="/admin/segments" element={<PermissionGuard><CustomerSegments /></PermissionGuard>} />
                  <Route path="/admin/delivery-zones" element={<PermissionGuard><DeliveryZones /></PermissionGuard>} />
                  <Route path="/admin/notifications" element={<PermissionGuard><AdminNotifications /></PermissionGuard>} />
                  <Route path="/admin/chat-histories" element={<PermissionGuard><ChatHistories /></PermissionGuard>} />
                  <Route path="/admin/bulk-edit" element={<PermissionGuard><BulkProductEdit /></PermissionGuard>} />
                  <Route path="/admin/bulk-add" element={<PermissionGuard><BulkAddProducts /></PermissionGuard>} />
                  <Route path="/admin/staff-permissions" element={<PermissionGuard><StaffPermissions /></PermissionGuard>} />
                  <Route path="/admin/courier-integration" element={<PermissionGuard><CourierIntegration /></PermissionGuard>} />
                  <Route path="/admin/steadfast" element={<PermissionGuard><SteadfastCourier /></PermissionGuard>} />
                  <Route path="/admin/courier-audit" element={<PermissionGuard><CourierAuditLogs /></PermissionGuard>} />
                  <Route path="/admin/referrals" element={<PermissionGuard><ReferralDashboard /></PermissionGuard>} />
                  <Route path="/admin/meta-pixel" element={<PermissionGuard><MetaPixel /></PermissionGuard>} />
                  <Route path="/admin/google-analytics" element={<PermissionGuard><GoogleAnalytics /></PermissionGuard>} />
                  <Route path="/admin/social-proof" element={<PermissionGuard><SocialProofMessages /></PermissionGuard>} />
                  <Route path="/admin/backup" element={<PermissionGuard><BackupRestore /></PermissionGuard>} />
                  <Route path="/admin/cloudinary" element={<PermissionGuard><CloudinarySettings /></PermissionGuard>} />
                  <Route path="/admin/tracking-audit" element={<PermissionGuard><TrackingAudit /></PermissionGuard>} />
                  <Route path="/admin/tracking-guide" element={<PermissionGuard><TrackingGuide /></PermissionGuard>} />
                  <Route path="/admin/tracking-funnel" element={<PermissionGuard><TrackingFunnel /></PermissionGuard>} />



                  <Route path="/return-policy" element={<ReturnPolicy />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>

              {/* Floating Cart Sidebar */}
              <CartSidebarWrapper />
              
              {/* Blocked User Warning */}
              <Suspense fallback={null}>
                <BlockedUserWarning />
              </Suspense>
              
              {/* Global Marketing Components - deferred after idle */}
              <Suspense fallback={null}>
                <DeferredMarketing />
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
