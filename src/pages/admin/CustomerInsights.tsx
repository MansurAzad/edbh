import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, ArrowLeft } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

/**
 * Drill-down report for Business Audit Customer cards.
 * Reads ?filter= repeat | high_value | abandoned | cancelled | city | district | source
 * Aggregates from orders + carts and shows a sortable table + CSV export.
 */

type FilterKind = "repeat" | "high_value" | "abandoned" | "cancelled" | "city" | "district" | "source";

const LABELS: Record<FilterKind, string> = {
  repeat: "Repeat customers (2+ orders)",
  high_value: "High-value customers (lifetime ≥ ৳5,000)",
  abandoned: "Abandoned carts (idle > 24h)",
  cancelled: "Customers with cancelled orders",
  city: "City-wise order distribution",
  district: "District-wise order distribution",
  source: "Customer source tracking",
};

const money = (n: number) => `৳${Math.round(n).toLocaleString()}`;
const DAY = 24 * 60 * 60 * 1000;

export default function CustomerInsights() {
  const [params] = useSearchParams();
  const filter = (params.get("filter") as FilterKind) || "repeat";

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["customer-insights", filter],
    queryFn: async () => {
      const [ordersRes, cartsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id,total,status,shipping_city,shipping_phone,guest_name,user_id,created_at")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase.from("cart_items").select("user_id,created_at,updated_at").limit(2000),
      ]);
      return { orders: ordersRes.data || [], carts: cartsRes.data || [] };
    },
  });

  const rows = useMemo(() => {
    if (!data) return [] as Array<Record<string, any>>;
    const { orders, carts } = data;
    const now = Date.now();

    const perCustomer = new Map<string, { key: string; name: string; phone: string | null; city: string | null; orders: number; spend: number; last: string; cancelled: number }>();
    orders.forEach((o: any) => {
      const key = o.user_id || o.shipping_phone || o.id;
      const prev = perCustomer.get(key) || {
        key, name: o.guest_name || "Registered", phone: o.shipping_phone, city: o.shipping_city,
        orders: 0, spend: 0, last: o.created_at, cancelled: 0,
      };
      prev.orders += 1;
      prev.spend += Number(o.total || 0);
      if (o.status === "cancelled") prev.cancelled += 1;
      if (new Date(o.created_at) > new Date(prev.last)) prev.last = o.created_at;
      perCustomer.set(key, prev);
    });

    if (filter === "repeat") {
      return [...perCustomer.values()].filter((c) => c.orders >= 2).sort((a, b) => b.orders - a.orders);
    }
    if (filter === "high_value") {
      return [...perCustomer.values()].filter((c) => c.spend >= 5000).sort((a, b) => b.spend - a.spend);
    }
    if (filter === "cancelled") {
      return [...perCustomer.values()].filter((c) => c.cancelled > 0).sort((a, b) => b.cancelled - a.cancelled);
    }
    if (filter === "city" || filter === "district") {
      const bucket = new Map<string, { key: string; orders: number; spend: number }>();
      orders.forEach((o: any) => {
        const k = o.shipping_city || "Unknown";
        const p = bucket.get(k) || { key: k, orders: 0, spend: 0 };
        p.orders += 1;
        p.spend += Number(o.total || 0);
        bucket.set(k, p);
      });
      return [...bucket.values()].sort((a, b) => b.orders - a.orders);
    }
    if (filter === "abandoned") {
      const idle = carts.filter((c: any) => now - new Date(c.updated_at || c.created_at).getTime() > DAY);
      const per = new Map<string, { key: string; idleFor: number; since: string }>();
      idle.forEach((c: any) => {
        const key = c.user_id || "anon";
        const ts = new Date(c.updated_at || c.created_at).getTime();
        const p = per.get(key) || { key, idleFor: 0, since: c.updated_at || c.created_at };
        p.idleFor = Math.max(p.idleFor, Math.floor((now - ts) / (3600 * 1000)));
        per.set(key, p);
      });
      return [...per.values()].sort((a, b) => b.idleFor - a.idleFor);
    }
    if (filter === "source") {
      // Source tag not captured on orders yet — return a diagnostic row.
      return [];
    }
    return [];
  }, [data, filter]);

  const exportCsv = () => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-insights-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <Link to="/admin/business-audit" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back to Business Audit
            </Link>
            <h1 className="text-2xl md:text-3xl font-display font-bold">{LABELS[filter] || "Customer Insights"}</h1>
            <p className="text-sm text-muted-foreground">Live drill-down report from your orders & carts data.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Refreshing…" : "Refresh"}
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Results <Badge variant="secondary">{rows.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : filter === "source" ? (
              <div className="text-sm text-muted-foreground">
                Customer <b>source</b> (Facebook / Website / WhatsApp / Walk-in) field এখনো orders-এ ক্যাপচার করা হচ্ছে না।
                Order form / admin new-order flow-এ একটি <code>source</code> ফিল্ড যোগ করলে এই কার্ডে রিয়েল ডেটা দেখাতে পারব।
              </div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No data matches this filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(rows[0]).map((k) => <TableHead key={k} className="capitalize">{k.replace(/_/g, " ")}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 500).map((r, i) => (
                      <TableRow key={i}>
                        {Object.keys(rows[0]).map((k) => (
                          <TableCell key={k} className="text-xs">
                            {typeof r[k] === "number" && k === "spend" ? money(r[k]) : String(r[k] ?? "—")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > 500 && (
                  <p className="text-xs text-muted-foreground mt-2">Showing first 500 rows — export CSV for the full list.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
