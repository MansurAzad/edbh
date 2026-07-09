import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import AuditCard from "@/components/admin/audit/AuditCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign, TrendingUp, ShoppingCart, Package, Users, MapPin, AlertTriangle,
  Truck, RotateCcw, BarChart3, Layers, Boxes, Award, Snowflake, ClipboardCheck,
  UserPlus, PhoneCall, PackageX, Repeat, Building2, RefreshCw, Download,
} from "lucide-react";

const DAY = 24 * 60 * 60 * 1000;

// Canonical order workflow expected by the audit
const WORKFLOW_STATUSES = [
  "pending", "confirmed", "processing", "packed", "shipped",
  "delivered", "cancelled", "returned", "exchange", "refunded",
] as const;

const money = (n: number) => `৳${Math.round(n).toLocaleString()}`;

export default function BusinessAudit() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["business-audit-v1"],
    staleTime: 60 * 1000,
    refetchInterval: autoRefresh ? 60 * 1000 : false, // live poll every 60s
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [ordersRes, itemsRes, productsRes, variantsRes, profilesRes, cartsRes] = await Promise.all([
        supabase.from("orders").select("id,total,status,payment_method,payment_status,advance_amount,shipping_city,shipping_phone,user_id,guest_name,created_at").order("created_at", { ascending: false }).limit(2000),
        supabase.from("order_items").select("order_id,product_id,product_name,quantity,price,size,color"),
        supabase.from("products").select("id,name,category,stock,price,sale_price,purchase_cost"),
        supabase.from("product_variants").select("product_id,stock"),
        supabase.from("profiles").select("user_id,full_name,city,created_at"),
        supabase.from("cart_items").select("user_id,created_at,updated_at").limit(1000),
      ]);
      return {
        orders: ordersRes.data || [],
        items: itemsRes.data || [],
        products: productsRes.data || [],
        variants: variantsRes.data || [],
        profiles: profilesRes.data || [],
        carts: cartsRes.data || [],
      };
    },
  });

  const m = useMemo(() => {
    if (!data) return null;
    const { orders, items, products, variants, profiles, carts } = data as any;
    const now = Date.now();
    const within = (d: string, days: number) => (now - new Date(d).getTime()) <= days * DAY;

    const delivered = orders.filter((o: any) => o.status === "delivered");
    const cancelled = orders.filter((o: any) => o.status === "cancelled");
    const returned  = orders.filter((o: any) => o.status === "returned");

    const daily = delivered.filter((o: any) => within(o.created_at, 1)).reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const weekly = delivered.filter((o: any) => within(o.created_at, 7)).reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const monthly = delivered.filter((o: any) => within(o.created_at, 30)).reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const gross = delivered.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const aov = delivered.length ? gross / delivered.length : 0;

    // Net profit: sum over delivered order items of (price - purchase_cost)*qty
    const productMap = new Map(products.map((p: any) => [p.id, p]));
    const deliveredIds = new Set(delivered.map((o: any) => o.id));
    let netProfit = 0;
    let missingCostProducts = new Set<string>();
    items.forEach((it: any) => {
      if (!deliveredIds.has(it.order_id)) return;
      const prod: any = productMap.get(it.product_id);
      const cost = prod?.purchase_cost != null ? Number(prod.purchase_cost) : null;
      if (cost == null && it.product_id) missingCostProducts.add(it.product_id);
      netProfit += (Number(it.price) - (cost || 0)) * Number(it.quantity);
    });

    const returnCancelRate = orders.length
      ? ((cancelled.length + returned.length) / orders.length) * 100
      : 0;

    const codPending = orders
      .filter((o: any) => o.payment_method === "cod" && !["delivered", "cancelled", "refunded"].includes(o.status))
      .reduce((s: number, o: any) => s + (Number(o.total || 0) - Number(o.advance_amount || 0)), 0);

    // Product sales aggregation
    const salesByProduct = new Map<string, { qty: number; revenue: number; name: string; lastSoldAt: number }>();
    items.forEach((it: any) => {
      if (!it.product_id) return;
      const order = orders.find((o: any) => o.id === it.order_id);
      if (!order) return;
      const prev = salesByProduct.get(it.product_id) || { qty: 0, revenue: 0, name: it.product_name, lastSoldAt: 0 };
      prev.qty += Number(it.quantity);
      prev.revenue += Number(it.price) * Number(it.quantity);
      const ts = new Date(order.created_at).getTime();
      if (ts > prev.lastSoldAt) prev.lastSoldAt = ts;
      salesByProduct.set(it.product_id, prev);
    });

    const bestSellers = [...salesByProduct.entries()]
      .sort((a, b) => b[1].qty - a[1].qty).slice(0, 5)
      .map(([id, v]) => ({ id, ...v }));

    // Category-wise sales
    const salesByCategory = new Map<string, number>();
    items.forEach((it: any) => {
      const order = orders.find((o: any) => o.id === it.order_id);
      if (!order || !deliveredIds.has(order.id)) return;
      const prod: any = productMap.get(it.product_id);
      const cat = prod?.category || "Other";
      salesByCategory.set(cat, (salesByCategory.get(cat) || 0) + Number(it.price) * Number(it.quantity));
    });
    const topCategories = [...salesByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Slow / dead stock
    const now30 = now - 30 * DAY;
    const now90 = now - 90 * DAY;
    const slow = products.filter((p: any) => {
      const s = salesByProduct.get(p.id);
      return (p.stock ?? 0) > 0 && (!s || s.lastSoldAt < now30);
    });
    const dead = products.filter((p: any) => {
      const s = salesByProduct.get(p.id);
      return (p.stock ?? 0) > 0 && (!s || s.lastSoldAt < now90);
    });

    const outOfStock = products.filter((p: any) => (p.stock ?? 0) <= 0).length;
    const lowStock = products.filter((p: any) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5).length;

    // Margins
    const withMargin = products
      .filter((p: any) => p.purchase_cost != null && Number(p.purchase_cost) > 0)
      .map((p: any) => {
        const sell = Number(p.sale_price || p.price);
        const cost = Number(p.purchase_cost);
        const pct = ((sell - cost) / sell) * 100;
        return { name: p.name, pct };
      });
    const highMargin = [...withMargin].sort((a, b) => b.pct - a.pct).slice(0, 3);
    const lowMargin  = [...withMargin].sort((a, b) => a.pct - b.pct).slice(0, 3);

    // Variant mismatch
    const variantSum = new Map<string, number>();
    variants.forEach((v: any) => variantSum.set(v.product_id, (variantSum.get(v.product_id) || 0) + Number(v.stock || 0)));
    const variantMismatch = products.filter((p: any) => variantSum.has(p.id) && (variantSum.get(p.id) || 0) !== (p.stock ?? 0));

    // Duplicate names (normalized)
    const nameMap = new Map<string, number>();
    products.forEach((p: any) => {
      const key = p.name.trim().toLowerCase().replace(/\s+/g, " ");
      nameMap.set(key, (nameMap.get(key) || 0) + 1);
    });
    const duplicates = [...nameMap.values()].filter((v) => v > 1).length;

    // Customers
    const orderCountByUser = new Map<string, number>();
    const spendByUser = new Map<string, number>();
    orders.forEach((o: any) => {
      const key = o.user_id || o.shipping_phone;
      if (!key) return;
      orderCountByUser.set(key, (orderCountByUser.get(key) || 0) + 1);
      spendByUser.set(key, (spendByUser.get(key) || 0) + Number(o.total || 0));
    });
    const repeatCustomers = [...orderCountByUser.values()].filter((n) => n >= 2).length;
    const highValueCustomers = [...spendByUser.values()].filter((v) => v >= 5000).length;

    // City / district breakdowns
    const byCity = new Map<string, number>();
    orders.forEach((o: any) => byCity.set(o.shipping_city || "Unknown", (byCity.get(o.shipping_city || "Unknown") || 0) + 1));
    const topCities = [...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Abandoned carts (updated > 24h ago, distinct users)
    const abandonedUsers = new Set(
      carts.filter((c: any) => now - new Date(c.updated_at || c.created_at).getTime() > DAY).map((c: any) => c.user_id),
    );

    const cancelledCustomers = new Set(cancelled.map((o: any) => o.user_id || o.shipping_phone).filter(Boolean)).size;

    // Order workflow counts
    const workflowCounts: Record<string, number> = {};
    WORKFLOW_STATUSES.forEach((s) => (workflowCounts[s] = 0));
    orders.forEach((o: any) => {
      if (workflowCounts[o.status] != null) workflowCounts[o.status]++;
    });
    const trackedInDb = new Set(orders.map((o: any) => o.status));
    const missingStatuses = WORKFLOW_STATUSES.filter((s) => !trackedInDb.has(s));

    return {
      daily, weekly, monthly, gross, aov, netProfit, missingCostCount: missingCostProducts.size,
      returnCancelRate, codPending, bestSellers, topCategories, slow, dead, outOfStock, lowStock,
      highMargin, lowMargin, variantMismatch, duplicates, repeatCustomers, highValueCustomers,
      topCities, abandonedUsers, cancelledCustomers, workflowCounts, missingStatuses,
      totalProducts: products.length, totalOrders: orders.length, totalCustomers: profiles.length,
    };
  }, [data]);

  if (isLoading || !m) {
    return (
      <AdminLayout>
        <div className="animate-pulse text-muted-foreground">Loading business audit…</div>
      </AdminLayout>
    );
  }

  const SectionHeading = ({ n, title, desc }: { n: string; title: string; desc: string }) => (
    <div className="flex items-baseline gap-3 mt-2">
      <span className="text-xs font-mono text-muted-foreground">{n}</span>
      <div>
        <h2 className="text-lg sm:text-xl font-display font-bold">{title}</h2>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );

  // ── CSV export of the current audit snapshot ────────────────────────────
  const exportAuditCsv = () => {
    if (!m) return;
    const flat: Array<[string, string | number]> = [
      ["Daily sales", money(m.daily)],
      ["Weekly sales", money(m.weekly)],
      ["Monthly sales", money(m.monthly)],
      ["Gross revenue (delivered)", money(m.gross)],
      ["Average order value", money(m.aov)],
      ["Net profit (est.)", money(m.netProfit)],
      ["Products missing purchase_cost", m.missingCostCount],
      ["Return / cancel rate %", m.returnCancelRate.toFixed(2)],
      ["COD pending amount", money(m.codPending)],
      ["Best sellers", m.bestSellers.map((b: any) => `${b.name}(${b.qty})`).join(" | ")],
      ["Top categories", m.topCategories.map(([n, v]: any) => `${n}:${money(v)}`).join(" | ")],
      ["Slow moving count", m.slow.length],
      ["Dead stock count", m.dead.length],
      ["Out of stock count", m.outOfStock],
      ["Low stock count", m.lowStock],
      ["Variant mismatch count", m.variantMismatch.length],
      ["Duplicate products", m.duplicates],
      ["Repeat customers (2+ orders)", m.repeatCustomers],
      ["High-value customers", m.highValueCustomers],
      ["Abandoned carts", m.abandonedUsers.size],
      ["Cancelled-order customers", m.cancelledCustomers],
      ["Total customers", m.totalCustomers],
      ["Total orders (sampled)", m.totalOrders],
      ["Missing workflow statuses", m.missingStatuses.join(" | ") || "None"],
    ];
    const csv = ["Metric,Value", ...flat.map(([k, v]) => `"${k}","${String(v).replace(/"/g, '""')}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `business-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Warn explicitly when the shop only tracks Pending / Complete style statuses.
  const activeStatuses = Object.entries(m.workflowCounts).filter(([, n]) => (n as number) > 0).map(([s]) => s);
  const workflowTooFlat = activeStatuses.length > 0 && activeStatuses.every((s) => ["pending", "delivered", "completed"].includes(s));
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6 text-primary" />
              Business Audit
            </h1>
            <p className="text-sm text-muted-foreground">
              ব্যবসার Sales, Product, Customer এবং Order workflow — এক নজরে অডিট রিপোর্ট
            </p>
            <p className="text-xs text-muted-foreground mt-1">Last refreshed: {lastUpdated}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground">Auto-refresh 60s</Label>
              <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={exportAuditCsv}>
              <Download className="w-4 h-4 mr-2" /> CSV
            </Button>
          </div>
        </div>


        {/* 7.1 Sales report */}
        <SectionHeading n="৭.১" title="Sales Report" desc="Revenue, profit ও operational cash-flow indicators" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <AuditCard title="Daily sales" icon={DollarSign} status={m.daily > 0 ? "ok" : "warn"}
            metric={money(m.daily)} hint="আজকের delivered revenue" to="/admin/reports" />
          <AuditCard title="Weekly sales" icon={DollarSign} status={m.weekly > 0 ? "ok" : "warn"}
            metric={money(m.weekly)} hint="গত ৭ দিন" to="/admin/reports" />
          <AuditCard title="Monthly sales" icon={DollarSign} status={m.monthly > 0 ? "ok" : "warn"}
            metric={money(m.monthly)} hint="গত ৩০ দিন" to="/admin/reports" />
          <AuditCard title="Gross revenue" icon={TrendingUp} status="info"
            metric={money(m.gross)} hint="সব delivered orders" to="/admin/reports" />
          <AuditCard title="Average order value" icon={ShoppingCart} status="info"
            metric={money(m.aov)} to="/admin/reports" />
          <AuditCard title="Net profit (est.)" icon={TrendingUp} status={m.netProfit > 0 ? "ok" : "warn"}
            metric={money(m.netProfit)}
            hint={m.missingCostCount ? `⚠️ ${m.missingCostCount} products missing purchase_cost` : "Cost-adjusted profit"}
            to="/admin/products" ctaLabel="Update purchase costs" />
          <AuditCard title="Return / cancel rate" icon={RotateCcw}
            status={m.returnCancelRate < 5 ? "ok" : m.returnCancelRate < 15 ? "warn" : "bad"}
            metric={`${m.returnCancelRate.toFixed(1)}%`} to="/admin/orders?status=cancelled" />
          <AuditCard title="COD pending amount" icon={PhoneCall}
            status={m.codPending > 0 ? "warn" : "ok"}
            metric={money(m.codPending)} hint="Uncollected cash-on-delivery" to="/admin/orders?status=pending" />
          <AuditCard title="Branch-wise sales" icon={Building2} status="info"
            metric="Single branch" hint="Multi-branch tracking not enabled" />
          <AuditCard title="Top products" icon={Award} status="info"
            metric={m.bestSellers[0]?.name?.slice(0, 22) || "—"}
            hint={m.bestSellers.slice(0, 3).map((b: any) => `${b.name} (${b.qty})`).join(" · ")}
            to="/admin/reports" />
          <AuditCard title="Top categories" icon={Layers} status="info"
            metric={m.topCategories[0]?.[0] || "—"}
            hint={m.topCategories.slice(0, 3).map(([n, v]: any) => `${n}: ${money(v)}`).join(" · ")}
            to="/admin/reports" />
        </div>

        {/* 7.2 Product report */}
        <SectionHeading n="৭.২" title="Product Report" desc="Inventory health, margin ও catalog quality" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <AuditCard title="Best sellers" icon={Award} status="ok"
            metric={m.bestSellers.length}
            hint={m.bestSellers.slice(0, 3).map((b: any) => b.name).join(", ") || "—"}
            to="/admin/products" />
          <AuditCard title="Slow moving" icon={Snowflake}
            status={m.slow.length > m.totalProducts * 0.3 ? "warn" : "ok"}
            metric={m.slow.length} hint="৩০ দিনে কোন বিক্রি নেই (stock>0)"
            to="/admin/products?filter=slow" />
          <AuditCard title="Dead stock" icon={PackageX}
            status={m.dead.length > 0 ? "bad" : "ok"}
            metric={m.dead.length} hint="৯০ দিনে বিক্রি নেই"
            to="/admin/products?filter=dead" />
          <AuditCard title="Out of stock" icon={Boxes}
            status={m.outOfStock > 0 ? "warn" : "ok"}
            metric={m.outOfStock} to="/admin/products?filter=oos" />
          <AuditCard title="Low stock alert" icon={AlertTriangle}
            status={m.lowStock > 0 ? "warn" : "ok"}
            metric={m.lowStock} hint="≤ 5 units"
            to="/admin/products?filter=low_stock" />
          <AuditCard title="High margin" icon={TrendingUp} status="info"
            metric={m.highMargin[0] ? `${m.highMargin[0].pct.toFixed(0)}%` : "—"}
            hint={m.highMargin.map((p: any) => p.name).join(", ") || "Add purchase_cost"}
            to="/admin/products?sort=margin_desc" />
          <AuditCard title="Low margin" icon={TrendingUp}
            status={m.lowMargin[0] && m.lowMargin[0].pct < 10 ? "warn" : "info"}
            metric={m.lowMargin[0] ? `${m.lowMargin[0].pct.toFixed(0)}%` : "—"}
            hint={m.lowMargin.map((p: any) => p.name).join(", ") || "—"}
            to="/admin/products?sort=margin_asc" />
          <AuditCard title="Variant mismatch" icon={Layers}
            status={m.variantMismatch.length > 0 ? "warn" : "ok"}
            metric={m.variantMismatch.length}
            hint="Product stock ≠ Σ variant stock"
            to="/admin/products" />
          <AuditCard title="Duplicate products" icon={Repeat}
            status={m.duplicates > 0 ? "warn" : "ok"}
            metric={m.duplicates}
            hint="একই নামে একাধিক প্রোডাক্ট"
            to="/admin/products?filter=duplicates" />
        </div>

        {/* 7.3 Customer report */}
        <SectionHeading n="৭.৩" title="Customer Report" desc="Repeat, retention ও geo/source insights" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <AuditCard title="Repeat customers" icon={Repeat} status={m.repeatCustomers > 0 ? "ok" : "warn"}
            metric={m.repeatCustomers} hint="২+ orders" to="/admin/customers" />
          <AuditCard title="High-value customers" icon={Award} status="info"
            metric={m.highValueCustomers} hint="Lifetime spend ≥ ৳5,000" to="/admin/customers" />
          <AuditCard title="City-wise orders" icon={MapPin} status="info"
            metric={m.topCities[0]?.[0] || "—"}
            hint={m.topCities.slice(0, 3).map(([c, n]: any) => `${c} (${n})`).join(" · ")}
            to="/admin/reports" />
          <AuditCard title="District-wise orders" icon={MapPin} status="warn"
            metric="Not tracked" hint="District field অর্ডারে সংরক্ষিত নেই"
            to="/admin/delivery-zones" ctaLabel="Enable district capture" />
          <AuditCard title="Customer source" icon={UserPlus} status="warn"
            metric="Not tracked" hint="Facebook / Website / WhatsApp / Walk-in tag চালু নেই"
            to="/admin/orders" ctaLabel="Add source field" />
          <AuditCard title="Abandoned carts" icon={ShoppingCart}
            status={m.abandonedUsers.size > 0 ? "warn" : "ok"}
            metric={m.abandonedUsers.size} hint=">24h idle carts"
            to="/admin/reports" />
          <AuditCard title="Cancelled-order customers" icon={PackageX}
            status={m.cancelledCustomers > 0 ? "warn" : "ok"}
            metric={m.cancelledCustomers} to="/admin/orders?status=cancelled" />
          <AuditCard title="Total customers" icon={Users} status="info"
            metric={m.totalCustomers} to="/admin/customers" />
        </div>

        {/* 7.4 Order workflow */}
        <SectionHeading n="৭.৪" title="Order Workflow Health" desc="Canonical status coverage" />
        {m.missingStatuses.length > 0 && (
          <Alert variant="default" className="border-amber-500/40">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <AlertTitle>Order workflow অসম্পূর্ণ</AlertTitle>
            <AlertDescription>
              যদি শুধু Pending/Complete থাকে, তাহলে sales operation ঠিকভাবে track হবে না।
              এই status গুলো এখনো ব্যবহৃত হয়নি: <b>{m.missingStatuses.join(", ")}</b>
            </AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Status distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {WORKFLOW_STATUSES.map((s) => {
                const count = m.workflowCounts[s] || 0;
                const missing = m.missingStatuses.includes(s);
                return (
                  <Badge key={s} variant={missing ? "outline" : "secondary"}
                    className={missing ? "border-amber-500/40 text-amber-700 dark:text-amber-400" : ""}>
                    {s}: {count}{missing && " ⚠️"}
                  </Badge>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              পুরো লাইফসাইকেল কভার করতে হলে <a href="/admin/orders" className="text-primary hover:underline">Orders</a> পেজ থেকে packed/returned/exchange/refunded status use করা শুরু করুন।
            </p>
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground pt-4">
          <BarChart3 className="w-3 h-3 inline mr-1" />
          Aggregated from latest {m.totalOrders} orders. Refreshes every 2 minutes.
        </div>
      </div>
    </AdminLayout>
  );
}
