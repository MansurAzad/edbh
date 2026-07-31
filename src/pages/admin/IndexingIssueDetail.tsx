/**
 * Per-URL Indexing Issue Detail
 * Deep-dives on a single URL's GSC inspection result and shows a plain-English
 * recommended fix mapped from the verdict + coverageState + robots/indexing state.
 */
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, ExternalLink, RefreshCw, Save } from "lucide-react";

type FixStatus = "unresolved" | "in_progress" | "applied";

type HistoryRow = {
  id: string;
  status: string;
  action_title: string | null;
  notes: string | null;
  changed_by_email: string | null;
  created_at: string;
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

/**
 * Map GSC state fields to actionable recommendations shown to the admin.
 * Keeps advice short and specific to the observed failure mode.
 */
function recommendFix(idx: any): { title: string; steps: string[] } {
  const verdict = idx?.verdict;
  const coverage: string = idx?.coverageState ?? "";
  const robots: string = idx?.robotsTxtState ?? "";
  const indexing: string = idx?.indexingState ?? "";

  if (robots === "DISALLOWED") {
    return {
      title: "Blocked by robots.txt",
      steps: [
        "Open public/robots.txt and remove the Disallow rule that matches this URL.",
        "Republish, then click Rescan in the SEO tab.",
        "In GSC → URL Inspection, click Request Indexing after the rescan.",
      ],
    };
  }
  if (indexing === "BLOCKED_BY_META_TAG" || indexing === "BLOCKED_BY_HTTP_HEADER") {
    return {
      title: "Blocked by noindex directive",
      steps: [
        "Remove the <meta name=\"robots\" content=\"noindex\"> tag or the X-Robots-Tag header for this route.",
        "Confirm the response no longer contains noindex using cURL or DevTools → Network.",
        "Republish and request indexing.",
      ],
    };
  }
  if (coverage.includes("Duplicate")) {
    return {
      title: "Duplicate / canonical mismatch",
      steps: [
        "Add or fix <link rel=\"canonical\" href=\"…\"> on this page to point to the preferred URL.",
        "Make sure only one URL variant is linked from navigation and sitemap.xml.",
        "If Google chose a different canonical, either accept it or 301-redirect the alternate.",
      ],
    };
  }
  if (coverage.includes("Not found") || coverage.includes("404")) {
    return {
      title: "Page returns 404",
      steps: [
        "Restore the page or add a 301 redirect from this URL to the closest live equivalent.",
        "Remove the URL from sitemap.xml if it is permanently gone.",
      ],
    };
  }
  if (coverage.includes("Redirect")) {
    return {
      title: "Redirect issue",
      steps: [
        "Verify the redirect target returns 200 and is itself canonical.",
        "Avoid redirect chains — one hop max.",
      ],
    };
  }
  if (coverage.includes("Crawled") && verdict !== "PASS") {
    return {
      title: "Crawled but not indexed",
      steps: [
        "Improve the page's unique content depth and internal links pointing to it.",
        "Ensure the URL is in sitemap.xml and linked from the homepage.",
        "Request indexing in GSC → URL Inspection.",
      ],
    };
  }
  if (coverage.includes("Discovered")) {
    return {
      title: "Discovered — not yet crawled",
      steps: [
        "Reduce server response time; Google throttles slow sites.",
        "Add stronger internal links to this URL.",
        "Wait a few days; request indexing manually if urgent.",
      ],
    };
  }
  if (verdict === "PASS") {
    return {
      title: "Indexed — no action needed",
      steps: ["This URL is indexed and eligible for Search. Keep content fresh."],
    };
  }
  return {
    title: "Review manually in Google Search Console",
    steps: [
      "Open Search Console → URL Inspection for this URL.",
      "Follow the specific reason Google surfaces there.",
    ],
  };
}

export default function IndexingIssueDetail() {
  const { encodedUrl } = useParams();
  const target = encodedUrl ? decodeURIComponent(encodedUrl) : "";
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Fix-status workflow state
  const [fixStatus, setFixStatus] = useState<FixStatus>("unresolved");
  const [fixTitle, setFixTitle] = useState("");
  const [fixNotes, setFixNotes] = useState("");
  const [fixSavedAt, setFixSavedAt] = useState<string | null>(null);
  const [savingFix, setSavingFix] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  async function load() {
    if (!target) return;
    setLoading(true); setError(null);
    const { data, error } = await supabase.functions.invoke("gsc-indexing", {
      body: { action: "inspect", url: target },
    });
    if (error) setError(error.message);
    else setResult(data?.result);
    setLoading(false);
  }

  async function loadFix() {
    if (!target) return;
    const { data } = await supabase
      .from("indexing_fix_status")
      .select("status,action_title,notes,updated_at")
      .eq("url", target)
      .maybeSingle();
    if (data) {
      setFixStatus(data.status as FixStatus);
      setFixTitle(data.action_title ?? "");
      setFixNotes(data.notes ?? "");
      setFixSavedAt(data.updated_at ?? null);
    }
  }

  async function loadHistory() {
    if (!target) return;
    const { data } = await supabase
      .from("indexing_fix_history")
      .select("id,status,action_title,notes,changed_by_email,created_at")
      .eq("url", target)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setHistory(data as HistoryRow[]);
  }

  useEffect(() => { load(); loadFix(); loadHistory(); /* eslint-disable-next-line */ }, [target]);

  async function saveFix() {
    if (!target) return;
    setSavingFix(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      url: target,
      status: fixStatus,
      action_title: fixTitle || null,
      notes: fixNotes || null,
      updated_by: userData?.user?.id ?? null,
    };
    const { data, error } = await supabase
      .from("indexing_fix_status")
      .upsert(payload, { onConflict: "url" })
      .select("updated_at")
      .maybeSingle();
    setSavingFix(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setFixSavedAt(data?.updated_at ?? new Date().toISOString());
    await loadHistory();
    toast({ title: "Fix status saved" });
  }


  const idx = result?.inspectionResult?.indexStatusResult ?? {};
  const mobile = result?.inspectionResult?.mobileUsabilityResult ?? {};
  const rich = result?.inspectionResult?.richResultsResult ?? {};
  const fix = recommendFix(idx);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/admin/indexing-issues">
          <Button size="sm" variant="ghost"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        </Link>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Recheck now
        </Button>
      </div>

      <div>
        <h2 className="text-xl font-semibold">Indexing detail</h2>
        <a href={target} target="_blank" rel="noreferrer" className="text-sm font-mono inline-flex items-center gap-1 hover:underline break-all">
          {target} <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {error && (
        <Card className="border-red-500/50"><CardContent className="pt-4 text-sm text-red-600">Error: {error}</CardContent></Card>
      )}

      <Card>
        <CardHeader><CardTitle>Verdict</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex items-center gap-2">Overall: {verdictBadge(idx.verdict)}</div>
          <div>Coverage: <code>{idx.coverageState ?? "—"}</code></div>
          <div>Robots: <code>{idx.robotsTxtState ?? "—"}</code></div>
          <div>Indexing: <code>{idx.indexingState ?? "—"}</code></div>
          <div>Page fetch: <code>{idx.pageFetchState ?? "—"}</code></div>
          <div>Last crawled: {fmt(idx.lastCrawlTime)}</div>
          <div>Referring page: <code>{idx.referringUrls?.[0] ?? "—"}</code></div>
          <div>Google-selected canonical: <code>{idx.googleCanonical ?? "—"}</code></div>
          <div>User-declared canonical: <code>{idx.userCanonical ?? "—"}</code></div>
          <div>Mobile usability: {verdictBadge(mobile.verdict)}</div>
          <div>Rich results: {verdictBadge(rich.verdict)}</div>
        </CardContent>
      </Card>

      <Card className="border-primary/40">
        <CardHeader><CardTitle>Recommended fix — {fix.title}</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <ol className="list-decimal ml-5 space-y-1">
            {fix.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Fix status</span>
            <Badge variant={fixStatus === "applied" ? "default" : fixStatus === "in_progress" ? "secondary" : "destructive"}>
              {fixStatus === "applied" ? "Applied" : fixStatus === "in_progress" ? "In progress" : "Unresolved"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={fixStatus} onValueChange={(v) => setFixStatus(v as FixStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unresolved">Unresolved</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="applied">Applied</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Action title</label>
              <Input
                value={fixTitle}
                onChange={(e) => setFixTitle(e.target.value)}
                placeholder={fix.title}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <Textarea
              rows={4}
              value={fixNotes}
              onChange={(e) => setFixNotes(e.target.value)}
              placeholder="What did you change? Which file/route? Any follow-up?"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {fixSavedAt ? `Last saved: ${fmt(fixSavedAt)}` : "Not saved yet"}
            </span>
            <Button size="sm" onClick={saveFix} disabled={savingFix}>
              <Save className="w-4 h-4 mr-1" /> {savingFix ? "Saving…" : "Save fix status"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fix history ({history.length})</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {history.length === 0 ? (
            <div className="text-muted-foreground">No changes recorded yet.</div>
          ) : (
            <ol className="relative border-l border-border ml-2 space-y-4">
              {history.map((h, i) => (
                <li key={h.id} className="ml-4">
                  <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={h.status === "applied" ? "default" : h.status === "in_progress" ? "secondary" : "destructive"}>
                      {h.status === "applied" ? "Applied" : h.status === "in_progress" ? "In progress" : "Unresolved"}
                    </Badge>
                    {i === 0 && <Badge variant="outline">Latest</Badge>}
                    <span className="text-xs text-muted-foreground">{fmt(h.created_at)}</span>
                    <span className="text-xs text-muted-foreground">· {h.changed_by_email ?? "unknown"}</span>
                  </div>
                  {h.action_title && <div className="mt-1 font-medium">{h.action_title}</div>}
                  {h.notes && <div className="text-muted-foreground whitespace-pre-wrap">{h.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader><CardTitle>Raw inspection payload</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap bg-muted rounded p-3 overflow-auto max-h-96">
            {JSON.stringify(result ?? {}, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

