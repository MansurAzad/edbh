import { useMemo, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { Package, ShoppingCart, Users, DollarSign, TrendingUp, Star, BarChart3, ClipboardCheck, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import LowStockAlert from "@/components/admin/LowStockAlert";
import { useQuery } from "@tanstack/react-query";

const SalesAnalytics = lazy(() => import("@/components/admin/SalesAnalytics"));

const StatCardSkeleton = () => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-5 w-5 rounded" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-8 w-20" />
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const { data: productsCount = 0, isLoading: productsLoading } = useQuery({
    queryKey: ["admin-products-count"],
    queryFn: async () => {
      const { count } = await supabase.from("products").select("*", { count: "exact", head: true });
      return count || 0;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const { data: orders = [], isLoading: loading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("id, total, status, created_at").order("created_at", { ascending: false }).limit(100);
      return data || [];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["admin-reviews-ratings"],
    queryFn: async () => {
      const { data } = await supabase.from("product_reviews").select("rating");
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const stats = useMemo(() => {
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total), 0);
    const pendingOrders = orders.filter((o) => o.status === "pending").length;
    const avgRating = reviews.length
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;
    return {
      totalProducts: productsCount,
      totalOrders: orders.length,
      totalRevenue,
      pendingOrders,
      totalReviews: reviews.length,
      averageRating: Math.round(avgRating * 10) / 10,
    };
  }, [orders, reviews, productsCount]);

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

  const statCards = [
    { title: "মোট প্রোডাক্ট", value: stats.totalProducts, icon: Package, color: "text-blue-500" },
    { title: "মোট অর্ডার", value: stats.totalOrders, icon: ShoppingCart, color: "text-green-500" },
    { title: "মোট রেভিনিউ", value: `৳${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, color: "text-primary" },
    { title: "পেন্ডিং অর্ডার", value: stats.pendingOrders, icon: TrendingUp, color: "text-orange-500" },
    { title: "মোট রিভিউ", value: stats.totalReviews, icon: Star, color: "text-yellow-500" },
    { title: "গড় রেটিং", value: stats.averageRating || "N/A", icon: Star, color: "text-yellow-500" },
  ];

  const isStatsLoading = productsLoading || loading;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "processing": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "shipped": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const getStatusBengali = (status: string) => {
    const map: Record<string, string> = {
      pending: "পেন্ডিং", processing: "প্রসেসিং", shipped: "শিপড",
      delivered: "ডেলিভার্ড", cancelled: "ক্যানসেলড",
    };
    return map[status] || status;
  };

  return (
    <AdminLayout>
      <div className="space-y-6 md:space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">ড্যাশবোর্ড</h1>
          <p className="text-sm md:text-base text-muted-foreground">আপনার স্টোরের সামগ্রিক পরিসংখ্যান</p>
        </div>

        <Link
          to="/admin/business-audit"
          className="group flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-3 hover:from-primary/15 hover:to-primary/10 transition"
        >
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-sm">Business Audit</p>
              <p className="text-xs text-muted-foreground truncate">Sales, product, customer ও order workflow — এক নজরে অডিট</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-primary group-hover:translate-x-0.5 transition-transform" />
        </Link>

        <Tabs defaultValue="overview" className="space-y-4 md:space-y-6">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
              <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              ওভারভিউ
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              সেলস অ্যানালিটিক্স
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 md:space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
              {isStatsLoading
                ? Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
                : statCards.map((stat) => (
                    <Card key={stat.title} className="hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                        <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground leading-tight">{stat.title}</CardTitle>
                        <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color} flex-shrink-0`} />
                      </CardHeader>
                      <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                        <div className="text-lg sm:text-2xl font-bold truncate">{stat.value}</div>
                      </CardContent>
                    </Card>
                  ))}
            </div>

            <LowStockAlert threshold={1} />

            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="text-base sm:text-lg">সাম্প্রতিক অর্ডার</CardTitle>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-3 sm:p-4 bg-muted/50 rounded-lg">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                        <div className="text-right space-y-2">
                          <Skeleton className="h-4 w-16 ml-auto" />
                          <Skeleton className="h-5 w-14 ml-auto rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : recentOrders.length === 0 ? (
                  <p className="text-muted-foreground text-sm">কোনো অর্ডার নেই</p>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {recentOrders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between p-3 sm:p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm sm:text-base truncate">অর্ডার #{order.id.slice(0, 8)}</p>
                          <p className="text-xs sm:text-sm text-muted-foreground">{new Date(order.created_at).toLocaleDateString("bn-BD")}</p>
                        </div>
                        <div className="text-right ml-3 flex-shrink-0">
                          <p className="font-semibold text-sm sm:text-base">৳{Number(order.total).toLocaleString()}</p>
                          <span className={`text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-full inline-block ${getStatusColor(order.status)}`}>
                            {getStatusBengali(order.status)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <Suspense fallback={
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i}><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
                  ))}
                </div>
                <Card><CardContent className="pt-6"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
              </div>
            }>
              <SalesAnalytics />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default Dashboard;
