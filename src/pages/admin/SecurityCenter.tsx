import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import JSZip from "jszip";
import {
  Shield, Play, Download, AlertTriangle, CheckCircle2, RefreshCw,
  Bug, FileWarning, Search as SearchIcon, ChevronLeft, ChevronRight,
  Trash2, Settings2, BellRing, Save, Package, History, Clock, Activity, XCircle,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const PAGE_SIZE = 25;

// ---------- helpers ----------
function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const set = new Set<string>();
  rows.forEach(r => Object.keys(r).forEach(k => set.add(k)));
  const cols = Array.from(set);
  const esc = (v: any) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
}
function downloadBlob(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function downloadJson(name: string, obj: unknown) {
  downloadBlob(name, new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
}
function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}
async function logAudit(action: string, category: string, metadata: Record<string, unknown> = {}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("security_admin_audit_log" as any).insert({
    actor: user.id, action, category, metadata,
  });
}

type ScanReport = {
  id: string; created_at: string; updated_at?: string; triggered_by: string;
  status?: string; progress?: number; error?: string | null;
  total_findings: number; critical_count: number; duration_ms: number | null;
  findings: any;
};

// ============================================================
export default function SecurityCenter() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("scans");

  // --- scans ---
  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ["security-scan-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_scan_reports").select("*")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as ScanReport[];
    },
  });

  // Realtime: update cache on scan-report changes instead of polling.
  useEffect(() => {
    const ch = supabase
      .channel("security_scan_reports_rt")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "security_scan_reports" },
        () => { qc.invalidateQueries({ queryKey: ["security-scan-reports"] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  const [scanQuery, setScanQuery] = useState("");
  const [scanSeverity, setScanSeverity] = useState<string>("all");
  const [scanStatus, setScanStatus] = useState<string>("all");
  const dScanQuery = useDebounced(scanQuery);
  const filteredScans = useMemo(() => reports.filter(r => {
    if (scanStatus !== "all" && (r.status ?? "completed") !== scanStatus) return false;
    if (scanSeverity === "critical" && r.critical_count === 0) return false;
    if (scanSeverity === "clean" && r.critical_count > 0) return false;
    if (!dScanQuery) return true;
    const q = dScanQuery.toLowerCase();
    return r.id.toLowerCase().includes(q) || (r.triggered_by ?? "").toLowerCase().includes(q)
      || JSON.stringify(r.findings ?? {}).toLowerCase().includes(q);
  }), [reports, dScanQuery, scanSeverity, scanStatus]);

  const running = reports.find(r => r.status === "running" || r.status === "queued");

  // --- date range (shared across blocks/csp) ---
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const fromIso = fromDate ? new Date(fromDate + "T00:00:00Z").toISOString() : null;
  const toIso = toDate ? new Date(toDate + "T23:59:59Z").toISOString() : null;

  // --- injection blocks ---
  const [blockPage, setBlockPage] = useState(0);
  const [blockQuery, setBlockQuery] = useState("");
  const [blockSource, setBlockSource] = useState<string>("all");
  const dBlockQuery = useDebounced(blockQuery);

  const blockBase = () => {
    let q = supabase.from("injection_block_log").select("*", { count: "exact" });
    if (blockSource !== "all") q = q.eq("source", blockSource);
    if (fromIso) q = q.gte("created_at", fromIso);
    if (toIso) q = q.lte("created_at", toIso);
    if (dBlockQuery) q = q.or(`reason.ilike.%${dBlockQuery}%,matched_pattern.ilike.%${dBlockQuery}%,payload_excerpt.ilike.%${dBlockQuery}%`);
    return q;
  };
  const { data: blockPageData } = useQuery({
    queryKey: ["injection-block-log", blockPage, dBlockQuery, blockSource, fromIso, toIso],
    queryFn: async () => {
      const { data, count, error } = await blockBase()
        .order("created_at", { ascending: false })
        .range(blockPage * PAGE_SIZE, blockPage * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  // --- CSP reports ---
  const [cspPage, setCspPage] = useState(0);
  const [cspQuery, setCspQuery] = useState("");
  const [cspDirective, setCspDirective] = useState<string>("all");
  const dCspQuery = useDebounced(cspQuery);
  const cspBase = () => {
    let q = supabase.from("csp_reports").select("*", { count: "exact" });
    if (cspDirective !== "all") q = q.eq("violated_directive", cspDirective);
    if (fromIso) q = q.gte("created_at", fromIso);
    if (toIso) q = q.lte("created_at", toIso);
    if (dCspQuery) q = q.or(`blocked_uri.ilike.%${dCspQuery}%,document_uri.ilike.%${dCspQuery}%,source_file.ilike.%${dCspQuery}%`);
    return q;
  };
  const { data: cspPageData } = useQuery({
    queryKey: ["csp-reports", cspPage, dCspQuery, cspDirective, fromIso, toIso],
    queryFn: async () => {
      const { data, count, error } = await cspBase()
        .order("created_at", { ascending: false })
        .range(cspPage * PAGE_SIZE, cspPage * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  // --- trend data ---
  const { data: trendData } = useQuery({
    queryKey: ["security-trends", fromIso, toIso],
    queryFn: async () => {
      const from = fromIso ?? new Date(Date.now() - 30 * 86400_000).toISOString();
      const to = toIso ?? new Date().toISOString();
      const [cspRes, blkRes] = await Promise.all([
        supabase.from("csp_reports").select("created_at,violated_directive,document_uri")
          .gte("created_at", from).lte("created_at", to).limit(5000),
        supabase.from("injection_block_log").select("created_at,source,reason,matched_pattern")
          .gte("created_at", from).lte("created_at", to).limit(5000),
      ]);
      const byDay: Record<string, { day: string; csp: number; blocks: number }> = {};
      const dayKey = (iso: string) => iso.slice(0, 10);
      (cspRes.data ?? []).forEach(r => {
        const k = dayKey(r.created_at);
        (byDay[k] ??= { day: k, csp: 0, blocks: 0 }).csp++;
      });
      (blkRes.data ?? []).forEach(r => {
        const k = dayKey(r.created_at);
        (byDay[k] ??= { day: k, csp: 0, blocks: 0 }).blocks++;
      });
      const bySeverity: Record<string, number> = { critical: 0, warn: 0 };
      (blkRes.data ?? []).forEach(r => {
        const sev = /script|iframe|javascript|kinghorse|gacor|toto/i.test((r.matched_pattern ?? "") + " " + (r.reason ?? "")) ? "critical" : "warn";
        bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
      });
      const byDirective: Record<string, number> = {};
      (cspRes.data ?? []).forEach(r => {
        const k = r.violated_directive ?? "unknown";
        byDirective[k] = (byDirective[k] ?? 0) + 1;
      });
      const byDomain: Record<string, number> = {};
      (cspRes.data ?? []).forEach(r => {
        try { const u = new URL(r.document_uri ?? ""); byDomain[u.hostname] = (byDomain[u.hostname] ?? 0) + 1; }
        catch { byDomain["(unknown)"] = (byDomain["(unknown)"] ?? 0) + 1; }
      });
      return {
        timeline: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)),
        severity: Object.entries(bySeverity).map(([k, v]) => ({ name: k, value: v })),
        directive: Object.entries(byDirective).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ name: k, value: v })),
        domain: Object.entries(byDomain).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ name: k, value: v })),
      };
    },
  });

  // Distinct filter options
  const { data: distinctSources = [] } = useQuery({
    queryKey: ["distinct-block-sources"],
    queryFn: async () => {
      const { data } = await supabase.from("injection_block_log").select("source").limit(500);
      return Array.from(new Set((data ?? []).map((r: any) => r.source))).sort();
    },
  });
  const { data: distinctDirectives = [] } = useQuery({
    queryKey: ["distinct-csp-directives"],
    queryFn: async () => {
      const { data } = await supabase.from("csp_reports").select("violated_directive").limit(500);
      return Array.from(new Set((data ?? []).map((r: any) => r.violated_directive).filter(Boolean))).sort();
    },
  });

  // --- settings ---
  const { data: settings } = useQuery({
    queryKey: ["security-scan-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("security_scan_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const [draft, setDraft] = useState<any>(null);
  useEffect(() => { if (settings && !draft) setDraft(settings); }, [settings, draft]);

  const saveSettings = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from("security_scan_settings")
        .update({
          rules: payload.rules, alerts: payload.alerts,
          schedule: payload.schedule,
          environment: payload.environment,
          csp_retention_days: payload.csp_retention_days,
          scan_retention_days: payload.scan_retention_days,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["security-scan-settings"] });
      qc.invalidateQueries({ queryKey: ["security-audit-log"] });
    },
    onError: (e: any) => toast.error(`Save failed: ${e.message}`),
  });

  const runScan = useMutation({
    mutationFn: async () => {
      await logAudit("run_scan_now", "action", { triggered_by: "manual" });
      const { data, error } = await supabase.functions.invoke("security-scan", { body: { triggered_by: "manual" } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const fired = data?.alerts_fired ?? [];
      toast.success(`Scan complete${fired.length ? ` · alerts: ${fired.join(", ")}` : ""}`);
      qc.invalidateQueries({ queryKey: ["security-scan-reports"] });
      qc.invalidateQueries({ queryKey: ["injection-block-log"] });
      qc.invalidateQueries({ queryKey: ["security-audit-log"] });
    },
    onError: (e: any) => toast.error(`Scan failed: ${e.message ?? e}`),
  });

  const cancelScan = useMutation({
    mutationFn: async (reportId: string) => {
      await logAudit("cancel_scan", "action", { report_id: reportId });
      const { error } = await supabase
        .from("security_scan_reports")
        .update({ cancel_requested: true, last_message: "Cancel requested by admin" })
        .eq("id", reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cancel requested — scan will stop at the next checkpoint.");
      qc.invalidateQueries({ queryKey: ["security-scan-reports"] });
      qc.invalidateQueries({ queryKey: ["security-audit-log"] });
    },
    onError: (e: any) => toast.error(`Cancel failed: ${e.message}`),
  });

  const runCleanup = useMutation({
    mutationFn: async () => {
      await logAudit("run_cleanup", "action", {});
      const { data, error } = await supabase.functions.invoke("security-cleanup");
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Cleanup done: ${JSON.stringify(data?.[0] ?? data)}`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(`Cleanup failed: ${e.message}`),
  });

  // --- audit log ---
  const [auditPage, setAuditPage] = useState(0);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditCategory, setAuditCategory] = useState<string>("all");
  const dAuditQuery = useDebounced(auditQuery);
  const { data: auditPageData } = useQuery({
    queryKey: ["security-audit-log", auditPage, dAuditQuery, auditCategory],
    queryFn: async () => {
      let q = supabase.from("security_admin_audit_log" as any).select("*", { count: "exact" });
      if (auditCategory !== "all") q = q.eq("category", auditCategory);
      if (dAuditQuery) q = q.or(`action.ilike.%${dAuditQuery}%,category.ilike.%${dAuditQuery}%`);
      const { data, count, error } = await q
        .order("created_at", { ascending: false })
        .range(auditPage * PAGE_SIZE, auditPage * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data as any[]) ?? [], total: count ?? 0 };
    },
  });

  // ---- Filtered bundle export ----
  const downloadFilteredBundle = async (report?: ScanReport) => {
    const zip = new JSZip();
    const meta = {
      exported_at: new Date().toISOString(),
      filters: {
        from: fromIso, to: toIso,
        block_source: blockSource, block_query: dBlockQuery,
        csp_directive: cspDirective, csp_query: dCspQuery,
      },
    };
    zip.file("filters.json", JSON.stringify(meta, null, 2));
    if (report) {
      zip.file("scan-summary.json", JSON.stringify(report, null, 2));
      zip.file("findings.csv", toCsv(report.findings?.items ?? []));
      zip.file("rules-snapshot.json", JSON.stringify(report.findings?.rules_snapshot ?? {}, null, 2));
    }
    // Filtered blocks
    const { data: blocks } = await blockBase().order("created_at", { ascending: false }).limit(5000);
    zip.file("injection-blocks-filtered.csv", toCsv(blocks ?? []));
    // Filtered CSP
    const { data: csps } = await cspBase().order("created_at", { ascending: false }).limit(5000);
    zip.file("csp-reports-filtered.csv", toCsv(csps ?? []));
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`security-bundle-${report?.id ?? Date.now()}.zip`, blob);
  };

  const latest = reports.find(r => r.status === "completed" || !r.status);

  return (
    <AdminLayout>
      <div className="space-y-6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Security Center</h1>
              <p className="text-sm text-muted-foreground">Injection scans, CSP violations, blocked writes, alerts, retention and schedule.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => runCleanup.mutate()} disabled={runCleanup.isPending}>
              <Trash2 className="mr-2 h-4 w-4" />Run cleanup
            </Button>
            <Button onClick={() => runScan.mutate()} disabled={runScan.isPending || !!running}>
              {runScan.isPending || running ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {running ? "Scan running…" : "Run scan now"}
            </Button>
          </div>
        </div>

        {/* Live scan status */}
        {running && (
          <Card className="border-primary/50">
            <CardHeader className="pb-2 flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary animate-pulse" />
                  Scan in progress · {running.status}
                </CardTitle>
                <CardDescription>Started {new Date(running.created_at).toLocaleTimeString()} · trigger: {running.triggered_by}</CardDescription>
              </div>
              <Button size="sm" variant="destructive"
                onClick={() => cancelScan.mutate(running.id)}
                disabled={cancelScan.isPending || running.cancel_requested}>
                <XCircle className="mr-2 h-3 w-3" />
                {running.cancel_requested ? "Canceling…" : "Cancel scan"}
              </Button>
            </CardHeader>
            <CardContent>
              <Progress value={running.progress ?? 0} />
              <p className="mt-2 text-xs text-muted-foreground">
                {running.progress ?? 0}% · {running.total_findings ?? 0} findings so far ({running.critical_count ?? 0} critical)
                {running.last_message ? ` · ${running.last_message}` : ""}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Latest scan</CardDescription>
              <CardTitle className="text-base">{latest ? new Date(latest.created_at).toLocaleString() : "—"}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {latest ? `${latest.total_findings} findings · ${latest.critical_count} critical` : "No scans yet"}
              {latest?.error && <div className="mt-1 text-destructive text-xs">Last error: {latest.error}</div>}
            </CardContent>
          </Card>
          <Card><CardHeader className="pb-2"><CardDescription>Next schedule</CardDescription>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />
              {settings?.schedule?.enabled ? `Every ${settings?.schedule?.frequency_hours ?? 24}h` : "Disabled"}
            </CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              env: {settings?.environment ?? "production"}<br />
              last: {settings?.schedule?.last_run_at ? new Date(settings.schedule.last_run_at).toLocaleString() : "—"}
            </CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>CSP reports</CardDescription><CardTitle className="text-xl">{cspPageData?.total ?? "—"}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Retention: {settings?.csp_retention_days ?? "—"}d</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Injection blocks</CardDescription><CardTitle className="text-xl">{blockPageData?.total ?? "—"}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Blocked writes/uploads</CardContent></Card>
        </div>

        {/* Date range applies to blocks/csp/trends/exports */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-3">
            <Label className="text-xs">Date range (applies to Blocks, CSP, Trends & exports):</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
            <span className="text-xs text-muted-foreground">→</span>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
            <Button size="sm" variant="outline" onClick={() => { setFromDate(weekAgo); setToDate(today); }}>Reset</Button>
            <Button size="sm" className="ml-auto" onClick={() => downloadFilteredBundle(latest)}>
              <Package className="mr-2 h-3 w-3" />Full bundle (filtered)
            </Button>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="scans"><Bug className="mr-2 h-4 w-4" />Scans</TabsTrigger>
            <TabsTrigger value="trends"><Activity className="mr-2 h-4 w-4" />Trends</TabsTrigger>
            <TabsTrigger value="blocks"><FileWarning className="mr-2 h-4 w-4" />Blocks</TabsTrigger>
            <TabsTrigger value="csp"><AlertTriangle className="mr-2 h-4 w-4" />CSP</TabsTrigger>
            <TabsTrigger value="rules"><Settings2 className="mr-2 h-4 w-4" />Rules</TabsTrigger>
            <TabsTrigger value="alerts"><BellRing className="mr-2 h-4 w-4" />Alerts &amp; retention</TabsTrigger>
            <TabsTrigger value="schedule"><Clock className="mr-2 h-4 w-4" />Schedule</TabsTrigger>
            <TabsTrigger value="audit"><History className="mr-2 h-4 w-4" />Audit log</TabsTrigger>
          </TabsList>

          {/* SCANS */}
          <TabsContent value="scans" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[240px]">
                <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search report ID, trigger, findings…" value={scanQuery} onChange={(e) => setScanQuery(e.target.value)} className="pl-8" />
              </div>
              <Select value={scanStatus} onValueChange={setScanStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={scanSeverity} onValueChange={setScanSeverity}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severity</SelectItem>
                  <SelectItem value="critical">Critical only</SelectItem>
                  <SelectItem value="clean">Clean only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {loadingReports && <div className="text-sm">Loading…</div>}
            {filteredScans.map((r) => {
              const items: any[] = r.findings?.items ?? [];
              const status = r.status ?? "completed";
              return (
                <Card key={r.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {new Date(r.created_at).toLocaleString()}
                        <Badge variant="outline">{r.triggered_by}</Badge>
                        <StatusBadge status={status} />
                      </CardTitle>
                      <CardDescription className="font-mono text-[10px]">{r.id}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {r.critical_count === 0 ? (
                        <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Clean</Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{r.critical_count}</Badge>
                      )}
                      <Button size="sm" variant="outline" onClick={() => downloadJson(`scan-${r.id}.json`, r)}>
                        <Download className="mr-2 h-3 w-3" />JSON
                      </Button>
                      <Button size="sm" onClick={() => downloadFilteredBundle(r)}>
                        <Package className="mr-2 h-3 w-3" />Bundle (filtered)
                      </Button>
                    </div>
                  </CardHeader>
                  {(status === "running" || status === "queued") && (
                    <CardContent className="pt-0"><Progress value={r.progress ?? 0} /></CardContent>
                  )}
                  {r.error && (
                    <CardContent className="pt-0 text-xs text-destructive flex items-center gap-2">
                      <XCircle className="h-4 w-4" />{r.error}
                    </CardContent>
                  )}
                  {items.length > 0 && (
                    <CardContent>
                      <div className="max-h-64 overflow-auto rounded border">
                        <table className="w-full text-xs">
                          <thead className="bg-muted sticky top-0"><tr>
                            <th className="p-2 text-left">Severity</th><th className="p-2 text-left">Table.Column</th>
                            <th className="p-2 text-left">Pattern</th><th className="p-2 text-left">Row ID</th>
                            <th className="p-2 text-left">Excerpt</th>
                          </tr></thead>
                          <tbody>{items.slice(0, 100).map((f, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-2"><Badge variant={f.severity === "critical" ? "destructive" : "outline"}>{f.severity}</Badge></td>
                              <td className="p-2 font-mono">{f.table}.{f.column}</td>
                              <td className="p-2 font-mono">{f.pattern}</td>
                              <td className="p-2 font-mono text-[10px]">{f.row_id}</td>
                              <td className="p-2 max-w-md truncate" title={f.excerpt}>{f.excerpt}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
            {!loadingReports && filteredScans.length === 0 && (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No scans match.</CardContent></Card>
            )}
          </TabsContent>

          {/* TRENDS */}
          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">CSP volume vs. injection blocks</CardTitle>
                <CardDescription>Daily counts in selected date range.</CardDescription></CardHeader>
              <CardContent style={{ height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={trendData?.timeline ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip /><Legend />
                    <Line type="monotone" dataKey="csp" stroke="hsl(var(--primary))" strokeWidth={2} />
                    <Line type="monotone" dataKey="blocks" stroke="hsl(var(--destructive))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-3">
              <TrendBar title="Blocks by severity" data={trendData?.severity ?? []} />
              <TrendBar title="CSP by directive (top 10)" data={trendData?.directive ?? []} />
              <TrendBar title="CSP by domain (top 10)" data={trendData?.domain ?? []} />
            </div>
          </TabsContent>

          {/* BLOCKS */}
          <TabsContent value="blocks">
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[240px]">
                    <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search reason / pattern / payload…" value={blockQuery}
                      onChange={(e) => { setBlockPage(0); setBlockQuery(e.target.value); }} className="pl-8" />
                  </div>
                  <Select value={blockSource} onValueChange={(v) => { setBlockPage(0); setBlockSource(v); }}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      {distinctSources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={async () => {
                    const { data } = await blockBase().order("created_at", { ascending: false }).limit(5000);
                    downloadBlob(`injection-blocks-filtered-${Date.now()}.csv`,
                      new Blob([toCsv(data ?? [])], { type: "text/csv" }));
                  }}><Download className="mr-2 h-3 w-3" />CSV (filtered)</Button>
                </div>
              </CardHeader>
              <CardContent>
                <PaginatedTable
                  rows={blockPageData?.rows ?? []} total={blockPageData?.total ?? 0}
                  page={blockPage} onPage={setBlockPage}
                  columns={[
                    { k: "created_at", label: "When", fmt: (v) => new Date(v).toLocaleString(), nowrap: true },
                    { k: "source", label: "Source", mono: true },
                    { k: "reason", label: "Reason" },
                    { k: "matched_pattern", label: "Pattern", mono: true },
                    { k: "payload_excerpt", label: "Excerpt", truncate: true },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* CSP */}
          <TabsContent value="csp">
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[240px]">
                    <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search domain / blocked URI / file…" value={cspQuery}
                      onChange={(e) => { setCspPage(0); setCspQuery(e.target.value); }} className="pl-8" />
                  </div>
                  <Select value={cspDirective} onValueChange={(v) => { setCspPage(0); setCspDirective(v); }}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Directive" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All directives</SelectItem>
                      {distinctDirectives.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={async () => {
                    const { data } = await cspBase().order("created_at", { ascending: false }).limit(5000);
                    downloadBlob(`csp-reports-filtered-${Date.now()}.csv`,
                      new Blob([toCsv(data ?? [])], { type: "text/csv" }));
                  }}><Download className="mr-2 h-3 w-3" />CSV (filtered)</Button>
                </div>
              </CardHeader>
              <CardContent>
                <PaginatedTable
                  rows={cspPageData?.rows ?? []} total={cspPageData?.total ?? 0}
                  page={cspPage} onPage={setCspPage}
                  columns={[
                    { k: "created_at", label: "When", fmt: (v) => new Date(v).toLocaleString(), nowrap: true },
                    { k: "violated_directive", label: "Directive", mono: true },
                    { k: "blocked_uri", label: "Blocked", mono: true, truncate: true },
                    { k: "source_file", label: "Source", mono: true, truncate: true },
                    { k: "document_uri", label: "Document", truncate: true },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* RULES */}
          <TabsContent value="rules">
            <RulesEditor draft={draft} setDraft={setDraft} onSave={() => saveSettings.mutate(draft)}
              saving={saveSettings.isPending} />
          </TabsContent>

          {/* ALERTS & RETENTION */}
          <TabsContent value="alerts">
            <AlertsEditor draft={draft} setDraft={setDraft} onSave={() => saveSettings.mutate(draft)}
              saving={saveSettings.isPending} />
          </TabsContent>

          {/* SCHEDULE */}
          <TabsContent value="schedule">
            <ScheduleEditor draft={draft} setDraft={setDraft} onSave={() => saveSettings.mutate(draft)}
              saving={saveSettings.isPending} />
          </TabsContent>

          {/* AUDIT LOG */}
          <TabsContent value="audit">
            <Card>
              <CardHeader className="space-y-3">
                <CardTitle className="text-base">Admin audit log</CardTitle>
                <CardDescription>Every change to rules, alerts, retention, schedule, plus manual scan/cleanup runs.</CardDescription>
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-[240px]">
                    <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search action or category…" value={auditQuery}
                      onChange={(e) => { setAuditPage(0); setAuditQuery(e.target.value); }} className="pl-8" />
                  </div>
                  <Select value={auditCategory} onValueChange={(v) => { setAuditPage(0); setAuditCategory(v); }}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      <SelectItem value="settings">Settings</SelectItem>
                      <SelectItem value="action">Actions</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => downloadBlob(
                    `security-audit-${Date.now()}.csv`,
                    new Blob([toCsv(auditPageData?.rows ?? [])], { type: "text/csv" }),
                  )}><Download className="mr-2 h-3 w-3" />CSV (page)</Button>
                </div>
              </CardHeader>
              <CardContent>
                <PaginatedTable
                  rows={auditPageData?.rows ?? []} total={auditPageData?.total ?? 0}
                  page={auditPage} onPage={setAuditPage}
                  columns={[
                    { k: "created_at", label: "When", fmt: (v) => new Date(v).toLocaleString(), nowrap: true },
                    { k: "category", label: "Category", mono: true },
                    { k: "action", label: "Action", mono: true },
                    { k: "environment", label: "Env" },
                    { k: "actor", label: "Actor", mono: true, truncate: true },
                    { k: "metadata", label: "Metadata", truncate: true, fmt: (v) => JSON.stringify(v ?? {}) },
                  ]}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

// ---------- small components ----------
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: any; label: string }> = {
    queued:    { variant: "secondary",   label: "Queued" },
    running:   { variant: "default",     label: "Running" },
    completed: { variant: "outline",     label: "Completed" },
    failed:    { variant: "destructive", label: "Failed" },
  };
  const m = map[status] ?? map.completed;
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function TrendBar({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent style={{ height: 220 }}>
        {data.length === 0 ? <div className="text-xs text-muted-foreground">No data</div> : (
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={10} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Bar dataKey="value" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function PaginatedTable({
  rows, total, page, onPage, columns,
}: {
  rows: any[]; total: number; page: number; onPage: (n: number) => void;
  columns: { k: string; label: string; fmt?: (v: any) => string; mono?: boolean; truncate?: boolean; nowrap?: boolean }[];
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <>
      <div className="max-h-[520px] overflow-auto rounded border">
        <table className="w-full text-xs">
          <thead className="bg-muted sticky top-0"><tr>
            {columns.map(c => <th key={c.k} className="p-2 text-left">{c.label}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? i} className="border-t">
                {columns.map(c => {
                  const v = r[c.k];
                  const disp = c.fmt ? c.fmt(v) : (v ?? "");
                  return (
                    <td key={c.k}
                      className={`p-2 ${c.mono ? "font-mono" : ""} ${c.truncate ? "max-w-xs truncate" : ""} ${c.nowrap ? "whitespace-nowrap" : ""}`}
                      title={typeof disp === "string" ? disp : undefined}>
                      {disp}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length} className="p-6 text-center text-muted-foreground">No matches.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{total.toLocaleString()} total · page {page + 1} / {pages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 0} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </>
  );
}

function RulesEditor({ draft, setDraft, onSave, saving }: any) {
  if (!draft) return <Card><CardContent className="p-6 text-sm">Loading settings…</CardContent></Card>;
  const rules = draft.rules ?? {};
  const setRules = (r: any) => setDraft({ ...draft, rules: { ...rules, ...r } });
  const listField = (key: string, label: string, placeholder: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Textarea rows={4} placeholder={placeholder}
        value={(rules[key] ?? []).join("\n")}
        onChange={(e) => setRules({ [key]: e.target.value.split("\n").map((s: string) => s.trim()).filter(Boolean) })} />
      <p className="text-[11px] text-muted-foreground">One per line</p>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scan rules</CardTitle>
        <CardDescription>Edit the patterns the scanner and DB triggers use to flag injection. Changes are audited.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {listField("keywords", "Spam keywords", "kinghorsetoto\nslot gacor\njudi bola")}
        {listField("tags", "Blocked HTML tags", "script\niframe\nobject\nembed")}
        {listField("uri_schemes", "Blocked URI schemes / prefixes", "javascript:\ndata:text/html\nvbscript:")}
        {listField("hidden_css", "Hidden-CSS patterns", "display:none\nvisibility:hidden\nfont-size:0")}
        <div className="space-y-1">
          <Label>Sensitivity</Label>
          <Select value={rules.sensitivity ?? "high"} onValueChange={(v) => setRules({ sensitivity: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low (CSS = ignore)</SelectItem>
              <SelectItem value="medium">Medium (CSS = warn)</SelectItem>
              <SelectItem value="high">High (CSS = critical)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Environment</Label>
          <Select value={draft.environment ?? "production"} onValueChange={(v) => setDraft({ ...draft, environment: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="development">Development</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Recorded on every audit entry.</p>
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save rules"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertsEditor({ draft, setDraft, onSave, saving }: any) {
  if (!draft) return <Card><CardContent className="p-6 text-sm">Loading settings…</CardContent></Card>;
  const alerts = draft.alerts ?? {};
  const setAlerts = (a: any) => setDraft({ ...draft, alerts: { ...alerts, ...a } });
  const num = (v: any) => (v === "" || v == null ? 0 : parseInt(String(v), 10) || 0);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Notification channels</CardTitle>
          <CardDescription>Fired on new critical finding or CSP spike.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded border p-3">
            <div><Label>Email (Resend)</Label><p className="text-xs text-muted-foreground">Uses configured RESEND_API_KEY.</p></div>
            <Switch checked={!!alerts.email_enabled} onCheckedChange={(v) => setAlerts({ email_enabled: v })} />
          </div>
          <Input placeholder="admin@yourdomain.com" value={alerts.email_to ?? ""}
            onChange={(e) => setAlerts({ email_to: e.target.value })} disabled={!alerts.email_enabled} />

          <div className="flex items-center justify-between rounded border p-3">
            <div><Label>Slack (Incoming Webhook)</Label><p className="text-xs text-muted-foreground">Posts a message to your Slack workspace.</p></div>
            <Switch checked={!!alerts.slack_enabled} onCheckedChange={(v) => setAlerts({ slack_enabled: v })} />
          </div>
          <Input placeholder="https://hooks.slack.com/services/…" value={alerts.slack_webhook_url ?? ""}
            onChange={(e) => setAlerts({ slack_webhook_url: e.target.value })} disabled={!alerts.slack_enabled} />

          <div className="flex items-center justify-between rounded border p-3">
            <div><Label>Custom webhook</Label><p className="text-xs text-muted-foreground">Generic POST with JSON payload.</p></div>
            <Switch checked={!!alerts.webhook_enabled} onCheckedChange={(v) => setAlerts({ webhook_enabled: v })} />
          </div>
          <Input placeholder="https://example.com/security-alerts" value={alerts.webhook_url ?? ""}
            onChange={(e) => setAlerts({ webhook_url: e.target.value })} disabled={!alerts.webhook_enabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Thresholds &amp; retention</CardTitle>
          <CardDescription>Applies to scans + auto-cleanup.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded border p-3">
            <Label>Alert on any critical finding</Label>
            <Switch checked={!!alerts.alert_on_critical} onCheckedChange={(v) => setAlerts({ alert_on_critical: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>CSP spike threshold</Label>
              <Input type="number" min={1} value={alerts.spike_threshold ?? 20}
                onChange={(e) => setAlerts({ spike_threshold: num(e.target.value) })} /></div>
            <div><Label>Spike window (minutes)</Label>
              <Input type="number" min={1} value={alerts.spike_window_minutes ?? 60}
                onChange={(e) => setAlerts({ spike_window_minutes: num(e.target.value) })} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Scan report retention (days)</Label>
              <Select value={String(draft.scan_retention_days ?? 180)}
                onValueChange={(v) => setDraft({ ...draft, scan_retention_days: parseInt(v, 10) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[30, 60, 90, 180, 365].map(d => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>CSP report retention (days)</Label>
              <Select value={String(draft.csp_retention_days ?? 90)}
                onValueChange={(v) => setDraft({ ...draft, csp_retention_days: parseInt(v, 10) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[7, 30, 60, 90, 180].map(d => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={onSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save alerts & retention"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleEditor({ draft, setDraft, onSave, saving }: any) {
  if (!draft) return <Card><CardContent className="p-6 text-sm">Loading settings…</CardContent></Card>;
  const schedule = draft.schedule ?? { enabled: true, frequency_hours: 24, last_run_at: null };
  const setSchedule = (s: any) => setDraft({ ...draft, schedule: { ...schedule, ...s } });
  const options = [
    { v: 6,   label: "Every 6 hours" },
    { v: 12,  label: "Every 12 hours" },
    { v: 24,  label: "Every 24 hours" },
    { v: 72,  label: "Every 3 days" },
    { v: 168, label: "Weekly" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recurring scan schedule</CardTitle>
        <CardDescription>An hourly scheduler checks this setting and runs the scan when due. Environment-specific.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        <div className="flex items-center justify-between rounded border p-3">
          <div>
            <Label>Enable recurring scans</Label>
            <p className="text-xs text-muted-foreground">Turn off to only run manually.</p>
          </div>
          <Switch checked={!!schedule.enabled} onCheckedChange={(v) => setSchedule({ enabled: v })} />
        </div>

        <div>
          <Label>Frequency</Label>
          <Select value={String(schedule.frequency_hours ?? 24)}
            onValueChange={(v) => setSchedule({ frequency_hours: parseInt(v, 10) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map(o => <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Environment</Label>
          <Select value={draft.environment ?? "production"} onValueChange={(v) => setDraft({ ...draft, environment: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="development">Development</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded border p-3 text-xs text-muted-foreground">
          Last scheduled run: <b>{schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleString() : "—"}</b><br />
          Scheduler polls hourly at :00 UTC.
        </div>

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
