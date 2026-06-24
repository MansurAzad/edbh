import { useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, TrendingDown, TrendingUp, Activity, Download, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  LineChart, Line, CartesianGrid, Legend, PieChart, Pie,
} from "recharts";

const FUNNEL_STEPS = [
  { key: "page_view", label: "Page View", color: "#3b82f6" },
  { key: "view_item", label: "Product View", color: "#8b5cf6" },
  { key: "add_to_cart", label: "Add to Cart", color: "#f59e0b" },
  { key: "begin_checkout", label: "Checkout Start", color: "#ec4899" },
  { key: "purchase", label: "Purchase", color: "#10b981" },
];

const RANGE_OPTIONS = [
  { value: 1, label: "Last 24h" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
];

const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) : "0.0");

const TrackingFunnel = () => {
  const [days, setDays] = useState(7);

  const { data: funnelData, isLoading } = useQuery({
    queryKey: ["funnel", days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const counts: Record<string, { events: number; sessions: Set<string>; clients: Set<string> }> = {};
      FUNNEL_STEPS.forEach(s => { counts[s.key] = { events: 0, sessions: new Set(), clients: new Set() }; });

      // Paginate (10k+ events possible)
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("analytics_events")
          .select("event_name, session_id, client_id")
          .in("event_name", FUNNEL_STEPS.map(s => s.key))
          .gte("created_at", since)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data) {
          const c = counts[row.event_name];
          if (!c) continue;
          c.events++;
          if (row.session_id) c.sessions.add(row.session_id);
          if (row.client_id) c.clients.add(row.client_id);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }

      return FUNNEL_STEPS.map(s => ({
        key: s.key,
        label: s.label,
        color: s.color,
        events: counts[s.key].events,
        sessions: counts[s.key].sessions.size,
        users: counts[s.key].clients.size,
      }));
    },
    refetchInterval: 60000,
  });

  const { data: dailyData } = useQuery({
    queryKey: ["funnel-daily", days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const byDay: Record<string, Record<string, number>> = {};
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("analytics_events")
          .select("event_name, created_at")
          .in("event_name", FUNNEL_STEPS.map(s => s.key))
          .gte("created_at", since)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data) {
          const d = String(row.created_at).slice(0, 10);
          if (!byDay[d]) byDay[d] = {};
          byDay[d][row.event_name] = (byDay[d][row.event_name] || 0) + 1;
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({
          date: date.slice(5),
          ...FUNNEL_STEPS.reduce((acc, s) => ({ ...acc, [s.key]: counts[s.key] || 0 }), {}),
        }));
    },
    refetchInterval: 60000,
  });

  const alerts = useMemo(() => {
    if (!funnelData) return [];
    const a: { severity: "error" | "warning" | "ok"; title: string; msg: string }[] = [];
    const get = (k: string) => funnelData.find(d => d.key === k)?.sessions || 0;
    const pv = get("page_view"), vi = get("view_item"), atc = get("add_to_cart");
    const co = get("begin_checkout"), pu = get("purchase");

    if (pv === 0) a.push({ severity: "error", title: "🔴 কোনো Page View নেই", msg: `গত ${days} দিনে একটিও page_view event রেকর্ড হয়নি — Tracking system বন্ধ হতে পারে।` });
    if (pv > 50 && vi === 0) a.push({ severity: "error", title: "🔴 Product View ট্র্যাক হচ্ছে না", msg: "Page view আছে কিন্তু view_item নেই — ProductDetail page-এ tracking ভেঙেছে।" });
    if (vi > 50 && atc === 0) a.push({ severity: "error", title: "🔴 Add to Cart ট্র্যাক হচ্ছে না", msg: "Product views আছে কিন্তু add_to_cart নেই — CartContext.addToCart-এ tracking issue।" });
    if (vi > 100 && atc > 0 && (atc / vi) * 100 < 2) a.push({ severity: "warning", title: "⚠️ Add to Cart rate কম", msg: `Product View → Add to Cart: ${pct(atc, vi)}% (industry avg 7-10%)। Price visibility, CTA button, stock badge improve করুন।` });
    if (atc > 5 && co === 0) a.push({ severity: "error", title: "🔴 Checkout Start ট্র্যাক হচ্ছে না", msg: "Cart additions আছে কিন্তু begin_checkout event নেই।" });
    if (atc > 10 && co > 0 && (co / atc) * 100 < 30) a.push({ severity: "warning", title: "⚠️ Cart Abandonment বেশি", msg: `Add to Cart → Checkout: ${pct(co, atc)}%। Free shipping threshold, urgency বাড়ান।` });
    if (co > 5 && pu === 0) a.push({ severity: "error", title: "🔴 Purchase event missing", msg: "Checkout শুরু হচ্ছে কিন্তু কোনো purchase track হচ্ছে না — order placement code চেক করুন।" });
    if (co > 5 && pu > 0 && (pu / co) * 100 < 40) a.push({ severity: "warning", title: "⚠️ Checkout Drop-off বেশি", msg: `Checkout → Purchase: ${pct(pu, co)}%। Form field কমান, payment options বাড়ান।` });
    if (a.length === 0) a.push({ severity: "ok", title: "✅ সব ঠিক আছে", msg: "Funnel-এর কোনো ধাপে critical issue পাওয়া যায়নি।" });
    return a;
  }, [funnelData, days]);

  const conversionRates = useMemo(() => {
    if (!funnelData) return [];
    const result = [];
    for (let i = 1; i < funnelData.length; i++) {
      const from = funnelData[i - 1].sessions;
      const to = funnelData[i].sessions;
      result.push({
        from: funnelData[i - 1].label,
        to: funnelData[i].label,
        rate: pct(to, from),
        dropped: from - to,
      });
    }
    // Overall
    const pv = funnelData[0]?.sessions || 0;
    const pu = funnelData[funnelData.length - 1]?.sessions || 0;
    result.push({ from: "Visitor", to: "Customer", rate: pct(pu, pv), dropped: pv - pu, overall: true });
    return result;
  }, [funnelData]);

  const funnelChartData = funnelData?.map(d => ({ name: d.label, value: d.sessions, fill: d.color })) || [];

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold">📊 Conversion Funnel</h1>
            <p className="text-muted-foreground">Visitor → Customer journey + auto monitoring</p>
          </div>
          <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <TabsList>
              {RANGE_OPTIONS.map(r => (
                <TabsTrigger key={r.value} value={String(r.value)}>{r.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Alerts */}
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <Alert key={i} variant={a.severity === "error" ? "destructive" : "default"}
              className={a.severity === "ok" ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20" :
                a.severity === "warning" ? "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20" : ""}>
              {a.severity === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertTitle>{a.title}</AlertTitle>
              <AlertDescription>{a.msg}</AlertDescription>
            </Alert>
          ))}
        </div>

        {/* Funnel step cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {funnelData?.map((d, i) => {
            const prev = i > 0 ? funnelData[i - 1].sessions : 0;
            const rate = i > 0 ? pct(d.sessions, prev) : null;
            return (
              <Card key={d.key}>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">{d.label}</div>
                  <div className="text-2xl font-bold mt-1" style={{ color: d.color }}>{d.sessions.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">{d.users} unique users</div>
                  {rate !== null && (
                    <div className="text-xs mt-2 flex items-center gap-1">
                      {Number(rate) >= 50 ? <TrendingUp className="w-3 h-3 text-green-600" /> : <TrendingDown className="w-3 h-3 text-red-600" />}
                      <span>{rate}% from prev</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Funnel visual */}
        <Card>
          <CardHeader><CardTitle>Funnel Visualization</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-muted-foreground">Loading...</p> : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={funnelChartData} layout="vertical" margin={{ left: 20, right: 60 }}>
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={140} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {funnelChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    <LabelList dataKey="value" position="right" formatter={(v: number) => v.toLocaleString()} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Conversion rate table */}
        <Card>
          <CardHeader><CardTitle>Step-by-Step Conversion Rates</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {conversionRates.map((c, i) => (
                <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${c.overall ? "bg-primary/5 border-primary/30" : "bg-card"}`}>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{c.from}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium">{c.to}</span>
                    {c.overall && <Badge variant="default" className="ml-2">Overall</Badge>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{c.dropped} dropped</span>
                    <Badge variant={Number(c.rate) >= 50 ? "default" : Number(c.rate) >= 10 ? "secondary" : "destructive"}>
                      {c.rate}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Daily trend */}
        <Card>
          <CardHeader><CardTitle>Daily Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyData || []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                {FUNNEL_STEPS.map(s => (
                  <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Optimization tips */}
        <Card>
          <CardHeader><CardTitle>💡 Funnel Optimization Tips</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>• <b>View → Add to Cart কম?</b> Price, stock badge, "Buy Now" CTA prominent করুন। Variant selector simplify করুন।</p>
            <p>• <b>Cart → Checkout drop?</b> Free shipping threshold show করুন। Trust badges, return policy visible রাখুন।</p>
            <p>• <b>Checkout → Purchase drop?</b> Form fields কমান। COD option highlight করুন। OTP delay কমান।</p>
            <p>• <b>Abandoned cart recovery</b> automation on করুন (Admin → Email Campaigns)।</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default TrackingFunnel;
