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
import { Copy, RefreshCw, Plug, AlertCircle, CheckCircle2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/inventory-sync`;
// Supabase's gateway requires the anon apikey on every /functions/v1/* call
// before the request reaches the function. External clients get this via
// verify_jwt=false + x-api-key only, but browser fetch must include it.
const GATEWAY_HEADERS = {
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
};

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

  // ---- Push-to-external-inventory state ----
  const [pushing, setPushing] = useState(false);
  const [dryRun, setDryRun] = useState(true); // default = safe preview
  const [incremental, setIncremental] = useState(true);
  const [concurrency, setConcurrency] = useState(4);
  const [productLimit, setProductLimit] = useState<number | "">(""); // empty = no limit
  const [lastPushAt, setLastPushAt] = useState<string | null>(null);
  const [resettingCheckpoint, setResettingCheckpoint] = useState(false);

  interface PushResultRow {
    product_id: string;
    name: string;
    action: "created" | "updated" | "failed" | "skipped" | "invalid";
    external_id?: string;
    status?: number;
    error?: string;
    attempts?: number;
    worker?: number;
  }
  interface ValidationErr {
    product_id: string;
    name: string;
    errors: string[];
  }
  interface LiveProgress {
    status?: "running" | "done";
    dry_run?: boolean;
    total: number;
    valid: number;
    invalid: number;
    done_count: number;
    created: number;
    updated: number;
    failed: number;
    retries: number;
    recent: Array<{ name: string; action: string; status?: number }>;
    in_flight: Array<{ worker: number; product_id: string; name: string; attempts: number }>;
    concurrency?: number;
    updated_at?: string;
  }
  const [pushResult, setPushResult] = useState<null | {
    dry_run: boolean;
    total: number;
    valid: number;
    invalid: number;
    created: number;
    updated: number;
    failed: number;
    retries?: number;
    since: string | null;
    last_synced_at: string | null;
    branch_id?: string | null;
    sample_payload?: Record<string, unknown> | null;
    validation_errors: ValidationErr[];
    results: PushResultRow[];
  }>(null);
  const [progress, setProgress] = useState<LiveProgress | null>(null);

  // --- Branch ID setting (sent with every push) ---
  const [branchId, setBranchIdState] = useState("");
  const [savingBranch, setSavingBranch] = useState(false);

  // --- External live-test state ---
  const [liveTesting, setLiveTesting] = useState(false);
  const [liveTestMethod, setLiveTestMethod] = useState<"GET" | "POST">("GET");
  const [liveTestPath, setLiveTestPath] = useState("/products");
  const [liveTestPayload, setLiveTestPayload] = useState(
    '{\n  "name": "Test Product",\n  "selling_price": 100,\n  "regular_price": 100,\n  "stock": 1,\n  "sku": "TEST-1"\n}',
  );
  const [liveTestResult, setLiveTestResult] = useState<null | {
    ok: boolean;
    method: string;
    url: string;
    status: number;
    latency_ms: number;
    headers?: Record<string, string>;
    body_text?: string;
    body_json?: unknown;
    error?: string;
  }>(null);

  /** Poll `system_settings.inventory_push_progress` while a push is in flight. */
  useEffect(() => {
    if (!pushing) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "inventory_push_progress")
        .maybeSingle();
      if (!cancelled && data?.value) setProgress(data.value as unknown as LiveProgress);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [pushing]);

  /** Trigger the server-side batch push (or dry-run) with current toggles. */
  const pushAllProducts = async () => {
    if (!dryRun && !confirm("Actual push শুরু হবে (dry-run নয়)। নিশ্চিত?")) return;
    setPushing(true);
    setPushResult(null);
    setProgress(null);
    try {
      const { data, error } = await supabase.functions.invoke("push-to-external-inventory", {
        body: {
          dry_run: dryRun,
          incremental,
          concurrency,
          limit: typeof productLimit === "number" ? productLimit : undefined,
          branch_id: branchId.trim() || undefined,
        },
      });
      if (error) throw error;
      setPushResult(data);
      if (data.last_synced_at) setLastPushAt(data.last_synced_at);
      if (dryRun) {
        toast.success(`Dry-run: ${data.valid}/${data.total} valid, ${data.invalid} invalid`);
      } else {
        toast.success(
          `Push সম্পন্ন: ${data.created + data.updated}/${data.total} success · ${data.failed} failed`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Push failed");
    } finally {
      setPushing(false);
    }
  };

  /** Clear the stored checkpoint so the next incremental run pushes everything. */
  const resetCheckpoint = async () => {
    if (!confirm("Checkpoint clear করা হবে — পরের incremental push সব products পাঠাবে। নিশ্চিত?")) return;
    setResettingCheckpoint(true);
    try {
      const { error } = await supabase.functions.invoke("push-to-external-inventory", {
        body: { reset_checkpoint: true, only_reset: true },
      });
      if (error) throw error;
      setLastPushAt(null);
      toast.success("Checkpoint reset হয়েছে");
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
    } finally {
      setResettingCheckpoint(false);
    }
  };


  /** Download failed + invalid rows as a CSV file. */
  const downloadFailedCsv = () => {
    if (!pushResult) return;
    const rows = [
      ...pushResult.validation_errors.map((v) => ({
        product_id: v.product_id,
        name: v.name,
        action: "invalid",
        status: "",
        attempts: "",
        error: v.errors.join(" | "),
      })),
      ...pushResult.results
        .filter((r) => r.action === "failed" || r.action === "invalid")
        .map((r) => ({
          product_id: r.product_id,
          name: r.name,
          action: r.action,
          status: r.status ?? "",
          attempts: r.attempts ?? "",
          error: r.error ?? "",
        })),
    ];
    if (rows.length === 0) {
      toast.info("কোনো failure নেই / No failures to export");
      return;
    }
    const headers = ["product_id", "name", "action", "status", "attempts", "error"];
    const esc = (v: any) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-sync-failures-${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Download full push report as JSON. */
  const downloadReportJson = () => {
    if (!pushResult) return;
    const blob = new Blob([JSON.stringify(pushResult, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-sync-report-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Download only the mapped sample payload (dry-run field-name review). */
  const downloadSamplePayload = () => {
    if (!pushResult?.sample_payload) return;
    const blob = new Blob([JSON.stringify(pushResult.sample_payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-sample-payload-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Save the branch_id to system_settings (sent with every push request). */
  const saveBranchId = async () => {
    setSavingBranch(true);
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { key: "inventory_branch_id", value: { id: branchId.trim() } },
        { onConflict: "key" },
      );
    setSavingBranch(false);
    if (error) toast.error("Save failed: " + error.message);
    else toast.success("Branch ID saved");
  };

  /** Live GET/POST test against the external inventory API (uses server-stored key). */
  const runLiveTest = async () => {
    setLiveTesting(true);
    setLiveTestResult(null);
    try {
      let payload: unknown = undefined;
      if (liveTestMethod === "POST") {
        try {
          payload = JSON.parse(liveTestPayload);
        } catch (e: any) {
          toast.error("Invalid JSON payload: " + e.message);
          setLiveTesting(false);
          return;
        }
      }
      const { data, error } = await supabase.functions.invoke("push-to-external-inventory", {
        body: {
          action: "live_test",
          method: liveTestMethod,
          path: liveTestPath.trim() || "/products",
          payload,
        },
      });
      if (error) throw error;
      setLiveTestResult(data);
      if (data.ok) toast.success(`${liveTestMethod} → HTTP ${data.status} (${data.latency_ms} ms)`);
      else toast.error(`${liveTestMethod} → HTTP ${data.status} — check details below`);
    } catch (e: any) {
      toast.error(e?.message ?? "Live test failed");
    } finally {
      setLiveTesting(false);
    }
  };


  // Load audit log + webhook settings + last push checkpoint
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
        .in("key", [
          "inventory_webhook_url",
          "inventory_webhook_enabled",
          "inventory_last_push_at",
          "inventory_branch_id",
        ]),
    ]);
    setLogs((rows as AuditRow[]) ?? []);
    if (settings) {
      const urlRow = settings.find((s: any) => s.key === "inventory_webhook_url");
      const enRow = settings.find((s: any) => s.key === "inventory_webhook_enabled");
      const lastRow = settings.find((s: any) => s.key === "inventory_last_push_at");
      const brRow = settings.find((s: any) => s.key === "inventory_branch_id");
      setWebhookUrl((urlRow?.value as any)?.url ?? "");
      setWebhookEnabled(!!(enRow?.value as any)?.enabled);
      setLastPushAt((lastRow?.value as any)?.at ?? null);
      setBranchIdState((brRow?.value as any)?.id ?? "");
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
        headers: { ...GATEWAY_HEADERS, "x-api-key": apiKey.trim() },
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
        headers: { ...GATEWAY_HEADERS, "x-api-key": apiKey.trim(), "Content-Type": "application/json" },
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

        {/* Push all products to external inventory (bigsoftdbh.lovable.app) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" /> Push products → External Inventory
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              সাইটের products আপনার external inventory software
              (<code className="font-mono text-xs">bigsoftdbh.lovable.app</code>)-এ POST হবে।
              Rate-limit ও validation সব server-side handle করা হয়।
            </p>

            {/* --- Options row --- */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-2 border rounded-md p-3">
                <Switch id="dry-run" checked={dryRun} onCheckedChange={setDryRun} />
                <div>
                  <Label htmlFor="dry-run" className="text-sm font-medium">Dry-run</Label>
                  <p className="text-[11px] text-muted-foreground">যাচাই করবে — push হবে না।</p>
                </div>
              </div>
              <div className="flex items-start gap-2 border rounded-md p-3">
                <Switch id="incremental" checked={incremental} onCheckedChange={setIncremental} />
                <div>
                  <Label htmlFor="incremental" className="text-sm font-medium">Incremental</Label>
                  <p className="text-[11px] text-muted-foreground">
                    শেষ sync-এর পর change হওয়া products।
                  </p>
                </div>
              </div>
              <div className="border rounded-md p-3">
                <Label htmlFor="concurrency" className="text-sm font-medium">Concurrency</Label>
                <Input
                  id="concurrency"
                  type="number"
                  min={1}
                  max={8}
                  value={concurrency}
                  onChange={(e) =>
                    setConcurrency(Math.max(1, Math.min(8, Number(e.target.value) || 1)))
                  }
                  className="h-8 mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Parallel workers (1–8)</p>
              </div>
              <div className="border rounded-md p-3">
                <Label htmlFor="limit" className="text-sm font-medium">Limit (test)</Label>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  placeholder="all"
                  value={productLimit}
                  onChange={(e) => {
                    const v = e.target.value;
                    setProductLimit(v === "" ? "" : Math.max(1, Number(v)));
                  }}
                  className="h-8 mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  কয়েকটা product দিয়ে টেস্ট করুন
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                শেষ successful push:{" "}
                <span className="font-mono">
                  {lastPushAt ? new Date(lastPushAt).toLocaleString() : "—"}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetCheckpoint}
                disabled={resettingCheckpoint || pushing}
                className="h-6 text-xs"
              >
                {resettingCheckpoint ? "Resetting…" : "Reset checkpoint"}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={pushAllProducts} disabled={pushing}>
                {pushing ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> {dryRun ? "Validating…" : "Pushing…"}</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" /> {dryRun ? "Run dry-run" : "Push now"}</>
                )}
              </Button>
              {pushResult && (
                <>
                  <Button variant="outline" size="sm" onClick={downloadFailedCsv}>
                    Download failures CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadReportJson}>
                    Download full report JSON
                  </Button>
                  {pushResult.sample_payload && (
                    <Button variant="outline" size="sm" onClick={downloadSamplePayload}>
                      Download sample payload JSON
                    </Button>
                  )}
                </>
              )}
            </div>

            {pushResult?.branch_id !== undefined && (
              <p className="text-[11px] text-muted-foreground">
                branch_id sent with request:{" "}
                <span className="font-mono">{pushResult.branch_id ?? "(none)"}</span>
              </p>
            )}

            {/* Live progress while pushing */}
            {pushing && progress && (
              <div className="border rounded-md p-3 bg-muted/30 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    Progress: {progress.done_count} / {progress.valid}
                    {progress.retries > 0 && (
                      <span className="text-amber-600 ml-2">retries: {progress.retries}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    ✓ {progress.created + progress.updated} · ✗ {progress.failed}
                  </span>
                </div>
                <div className="w-full h-2 bg-background rounded overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${
                        progress.valid > 0
                          ? Math.min(100, (progress.done_count / progress.valid) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                {progress.in_flight.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">In-flight workers:</div>
                    <ul className="space-y-0.5 font-mono">
                      {progress.in_flight.map((w) => (
                        <li key={w.worker} className="truncate">
                          <span className="text-muted-foreground">W{w.worker}</span>{" "}
                          → {w.name}
                          {w.attempts > 1 && (
                            <span className="text-amber-600"> (retry {w.attempts})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {progress.recent.length > 0 && (
                  <div>
                    <div className="font-medium mb-1">Recent:</div>
                    <ul className="space-y-0.5 font-mono">
                      {progress.recent.slice().reverse().map((r, i) => (
                        <li
                          key={i}
                          className={
                            r.action === "failed" ? "text-destructive" : "text-green-600"
                          }
                        >
                          {r.action === "failed" ? "✗" : "✓"} {r.name}
                          {r.status ? ` (${r.status})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}


            {pushResult && (
              <div className="text-sm space-y-2 border rounded-md p-3 bg-muted/30">
                <div className="flex flex-wrap gap-2">
                  {pushResult.dry_run && <Badge variant="outline">Dry-run</Badge>}
                  <Badge variant="default">Total: {pushResult.total}</Badge>
                  <Badge variant="secondary">Valid: {pushResult.valid}</Badge>
                  {pushResult.invalid > 0 && (
                    <Badge variant="destructive">Invalid: {pushResult.invalid}</Badge>
                  )}
                  {!pushResult.dry_run && (
                    <>
                      <Badge className="bg-green-600">Created: {pushResult.created}</Badge>
                      <Badge variant="secondary">Updated: {pushResult.updated}</Badge>
                      {pushResult.failed > 0 && (
                        <Badge variant="destructive">Failed: {pushResult.failed}</Badge>
                      )}
                    </>
                  )}
                </div>
                {pushResult.since && (
                  <p className="text-xs text-muted-foreground">
                    Filtered since: <span className="font-mono">{pushResult.since}</span>
                  </p>
                )}

                {pushResult.validation_errors.length > 0 && (
                  <details className="text-xs" open>
                    <summary className="cursor-pointer font-medium text-destructive">
                      Validation errors ({pushResult.validation_errors.length})
                    </summary>
                    <ul className="mt-1 space-y-1 max-h-56 overflow-auto">
                      {pushResult.validation_errors.slice(0, 50).map((v) => (
                        <li key={v.product_id} className="font-mono break-all">
                          <span className="text-muted-foreground">{v.name}:</span>{" "}
                          <span className="text-destructive">{v.errors.join("; ")}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {pushResult.results.filter((r) => r.action === "failed").length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium text-destructive">
                      Push failures ({pushResult.results.filter((r) => r.action === "failed").length})
                    </summary>
                    <ul className="mt-1 space-y-1 max-h-56 overflow-auto">
                      {pushResult.results
                        .filter((r) => r.action === "failed")
                        .slice(0, 50)
                        .map((r) => (
                          <li key={r.product_id} className="font-mono break-all">
                            [{r.status ?? "-"}] {r.name}: {r.error}
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
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
