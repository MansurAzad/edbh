/**
 * @file CatalogFeedHealth.tsx
 * Admin widget that periodically re-fetches the Meta Catalog feed URLs
 * (XML + CSV) and surfaces:
 *   - HTTP status
 *   - item / row count
 *   - last generated timestamp (channel <lastBuildDate> or fetch time)
 *   - warnings when the feed is empty, malformed, or non-200
 *
 * Includes a "Test Feed" button that runs both XML + CSV checks on demand
 * and reports pass/fail with the parsed item count.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, PlayCircle, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type FeedStatus = "unknown" | "ok" | "warning" | "error";
interface FeedProbe {
  format: "xml" | "csv";
  url: string;
  status: FeedStatus;
  httpStatus: number | null;
  itemCount: number;
  lastGenerated: string | null;
  message: string;
  checkedAt: number;
}

const PROJECT_REF = "izeabmhtxtrelfqgkuua";
const XML_URL = `https://${PROJECT_REF}.functions.supabase.co/meta-catalog-feed?format=xml`;
const CSV_URL = `https://${PROJECT_REF}.functions.supabase.co/meta-catalog-feed?format=csv`;
const POLL_MS = 5 * 60 * 1000; // 5 minutes

function countXmlItems(xml: string): number {
  // Meta/Google feed items are wrapped in <item>…</item>. Count opening tags.
  return (xml.match(/<item\b/gi) || []).length;
}
function extractLastBuild(xml: string): string | null {
  const m = xml.match(/<lastBuildDate>([^<]+)<\/lastBuildDate>/i);
  return m ? m[1] : null;
}
function countCsvRows(csv: string): number {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return Math.max(0, lines.length - 1); // minus header
}

async function probeFeed(format: "xml" | "csv"): Promise<FeedProbe> {
  const url = format === "xml" ? XML_URL : CSV_URL;
  const checkedAt = Date.now();
  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.text();
    if (!res.ok) {
      return {
        format, url, status: "error", httpStatus: res.status,
        itemCount: 0, lastGenerated: null,
        message: `HTTP ${res.status} — feed did not return OK`,
        checkedAt,
      };
    }
    if (format === "xml") {
      const looksLikeRss = /<rss\b/i.test(body) && /<channel\b/i.test(body);
      const items = countXmlItems(body);
      if (!looksLikeRss) {
        return { format, url, status: "error", httpStatus: res.status, itemCount: 0,
          lastGenerated: null, message: "Malformed XML — <rss>/<channel> missing", checkedAt };
      }
      if (items === 0) {
        return { format, url, status: "warning", httpStatus: res.status, itemCount: 0,
          lastGenerated: extractLastBuild(body), message: "Feed is empty (0 items)", checkedAt };
      }
      return { format, url, status: "ok", httpStatus: res.status, itemCount: items,
        lastGenerated: extractLastBuild(body), message: `${items} products in feed`, checkedAt };
    }
    // CSV
    const rows = countCsvRows(body);
    if (!/^id\s*,/i.test(body)) {
      return { format, url, status: "error", httpStatus: res.status, itemCount: 0,
        lastGenerated: null, message: "Malformed CSV — header row missing 'id'", checkedAt };
    }
    if (rows === 0) {
      return { format, url, status: "warning", httpStatus: res.status, itemCount: 0,
        lastGenerated: null, message: "Feed is empty (0 rows)", checkedAt };
    }
    return { format, url, status: "ok", httpStatus: res.status, itemCount: rows,
      lastGenerated: null, message: `${rows} products in feed`, checkedAt };
  } catch (e: any) {
    return {
      format, url, status: "error", httpStatus: null, itemCount: 0,
      lastGenerated: null, message: e?.message || "Network error",
      checkedAt,
    };
  }
}

function StatusBadge({ status }: { status: FeedStatus }) {
  if (status === "ok") return <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Healthy</Badge>;
  if (status === "warning") return <Badge className="bg-amber-500 hover:bg-amber-500"><AlertTriangle className="w-3 h-3 mr-1" />Warning</Badge>;
  if (status === "error") return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
  return <Badge variant="outline">Unknown</Badge>;
}

export default function CatalogFeedHealth() {
  const { toast } = useToast();
  const [probes, setProbes] = useState<Record<"xml" | "csv", FeedProbe | null>>({ xml: null, csv: null });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  const runAll = useCallback(async (interactive = false) => {
    if (interactive) setTesting(true); else setLoading(true);
    const [xml, csv] = await Promise.all([probeFeed("xml"), probeFeed("csv")]);
    setProbes({ xml, csv });
    if (interactive) {
      setTesting(false);
      const worst = [xml.status, csv.status].includes("error") ? "error"
        : [xml.status, csv.status].includes("warning") ? "warning" : "ok";
      toast({
        title: worst === "ok" ? "Feed test passed" : worst === "warning" ? "Feed test — warning" : "Feed test failed",
        description: `XML: ${xml.message} · CSV: ${csv.message}`,
        variant: worst === "error" ? "destructive" : "default",
      });
    } else setLoading(false);
  }, [toast]);

  useEffect(() => {
    runAll(false);
    const t = setInterval(() => runAll(false), POLL_MS);
    return () => clearInterval(t);
  }, [runAll]);

  const overall = useMemo<FeedStatus>(() => {
    const s = [probes.xml?.status, probes.csv?.status];
    if (s.includes("error")) return "error";
    if (s.includes("warning")) return "warning";
    if (s.every((v) => v === "ok")) return "ok";
    return "unknown";
  }, [probes]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Feed Health Monitor <StatusBadge status={overall} />
            </CardTitle>
            <CardDescription>
              Auto re-checks every 5 minutes. Warns if the feed becomes empty, non-200, or malformed.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => runAll(false)} disabled={loading || testing}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => runAll(true)} disabled={testing || loading}>
              <PlayCircle className={`w-4 h-4 mr-1 ${testing ? "animate-pulse" : ""}`} />
              Test Feed
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {(["xml", "csv"] as const).map((fmt) => {
          const p = probes[fmt];
          return (
            <div key={fmt} className="p-3 rounded-md border bg-muted/40">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold uppercase text-xs tracking-wide">{fmt} feed</div>
                <StatusBadge status={p?.status ?? "unknown"} />
              </div>
              <div className="text-xs text-muted-foreground truncate mb-2" title={fmt === "xml" ? XML_URL : CSV_URL}>
                {fmt === "xml" ? XML_URL : CSV_URL}
              </div>
              <dl className="grid grid-cols-2 gap-y-1 text-xs">
                <dt className="text-muted-foreground">HTTP</dt>
                <dd>{p?.httpStatus ?? "—"}</dd>
                <dt className="text-muted-foreground">Item count</dt>
                <dd className={p && p.itemCount === 0 ? "text-amber-600 font-semibold" : ""}>{p?.itemCount ?? "—"}</dd>
                <dt className="text-muted-foreground">Last generated</dt>
                <dd>{p?.lastGenerated || (p ? new Date(p.checkedAt).toLocaleTimeString() : "—")}</dd>
                <dt className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />Last checked</dt>
                <dd>{p ? new Date(p.checkedAt).toLocaleTimeString() : "—"}</dd>
              </dl>
              {p && p.status !== "ok" && (
                <p className={`mt-2 text-xs ${p.status === "error" ? "text-destructive" : "text-amber-700"}`}>
                  {p.message}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
