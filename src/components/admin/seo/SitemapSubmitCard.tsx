/**
 * SitemapSubmitCard
 * Admin control for submitting the site's sitemaps to Google Search Console
 * and reading back their processing / indexing status.
 *
 * Talks to the `gsc-indexing` edge function:
 *   - { action: "sitemaps" }        → list submitted sitemaps + status
 *   - { action: "submit-sitemap" }  → (re)submit a sitemap URL
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, UploadCloud, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const DEFAULT_SITEMAPS = [
  "https://dubaiborkahouse.com/sitemap.xml",
  "https://izeabmhtxtrelfqgkuua.supabase.co/functions/v1/dynamic-sitemap",
];

type SitemapRow = {
  path?: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  warnings?: string | number;
  errors?: string | number;
  contents?: Array<{ type?: string; submitted?: string; indexed?: string }>;
};

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" }) : "—";

const SitemapSubmitCard = () => {
  const [rows, setRows] = useState<SitemapRow[]>([]);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState(DEFAULT_SITEMAPS[0]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gsc-indexing", {
        body: { action: "sitemaps" },
      });
      if (error) throw error;
      setConnected(data?.connected !== false);
      setRows(Array.isArray(data?.sitemap) ? data.sitemap : []);
    } catch (e) {
      toast({
        title: "সাইটম্যাপ স্ট্যাটাস আনা যায়নি",
        description: String((e as Error)?.message ?? e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    async (sitemapUrl: string) => {
      setSubmitting(sitemapUrl);
      try {
        const { data, error } = await supabase.functions.invoke("gsc-indexing", {
          body: { action: "submit-sitemap", sitemapUrl },
        });
        if (error) throw error;
        if (data?.ok === false) {
          throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
        }
        toast({ title: "সাইটম্যাপ সাবমিট হয়েছে", description: sitemapUrl });
        await load();
      } catch (e) {
        toast({
          title: "সাবমিট ব্যর্থ",
          description: String((e as Error)?.message ?? e),
          variant: "destructive",
        });
      } finally {
        setSubmitting(null);
      }
    },
    [load],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <UploadCloud className="w-4 h-4" />
          Sitemap ও Search Console
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          রিফ্রেশ
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!connected && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500" />
            <span>Google Search Console কানেক্টর এখনো যুক্ত হয়নি।</span>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://dubaiborkahouse.com/sitemap.xml"
            aria-label="Sitemap URL"
          />
          <Button onClick={() => void submit(customUrl)} disabled={!customUrl || submitting === customUrl}>
            {submitting === customUrl ? "সাবমিট হচ্ছে…" : "GSC-তে সাবমিট"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {DEFAULT_SITEMAPS.map((s) => (
            <Button
              key={s}
              variant="secondary"
              size="sm"
              onClick={() => void submit(s)}
              disabled={submitting === s}
            >
              {submitting === s ? "…" : s.includes("dynamic") ? "Dynamic sitemap সাবমিট" : "Static sitemap সাবমিট"}
            </Button>
          ))}
        </div>

        <div className="divide-y divide-border rounded-md border border-border">
          {rows.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {loading ? "লোড হচ্ছে…" : "কোনো সাবমিটেড সাইটম্যাপ পাওয়া যায়নি।"}
            </p>
          ) : (
            rows.map((r) => {
              const errors = Number(r.errors ?? 0);
              const warnings = Number(r.warnings ?? 0);
              const web = r.contents?.find((c) => c.type === "web");
              return (
                <div key={r.path} className="p-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium break-all">{r.path}</span>
                    {errors > 0 ? (
                      <Badge variant="destructive">{errors} error</Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="w-3 h-3" /> OK
                      </Badge>
                    )}
                    {warnings > 0 && <Badge variant="outline">{warnings} warning</Badge>}
                    {r.isPending && <Badge variant="outline">Pending</Badge>}
                  </div>
                  <p className="text-muted-foreground">
                    সাবমিট: {fmt(r.lastSubmitted)} · শেষ ক্রল: {fmt(r.lastDownloaded)}
                    {web ? ` · URL: ${web.indexed ?? 0}/${web.submitted ?? 0} indexed` : ""}
                  </p>
                  {r.path && (
                    <Button variant="ghost" size="sm" onClick={() => void submit(r.path!)} disabled={submitting === r.path}>
                      আবার সাবমিট
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SitemapSubmitCard;
