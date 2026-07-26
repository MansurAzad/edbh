/**
 * Indexing Issues Panel
 * Fetches GSC URL Inspection data via `gsc-indexing` edge function and shows:
 *  - Connection status
 *  - Verified sites list
 *  - Per-URL coverage/index verdict, last crawled, referring page, and errors/warnings
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle, ExternalLink } from "lucide-react";

type Inspection = {
  url: string;
  clicks?: number;
  impressions?: number;
  result: any;
};

function verdictBadge(v?: string) {
  if (v === "PASS") return <Badge className="bg-emerald-600">Pass</Badge>;
  if (v === "PARTIAL") return <Badge className="bg-amber-600">Warning</Badge>;
  if (v === "FAIL") return <Badge variant="destructive">Fail</Badge>;
  if (v === "NEUTRAL") return <Badge variant="secondary">Neutral</Badge>;
  return <Badge variant="outline">{v ?? "Unknown"}</Badge>;
}

function fmt(ts?: string) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

export default function IndexingIssues() {
  const [loading, setLoading] = useState(false);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [sites, setSites] = useState<any[] | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<{
    inspections: Inspection[];
    analyticsError?: any;
    siteUrl?: string;
  } | null>(null);
  const [singleUrl, setSingleUrl] = useState("https://edbh.lovable.app/");
  const [singleResult, setSingleResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSites() {
    setLoading(true); setError(null);
    const { data, error } = await supabase.functions.invoke("gsc-indexing", {
      method: "GET" as any,
      body: undefined,
      headers: {} as any,
    } as any);
    if (error) { setError(error.message); setLoading(false); return; }
    setConnected(data?.connected ?? false);
    setSites(data?.siteEntry ?? []);
    setLoading(false);
  }

  async function loadSummary() {
    setLoading(true); setError(null);
    const { data, error } = await supabase.functions.invoke("gsc-indexing", {
      body: { action: "errors" },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    setConnected(data?.connected ?? false);
    setSummary(data);
    setLoading(false);
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
    // load sites+summary via GET+POST in parallel
    (async () => {
      await loadSites();
      await loadSummary();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Indexing Issues</h2>
        <p className="text-sm text-muted-foreground">
          Google Search Console coverage, last crawled time, and URLs affected by errors or warnings.
        </p>
      </div>


      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { loadSites(); loadSummary(); }} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {connected === false && (
        <Card className="border-amber-500/50">
          <CardHeader><CardTitle className="text-amber-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Not connected</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Google Search Console connector isn't linked yet, or the site
            <code className="mx-1 px-1 rounded bg-muted">https://edbh.lovable.app/</code>
            isn't verified. Verify via the META tag flow — it's already added to <code>index.html</code>.
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-500/50">
          <CardContent className="pt-4 text-sm text-red-600">Error: {error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Verified properties</CardTitle></CardHeader>
        <CardContent>
          {loading && !sites ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : sites && sites.length > 0 ? (
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
            <div className="text-sm text-muted-foreground">No verified properties found for this connection.</div>
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
              placeholder="https://edbh.lovable.app/some-page"
            />
            <Button size="sm" onClick={inspectOne} disabled={inspectLoading}>
              {inspectLoading ? "Inspecting…" : "Inspect"}
            </Button>
          </div>
          {singleResult && (
            <div className="text-sm space-y-1">
              <div>Verdict: {verdictBadge(singleResult?.inspectionResult?.indexStatusResult?.verdict)}</div>
              <div>Coverage state: <code>{singleResult?.inspectionResult?.indexStatusResult?.coverageState ?? "—"}</code></div>
              <div>Last crawled: {fmt(singleResult?.inspectionResult?.indexStatusResult?.lastCrawlTime)}</div>
              <div>Robots: <code>{singleResult?.inspectionResult?.indexStatusResult?.robotsTxtState ?? "—"}</code></div>
              <div>Indexing: <code>{singleResult?.inspectionResult?.indexStatusResult?.indexingState ?? "—"}</code></div>
            </div>
          )}
        </CardContent>
      </Card>

      {(["errors","warnings","ok"] as const).map((key) => {
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
                    return (
                      <div key={it.url} className="py-3 text-sm">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <a href={it.url} target="_blank" rel="noreferrer" className="font-mono text-xs md:text-sm truncate max-w-full inline-flex items-center gap-1 hover:underline">
                            {it.url} <ExternalLink className="w-3 h-3" />
                          </a>
                          {verdictBadge(idx.verdict)}
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
