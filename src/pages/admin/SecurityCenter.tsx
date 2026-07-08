import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import JSZip from "jszip";
import {
  Shield, Play, Download, AlertTriangle, CheckCircle2, RefreshCw,
  Bug, FileWarning, Search as SearchIcon, ChevronLeft, ChevronRight,
  Trash2, Settings2, BellRing, Save, Package,
} from "lucide-react";

// ------------ helpers ------------
const PAGE_SIZE = 25;

function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set<string>()));
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

// ------------ paginated table with search ------------
function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

type ScanReport = {
  id: string; created_at: string; triggered_by: string;
  total_findings: number; critical_count: number; duration_ms: number | null;
  findings: any;
};

// ============================================================
export default function SecurityCenter() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("scans");

  // --- scans (client filtered) ---
  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ["security-scan-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_scan_reports").select("*")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as ScanReport[];
    },
  });
  const [scanQuery, setScanQuery] = useState("");
  const [scanSeverity, setScanSeverity] = useState<string>("all");
  const dScanQuery = useDebounced(scanQuery);
  const filteredScans = useMemo(() => reports.filter(r => {
    if (scanSeverity === "critical" && r.critical_count === 0) return false;
    if (scanSeverity === "clean" && r.critical_count > 0) return false;
    if (!dScanQuery) return true;
    const q = dScanQuery.toLowerCase();
    return r.id.toLowerCase().includes(q) || r.triggered_by.toLowerCase().includes(q)
      || JSON.stringify(r.findings ?? {}).toLowerCase().includes(q);
  }), [reports, dScanQuery, scanSeverity]);

  // --- injection blocks (server paginated) ---
  const [blockPage, setBlockPage] = useState(0);
  const [blockQuery, setBlockQuery] = useState("");
  const [blockSource, setBlockSource] = useState<string>("all");
  const dBlockQuery = useDebounced(blockQuery);
  const { data: blockPageData } = useQuery({
    queryKey: ["injection-block-log", blockPage, dBlockQuery, blockSource],
    queryFn: async () => {
      let q = supabase.from("injection_block_log").select("*", { count: "exact" });
      if (blockSource !== "all") q = q.eq("source", blockSource);
      if (dBlockQuery) q = q.or(`reason.ilike.%${dBlockQuery}%,matched_pattern.ilike.%${dBlockQuery}%,payload_excerpt.ilike.%${dBlockQuery}%`);
      const { data, count, error } = await q
        .order("created_at", { ascending: false })
        .range(blockPage * PAGE_SIZE, blockPage * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  // --- CSP reports (server paginated) ---
  const [cspPage, setCspPage] = useState(0);
  const [cspQuery, setCspQuery] = useState("");
  const [cspDirective, setCspDirective] = useState<string>("all");
  const dCspQuery = useDebounced(cspQuery);
  const { data: cspPageData } = useQuery({
    queryKey: ["csp-reports", cspPage, dCspQuery, cspDirective],
    queryFn: async () => {
      let q = supabase.from("csp_reports").select("*", { count: "exact" });
      if (cspDirective !== "all") q = q.eq("violated_directive", cspDirective);
      if (dCspQuery) q = q.or(`blocked_uri.ilike.%${dCspQuery}%,document_uri.ilike.%${dCspQuery}%,source_file.ilike.%${dCspQuery}%`);
      const { data, count, error } = await q
        .order("created_at", { ascending: false })
        .range(cspPage * PAGE_SIZE, cspPage * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
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
      return data;
    },
  });
  const [draft, setDraft] = useState<any>(null);
  useEffect(() => { if (settings && !draft) setDraft(settings); }, [settings, draft]);

  const saveSettings = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from("security_scan_settings")
        .update({
          rules: payload.rules, alerts: payload.alerts,
          csp_retention_days: payload.csp_retention_days,
          scan_retention_days: payload.scan_retention_days,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["security-scan-settings"] }); },
    onError: (e: any) => toast.error(`Save failed: ${e.message}`),
  });

  const runScan = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("security-scan", { body: { triggered_by: "manual" } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const fired = data?.alerts_fired ?? [];
      toast.success(`Scan complete${fired.length ? ` · alerts: ${fired.join(", ")}` : ""}`);
      qc.invalidateQueries({ queryKey: ["security-scan-reports"] });
      qc.invalidateQueries({ queryKey: ["injection-block-log"] });
    },
    onError: (e: any) => toast.error(`Scan failed: ${e.message ?? e}`),
  });

  const runCleanup = useMutation({
    mutationFn: async () => {
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

  // ---- Download full scan bundle ----
  const downloadBundle = async (report: ScanReport) => {
    const zip = new JSZip();
    zip.file("scan-summary.json", JSON.stringify(report, null, 2));
    const items = report.findings?.items ?? [];
    zip.file("findings.csv", toCsv(items));
    const blocks = report.findings?.recent_blocks ?? [];
    zip.file("recent-blocks.csv", toCsv(blocks));
    // Include all injection blocks (best-effort)
    const { data: allBlocks } = await supabase.from("injection_block_log")
      .select("*").order("created_at", { ascending: false }).limit(2000);
    zip.file("injection-block-log.csv", toCsv(allBlocks ?? []));
    zip.file("rules-snapshot.json", JSON.stringify(report.findings?.rules_snapshot ?? {}, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`security-scan-${report.id}.zip`, blob);
  };

  const latest = reports[0];

  return (
    <AdminLayout>
      <div className="space-y-6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Security Center</h1>
              <p className="text-sm text-muted-foreground">Injection scans, CSP violations, blocked writes, alerts and retention.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => runCleanup.mutate()} disabled={runCleanup.isPending}>
              <Trash2 className="mr-2 h-4 w-4" />Run cleanup
            </Button>
            <Button onClick={() => runScan.mutate()} disabled={runScan.isPending}>
              {runScan.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run scan now
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Latest scan</CardDescription>
              <CardTitle className="text-base">{latest ? new Date(latest.created_at).toLocaleString() : "—"}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {latest ? `${latest.total_findings} findings · ${latest.critical_count} critical` : "No scans yet"}
            </CardContent>
          </Card>
          <Card><CardHeader className="pb-2"><CardDescription>Scans stored</CardDescription><CardTitle className="text-xl">{reports.length}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Retention: {settings?.scan_retention_days ?? "—"}d</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>CSP reports</CardDescription><CardTitle className="text-xl">{cspPageData?.total ?? "—"}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Retention: {settings?.csp_retention_days ?? "—"}d</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Injection blocks</CardDescription><CardTitle className="text-xl">{blockPageData?.total ?? "—"}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Blocked writes/uploads</CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="scans"><Bug className="mr-2 h-4 w-4" />Scans</TabsTrigger>
            <TabsTrigger value="blocks"><FileWarning className="mr-2 h-4 w-4" />Blocks</TabsTrigger>
            <TabsTrigger value="csp"><AlertTriangle className="mr-2 h-4 w-4" />CSP</TabsTrigger>
            <TabsTrigger value="rules"><Settings2 className="mr-2 h-4 w-4" />Rules</TabsTrigger>
            <TabsTrigger value="alerts"><BellRing className="mr-2 h-4 w-4" />Alerts &amp; retention</TabsTrigger>
          </TabsList>

          {/* SCANS */}
          <TabsContent value="scans" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[240px]">
                <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search report ID, trigger, findings…" value={scanQuery} onChange={(e) => setScanQuery(e.target.value)} className="pl-8" />
              </div>
              <Select value={scanSeverity} onValueChange={setScanSeverity}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="critical">Critical only</SelectItem>
                  <SelectItem value="clean">Clean only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {loadingReports && <div className="text-sm">Loading…</div>}
            {filteredScans.map((r) => {
              const items: any[] = r.findings?.items ?? [];
              return (
                <Card key={r.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div>
                      <CardTitle className="text-base">
                        {new Date(r.created_at).toLocaleString()}{" "}
                        <Badge variant="outline" className="ml-2">{r.triggered_by}</Badge>
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
                      <Button size="sm" onClick={() => downloadBundle(r)}>
                        <Package className="mr-2 h-3 w-3" />Full bundle
                      </Button>
                    </div>
                  </CardHeader>
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
                  <Button variant="outline" size="sm" onClick={() => downloadBlob(
                    `injection-blocks-${Date.now()}.csv`,
                    new Blob([toCsv(blockPageData?.rows ?? [])], { type: "text/csv" }),
                  )}><Download className="mr-2 h-3 w-3" />CSV (page)</Button>
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
                  <Button variant="outline" size="sm" onClick={() => downloadBlob(
                    `csp-reports-${Date.now()}.csv`,
                    new Blob([toCsv(cspPageData?.rows ?? [])], { type: "text/csv" }),
                  )}><Download className="mr-2 h-3 w-3" />CSV (page)</Button>
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
        </Tabs>
      </div>
    </AdminLayout>
  );
}

// ------------ Paginated table ------------
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

// ------------ Rules editor ------------
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
        <CardDescription>Edit the patterns the scanner and DB triggers use to flag injection. Saved to <code>security_scan_settings</code>.</CardDescription>
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
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save rules"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------ Alerts + retention editor ------------
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
        <CardHeader><CardTitle className="text-base">Thresholds & retention</CardTitle>
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
