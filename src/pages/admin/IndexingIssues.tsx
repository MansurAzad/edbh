/**
 * Indexing Issues Panel
 * Google Search Console coverage for https://dubaiborkahouse.com/.
 *
 * Adds:
 *  - Per-row "Recheck now" (forces a fresh URL inspection for that row).
 *  - Auto-refresh every AUTO_REFRESH_MS with a visible "last updated" stamp
 *    and a stale-data warning after STALE_HOURS.
 *  - Unresolved fixes list sourced from public.indexing_fix_status.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle, ExternalLink, Download, Clock, ListChecks } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const AUTO_REFRESH_MS = 15 * 60 * 1000; // 15 minutes
const STALE_HOURS = 6;

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

  async function loadFixRows() {
    const { data, error } = await supabase
      .from("indexing_fix_status")
      .select("url,status,action_title,notes,updated_at")
      .order("updated_at", { ascending: false });
    if (!error && data) setFixRows(data as FixRow[]);
  }

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
  }, [loadSummary]);

  // Auto-refresh every AUTO_REFRESH_MS
  useEffect(() => {
    const t = setInterval(() => { loadSummary(); loadFixRows(); }, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [loadSummary]);

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

  const stale = lastFetched ? (Date.now() - lastFetched.getTime()) / 3600000 >= STALE_HOURS : false;
  const unresolved = fixRows.filter((r) => r.status !== "applied");

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

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { retriedRef.current = false; loadSites(); loadSummary(); loadFixRows(); }} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!(summary?.inspections?.length)}>
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

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
                  <div className="min-w-0 flex-1">
                    <Link to={`/admin/indexing-issues/${encodeURIComponent(r.url)}`} className="font-mono text-xs hover:underline break-all">{r.url}</Link>
                    {r.action_title && <div className="text-muted-foreground text-xs">{r.action_title}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {fixStatusBadge(r.status)}
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
        const items = buckets[key];
        const title = key === "errors" ? "Errors" : key === "warnings" ? "Warnings" : "Indexed OK";
        const Icon = key === "errors" ? XCircle : key === "warnings" ? AlertTriangle : CheckCircle2;
        const color = key === "errors" ? "text-red-600" : key === "warnings" ? "text-amber-600" : "text-emerald-600";
        return (
          <Card key={key}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${color}`}>
                <Icon className="w-4 h-4" /> {title} ({items.length})
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
                    return (
                      <div key={it.url} className="py-3 text-sm">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <a href={it.url} target="_blank" rel="noreferrer" className="font-mono text-xs md:text-sm truncate max-w-full inline-flex items-center gap-1 hover:underline">
                            {it.url} <ExternalLink className="w-3 h-3" />
                          </a>
                          <div className="flex items-center gap-2">
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
