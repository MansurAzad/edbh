import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Loader2, CheckCircle2, XCircle, Pencil, Save, X, Trash2, Play, Shield, AlertTriangle, RefreshCw, ArrowUp, ArrowDown,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Scope = "customer" | "admin" | "product_studio";

interface ProviderRow {
  id: string;
  scope: Scope;
  provider_name: string;
  base_url: string;
  api_key_masked: string;
  model: string;
  extra_headers: Record<string, string> | null;
  is_active: boolean;
  is_fallback: boolean;
  priority: number;
  notes: string | null;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_latency_ms: number | null;
  last_test_error: string | null;
  last_test_sample: string | null;
}

const PRESETS = [
  { name: "DeepSeek", base_url: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { name: "Kimi (Moonshot)", base_url: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { name: "Qwen (DashScope)", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { name: "OpenCode Zen", base_url: "https://api.opencode.ai/zen/v1", model: "zen-default" },
  { name: "OpenRouter", base_url: "https://openrouter.ai/api/v1", model: "openrouter/auto" },
  { name: "Groq", base_url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { name: "Together AI", base_url: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { name: "Custom (OpenAI-compatible)", base_url: "", model: "" },
];

const emptyForm = {
  scope: "customer" as Scope,
  provider_name: "",
  base_url: "",
  api_key: "",
  model: "",
  notes: "",
  is_active: true,
  is_fallback: false,
  priority: 100,
};

const AIProviderSettings = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: providers, isLoading, error: loadError, refetch, isFetching } = useQuery({
    queryKey: ["ai-providers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_ai_providers" as any);
      if (error) throw error;
      return (data || []) as unknown as ProviderRow[];
    },
    retry: 1,
  });

  useEffect(() => {
    if (loadError) {
      const msg = (loadError as any)?.message || String(loadError);
      toast({
        title: "Provider লোড করা যায়নি",
        description: /function|does not exist|schema cache/i.test(msg)
          ? "RPC list_ai_providers পাওয়া যাচ্ছে না — ডাটাবেস migration প্রয়োজন।"
          : msg,
        variant: "destructive",
      });
    }
  }, [loadError, toast]);

  // Runtime fallback order used by the edge functions: is_active DESC, is_fallback DESC, priority ASC.
  // Sort here so the on-screen list ALWAYS matches the order requests will actually be tried in.
  const sortByRuntimeOrder = (rows: ProviderRow[]) =>
    [...rows].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      if (a.is_fallback !== b.is_fallback) return a.is_fallback ? -1 : 1;
      return (a.priority ?? 100) - (b.priority ?? 100);
    });
  const customerProviders = sortByRuntimeOrder((providers || []).filter((p) => p.scope === "customer"));
  const adminProviders = sortByRuntimeOrder((providers || []).filter((p) => p.scope === "admin"));
  const studioProviders = sortByRuntimeOrder((providers || []).filter((p) => p.scope === "product_studio"));

  const applyPreset = (name: string) => {
    const p = PRESETS.find((x) => x.name === name);
    if (!p) return;
    setForm((f) => ({
      ...f,
      provider_name: p.name === "Custom (OpenAI-compatible)" ? f.provider_name : p.name,
      base_url: p.base_url || f.base_url,
      model: p.model || f.model,
    }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const startEdit = (row: ProviderRow) => {
    setEditingId(row.id);
    setForm({
      scope: row.scope,
      provider_name: row.provider_name,
      base_url: row.base_url,
      api_key: "", // never prefill; blank = keep existing
      model: row.model,
      notes: row.notes || "",
      is_active: row.is_active,
      is_fallback: row.is_fallback,
      priority: row.priority,
    });
  };

  const handleSave = async () => {
    const isNew = !editingId;
    if (!form.provider_name.trim() || !form.base_url.trim() || !form.model.trim() ||
        (isNew && !form.api_key.trim())) {
      toast({
        title: "অসম্পূর্ণ",
        description: isNew
          ? "Provider name, Base URL, API key এবং Model সব দিতে হবে।"
          : "Provider name, Base URL এবং Model দিতে হবে। (API key খালি রাখলে পুরোনোটাই থাকবে)",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      // Only one ACTIVE per scope: deactivate others
      if (form.is_active) {
        await supabase
          .from("ai_provider_settings" as any)
          .update({ is_active: false })
          .eq("scope", form.scope)
          .neq("id", editingId || "00000000-0000-0000-0000-000000000000");
      }
      const payload: any = {
        scope: form.scope,
        provider_name: form.provider_name.trim(),
        base_url: form.base_url.trim(),
        model: form.model.trim(),
        notes: form.notes.trim() || null,
        is_active: form.is_active,
        is_fallback: form.is_fallback,
        priority: form.priority,
      };
      // Only include api_key when adding or rotating
      if (form.api_key.trim()) payload.api_key = form.api_key.trim();

      const res = editingId
        ? await supabase.from("ai_provider_settings" as any).update(payload).eq("id", editingId)
        : await supabase.from("ai_provider_settings" as any).insert(payload);
      if (res.error) throw res.error;
      toast({ title: "সফল", description: editingId ? "Provider আপডেট হয়েছে" : "Provider যুক্ত হয়েছে" });
      resetForm();
      qc.invalidateQueries({ queryKey: ["ai-providers"] });
    } catch (e: any) {
      toast({ title: "ত্রুটি", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: ProviderRow, next: boolean) => {
    try {
      if (next) {
        await supabase
          .from("ai_provider_settings" as any)
          .update({ is_active: false })
          .eq("scope", row.scope)
          .neq("id", row.id);
      }
      const { error } = await supabase
        .from("ai_provider_settings" as any)
        .update({ is_active: next })
        .eq("id", row.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["ai-providers"] });
    } catch (e: any) {
      toast({ title: "ত্রুটি", description: e.message, variant: "destructive" });
    }
  };

  const toggleFallback = async (row: ProviderRow, next: boolean) => {
    const { error } = await supabase
      .from("ai_provider_settings" as any)
      .update({ is_fallback: next })
      .eq("id", row.id);
    if (error) toast({ title: "ত্রুটি", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["ai-providers"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this provider configuration?")) return;
    const { error } = await supabase.from("ai_provider_settings" as any).delete().eq("id", id);
    if (error) toast({ title: "ত্রুটি", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["ai-providers"] });
  };

  const testConnection = async (id: string) => {
    setTestingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("ai-provider-test", {
        body: { id, prompt: "Reply with exactly: OK" },
      });
      if (error) throw error;
      if (data?.ok) {
        toast({
          title: `✅ Connected (${data.latency_ms}ms)`,
          description: data.sample ? `উত্তর: ${String(data.sample).slice(0, 120)}` : "সফল",
        });
      } else {
        toast({
          title: "❌ Connection failed",
          description: data?.error || `HTTP ${data?.status}`,
          variant: "destructive",
        });
      }
      qc.invalidateQueries({ queryKey: ["ai-providers"] });
    } catch (e: any) {
      toast({ title: "ত্রুটি", description: e.message, variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  /**
   * Reorder providers within a scope by swapping the `priority` value with the
   * neighbouring row. Lower priority = tried first by the edge function. This
   * gives admins an intuitive "up/down" reorder for the runtime fallback chain.
   */
  const reorder = async (list: ProviderRow[], index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const a = list[index];
    const b = list[target];
    try {
      // Ensure distinct priorities before swap (if they're equal, bump the other side by 1).
      const aPriority = a.priority ?? 100;
      const bPriority = b.priority === a.priority ? (a.priority ?? 100) + (direction === -1 ? 1 : -1) : (b.priority ?? 100);
      await supabase.from("ai_provider_settings" as any).update({ priority: bPriority }).eq("id", a.id);
      await supabase.from("ai_provider_settings" as any).update({ priority: aPriority }).eq("id", b.id);
      qc.invalidateQueries({ queryKey: ["ai-providers"] });
    } catch (e: any) {
      toast({ title: "Reorder failed", description: e.message, variant: "destructive" });
    }
  };

  const renderRow = (row: ProviderRow, index: number, list: ProviderRow[]) => (
    <div key={row.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">#{index + 1}</span>
          <span className="font-medium">{row.provider_name}</span>
          {row.is_active && (
            <Badge className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Active
            </Badge>
          )}
          {row.is_fallback && (
            <Badge variant="outline">
              <Shield className="w-3 h-3 mr-1" /> Fallback · p{row.priority}
            </Badge>
          )}
          {row.last_test_status === "ok" && (
            <Badge variant="secondary" className="text-green-700">
              ✓ {row.last_test_latency_ms}ms
            </Badge>
          )}
          {row.last_test_status === "fail" && (
            <Badge variant="destructive" title={row.last_test_error || ""}>
              <XCircle className="w-3 h-3 mr-1" /> Test failed
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {row.model} · {row.base_url} · key {row.api_key_masked}
        </p>
        {row.last_test_error && (
          <p className="text-xs text-destructive mt-1 line-clamp-2">{row.last_test_error}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 flex-wrap">
        <div className="flex flex-col mr-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => reorder(list, index, -1)}
            disabled={index === 0}
            title="Move up (try earlier)"
            aria-label="Move up"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => reorder(list, index, 1)}
            disabled={index === list.length - 1}
            title="Move down (try later)"
            aria-label="Move down"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-1 mr-2">
          <Label className="text-xs">Active</Label>
          <Switch checked={row.is_active} onCheckedChange={(c) => toggleActive(row, c)} />
        </div>
        <div className="flex items-center gap-1 mr-2">
          <Label className="text-xs">Fallback</Label>
          <Switch checked={row.is_fallback} onCheckedChange={(c) => toggleFallback(row, c)} />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => testConnection(row.id)}
          disabled={testingId === row.id}
          title="Send a probe request to this provider/model"
        >
          {testingId === row.id ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-1" />
          )}
          Test
        </Button>
        <Button variant="ghost" size="icon" onClick={() => startEdit(row)}><Pencil className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => remove(row.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <CardTitle>Custom AI Providers</CardTitle>
        </div>
        <CardDescription>
          Customer Chatbot ও Admin AI Agent — দুটোর জন্যই আলাদা Provider override সেট করুন।
          API keys সার্ভারে এনক্রিপ্টেড থাকে; UI-তে শুধু শেষ ৪ ক্যারেক্টার দেখায়। কোনো scope-এ active provider না থাকলে Lovable AI ব্যবহৃত হবে।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Form */}
        <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{editingId ? "Edit provider" : "Add a provider"}</h4>
            {editingId && (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Use for (Scope)</Label>
              <Select value={form.scope} onValueChange={(v: Scope) => setForm({ ...form, scope: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer Chatbot</SelectItem>
                  <SelectItem value="admin">Admin AI Agent</SelectItem>
                  <SelectItem value="product_studio">AI Product Studio (Vision)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Preset</Label>
              <Select onValueChange={applyPreset}>
                <SelectTrigger><SelectValue placeholder="Choose a preset (optional)" /></SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider name</Label>
              <Input value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} placeholder="DeepSeek" />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="deepseek-chat" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Base URL (OpenAI-compatible, without /chat/completions)</Label>
            <Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.deepseek.com/v1" />
          </div>

          <div className="space-y-2">
            <Label>
              API Key{" "}
              {editingId && <span className="text-xs text-muted-foreground">(blank = keep existing)</span>}
            </Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              placeholder={editingId ? "•••• (leave blank to keep)" : "sk-..."}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: c })} />
              <Label>Set as Active for this scope</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_fallback} onCheckedChange={(c) => setForm({ ...form, is_fallback: c })} />
              <Label>Use as Fallback if active fails</Label>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fallback priority (lower = tried first)</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value || "100", 10) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea rows={1} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {editingId ? "Update" : "Add Provider"}
            </Button>
          </div>
        </div>

        {/* Lists by scope */}
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : loadError ? (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>Providers লোড করা যাচ্ছে না</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-sm break-all">{(loadError as any)?.message || String(loadError)}</p>
              {/function|does not exist|schema cache/i.test((loadError as any)?.message || "") && (
                <p className="text-xs">
                  সম্ভাব্য কারণ: <code>list_ai_providers</code> RPC ডাটাবেসে নেই। সর্বশেষ migration approve করুন।
                </p>
              )}
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                আবার চেষ্টা করুন
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-3">
              <h4 className="font-medium">Customer Chatbot providers</h4>
              {customerProviders.length === 0 ? (
                <p className="text-sm text-muted-foreground">কোনো custom provider নেই — Lovable AI ব্যবহার হচ্ছে।</p>
              ) : (
                <div className="space-y-2">{customerProviders.map((r, i, l) => renderRow(r, i, l))}</div>
              )}
            </div>
            <div className="space-y-3">
              <h4 className="font-medium">Admin AI Agent providers</h4>
              {adminProviders.length === 0 ? (
                <p className="text-sm text-muted-foreground">কোনো custom provider নেই — Lovable AI ব্যবহার হচ্ছে।</p>
              ) : (
                <div className="space-y-2">{adminProviders.map((r, i, l) => renderRow(r, i, l))}</div>
              )}
            </div>
            <div className="space-y-3">
              <h4 className="font-medium">AI Product Studio providers (Vision-capable model প্রয়োজন)</h4>
              {studioProviders.length === 0 ? (
                <p className="text-sm text-muted-foreground">কোনো custom provider নেই — Lovable AI (Gemini Vision) ব্যবহার হচ্ছে।</p>
              ) : (
                <div className="space-y-2">{studioProviders.map((r, i, l) => renderRow(r, i, l))}</div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AIProviderSettings;
