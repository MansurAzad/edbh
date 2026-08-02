/**
 * Indexing Issues Panel
 * Google Search Console coverage for https://dubaiborkahouse.com/.
 *
 * Adds:
 *  - Per-row "Recheck now" (forces a fresh URL inspection for that row).
 *  - Auto-refresh every AUTO_REFRESH_MS with a visible "last updated" stamp
 *    and a stale-data warning after STALE_HOURS.
 *  - Unresolved fixes list sourced from public.indexing_fix_status.
 *  - Bulk "Mark selected as Applied" with a shared note.
 *  - Unresolved-only toggle + URL search box for narrowing affected pages.
 *  - Optional notifications when Errors/Warnings counts change on refresh.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Bell, CheckCircle2, RefreshCw, XCircle, ExternalLink, Download, Clock, ListChecks, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const AUTO_REFRESH_MS = 15 * 60 * 1000; // 15 minutes
const STALE_HOURS = 6;
const NOTIFY_KEY = "indexing-issues-notify";
const AGE_KEY = "indexing-issues-age-days";

type NotifySettings = {
  enabled: boolean;
  channelToast: boolean;
  channelBrowser: boolean;
  errorThreshold: number;
  warningThreshold: number;
};

const DEFAULT_NOTIFY: NotifySettings = {
  enabled: false,
  channelToast: true,
  channelBrowser: false,
  errorThreshold: 1,
  warningThreshold: 1,
};

function loadNotifySettings(): NotifySettings {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    if (!raw) return DEFAULT_NOTIFY;
    if (raw === "1") return { ...DEFAULT_NOTIFY, enabled: true };
    if (raw === "0") return DEFAULT_NOTIFY;
    return { ...DEFAULT_NOTIFY, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFY;
  }
}


type Inspection = {
  url: string;
  clicks?: number;
  impressions?: number;
  result: any;
};

type FixRow = {
  url: string;
  status: "unresolved" | "in_progress" | "applied";
  action_title: string | null;
  notes: string | null;
  updated_at: string;
};

function verdictBadge(v?: string) {
  if (v === "PASS") return <Badge className="bg-emerald-600">Pass</Badge>;
  if (v === "PARTIAL") return <Badge className="bg-amber-600">Warning</Badge>;
  if (v === "FAIL") return <Badge variant="destructive">Fail</Badge>;
  if (v === "NEUTRAL") return <Badge variant="secondary">Neutral</Badge>;
  return <Badge variant="outline">{v ?? "Unknown"}</Badge>;
}

function fixStatusBadge(s: FixRow["status"]) {
  if (s === "applied") return <Badge className="bg-emerald-600">Applied</Badge>;
  if (s === "in_progress") return <Badge className="bg-amber-600">In progress</Badge>;
  return <Badge variant="destructive">Unresolved</Badge>;
}

function fmt(ts?: string | Date) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

function relative(from: Date) {
  const diff = Date.now() - from.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function IndexingIssues() {
  const [loading, setLoading] = useState(false);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});
  const [sites, setSites] = useState<any[] | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [summary, setSummary] = useState<{
    inspections: Inspection[];
    analyticsError?: any;
    siteUrl?: string;
    requestId?: string;
    analyticsAttempts?: number;
  } | null>(null);
  const [singleUrl, setSingleUrl] = useState("https://dubaiborkahouse.com/");
  const [singleResult, setSingleResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixRows, setFixRows] = useState<FixRow[]>([]);
  const retriedRef = useRef(false);

  // Filters
  const [search, setSearch] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [ageFilterOn, setAgeFilterOn] = useState(false);
  const [ageDays, setAgeDays] = useState<number>(() => {
    const n = Number(localStorage.getItem(AGE_KEY));
    return Number.isFinite(n) && n > 0 ? n : 7;
  });

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkNote, setBulkNote] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkRechecking, setBulkRechecking] = useState(false);
  const [exportingUnresolved, setExportingUnresolved] = useState(false);

  // Notifications
  const [notify, setNotify] = useState<NotifySettings>(loadNotifySettings);
  const prevCountsRef = useRef<{ errors: number; warnings: number } | null>(null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;


  async function loadSites() {
    setError(null);
    const { data, error } = await supabase.functions.invoke("gsc-indexing", { body: { action: "sites" } });
    if (error) { setError(error.message); return; }
    setConnected(data?.connected ?? false);
    setSites(data?.siteEntry ?? []);
  }

  const loadSummary = useCallback(async (isRetry = false) => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.functions.invoke("gsc-indexing", { body: { action: "errors" } });
    if (error) { setError(error.message); setLoading(false); return; }
    setConnected(data?.connected ?? false);
    setSummary(data);
    setLastFetched(new Date());
    setLoading(false);

    const empty = (data?.inspections?.length ?? 0) === 0;
    if (!isRetry && (empty || data?.analyticsError) && data?.connected !== false) {
      if (!retriedRef.current) {
        retriedRef.current = true;
        setTimeout(() => loadSummary(true), 1200);
      }
    } else if (isRetry) {
      retriedRef.current = false;
    }
  }, []);

  const loadFixRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("indexing_fix_status")
      .select("url,status,action_title,notes,updated_at")
      .order("updated_at", { ascending: false });
    if (!error && data) setFixRows(data as FixRow[]);
  }, []);

  async function recheckRow(url: string) {
    setRowLoading((s) => ({ ...s, [url]: true }));
    const { data, error } = await supabase.functions.invoke("gsc-indexing", {
      body: { action: "inspect", url },
    });
    setRowLoading((s) => ({ ...s, [url]: false }));
    if (error) {
      toast({ title: "Recheck failed", description: error.message, variant: "destructive" });
      return;
    }
    setSummary((prev) => {
      if (!prev) return prev;
      const inspections = prev.inspections.map((it) =>
        it.url === url ? { ...it, result: data?.result ?? it.result } : it,
      );
      if (!inspections.some((it) => it.url === url) && data?.result) {
        inspections.push({ url, result: data.result });
      }
      return { ...prev, inspections };
    });
    toast({ title: "Rechecked", description: url });
  }

  async function inspectOne() {
    setInspectLoading(true); setError(null);
    const { data, error } = await supabase.functions.invoke("gsc-indexing", {
      body: { action: "inspect", url: singleUrl },
    });
    if (error) { setError(error.message); setInspectLoading(false); return; }
    setSingleResult(data?.result);
    setInspectLoading(false);
  }

  useEffect(() => {
    (async () => { await loadSites(); await loadSummary(); await loadFixRows(); })();
  }, [loadSummary, loadFixRows]);

  // Auto-refresh every AUTO_REFRESH_MS
  useEffect(() => {
    const t = setInterval(() => { loadSummary(); loadFixRows(); }, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [loadSummary, loadFixRows]);

  const buckets = useMemo(() => {
    const errors: Inspection[] = [];
    const warnings: Inspection[] = [];
    const ok: Inspection[] = [];
    for (const it of summary?.inspections ?? []) {
      const v = it.result?.inspectionResult?.indexStatusResult?.verdict;
      if (v === "FAIL") errors.push(it);
      else if (v === "PARTIAL" || v === "NEUTRAL") warnings.push(it);
      else ok.push(it);
    }
    return { errors, warnings, ok };
  }, [summary]);

  const fixByUrl = useMemo(() => {
    const m = new Map<string, FixRow>();
    for (const r of fixRows) if (!m.has(r.url)) m.set(r.url, r);
    return m;
  }, [fixRows]);

  // Age (in days) of an unresolved fix row, or null when resolved/unknown.
  const unresolvedAgeDays = useCallback((url: string): number | null => {
    const fx = fixByUrl.get(url);
    if (!fx || fx.status === "applied") return null;
    return (Date.now() - new Date(fx.updated_at).getTime()) / 86400000;
  }, [fixByUrl]);

  // Apply search + unresolved-only + unresolved-age filters to each bucket.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const apply = (items: Inspection[]) =>
      items.filter((it) => {
        if (q && !it.url.toLowerCase().includes(q)) return false;
        if (unresolvedOnly && fixByUrl.get(it.url)?.status === "applied") return false;
        if (ageFilterOn) {
          const age = unresolvedAgeDays(it.url);
          if (age === null || age < ageDays) return false;
        }
        return true;
      });
    return { errors: apply(buckets.errors), warnings: apply(buckets.warnings), ok: apply(buckets.ok) };
  }, [buckets, search, unresolvedOnly, fixByUrl, ageFilterOn, ageDays, unresolvedAgeDays]);

  // Notify when Errors/Warnings counts change past the configured thresholds.
  useEffect(() => {
    if (!summary) return;
    const next = { errors: buckets.errors.length, warnings: buckets.warnings.length };
    const prev = prevCountsRef.current;
    prevCountsRef.current = next;
    const cfg = notifyRef.current;
    if (!prev || !cfg.enabled) return;

    const errDelta = Math.abs(next.errors - prev.errors);
    const warnDelta = Math.abs(next.warnings - prev.warnings);
    const errHit = errDelta >= Math.max(1, cfg.errorThreshold);
    const warnHit = warnDelta >= Math.max(1, cfg.warningThreshold);
    if (!errHit && !warnHit) return;

    const body = `Errors ${prev.errors} → ${next.errors}, Warnings ${prev.warnings} → ${next.warnings}`;
    if (cfg.channelToast) toast({ title: "Indexing counts changed", description: body });
    if (cfg.channelBrowser) {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Indexing counts changed", { body });
        }
      } catch { /* notifications unavailable */ }
    }
  }, [summary, buckets]);

  function updateNotify(patch: Partial<NotifySettings>) {
    setNotify((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(NOTIFY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  async function toggleNotifyChannel(kind: "channelToast" | "channelBrowser", on: boolean) {
    updateNotify({ [kind]: on } as Partial<NotifySettings>);
    if (kind === "channelBrowser" && on && typeof Notification !== "undefined" && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
  }

  const stale = lastFetched ? (Date.now() - lastFetched.getTime()) / 3600000 >= STALE_HOURS : false;
  const unresolved = fixRows.filter((r) => r.status !== "applied");
  const agingCount = unresolved.filter(
    (r) => (Date.now() - new Date(r.updated_at).getTime()) / 86400000 >= ageDays,
  ).length;


  function toggleSelected(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }

  async function bulkMarkApplied() {
    const urls = Array.from(selected);
    if (!urls.length) return;
    setBulkSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = urls.map((url) => ({
      url,
      status: "applied" as const,
      notes: bulkNote.trim() || null,
      updated_by: userData?.user?.id ?? null,
    }));
    const { error } = await supabase
      .from("indexing_fix_status")
      .upsert(payload, { onConflict: "url" });
    setBulkSaving(false);
    if (error) {
      toast({ title: "Bulk update failed", description: error.message, variant: "destructive" });
      return;
    }
    setSelected(new Set());
    setBulkNote("");
    await loadFixRows();
    toast({ title: `Marked ${urls.length} URL${urls.length > 1 ? "s" : ""} as Applied` });
  }

  function exportCsv() {
    const rows = summary?.inspections ?? [];
    if (!rows.length) { toast({ title: "Nothing to export" }); return; }
    const header = ["URL","Bucket","Verdict","Coverage","Robots","Indexing","PageFetch","LastCrawled","GoogleCanonical","UserCanonical","ReferringPage","Clicks","Impressions"];
    const lines = [header.join(",")];
    for (const it of rows) {
      const idx = it.result?.inspectionResult?.indexStatusResult ?? {};
      const v = idx.verdict;
      const bucket = v === "FAIL" ? "Error" : v === "PARTIAL" || v === "NEUTRAL" ? "Warning" : "OK";
      lines.push([it.url, bucket, v ?? "", idx.coverageState ?? "", idx.robotsTxtState ?? "", idx.indexingState ?? "", idx.pageFetchState ?? "", idx.lastCrawlTime ?? "", idx.googleCanonical ?? "", idx.userCanonical ?? "", idx.referringUrls?.[0] ?? "", it.clicks ?? "", it.impressions ?? ""].map(csvEscape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `indexing-issues-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  /** Re-inspect only the URLs currently selected, sequentially to stay under GSC quota. */
  async function bulkRecheckSelected() {
    const urls = Array.from(selected);
    if (!urls.length) return;
    setBulkRechecking(true);
    let ok = 0, failed = 0;
    for (const url of urls) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase.functions.invoke("gsc-indexing", {
        body: { action: "inspect", url },
      });
      if (error) { failed++; continue; }
      ok++;
      setSummary((prev) => {
        if (!prev) return prev;
        const inspections = prev.inspections.map((it) =>
          it.url === url ? { ...it, result: data?.result ?? it.result } : it,
        );
        if (!inspections.some((it) => it.url === url) && data?.result) inspections.push({ url, result: data.result });
        return { ...prev, inspections };
      });
    }
    setBulkRechecking(false);
    setLastFetched(new Date());
    toast({
      title: `Rechecked ${ok} URL${ok === 1 ? "" : "s"}`,
      description: failed ? `${failed} failed` : undefined,
      variant: failed ? "destructive" : undefined,
    });
  }

  /** CSV of unresolved fixes only, with latest status/notes plus history timeline fields. */
  async function exportUnresolvedCsv() {
    if (!unresolved.length) { toast({ title: "Nothing to export" }); return; }
    setExportingUnresolved(true);
    const urls = unresolved.map((r) => r.url);
    const { data: history } = await supabase
      .from("indexing_fix_history")
      .select("url,status,action_title,notes,changed_by_email,created_at")
      .in("url", urls)
      .order("created_at", { ascending: false });

    const byUrl = new Map<string, any[]>();
    for (const h of history ?? []) {
      const list = byUrl.get(h.url) ?? [];
      list.push(h);
      byUrl.set(h.url, list);
    }

    const header = [
      "URL","CurrentStatus","ActionTitle","Notes","LastUpdated","UnresolvedAgeDays","Verdict","Coverage",
      "HistoryEntries","LastChangeAt","LastChangeBy","LastChangeStatus","LastChangeNotes","HistoryTimeline",
    ];
    const lines = [header.join(",")];
    for (const r of unresolved) {
      const hist = byUrl.get(r.url) ?? [];
      const last = hist[0];
      const insp = (summary?.inspections ?? []).find((i) => i.url === r.url);
      const idx = insp?.result?.inspectionResult?.indexStatusResult ?? {};
      const timeline = hist
        .map((h) => `${new Date(h.created_at).toISOString()} | ${h.status} | ${h.changed_by_email ?? "unknown"} | ${(h.action_title ?? "").replace(/\|/g, "/")} | ${(h.notes ?? "").replace(/\s+/g, " ")}`)
        .join(" ;; ");
      lines.push([
        r.url,
        r.status,
        r.action_title ?? "",
        r.notes ?? "",
        r.updated_at,
        ((Date.now() - new Date(r.updated_at).getTime()) / 86400000).toFixed(1),
        idx.verdict ?? "",
        idx.coverageState ?? "",
        hist.length,
        last?.created_at ?? "",
        last?.changed_by_email ?? "",
        last?.status ?? "",
        last?.notes ?? "",
        timeline,
      ].map(csvEscape).join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href; a.download = `unresolved-indexing-fixes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(href);
    setExportingUnresolved(false);
  }


  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Indexing Issues</h2>
        <p className="text-sm text-muted-foreground">
          Google Search Console coverage for <code>https://dubaiborkahouse.com/</code>. Auto-refreshes every {Math.round(AUTO_REFRESH_MS / 60000)} min.
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-muted-foreground">
            Last updated: {lastFetched ? `${fmt(lastFetched)} (${relative(lastFetched)})` : "—"}
          </span>
          {stale && (
            <Badge variant="destructive" className="ml-1">Stale · older than {STALE_HOURS}h</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => { retriedRef.current = false; loadSites(); loadSummary(); loadFixRows(); }} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!(summary?.inspections?.length)}>
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
        <Button size="sm" variant="outline" onClick={exportUnresolvedCsv} disabled={!unresolved.length || exportingUnresolved}>
          <Download className="w-4 h-4 mr-2" />
          {exportingUnresolved ? "Exporting…" : `Export unresolved (${unresolved.length})`}
        </Button>
      </div>

      {/* Notification settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" /> Notification settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch id="notify-toggle" checked={notify.enabled} onCheckedChange={(v) => updateNotify({ enabled: v })} />
            <Label htmlFor="notify-toggle" className="text-sm">Alert me when Errors/Warnings change after a refresh</Label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Channels</div>
              <div className="flex items-center gap-2">
                <Switch id="ch-toast" checked={notify.channelToast} disabled={!notify.enabled}
                  onCheckedChange={(v) => toggleNotifyChannel("channelToast", v)} />
                <Label htmlFor="ch-toast" className="text-sm">In-app toast</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="ch-browser" checked={notify.channelBrowser} disabled={!notify.enabled}
                  onCheckedChange={(v) => toggleNotifyChannel("channelBrowser", v)} />
                <Label htmlFor="ch-browser" className="text-sm">Browser notification</Label>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Thresholds (minimum change to alert)</div>
              <div className="flex items-center gap-2">
                <Label htmlFor="th-err" className="text-sm w-24">Errors ±</Label>
                <Input id="th-err" type="number" min={1} className="w-24" disabled={!notify.enabled}
                  value={notify.errorThreshold}
                  onChange={(e) => updateNotify({ errorThreshold: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="th-warn" className="text-sm w-24">Warnings ±</Label>
                <Input id="th-warn" type="number" min={1} className="w-24" disabled={!notify.enabled}
                  value={notify.warningThreshold}
                  onChange={(e) => updateNotify({ warningThreshold: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search URLs…"
              aria-label="Search URLs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="unresolved-only" checked={unresolvedOnly} onCheckedChange={setUnresolvedOnly} />
            <Label htmlFor="unresolved-only" className="text-sm">Unresolved only</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="age-filter" checked={ageFilterOn} onCheckedChange={setAgeFilterOn} />
            <Label htmlFor="age-filter" className="text-sm whitespace-nowrap">Unresolved older than</Label>
            <Input
              type="number"
              min={1}
              className="w-20"
              value={ageDays}
              aria-label="Unresolved age in days"
              onChange={(e) => {
                const n = Math.max(1, Number(e.target.value) || 1);
                setAgeDays(n);
                try { localStorage.setItem(AGE_KEY, String(n)); } catch { /* ignore */ }
              }}
            />
            <span className="text-sm text-muted-foreground">days</span>
            {agingCount > 0 && <Badge variant="destructive">{agingCount} aging</Badge>}
          </div>
          {(search || unresolvedOnly || ageFilterOn) && (
            <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setUnresolvedOnly(false); setAgeFilterOn(false); }}>Clear</Button>
          )}
        </CardContent>
      </Card>


      {/* Bulk actions */}
      {selected.size > 0 && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{selected.size} URL{selected.size > 1 ? "s" : ""} selected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={2}
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              placeholder="Shared note applied to all selected URLs (what did you fix?)"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={bulkMarkApplied} disabled={bulkSaving}>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {bulkSaving ? "Saving…" : "Mark selected as Applied"}
              </Button>
              <Button size="sm" variant="outline" onClick={bulkRecheckSelected} disabled={bulkRechecking}>
                <RefreshCw className={`w-4 h-4 mr-1 ${bulkRechecking ? "animate-spin" : ""}`} />
                {bulkRechecking ? "Rechecking…" : "Recheck selected URLs"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>

            </div>
          </CardContent>
        </Card>
      )}

      {connected === false && (
        <Card className="border-amber-500/50">
          <CardHeader><CardTitle className="text-amber-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Not connected</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Google Search Console isn't linked, or <code>https://dubaiborkahouse.com/</code> isn't a verified property on this account. Verify it in GSC to see live indexing data.
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-500/50"><CardContent className="pt-4 text-sm text-red-600">Error: {error}</CardContent></Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="w-4 h-4" /> Unresolved fixes ({unresolved.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {unresolved.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing pending. Open any URL's Details to record a fix.</div>
          ) : (
            <div className="divide-y">
              {unresolved.map((r) => (
                <div key={r.url} className="py-2 text-sm flex flex-wrap items-center gap-2 justify-between">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <Checkbox
                      className="mt-0.5"
                      checked={selected.has(r.url)}
                      onCheckedChange={() => toggleSelected(r.url)}
                      aria-label={`Select ${r.url}`}
                    />
                    <div className="min-w-0">
                      <Link to={`/admin/indexing-issues/${encodeURIComponent(r.url)}`} className="font-mono text-xs hover:underline break-all">{r.url}</Link>
                      {r.action_title && <div className="text-muted-foreground text-xs">{r.action_title}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {fixStatusBadge(r.status)}
                    {(Date.now() - new Date(r.updated_at).getTime()) / 86400000 >= ageDays && (
                      <Badge variant="destructive">
                        Aging · {Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 86400000)}d
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{relative(new Date(r.updated_at))}</span>
                  </div>

                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Verified properties</CardTitle></CardHeader>
        <CardContent>
          {sites && sites.length > 0 ? (
            <ul className="text-sm space-y-1">
              {sites.map((s: any) => (
                <li key={s.siteUrl} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <code>{s.siteUrl}</code>
                  <span className="text-muted-foreground">— {s.permissionLevel}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">No verified properties found.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Inspect a URL</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded px-3 py-2 text-sm bg-background"
              value={singleUrl}
              onChange={(e) => setSingleUrl(e.target.value)}
              placeholder="https://dubaiborkahouse.com/some-page"
            />
            <Button size="sm" onClick={inspectOne} disabled={inspectLoading}>
              {inspectLoading ? "Inspecting…" : "Inspect"}
            </Button>
            <Link to={`/admin/indexing-issues/${encodeURIComponent(singleUrl)}`}>
              <Button size="sm" variant="secondary">Details</Button>
            </Link>
          </div>
          {singleResult && (
            <div className="text-sm space-y-1">
              <div>Verdict: {verdictBadge(singleResult?.inspectionResult?.indexStatusResult?.verdict)}</div>
              <div>Coverage: <code>{singleResult?.inspectionResult?.indexStatusResult?.coverageState ?? "—"}</code></div>
              <div>Last crawled: {fmt(singleResult?.inspectionResult?.indexStatusResult?.lastCrawlTime)}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {(["errors", "warnings", "ok"] as const).map((key) => {
        const items = filtered[key];
        const total = buckets[key].length;
        const title = key === "errors" ? "Errors" : key === "warnings" ? "Warnings" : "Indexed OK";
        const Icon = key === "errors" ? XCircle : key === "warnings" ? AlertTriangle : CheckCircle2;
        const color = key === "errors" ? "text-red-600" : key === "warnings" ? "text-amber-600" : "text-emerald-600";
        return (
          <Card key={key}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${color}`}>
                <Icon className="w-4 h-4" /> {title} ({items.length}{items.length !== total ? ` of ${total}` : ""})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-sm text-muted-foreground">None.</div>
              ) : (
                <div className="divide-y">
                  {items.map((it) => {
                    const idx = it.result?.inspectionResult?.indexStatusResult ?? {};
                    const busy = !!rowLoading[it.url];
                    const fx = fixByUrl.get(it.url);
                    return (
                      <div key={it.url} className="py-3 text-sm">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <Checkbox
                              checked={selected.has(it.url)}
                              onCheckedChange={() => toggleSelected(it.url)}
                              aria-label={`Select ${it.url}`}
                            />
                            <a href={it.url} target="_blank" rel="noreferrer" className="font-mono text-xs md:text-sm truncate max-w-full inline-flex items-center gap-1 hover:underline">
                              {it.url} <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <div className="flex items-center gap-2">
                            {fx && fixStatusBadge(fx.status)}
                            {(() => {
                              const age = unresolvedAgeDays(it.url);
                              return age !== null && age >= ageDays
                                ? <Badge variant="destructive">Aging · {Math.floor(age)}d</Badge>
                                : null;
                            })()}

                            {verdictBadge(idx.verdict)}
                            <Button size="sm" variant="outline" onClick={() => recheckRow(it.url)} disabled={busy}>
                              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${busy ? "animate-spin" : ""}`} />
                              Recheck now
                            </Button>
                            <Link to={`/admin/indexing-issues/${encodeURIComponent(it.url)}`}>
                              <Button size="sm" variant="ghost">View details</Button>
                            </Link>
                          </div>
                        </div>
                        <div className="text-muted-foreground mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
                          <span>Coverage: <code>{idx.coverageState ?? "—"}</code></span>
                          <span>Robots: <code>{idx.robotsTxtState ?? "—"}</code></span>
                          <span>Indexing: <code>{idx.indexingState ?? "—"}</code></span>
                          <span>Last crawled: {fmt(idx.lastCrawlTime)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
