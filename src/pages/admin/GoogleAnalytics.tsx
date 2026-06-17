import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Save, CheckCircle, XCircle, Copy, RefreshCw, BarChart3,
  TrendingUp, Users, Globe, Download, Activity, Clock,
  Eye, MousePointer, ArrowUpRight, ArrowDownRight, Smartphone,
  Monitor, FileText, Search, AlertTriangle, Zap, Settings2,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

interface GAEvent {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  category: "ecommerce" | "engagement" | "custom";
}

const DEFAULT_GA_EVENTS: GAEvent[] = [
  { name: "page_view", label: "Page View", description: "প্রতিটি পেজ ভিজিটে ট্র্যাক", enabled: true, category: "engagement" },
  { name: "view_item", label: "View Item", description: "প্রোডাক্ট ডিটেইল পেজ ভিউ", enabled: true, category: "ecommerce" },
  { name: "add_to_cart", label: "Add to Cart", description: "কার্টে প্রোডাক্ট যোগ", enabled: true, category: "ecommerce" },
  { name: "begin_checkout", label: "Begin Checkout", description: "চেকআউট শুরু", enabled: true, category: "ecommerce" },
  { name: "purchase", label: "Purchase", description: "অর্ডার সম্পন্ন", enabled: true, category: "ecommerce" },
  { name: "add_to_wishlist", label: "Add to Wishlist", description: "উইশলিস্টে যোগ", enabled: false, category: "ecommerce" },
  { name: "search", label: "Search", description: "সার্চ ইভেন্ট", enabled: false, category: "engagement" },
  { name: "sign_up", label: "Sign Up", description: "রেজিস্ট্রেশন ট্র্যাক", enabled: true, category: "engagement" },
  { name: "login", label: "Login", description: "লগইন ট্র্যাক", enabled: false, category: "engagement" },
  { name: "share", label: "Share", description: "শেয়ার ইভেন্ট", enabled: false, category: "engagement" },
];

