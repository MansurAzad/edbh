/**
 * Admin → Inventory Sync
 *
 * Surfaces the Inventory Sync REST API to admins:
 *  - Shows the base URL and the expected header (`x-api-key`)
 *  - "Test connection" button that pings the edge function (anon-key proxied)
 *  - Recent audit log (who hit which endpoint, status, record count)
 *  - Copy-paste cURL / JavaScript / Python snippets for the developer
 *
 * The actual API key is **never** rendered here — it lives only as a server-side
 * secret. The admin clicks "Rotate" to regenerate it (handled in Project Settings).
 */
import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Copy, RefreshCw, Plug, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/inventory-sync`;

interface AuditRow {
  id: string;
  endpoint: string;
  method: string;
  ip: string | null;
  status_code: number | null;
  record_count: number | null;
  product_id: string | null;
  error_message: string | null;
  created_at: string;
}

export default function InventorySync() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [apiKey, setApiKey] = useState(""); // user pastes their key locally only for the test
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<null | {
    ok: boolean;
    status: number | null;
    error: string | null;
    url: string | null;
  }>(null);

  // Load audit log + webhook settings
  const loadAll = async () => {
    setLoading(true);
    const [{ data: rows }, { data: settings }] = await Promise.all([
      supabase
        .from("inventory_sync_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["inventory_webhook_url", "inventory_webhook_enabled"]),
    ]);
    setLogs((rows as AuditRow[]) ?? []);
    if (settings) {
      const urlRow = settings.find((s: any) => s.key === "inventory_webhook_url");
      const enRow = settings.find((s: any) => s.key === "inventory_webhook_enabled");
      setWebhookUrl((urlRow?.value as any)?.url ?? "");
      setWebhookEnabled(!!(enRow?.value as any)?.enabled);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("কপি হয়েছে / Copied");
  };

  const testConnection = async () => {
    if (!apiKey.trim()) {
      toast.error("API key দিন / Enter your API key first");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${FUNCTION_BASE}/ping`, {
        headers: { "x-api-key": apiKey.trim() },
      });
      const json = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, msg: `Connected — server time ${json.time}` });
      } else {
        setTestResult({ ok: false, msg: json.error ?? `HTTP ${res.status}` });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message ?? "Network error" });
    } finally {
      setTesting(false);
      loadAll();
    }
  };

  const saveWebhook = async () => {
    setSavingWebhook(true);
    const { error: e1 } = await supabase
      .from("system_settings")
      .update({ value: { url: webhookUrl } })
      .eq("key", "inventory_webhook_url");
    const { error: e2 } = await supabase
      .from("system_settings")
      .update({ value: { enabled: webhookEnabled } })
      .eq("key", "inventory_webhook_enabled");
    setSavingWebhook(false);
    if (e1 || e2) {
      toast.error("সেভ করা যায়নি / Failed to save");
    } else {
      toast.success("সেভ হয়েছে / Saved");
    }
  };

  /** Send a signed test payload to the configured webhook URL. */
  const testWebhook = async () => {
    if (!apiKey.trim()) {
      toast.error("আগে API key দিন / Enter your API key in the Test connection field first");
      return;
    }
    if (!webhookUrl.trim() || !webhookEnabled) {
      toast.error("Webhook URL সেট ও enabled থাকতে হবে / Set & enable the webhook URL first");
      return;
    }
    setTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await fetch(`${FUNCTION_BASE}/test-webhook`, {
        method: "POST",
        headers: { "x-api-key": apiKey.trim(), "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      setWebhookTestResult({
        ok: !!data.delivered,
        status: data.status ?? null,
        error: data.error ?? null,
        url: data.url ?? null,
      });
    } catch (e: any) {
      setWebhookTestResult({ ok: false, status: null, error: e?.message ?? "Network error", url: null });
    } finally {
      setTestingWebhook(false);
      loadAll();
    }
  };





  // ---- Code snippets ----
  // Cursor mode is preferred for incremental sync — pass `cursor=` (empty on first
  // call) and follow `pagination.next_cursor` until `has_more` is false.
  const curlList = `# Page mode
curl -H "x-api-key: YOUR_KEY" \\
  "${FUNCTION_BASE}/products?page=1&per_page=50&updated_since=2026-01-01T00:00:00Z"

# Cursor mode (recommended for incremental sync)
curl -H "x-api-key: YOUR_KEY" \\
  "${FUNCTION_BASE}/products?cursor=&per_page=100&updated_since=2026-01-01T00:00:00Z"`;

  const curlStock = `curl -X POST -H "x-api-key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"stock": 25}' \\
  "${FUNCTION_BASE}/products/PRODUCT_UUID/stock"`;

  const jsSnippet = `const res = await fetch("${FUNCTION_BASE}/products?per_page=100", {
  headers: { "x-api-key": process.env.LOVABLE_INVENTORY_KEY }
});
const { products, pagination } = await res.json();
console.log(\`Fetched \${products.length} of \${pagination.total} products\`);`;

  const pySnippet = `import os, requests
res = requests.get(
    "${FUNCTION_BASE}/products",
    headers={"x-api-key": os.environ["LOVABLE_INVENTORY_KEY"]},
    params={"per_page": 100, "updated_since": "2026-01-01T00:00:00Z"},
)
data = res.json()
for p in data["products"]:
    print(p["id"], p["name"], p["stock"])`;

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Inventory Sync API</h1>
          <p className="text-muted-foreground text-sm mt-1">
            আপনার external inventory software-এর জন্য secure JSON API — products
            pull করুন, stock/price push করুন।
          </p>
        </div>

        {/* Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="w-5 h-5" /> Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Base URL</Label>
              <div className="flex gap-2 mt-1">
                <Input readOnly value={FUNCTION_BASE} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copy(FUNCTION_BASE)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label>Required header</Label>
              <Input readOnly value="x-api-key: <INVENTORY_SYNC_API_KEY>" className="font-mono text-xs mt-1" />
              <p className="text-xs text-muted-foreground mt-1">
                Key টি Project Settings → Secrets-এ saved আছে। Rotate করতে চাইলে
                সেখানে গিয়ে value update করুন।
              </p>
            </div>

            <div className="border-t pt-4">
              <Label>Test connection (একবার আপনার key paste করুন)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="password"
                  placeholder="Paste INVENTORY_SYNC_API_KEY"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <Button onClick={testConnection} disabled={testing}>
                  {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Test"}
                </Button>
              </div>
              {testResult && (
                <div
                  className={`mt-2 text-sm flex items-center gap-2 ${
                    testResult.ok ? "text-green-600" : "text-destructive"
                  }`}
                >
                  {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {testResult.msg}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Webhook */}
        <Card>
          <CardHeader>
            <CardTitle>Real-time webhook (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Product create/update হলে এই URL-এ POST হবে। (Webhook delivery
              implementation আসছে — এখন setting save করতে পারবেন।)
            </p>
            <div>
              <Label>Webhook URL</Label>
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-inventory.example.com/lovable-webhook"
                className="font-mono text-xs mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={webhookEnabled} onCheckedChange={setWebhookEnabled} />
              <Label className="text-sm">Enabled</Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveWebhook} disabled={savingWebhook} size="sm">
                {savingWebhook ? "Saving…" : "Save webhook settings"}
              </Button>
              <Button
                onClick={testWebhook}
                disabled={testingWebhook}
                size="sm"
                variant="outline"
              >
                {testingWebhook ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  "Test webhook (send signed sample)"
                )}
              </Button>
            </div>
            {webhookTestResult && (
              <div
                className={`text-sm flex items-start gap-2 ${
                  webhookTestResult.ok ? "text-green-600" : "text-destructive"
                }`}
              >
                {webhookTestResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                )}
                <div className="font-mono text-xs break-all">
                  {webhookTestResult.ok
                    ? `Delivered → HTTP ${webhookTestResult.status} (${webhookTestResult.url})`
                    : `Failed${
                        webhookTestResult.status ? ` (HTTP ${webhookTestResult.status})` : ""
                      }: ${webhookTestResult.error ?? "unknown"}`}
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Signed with header <code className="font-mono">x-lovable-signature: sha256=…</code>{" "}
              (HMAC-SHA256 of the raw body using <code>INVENTORY_WEBHOOK_SECRET</code>).
            </p>
          </CardContent>
        </Card>

        {/* Client helpers */}
        <Card>
          <CardHeader>
            <CardTitle>Client helpers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground text-xs">
              Drop-in clients with built-in API-key auth, 429 retry, and cursor-pagination iterators.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <a href="/clients/inventory-sync-client.js" download>
                  Download JS client
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href="/clients/inventory_sync_client.py" download>
                  Download Python client
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>


        {/* Snippets */}
        <Card>
          <CardHeader>
            <CardTitle>Code samples</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="curl">
              <TabsList>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="js">JavaScript</TabsTrigger>
                <TabsTrigger value="py">Python</TabsTrigger>
              </TabsList>
              <TabsContent value="curl" className="space-y-3">
                <Snippet title="List products" code={curlList} onCopy={copy} />
                <Snippet title="Update stock" code={curlStock} onCopy={copy} />
              </TabsContent>
              <TabsContent value="js">
                <Snippet title="Fetch products (Node/Browser)" code={jsSnippet} onCopy={copy} />
              </TabsContent>
              <TabsContent value="py">
                <Snippet title="Fetch products (Python)" code={pySnippet} onCopy={copy} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Audit log */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent activity
              <Button size="sm" variant="ghost" onClick={loadAll} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-3">Time</th>
                      <th className="pr-3">Method</th>
                      <th className="pr-3">Endpoint</th>
                      <th className="pr-3">Status</th>
                      <th className="pr-3">Records</th>
                      <th className="pr-3">IP</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {new Date(l.created_at).toLocaleString()}
                        </td>
                        <td className="pr-3 font-mono">{l.method}</td>
                        <td className="pr-3 font-mono">{l.endpoint}</td>
                        <td className="pr-3">
                          <Badge
                            variant={
                              !l.status_code
                                ? "secondary"
                                : l.status_code < 300
                                ? "default"
                                : l.status_code < 500
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {l.status_code ?? "-"}
                          </Badge>
                        </td>
                        <td className="pr-3">{l.record_count ?? "-"}</td>
                        <td className="pr-3 font-mono">{l.ip ?? "-"}</td>
                        <td className="text-destructive">{l.error_message ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function Snippet({
  title,
  code,
  onCopy,
}: {
  title: string;
  code: string;
  onCopy: (s: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs">{title}</Label>
        <Button size="sm" variant="ghost" onClick={() => onCopy(code)}>
          <Copy className="w-3 h-3 mr-1" /> Copy
        </Button>
      </div>
      <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto font-mono whitespace-pre-wrap">
        {code}
      </pre>
    </div>
  );
}
