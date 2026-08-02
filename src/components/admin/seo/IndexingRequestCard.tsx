import { useEffect, useState } from "react";
import { Loader2, Send, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BASE_URL } from "@/lib/seo/metaGenerator";
import { KEYWORD_LANDING_PAGES } from "@/lib/seo/keywordLandingPages";

interface IndexingRow {
  id: string;
  url: string;
  request_type: string;
  status: string;
  http_status: number | null;
  error: string | null;
  created_at: string;
}

const DEFAULT_URLS = [
  `${BASE_URL}/`,
  `${BASE_URL}/shop`,
  ...KEYWORD_LANDING_PAGES.slice(0, 6).map((p) => `${BASE_URL}/collections/${p.slug}`),
].join("\n");

/**
 * Sends URL indexing requests to Google (Indexing API via the Search Console
 * connector) instead of only re-submitting the sitemap, and shows the log.
 */
const IndexingRequestCard = () => {
  const [urls, setUrls] = useState(DEFAULT_URLS);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<IndexingRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("gsc-indexing", {
      body: { action: "indexing-history", limit: 30 },
    });
    setLoading(false);
    if (error) {
      toast.error("হিস্ট্রি লোড করা যায়নি", { description: error.message });
      return;
    }
    setHistory((data?.rows ?? []) as IndexingRow[]);
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const send = async () => {
    const list = urls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    if (list.length === 0) {
      toast.error("অন্তত একটি URL দিন");
      return;
    }
    setSending(true);
    const { data, error } = await supabase.functions.invoke("gsc-indexing", {
      body: { action: "request-indexing", urls: list, type: "URL_UPDATED" },
    });
    setSending(false);

    if (error) {
      toast.error("ইনডেক্সিং রিকোয়েস্ট ব্যর্থ", { description: error.message });
      return;
    }
    if (data?.connected === false) {
      toast.error("Google Search Console কানেক্ট করা নেই");
      return;
    }
    const sent = data?.sent ?? 0;
    const failed = data?.failed ?? 0;
    if (failed > 0) {
      toast.warning(`${sent}টি সফল, ${failed}টি ব্যর্থ`, {
        description: data?.results?.find((r: { ok: boolean }) => !r.ok)?.response?.error?.message,
      });
    } else {
      toast.success(`${sent}টি URL ইনডেক্সিংয়ের জন্য পাঠানো হয়েছে`);
    }
    await loadHistory();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="w-4 h-4" /> Google Indexing API রিকোয়েস্ট
        </CardTitle>
        <CardDescription>
          নতুন/আপডেটেড URL সরাসরি Google-এ পাঠান — sitemap resubmit-এর অপেক্ষা করতে হবে না।
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="indexing-urls">URL তালিকা (প্রতি লাইনে একটি, সর্বোচ্চ ৫০)</Label>
          <Textarea
            id="indexing-urls"
            rows={6}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => void send()} disabled={sending}>
            {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            ইনডেক্সিং রিকোয়েস্ট পাঠান
          </Button>
          <Button variant="outline" onClick={() => void loadHistory()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> হিস্ট্রি
          </Button>
        </div>

        <div aria-live="polite" className="space-y-1.5">
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">এখনো কোনো রিকোয়েস্ট পাঠানো হয়নি।</p>
          ) : (
            history.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                <span className="font-mono truncate">{row.url}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <Badge variant={row.status === "sent" ? "secondary" : "destructive"}>
                    {row.status === "sent" ? (
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                    ) : (
                      <XCircle className="w-3 h-3 mr-1" />
                    )}
                    {row.http_status ?? row.status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("bn-BD")}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default IndexingRequestCard;
