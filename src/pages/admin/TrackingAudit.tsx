import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { serverTrack } from "@/lib/server-tracking";
import { useQuery } from "@tanstack/react-query";

const GTM_ID = "GTM-WT42DHSJ";

type Status = "ok" | "warn" | "fail" | "loading";

function StatusIcon({ s }: { s: Status }) {
  if (s === "ok") return <CheckCircle2 className="w-5 h-5 text-green-600" />;
  if (s === "warn") return <AlertCircle className="w-5 h-5 text-amber-500" />;
  if (s === "fail") return <XCircle className="w-5 h-5 text-red-600" />;
  return <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />;
}

function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

const TrackingAudit = () => {
  const [browserChecks, setBrowserChecks] = useState<{ key: string; label: string; status: Status; detail: string }[]>([]);
  const [capiTest, setCapiTest] = useState<{ status: Status; detail: string }>({ status: "loading", detail: "Click 'Run Test Event'" });
  const [testing, setTesting] = useState(false);
  const [ga4Test, setGa4Test] = useState<{ status: Status; detail: string; payload?: any }>({ status: "loading", detail: "Click 'Run GA4 DebugView Test'" });
  const [ga4Testing, setGa4Testing] = useState(false);

  const refreshBrowserChecks = () => {
    const w = window as any;
    const checks = [
      {
        key: "gtm",
        label: "GTM Container লোড হয়েছে",
        status: (w.google_tag_manager && w.google_tag_manager[GTM_ID]) ? "ok" : "fail" as Status,
        detail: w.google_tag_manager?.[GTM_ID] ? GTM_ID : "GTM script load হয়নি",
      },
      {
        key: "dl",
        label: "dataLayer একটিভ",
        status: Array.isArray(w.dataLayer) ? "ok" : "fail" as Status,
        detail: Array.isArray(w.dataLayer) ? `${w.dataLayer.length} events` : "dataLayer undefined",
      },
      {
        key: "gtag",
        label: "GA4 gtag() ফাংশন",
        status: typeof w.gtag === "function" ? "ok" : "warn" as Status,
        detail: typeof w.gtag === "function" ? "Loaded" : "GTM থেকে load হবে — admin Settings এ GA ID থাকলে direct-ও load হবে",
      },
      {
        key: "fbq",
        label: "Meta fbq() ফাংশন",
        status: typeof w.fbq === "function" ? "ok" : "warn" as Status,
        detail: typeof w.fbq === "function" ? "Loaded" : "GTM Meta tag publish করুন বা admin Settings এ Pixel ID দিন",
      },
      {
        key: "fbp",
        label: "_fbp cookie (Meta browser ID)",
        status: getCookie("_fbp") ? "ok" : "warn" as Status,
        detail: getCookie("_fbp") || "Meta Pixel fire হলে set হবে",
      },
      {
        key: "fbc",
        label: "_fbc cookie (Click ID)",
        status: getCookie("_fbc") ? "ok" : "warn" as Status,
        detail: getCookie("_fbc") || "Facebook ad ক্লিক করে আসলে set হবে (optional)",
      },
      {
        key: "client_id",
        label: "Persistent Client ID",
        status: localStorage.getItem("sst_client_id") ? "ok" : "fail" as Status,
        detail: localStorage.getItem("sst_client_id") || "Missing",
      },
    ];
    setBrowserChecks(checks);
  };

  useEffect(() => {
    refreshBrowserChecks();
    const t = setInterval(refreshBrowserChecks, 3000);
    return () => clearInterval(t);
  }, []);

  // Last 24h / 7d analytics counts
  const { data: stats } = useQuery({
    queryKey: ["tracking-audit-stats"],
    queryFn: async () => {
      const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ count: c24 }, { count: c7 }, { data: top }] = await Promise.all([
        supabase.from("analytics_events").select("*", { count: "exact", head: true }).gte("created_at", since24),
        supabase.from("analytics_events").select("*", { count: "exact", head: true }).gte("created_at", since7),
        supabase.from("analytics_events").select("event_name").gte("created_at", since7).limit(5000),
      ]);
      const counts: Record<string, number> = {};
      (top || []).forEach((r: any) => { counts[r.event_name] = (counts[r.event_name] || 0) + 1; });
      const topEvents = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      return { c24: c24 || 0, c7: c7 || 0, topEvents };
    },
    refetchInterval: 30000,
  });

  const runTestEvent = async () => {
    setTesting(true);
    setCapiTest({ status: "loading", detail: "Sending test event to server-tracking..." });
    try {
      await serverTrack({
        event_name: "page_view",
        event_id: `audit-test-${Date.now()}`,
        params: { test_event_code: "TEST12345", page_path: "/admin/tracking-audit", value: 0, currency: "BDT" },
      });
      // Re-query last event
      await new Promise(r => setTimeout(r, 1500));
      const { data } = await supabase
        .from("analytics_events")
        .select("event_name, created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        setCapiTest({ status: "ok", detail: `Edge Function responded. সর্বশেষ DB event: ${data[0].event_name} @ ${new Date(data[0].created_at).toLocaleTimeString()}` });
      } else {
        setCapiTest({ status: "warn", detail: "Edge Function called কিন্তু DB-তে event পাওয়া যায়নি" });
      }
    } catch (err: any) {
      setCapiTest({ status: "fail", detail: err?.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const okCount = browserChecks.filter(c => c.status === "ok").length;
  const totalCount = browserChecks.length;

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-3xl font-bold">Tracking Audit</h1>
          <p className="text-muted-foreground">GTM, GA4 ও Meta Pixel real-time health check</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Browser-side Checks</CardTitle>
            <Badge variant={okCount === totalCount ? "default" : "secondary"}>
              {okCount} / {totalCount} OK
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {browserChecks.map(c => (
              <div key={c.key} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <StatusIcon s={c.status} />
                <div className="flex-1">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-sm text-muted-foreground break-all">{c.detail}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Server-side (CAPI + GA4 MP)</CardTitle>
            <Button onClick={runTestEvent} disabled={testing} size="sm">
              {testing ? "Testing..." : "Run Test Event"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
              <StatusIcon s={capiTest.status} />
              <div className="flex-1">
                <div className="font-medium">server-tracking Edge Function</div>
                <div className="text-sm text-muted-foreground">{capiTest.detail}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Test event পাঠানোর পর Meta Events Manager → Test Events tab-এ "TEST12345" code দিয়ে real-time দেখুন।
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Native Analytics (analytics_events table)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground">Last 24 hours</div>
              <div className="text-3xl font-bold">{stats?.c24 ?? "—"}</div>
            </div>
            <div className="p-4 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground">Last 7 days</div>
              <div className="text-3xl font-bold">{stats?.c7 ?? "—"}</div>
            </div>
            <div className="col-span-2 p-4 rounded-lg border bg-card">
              <div className="text-sm font-medium mb-2">Top events (7d)</div>
              {stats?.topEvents?.length ? (
                <div className="space-y-1">
                  {stats.topEvents.map(([name, count]) => (
                    <div key={name} className="flex justify-between text-sm">
                      <span className="font-mono">{name}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">No data</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>External Tools</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3">
            <a href={`https://tagmanager.google.com/#/container/accounts/-/containers/-/workspaces`} target="_blank" rel="noopener" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted">
              <span>GTM Workspace</span><ExternalLink className="w-4 h-4" />
            </a>
            <a href="https://analytics.google.com/analytics/web/#/p0/realtime/overview" target="_blank" rel="noopener" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted">
              <span>GA4 Realtime</span><ExternalLink className="w-4 h-4" />
            </a>
            <a href="https://business.facebook.com/events_manager2" target="_blank" rel="noopener" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted">
              <span>Meta Events Manager</span><ExternalLink className="w-4 h-4" />
            </a>
            <a href="/admin/tracking-guide" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted">
              <span>📘 Setup Guide (Bangla)</span><ExternalLink className="w-4 h-4" />
            </a>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default TrackingAudit;