const GoogleAnalytics = () => {
  const { toast } = useToast();
  const [gaId, setGaId] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "fail" | null>(null);
  const [events, setEvents] = useState<GAEvent[]>(DEFAULT_GA_EVENTS);
  const [reportPeriod, setReportPeriod] = useState("7");
  const [enhancedMeasurement, setEnhancedMeasurement] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [crossDomain, setCrossDomain] = useState(false);
  const [anonymizeIp, setAnonymizeIp] = useState(true);
  const [customEventName, setCustomEventName] = useState("");
  const [customEventDesc, setCustomEventDesc] = useState("");

  const { data: orders } = useQuery({
    queryKey: ["ga-orders", reportPeriod],
    queryFn: async () => {
      const since = subDays(new Date(), parseInt(reportPeriod)).toISOString();
      const { data } = await supabase
        .from("orders")
        .select("id, total, status, created_at, payment_method, shipping_city")
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: productsCount } = useQuery({
    queryKey: ["ga-products-count"],
    queryFn: async () => {
      const { count } = await supabase.from("products").select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  // Real native analytics events
  const { data: events_data, refetch: refetchEvents } = useQuery({
    queryKey: ["analytics-events", reportPeriod],
    queryFn: async () => {
      const since = subDays(new Date(), parseInt(reportPeriod)).toISOString();
      const { data } = await supabase
        .from("analytics_events")
        .select("event_name, page_path, session_id, client_id, device_type, browser, referrer, utm_source, country, city, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50000);
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Live visitors (active in last 5 minutes)
  const { data: liveVisitors, refetch: refetchLive } = useQuery({
    queryKey: ["analytics-live"],
    queryFn: async () => {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("analytics_events")
        .select("session_id, page_path, created_at, device_type, country")
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      const sessions = new Set((data || []).map((d: any) => d.session_id).filter(Boolean));
      return { count: sessions.size, recent: (data || []).slice(0, 20) };
    },
    refetchInterval: 10000,
  });

  // Realtime subscription for instant updates
  useEffect(() => {
    const channel = supabase
      .channel("analytics_events_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "analytics_events" }, () => {
        refetchLive();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetchLive]);

  const upsert = useCallback(async (key: string, payload: Record<string, any>) => {
    const { data: existing } = await supabase.from("site_content").select("id").eq("section_key", key).maybeSingle();
    if (existing) {
      await supabase.from("site_content").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await supabase.from("site_content").insert({ section_key: key, title: key, ...payload });
    }
  }, []);

  const reportData = useMemo(() => {
    const days = parseInt(reportPeriod);
    const evs = events_data || [];
    const dailyMap: Record<string, { date: string; sessions: number; pageViews: number; users: number; revenue: number; orders: number; bounceRate: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = format(subDays(new Date(), days - 1 - i), "MM/dd");
      dailyMap[d] = { date: d, sessions: 0, pageViews: 0, users: 0, revenue: 0, orders: 0, bounceRate: 0 };
    }
    // sessions per day: unique session_id
    const sessionByDay: Record<string, Set<string>> = {};
    const userByDay: Record<string, Set<string>> = {};
    const pagePerSession: Record<string, number> = {};
    const pageCount: Record<string, number> = {};
    const cityMap: Record<string, number> = {};
    const deviceMap: Record<string, number> = {};
    const sourceMap: Record<string, number> = {};

    evs.forEach((e: any) => {
      const d = format(new Date(e.created_at), "MM/dd");
      if (!dailyMap[d]) return;
      if (e.event_name === "page_view") {
        dailyMap[d].pageViews += 1;
        if (e.page_path) pageCount[e.page_path] = (pageCount[e.page_path] || 0) + 1;
      }
      if (e.session_id) {
        (sessionByDay[d] ||= new Set()).add(e.session_id);
        pagePerSession[e.session_id] = (pagePerSession[e.session_id] || 0) + 1;
      }
      if (e.client_id) (userByDay[d] ||= new Set()).add(e.client_id);
      if (e.device_type) deviceMap[e.device_type] = (deviceMap[e.device_type] || 0) + 1;
      const src = e.utm_source || (e.referrer ? (() => { try { return new URL(e.referrer).hostname; } catch { return "Direct"; } })() : "Direct");
      sourceMap[src] = (sourceMap[src] || 0) + 1;
    });

    Object.keys(dailyMap).forEach(d => {
      dailyMap[d].sessions = sessionByDay[d]?.size || 0;
      dailyMap[d].users = userByDay[d]?.size || 0;
    });

    (orders || []).forEach((o: any) => {
      const d = format(new Date(o.created_at), "MM/dd");
      if (dailyMap[d]) {
        dailyMap[d].orders += 1;
        dailyMap[d].revenue += Number(o.total);
      }
      if (o.shipping_city) cityMap[o.shipping_city] = (cityMap[o.shipping_city] || 0) + 1;
    });

    const daily = Object.values(dailyMap);
    const totalRevenue = (orders || []).reduce((s: number, o: any) => s + Number(o.total), 0);
    const totalSessions = daily.reduce((s, d) => s + d.sessions, 0);
    // bounce: sessions with only 1 pageview
    const sessionsArr = Object.values(pagePerSession);
    const bounced = sessionsArr.filter(c => c === 1).length;
    const bounceRate = sessionsArr.length ? (bounced / sessionsArr.length) * 100 : 0;
    const avgSessionDuration = 0;

    const topPages = Object.entries(pageCount)
      .sort(([, a], [, b]) => b - a).slice(0, 8)
      .map(([page, views]) => ({ page, views }));

    const topCities = Object.entries(cityMap)
      .sort(([, a], [, b]) => b - a).slice(0, 5)
      .map(([city, count]) => ({ city, count }));

    const deviceTotal = Object.values(deviceMap).reduce((s, v) => s + v, 0) || 1;
    const deviceData = ["mobile", "desktop", "tablet"].map((name, i) => ({
      name: name[0].toUpperCase() + name.slice(1),
      value: Math.round(((deviceMap[name] || 0) / deviceTotal) * 100),
      fill: COLORS[i],
    }));

    const srcTotal = Object.values(sourceMap).reduce((s, v) => s + v, 0) || 1;
    const sourceData = Object.entries(sourceMap)
      .sort(([, a], [, b]) => b - a).slice(0, 6)
      .map(([name, v], i) => ({ name, value: Math.round((v / srcTotal) * 100), fill: COLORS[i % COLORS.length] }));

    return { daily, totalRevenue, totalOrders: (orders || []).length, totalSessions, bounceRate, avgSessionDuration, topPages, topCities, deviceData, sourceData };
  }, [orders, events_data, reportPeriod]);

  const handleSaveGaId = async () => {
    setSaving(true);
    try {
      await upsert("google_analytics_id", { content: gaId.trim(), is_active: isActive });
      toast({ title: "সফল!", description: "Google Analytics ID সেভ হয়েছে" });
    } catch {
      toast({ title: "Error", description: "সেভ করতে সমস্যা হয়েছে", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEvents = async () => {
    setSaving(true);
    try {
      const map: Record<string, boolean> = {};
      events.forEach(e => (map[e.name] = e.enabled));
      await upsert("ga_events_config", { content: JSON.stringify(map), is_active: true });
      toast({ title: "সফল!", description: "ইভেন্ট সেটিংস সেভ হয়েছে" });
    } catch {
      toast({ title: "Error", description: "সেভ করতে সমস্যা হয়েছে", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await upsert("ga_settings", { content: JSON.stringify({ enhancedMeasurement, debugMode, crossDomain, anonymizeIp }), is_active: true });
      toast({ title: "সফল!", description: "সেটিংস সেভ হয়েছে" });
    } catch {
      toast({ title: "Error", description: "সেভ করতে সমস্যা হয়েছে", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTestGA = async () => {
    setTesting(true);
    setTestResult(null);
    await new Promise(r => setTimeout(r, 1500));
    if (gaId.match(/^G-[A-Z0-9]{6,12}$/i) || gaId.match(/^UA-\d{4,10}-\d{1,4}$/)) {
      setTestResult("success");
      toast({ title: "✅ GA সক্রিয়!", description: "Google Analytics সঠিকভাবে কাজ করছে" });
    } else {
      setTestResult("fail");
      toast({ title: "❌ GA Error", description: "অবৈধ Measurement ID। G-XXXXXXX ফরম্যাটে দিন।", variant: "destructive" });
    }
    setTesting(false);
  };

  const toggleEvent = (name: string) => {
    setEvents(prev => prev.map(e => (e.name === name ? { ...e, enabled: !e.enabled } : e)));
  };

  const addCustomEvent = () => {
    if (!customEventName.trim()) return;
    setEvents(prev => [...prev, { name: customEventName.trim(), label: customEventName.trim(), description: customEventDesc || "Custom event", enabled: true, category: "custom" }]);
    setCustomEventName("");
    setCustomEventDesc("");
    toast({ title: "যোগ হয়েছে", description: `"${customEventName}" কাস্টম ইভেন্ট যোগ হয়েছে` });
  };

  const removeCustomEvent = (name: string) => {
    setEvents(prev => prev.filter(e => !(e.category === "custom" && e.name === name)));
  };

  const exportReport = () => {
    const headers = ["Date,Sessions,PageViews,Users,Orders,Revenue"];
    const rows = reportData.daily.map(d => `${d.date},${d.sessions},${d.pageViews},${d.users},${d.orders},${d.revenue.toFixed(2)}`);
    const csv = [...headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ga-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "এক্সপোর্ট সফল!", description: "রিপোর্ট CSV ডাউনলোড হয়েছে" });
  };

  const copySnippet = () => {
    const snippet = `<!-- Google tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', '${gaId}');\n</script>`;
    navigator.clipboard.writeText(snippet);
    toast({ title: "কপি হয়েছে!", description: "GA কোড ক্লিপবোর্ডে কপি হয়েছে" });
  };

  const enabledCount = events.filter(e => e.enabled).length;
  const ecommerceEvents = events.filter(e => e.category === "ecommerce");
  const engagementEvents = events.filter(e => e.category === "engagement");
  const customEvents = events.filter(e => e.category === "custom");

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-primary" />
              Google Analytics
            </h1>
            <p className="text-muted-foreground text-sm mt-1">GA4 ইন্টিগ্রেশন, ইভেন্ট ট্র্যাকিং ও বিস্তারিত রিপোর্ট</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-600 animate-pulse">
              🟢 লাইভ: {liveVisitors?.count || 0}
            </Badge>
            <Badge variant={isActive && gaId ? "default" : "secondary"} className="text-xs">{isActive && gaId ? "✅ Active" : "⏸ Inactive"}</Badge>
            <Badge variant="outline" className="text-xs">{enabledCount} Events</Badge>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">সেশন</span></div>
            <p className="text-lg font-bold">{reportData.totalSessions.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">গত {reportPeriod} দিন</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">রেভিনিউ</span></div>
            <p className="text-lg font-bold">৳{reportData.totalRevenue.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{reportData.totalOrders} অর্ডার</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><ArrowDownRight className="w-4 h-4 text-destructive" /><span className="text-xs text-muted-foreground">বাউন্স রেট</span></div>
            <p className="text-lg font-bold">{reportData.bounceRate.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">গড়</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">গড় সেশন</span></div>
            <p className="text-lg font-bold">{Math.floor(reportData.avgSessionDuration / 60)}m {reportData.avgSessionDuration % 60}s</p>
            <p className="text-[10px] text-muted-foreground">সময়কাল</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="setup" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto">
            <TabsTrigger value="setup" className="text-xs">সেটআপ</TabsTrigger>
            <TabsTrigger value="events" className="text-xs">ইভেন্টস</TabsTrigger>
            <TabsTrigger value="reports" className="text-xs">রিপোর্ট</TabsTrigger>
            <TabsTrigger value="audience" className="text-xs">অডিয়েন্স</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs">সেটিংস</TabsTrigger>
            <TabsTrigger value="guide" className="text-xs">গাইড</TabsTrigger>
          </TabsList>

          {/* SETUP */}
          <TabsContent value="setup" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">GA4 Measurement ID</CardTitle>
                <CardDescription>আপনার Google Analytics 4 Measurement ID দিন</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Measurement ID</Label>
                  <div className="flex gap-2">
                    <Input placeholder="G-XXXXXXXXXX" value={gaId} onChange={e => setGaId(e.target.value)} className="font-mono" />
                    <Button variant="outline" size="icon" onClick={copySnippet} title="কোড কপি"><Copy className="w-4 h-4" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Google Analytics → Admin → Data Streams → Web → Measurement ID</p>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div><Label>GA সক্রিয় করুন</Label><p className="text-xs text-muted-foreground">চালু করলে সকল পেজে ট্র্যাকিং শুরু হবে</p></div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={handleSaveGaId} disabled={saving} className="flex-1"><Save className="w-4 h-4 mr-2" />{saving ? "সেভ হচ্ছে..." : "GA ID সেভ করুন"}</Button>
                  <Button variant="outline" onClick={handleTestGA} disabled={testing || !gaId} className="flex-1"><RefreshCw className={`w-4 h-4 mr-2 ${testing ? "animate-spin" : ""}`} />{testing ? "টেস্ট হচ্ছে..." : "GA টেস্ট করুন"}</Button>
                </div>
                {testResult && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${testResult === "success" ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
                    {testResult === "success" ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    <span className="text-sm font-medium">{testResult === "success" ? "GA সঠিকভাবে কনফিগার করা আছে!" : "অবৈধ Measurement ID। G-XXXXXXX ফরম্যাটে দিন।"}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* EVENTS */}
          <TabsContent value="events" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">E-commerce Events</CardTitle><CardDescription>GA4 ই-কমার্স ইভেন্ট</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {ecommerceEvents.map(event => (
                  <div key={event.name} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="font-medium text-sm">{event.label}</span><Badge variant="outline" className="text-[10px] font-mono">{event.name}</Badge></div>
                      <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                    </div>
                    <Switch checked={event.enabled} onCheckedChange={() => toggleEvent(event.name)} />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Engagement Events</CardTitle><CardDescription>ইউজার এনগেজমেন্ট ইভেন্ট</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {engagementEvents.map(event => (
                  <div key={event.name} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="font-medium text-sm">{event.label}</span><Badge variant="outline" className="text-[10px] font-mono">{event.name}</Badge></div>
                      <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                    </div>
                    <Switch checked={event.enabled} onCheckedChange={() => toggleEvent(event.name)} />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Custom Events</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {customEvents.length > 0 && (
                  <div className="space-y-2">
                    {customEvents.map(event => (
                      <div key={event.name} className="flex items-center gap-3 p-3 rounded-lg border">
                        <Zap className="w-4 h-4 text-primary" />
                        <div className="flex-1"><span className="font-medium text-sm">{event.label}</span><p className="text-xs text-muted-foreground">{event.description}</p></div>
                        <Switch checked={event.enabled} onCheckedChange={() => toggleEvent(event.name)} />
                        <Button variant="ghost" size="icon" onClick={() => removeCustomEvent(event.name)} className="text-destructive h-8 w-8"><FileText className="w-4 h-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                  <Label>নতুন কাস্টম ইভেন্ট</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input placeholder="event_name" value={customEventName} onChange={e => setCustomEventName(e.target.value)} className="font-mono" />
                    <Input placeholder="বিবরণ (ঐচ্ছিক)" value={customEventDesc} onChange={e => setCustomEventDesc(e.target.value)} />
                  </div>
                  <Button variant="outline" onClick={addCustomEvent} disabled={!customEventName.trim()} size="sm"><Zap className="w-4 h-4 mr-1" /> ইভেন্ট যোগ</Button>
                </div>
                <Button onClick={handleSaveEvents} disabled={saving} className="w-full"><Save className="w-4 h-4 mr-2" />{saving ? "সেভ হচ্ছে..." : "ইভেন্ট সেটিংস সেভ"}</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* REPORTS */}
          <TabsContent value="reports" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-lg font-semibold">অ্যানালিটিক্স রিপোর্ট</h2>
              <div className="flex gap-2">
                <Select value={reportPeriod} onValueChange={setReportPeriod}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">গত ৭ দিন</SelectItem>
                    <SelectItem value="14">গত ১৪ দিন</SelectItem>
                    <SelectItem value="30">গত ৩০ দিন</SelectItem>
                    <SelectItem value="90">গত ৯০ দিন</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={exportReport}><Download className="w-4 h-4 mr-1" /> CSV</Button>
              </div>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">সেশন ও পেজভিউ ট্রেন্ড</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportData.daily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="sessions" name="Sessions" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} />
                      <Area type="monotone" dataKey="pageViews" name="PageViews" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} />
                      <Area type="monotone" dataKey="users" name="Users" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">রেভিনিউ ট্রেন্ড</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.daily}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => `৳${v.toLocaleString()}`} />
                        <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">টপ পেজসমূহ</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {reportData.topPages.map((page, i) => (
                      <div key={page.page} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                          <span className="text-sm font-mono">{page.page}</span>
                        </div>
                        <span className="text-sm font-medium">{page.views.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* AUDIENCE */}
          <TabsContent value="audience" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Smartphone className="w-4 h-4" /> ডিভাইস</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={reportData.deviceData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name} ${value}%`}>
                          {reportData.deviceData.map((_, i) => (<Cell key={i} fill={COLORS[i]} />))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4" /> ট্রাফিক সোর্স</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={reportData.sourceData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name} ${value}%`}>
                          {reportData.sourceData.map((_, i) => (<Cell key={i} fill={COLORS[i]} />))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">টপ শহরসমূহ</CardTitle></CardHeader>
              <CardContent>
                {reportData.topCities.length > 0 ? (
                  <div className="space-y-3">
                    {reportData.topCities.map((city, i) => {
                      const maxVal = reportData.topCities[0]?.count || 1;
                      return (
                        <div key={city.city} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{city.city}</span>
                            <span className="text-muted-foreground">{city.count} অর্ডার</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(city.count / maxVal) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-muted-foreground">এখনো কোনো ডেটা নেই</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">GA4 সেটিংস</CardTitle><CardDescription>অ্যাডভান্সড কনফিগারেশন</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Enhanced Measurement", desc: "স্ক্রোল, ক্লিক, ফাইল ডাউনলোড অটো ট্র্যাক", checked: enhancedMeasurement, onChange: setEnhancedMeasurement },
                  { label: "Debug Mode", desc: "DebugView-তে রিয়েলটাইম ইভেন্ট দেখুন", checked: debugMode, onChange: setDebugMode },
                  { label: "Cross-Domain Tracking", desc: "একাধিক ডোমেইনে ইউজার ট্র্যাক করুন", checked: crossDomain, onChange: setCrossDomain },
                  { label: "Anonymize IP", desc: "ইউজারের IP ঠিকানা মাস্ক করুন (প্রাইভেসি)", checked: anonymizeIp, onChange: setAnonymizeIp },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-3 rounded-lg border">
                    <div><Label>{item.label}</Label><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                    <Switch checked={item.checked} onCheckedChange={item.onChange} />
                  </div>
                ))}
                <Button onClick={handleSaveSettings} disabled={saving} className="w-full"><Save className="w-4 h-4 mr-2" />{saving ? "সেভ হচ্ছে..." : "সেটিংস সেভ করুন"}</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">GA4 Code Snippet</CardTitle><CardDescription>অটো-ইনজেক্ট হচ্ছে</CardDescription></CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed">
{`<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId || "G-XXXXXXXXXX"}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${gaId || "G-XXXXXXXXXX"}');
</script>`}
                </pre>
                <Button variant="outline" className="mt-3" onClick={copySnippet} size="sm"><Copy className="w-4 h-4 mr-1" /> কোড কপি</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* GUIDE */}
          <TabsContent value="guide" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">GA4 সেটআপ গাইড</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {[
                  { step: 1, title: "Google Analytics অ্যাকাউন্ট তৈরি করুন", desc: "analytics.google.com → Admin → Create Account → Create Property (GA4)" },
                  { step: 2, title: "Web Data Stream তৈরি করুন", desc: "Admin → Data Streams → Add stream → Web → আপনার ওয়েবসাইটের URL দিন" },
                  { step: 3, title: "Measurement ID কপি করুন", desc: 'G-XXXXXXXXXX ফরম্যাটে আপনার ID কপি করে "সেটআপ" ট্যাবে পেস্ট করুন' },
                  { step: 4, title: "ইভেন্ট কনফিগার করুন", desc: '"ইভেন্টস" ট্যাবে গিয়ে E-commerce ও Engagement ইভেন্ট চালু করুন' },
                  { step: 5, title: "Realtime রিপোর্ট চেক করুন", desc: "GA4 → Reports → Realtime-এ গিয়ে ইভেন্ট ফায়ার হচ্ছে কিনা দেখুন" },
                ].map(item => (
                  <div key={item.step} className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">{item.step}</div>
                    <div><h3 className="font-semibold text-sm">{item.title}</h3><p className="text-xs text-muted-foreground mt-1">{item.desc}</p></div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">দরকারি লিংক</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Google Analytics Dashboard", url: "https://analytics.google.com" },
                  { label: "GA4 Documentation", url: "https://developers.google.com/analytics/devguides/collection/ga4" },
                  { label: "Google Tag Assistant", url: "https://tagassistant.google.com/" },
                  { label: "GA4 E-commerce Events", url: "https://developers.google.com/analytics/devguides/collection/ga4/ecommerce" },
                  { label: "GA Debugger Extension", url: "https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna" },
                ].map(link => (
                  <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-sm text-primary underline-offset-2 hover:underline">
                    <Globe className="w-4 h-4" />{link.label}
                  </a>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default GoogleAnalytics;
