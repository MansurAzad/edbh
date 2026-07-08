import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Search, Sparkles, Wand2, RotateCcw, Eye, ShieldAlert, History, Bot, Loader2 } from "lucide-react";

interface ProductRow {
  id: string;
  name: string;
  category: string;
  material: string | null;
  price: number;
  sale_price: number | null;
  stock: number | null;
  featured: boolean;
  description: string | null;
  colors: string[] | null;
  sizes: string[] | null;
}

type EditPatch = Partial<Pick<ProductRow, "name" | "price" | "sale_price" | "stock" | "featured" | "description">>;

const DEFAULT_TEMPLATE = "Dubai Imported {name} – {color} – {category}";

// ---------- Client-side sanitizer (matches DB trigger; friendly UX before hitting server) ----------
const SPAM_RE = /(kinghorsetoto|judi\s*bola|fastoto|intertogel|slot\s*gacor|situs\s*togel|bandar\s*judi|prediksi\s*togel|casino\s*online|sbobet|pkv\s*games|<\s*script|<\s*iframe|display\s*:\s*none|visibility\s*:\s*hidden)/i;

const sanitizeName = (s: string) => s.replace(/<[^>]*>/g, "").trim();
const sanitizeDescription = (s: string) =>
  s
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, "")
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript\s*:/gi, "");

const containsSpam = (s: string | null | undefined) => !!s && SPAM_RE.test(s);

const applyTemplate = (tpl: string, p: ProductRow, currentName: string): string => {
  const firstColor = p.colors?.[0]?.trim() || "";
  const firstSize = p.sizes?.[0]?.trim() || "";
  const filled = tpl
    .replace(/\{name\}/gi, currentName || "")
    .replace(/\{category\}/gi, p.category || "")
    .replace(/\{material\}/gi, p.material || "")
    .replace(/\{color\}/gi, firstColor)
    .replace(/\{size\}/gi, firstSize);
  return filled
    .replace(/–\s*–/g, "–")
    .replace(/\s+–\s*$/g, "")
    .replace(/^\s*–\s+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

// Validate a product against a template — return missing placeholders / format warnings.
const validateForTemplate = (tpl: string, p: ProductRow): string[] => {
  const warnings: string[] = [];
  const placeholders = Array.from(tpl.matchAll(/\{(name|category|material|color|size)\}/gi)).map(m => m[1].toLowerCase());
  const uniq = Array.from(new Set(placeholders));
  for (const ph of uniq) {
    if (ph === "name" && !p.name?.trim()) warnings.push("name missing");
    if (ph === "category" && !p.category?.trim()) warnings.push("category missing");
    if (ph === "material" && !p.material?.trim()) warnings.push("material missing");
    if (ph === "color" && !(p.colors && p.colors[0]?.trim())) warnings.push("color missing");
    if (ph === "size" && !(p.sizes && p.sizes[0]?.trim())) warnings.push("size missing");
  }
  // Format checks
  const color = p.colors?.[0] || "";
  if (uniq.includes("color") && color && /[^A-Za-z0-9\s&\-]/.test(color)) warnings.push(`color format odd: "${color}"`);
  if (uniq.includes("color") && color && color !== color.replace(/\s+/g, " ").trim()) warnings.push("color has extra spaces");
  const size = p.sizes?.[0] || "";
  if (uniq.includes("size") && size && !/^([A-Z0-9]+([-–/][A-Z0-9]+)?)$/i.test(size)) warnings.push(`size format odd: "${size}"`);
  return warnings;
};

const BulkProductEdit = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, EditPatch>>({});
  const [saving, setSaving] = useState(false);
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiFields, setAiFields] = useState<{ title: boolean; description: boolean }>({ title: true, description: true });
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number; ok: number; fail: number }>({ done: 0, total: 0, ok: 0, fail: 0 });
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiResults, setAiResults] = useState<Array<{
    id: string; productName: string;
    beforeName: string; afterName?: string;
    beforeDesc: string; afterDesc?: string;
    titleValid: boolean; titleWarnings: string[];
    error?: string;
  }>>([]);
  const [aiRateLimited, setAiRateLimited] = useState(false);

  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [descAppend, setDescAppend] = useState("COD Available. Size 52–58 available. দুবাই থেকে আমদানি।");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-bulk-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, category, material, price, sale_price, stock, featured, description, colors, sizes")
        .order("created_at", { ascending: false });
      return (data || []) as ProductRow[];
    },
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ["product-edit-audit"],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_edit_audit")
        .select("id, product_id, admin_email, field, old_value, new_value, source, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  const productMap = useMemo(() => {
    const m = new Map<string, ProductRow>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);

  const filtered = useMemo(() => products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(search.toLowerCase())
  ), [products, search]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  };

  const setEdit = (id: string, field: keyof EditPatch, value: any) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const getValue = <K extends keyof ProductRow>(product: ProductRow, field: K): ProductRow[K] => {
    const edited = edits[product.id]?.[field as keyof EditPatch];
    return (edited !== undefined ? edited : product[field]) as ProductRow[K];
  };

  // Build a diff list of pending changes
  const diffRows = useMemo(() => {
    const rows: Array<{ id: string; name: string; field: string; oldVal: string; newVal: string; spam: boolean }> = [];
    Object.entries(edits).forEach(([id, patch]) => {
      const orig = productMap.get(id);
      if (!orig) return;
      Object.entries(patch).forEach(([field, value]) => {
        const oldVal = String((orig as any)[field] ?? "");
        const newValRaw = value === null || value === undefined ? "" : String(value);
        if (oldVal === newValRaw) return;
        const spam = (field === "name" || field === "description") && containsSpam(newValRaw);
        rows.push({ id, name: orig.name, field, oldVal, newVal: newValRaw, spam });
      });
    });
    return rows;
  }, [edits, productMap]);

  const spamCount = diffRows.filter(r => r.spam).length;

  const handleBulkSave = async () => {
    if (diffRows.length === 0) { toast.error("কোনো পরিবর্তন নেই"); return; }
    if (spamCount > 0) { toast.error(`${spamCount} row-এ blocked content — সেভ বন্ধ`); return; }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const adminId = userData?.user?.id;
    const adminEmail = userData?.user?.email || null;

    let success = 0;
    const auditRows: any[] = [];

    for (const id of Object.keys(edits)) {
      const e = edits[id];
      const orig = productMap.get(id);
      if (!orig) continue;
      const updates: any = {};
      if (e.name !== undefined) updates.name = sanitizeName(String(e.name));
      if (e.price !== undefined) updates.price = Number(e.price);
      if (e.sale_price !== undefined) updates.sale_price = e.sale_price ? Number(e.sale_price) : null;
      if (e.stock !== undefined) updates.stock = Number(e.stock);
      if (e.featured !== undefined) updates.featured = e.featured;
      if (e.description !== undefined) updates.description = sanitizeDescription(String(e.description ?? ""));
      if (Object.keys(updates).length === 0) continue;

      const { error } = await supabase.from("products").update(updates).eq("id", id);
      if (!error) {
        success++;
        Object.entries(updates).forEach(([field, val]) => {
          const oldVal = (orig as any)[field];
          if (String(oldVal ?? "") === String(val ?? "")) return;
          auditRows.push({
            product_id: id,
            admin_id: adminId,
            admin_email: adminEmail,
            field,
            old_value: oldVal === null || oldVal === undefined ? null : String(oldVal),
            new_value: val === null || val === undefined ? null : String(val),
            source: "bulk_edit",
          });
        });
      } else {
        toast.error(`${orig.name}: ${error.message}`);
      }
    }

    if (auditRows.length > 0) {
      await supabase.from("product_edit_audit").insert(auditRows);
    }

    toast.success(`${success}টি প্রোডাক্ট আপডেট, ${auditRows.length}টি ফিল্ড লগ হয়েছে`);
    setEdits({});
    setSelected(new Set());
    setDryRunOpen(false);
    queryClient.invalidateQueries({ queryKey: ["admin-bulk-products"] });
    queryClient.invalidateQueries({ queryKey: ["product-edit-audit"] });
    queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
    setSaving(false);
  };

  const applyBulkPrice = () => {
    if (!bulkPrice) return;
    selected.forEach(id => setEdit(id, "price", Number(bulkPrice)));
    toast.info(`${selected.size}টি প্রোডাক্টে প্রাইস সেট করা হয়েছে`);
  };

  const applyBulkStock = () => {
    if (!bulkStock) return;
    selected.forEach(id => setEdit(id, "stock", Number(bulkStock)));
    toast.info(`${selected.size}টি প্রোডাক্টে স্টক সেট করা হয়েছে`);
  };

  // Pre-validation: warn for missing/malformed placeholders before applying
  const templateValidation = useMemo(() => {
    const problems: Array<{ id: string; name: string; warnings: string[] }> = [];
    products.forEach(p => {
      if (!selected.has(p.id)) return;
      const w = validateForTemplate(template, p);
      if (w.length) problems.push({ id: p.id, name: p.name, warnings: w });
    });
    return problems;
  }, [products, selected, template]);

  const applyNameTemplate = () => {
    if (selected.size === 0) { toast.error("প্রোডাক্ট সিলেক্ট করুন"); return; }
    if (!template.includes("{name}")) { toast.error("টেমপ্লেটে {name} থাকতে হবে"); return; }
    if (templateValidation.length > 0) {
      toast.warning(`${templateValidation.length}টি প্রোডাক্টে placeholder সমস্যা — নিচে দেখুন`);
    }

    let count = 0;
    products.forEach(p => {
      if (!selected.has(p.id)) return;
      const raw = String(getValue(p, "name") || "");
      const base = raw
        .replace(/^Dubai Imported\s+/i, "")
        .replace(/\s*–\s*Dubai Collection\s*$/i, "")
        .trim();
      const next = applyTemplate(template, p, base);
      if (next && next !== raw) {
        setEdit(p.id, "name", next);
        count++;
      }
    });
    toast.success(`${count}টি নাম প্রিভিউ তৈরি — Dry-run দেখুন তারপর Save`);
  };

  const appendDescription = () => {
    if (selected.size === 0) { toast.error("প্রোডাক্ট সিলেক্ট করুন"); return; }
    if (!descAppend.trim()) return;

    let count = 0;
    products.forEach(p => {
      if (!selected.has(p.id)) return;
      const current = String(getValue(p, "description") || "");
      if (current.includes(descAppend)) return;
      const next = (current ? current.trimEnd() + "\n\n" : "") + descAppend;
      setEdit(p.id, "description", next);
      count++;
    });
    toast.success(`${count}টি প্রোডাক্টের ডেসক্রিপশনে যোগ হয়েছে`);
  };

  const resetEdits = () => {
    setEdits({});
    toast.info("সব pending পরিবর্তন বাতিল করা হলো");
  };

  // Title format validator: expects "[Origin] [Fabric...] [Type] – [Color] [– Set/Part]?"
  const validateAiTitle = (title: string): { valid: boolean; warnings: string[] } => {
    const w: string[] = [];
    if (!title) return { valid: false, warnings: ["empty"] };
    if (title.length < 40) w.push(`too short (${title.length})`);
    if (title.length > 100) w.push(`too long (${title.length})`);
    if (!/(Dubai|Imported|Premium)/i.test(title)) w.push("origin missing");
    if (!/(Nida|Chiffon|Barbie|Georgette|Crepe|Organza|Silk|Fabric)/i.test(title)) w.push("fabric missing");
    if (!/(Abaya|Borka|Farasha|Kaftan|Hijab)/i.test(title)) w.push("product type missing");
    if (!/–|-/.test(title)) w.push("no separator (–)");
    if (/dubai collection$/i.test(title.trim())) w.push('remove "Dubai Collection" suffix');
    return { valid: w.length === 0, warnings: w };
  };

  const runAiEnrichBatch = async (ids: string[]) => {
    if (ids.length === 0) { toast.error("প্রোডাক্ট সিলেক্ট করুন"); return; }
    if (!aiFields.title && !aiFields.description) { toast.error("অন্তত title বা description বেছে নিন"); return; }
    if (ids.length > 50) { toast.error("এক বারে সর্বোচ্চ ৫০টি প্রোডাক্ট"); return; }

    setAiRunning(true);
    setAiRateLimited(false);
    setAiProgress({ done: 0, total: ids.length, ok: 0, fail: 0 });
    setAiResults([]);
    setAiPanelOpen(true);

    const fields = [aiFields.title && "title", aiFields.description && "description"].filter(Boolean) as string[];
    const CHUNK = 5;
    const collected: typeof aiResults = [];

    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunkIds = ids.slice(i, i + CHUNK);
      try {
        const { data, error } = await supabase.functions.invoke("enrich-product", {
          body: { productIds: chunkIds, fields, dryRun: true },
        });
        if (error) {
          const msg = String(error.message || error);
          if (/429|rate limit/i.test(msg)) setAiRateLimited(true);
          if (/402|credit/i.test(msg)) toast.error("AI credits শেষ — Workspace billing-এ credits যোগ করুন");
          throw new Error(msg);
        }
        const results = (data?.results || []) as Array<{ id: string; title?: string; description?: string; error?: string }>;
        for (const r of results) {
          const orig = productMap.get(r.id);
          const beforeName = orig?.name || "";
          const beforeDesc = orig?.description || "";
          if (r.error) {
            collected.push({
              id: r.id, productName: beforeName, beforeName, beforeDesc,
              titleValid: false, titleWarnings: [], error: r.error,
            });
            setAiProgress(p => ({ ...p, done: p.done + 1, fail: p.fail + 1 }));
            continue;
          }
          const validation = r.title ? validateAiTitle(r.title) : { valid: true, warnings: [] };
          const patch: EditPatch = {};
          if (aiFields.title && r.title) patch.name = r.title;
          if (aiFields.description && r.description) patch.description = r.description;
          if (Object.keys(patch).length) {
            setEdits(prev => ({ ...prev, [r.id]: { ...prev[r.id], ...patch } }));
          }
          collected.push({
            id: r.id, productName: beforeName, beforeName, beforeDesc,
            afterName: r.title, afterDesc: r.description,
            titleValid: validation.valid, titleWarnings: validation.warnings,
          });
          setAiProgress(p => ({ ...p, done: p.done + 1, ok: p.ok + 1 }));
        }
      } catch (e: any) {
        // Mark all items in this chunk as failed
        for (const id of chunkIds) {
          const orig = productMap.get(id);
          collected.push({
            id, productName: orig?.name || id, beforeName: orig?.name || "", beforeDesc: orig?.description || "",
            titleValid: false, titleWarnings: [], error: e?.message || "unknown",
          });
          setAiProgress(p => ({ ...p, done: p.done + 1, fail: p.fail + 1 }));
        }
      }
      setAiResults([...collected]);
      // Gentle spacing between chunks to reduce rate-limit risk
      if (i + CHUNK < ids.length) await new Promise(r => setTimeout(r, 400));
    }

    setAiRunning(false);
    const okCount = collected.filter(r => !r.error).length;
    const failCount = collected.filter(r => !!r.error).length;
    toast.success(`AI-জেনারেটেড: ${okCount} সফল, ${failCount} ব্যর্থ — নিচের প্যানেলে দেখুন`);
  };

  const runAiEnrich = () => runAiEnrichBatch(Array.from(selected));
  const retryFailed = () => {
    const failedIds = aiResults.filter(r => !!r.error).map(r => r.id);
    if (failedIds.length === 0) { toast.info("Retry করার কিছু নেই"); return; }
    runAiEnrichBatch(failedIds);
  };

  const editCount = Object.keys(edits).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold">Bulk Edit</h1>
            <p className="text-muted-foreground">Bulk update + SEO template + Dry-run + Audit log</p>
          </div>
          <div className="flex items-center gap-2">
            {editCount > 0 && (
              <Button variant="outline" onClick={resetEdits}>
                <RotateCcw className="w-4 h-4 mr-2" /> Reset ({editCount})
              </Button>
            )}
            <Button variant="secondary" onClick={() => setDryRunOpen(true)} disabled={editCount === 0}>
              <Eye className="w-4 h-4 mr-2" /> Dry-run ({diffRows.length})
            </Button>
            <Button onClick={() => setDryRunOpen(true)} disabled={saving || editCount === 0}>
              <Save className="w-4 h-4 mr-2" /> Review & Save
            </Button>
          </div>
        </div>

        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="audit"><History className="w-3 h-3 mr-1" /> Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="space-y-6">
            {/* Name Template Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> SEO Name Template
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  Placeholders: <code className="bg-muted px-1 rounded">{"{name}"}</code>{" "}
                  <code className="bg-muted px-1 rounded">{"{category}"}</code>{" "}
                  <code className="bg-muted px-1 rounded">{"{material}"}</code>{" "}
                  <code className="bg-muted px-1 rounded">{"{color}"}</code>{" "}
                  <code className="bg-muted px-1 rounded">{"{size}"}</code>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Dubai Imported {name} – {color} – {category}",
                    "{name} – {material} – Size {size} – Dubai Collection",
                    "Premium {category} – {name} – COD Available",
                    "Dubai Imported {name} – {color} – Size 52–58",
                  ].map(preset => (
                    <Button key={preset} size="sm" variant="secondary" className="text-xs h-7"
                      onClick={() => setTemplate(preset)}>
                      {preset.length > 42 ? preset.slice(0, 40) + "…" : preset}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                  <Input value={template} onChange={e => setTemplate(e.target.value)}
                    placeholder="e.g. Dubai Imported {name} – {color} – {category}" className="flex-1" />
                  <Button onClick={applyNameTemplate} disabled={selected.size === 0}>
                    <Wand2 className="w-4 h-4 mr-2" /> Apply to {selected.size} selected
                  </Button>
                </div>

                {selected.size > 0 && templateValidation.length > 0 && (
                  <Alert variant="destructive" className="mt-2">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-medium mb-1">
                        {templateValidation.length}টি প্রোডাক্টে placeholder সমস্যা:
                      </div>
                      <div className="max-h-40 overflow-auto text-xs space-y-1">
                        {templateValidation.slice(0, 15).map(v => (
                          <div key={v.id} className="flex flex-wrap items-center gap-2">
                            <span className="font-mono">{v.name.slice(0, 40)}</span>
                            {v.warnings.map((w, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">{w}</Badge>
                            ))}
                          </div>
                        ))}
                        {templateValidation.length > 15 && <div>…and {templateValidation.length - 15} more</div>}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Description Append */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Description Append (COD / Size / Badge)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea value={descAppend} onChange={e => setDescAppend(e.target.value)} rows={2}
                  placeholder="e.g. COD Available. Size 52–58 available." />
                <Button onClick={appendDescription} disabled={selected.size === 0} variant="secondary">
                  Append to {selected.size} selected
                </Button>
              </CardContent>
            </Card>

            {/* AI Enrich Card */}
            <Card className="border-primary/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" /> AI Enrich — Title & Description
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Lovable AI-এর মাধ্যমে সিলেক্টেড প্রোডাক্টের title আপনার SEO format-এ
                  <code className="mx-1 bg-muted px-1 rounded">[Origin] [Fabric] [Work] [Type] – [Color] – [Set/Part]</code>
                  এবং description Bangla+English-এ regenerate হবে। প্রথমে dry-run হিসেবে edits map-এ ঢুকবে — Review & Save চাপলেই DB-তে যাবে।
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={aiFields.title} onCheckedChange={v => setAiFields(f => ({ ...f, title: !!v }))} />
                    Title regenerate
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={aiFields.description} onCheckedChange={v => setAiFields(f => ({ ...f, description: !!v }))} />
                    Description regenerate
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={runAiEnrich} disabled={selected.size === 0 || aiRunning || (!aiFields.title && !aiFields.description)}>
                    {aiRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                    {aiRunning ? "Generating…" : `Generate for ${selected.size} selected`}
                  </Button>
                  {aiResults.length > 0 && (
                    <Button variant="outline" onClick={() => setAiPanelOpen(true)}>
                      Show last results ({aiResults.length})
                    </Button>
                  )}
                </div>

                {(aiRunning || aiProgress.total > 0) && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Progress: {aiProgress.done}/{aiProgress.total} · ✓ {aiProgress.ok} · ✗ {aiProgress.fail}</span>
                      {aiRateLimited && <span className="text-destructive font-medium">Rate limit hit — slowing down</span>}
                    </div>
                    <Progress value={aiProgress.total ? (aiProgress.done / aiProgress.total) * 100 : 0} className="h-2" />
                  </div>
                )}

                {selected.size > 50 && (
                  <p className="text-xs text-destructive">এক বারে সর্বোচ্চ ৫০টি — কম সিলেক্ট করুন।</p>
                )}
              </CardContent>
            </Card>



            {/* Search + quick bulk price/stock */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search name/category..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
              </div>
              {selected.size > 0 && (
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-muted-foreground">{selected.size} সিলেক্টেড —</span>
                  <Input type="number" placeholder="Bulk Price" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} className="w-28 h-8" />
                  <Button size="sm" variant="outline" onClick={applyBulkPrice}>Apply</Button>
                  <Input type="number" placeholder="Bulk Stock" value={bulkStock} onChange={e => setBulkStock(e.target.value)} className="w-28 h-8" />
                  <Button size="sm" variant="outline" onClick={applyBulkStock}>Apply</Button>
                </div>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={selectAll} />
                      </TableHead>
                      <TableHead className="min-w-[280px]">Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="w-28">Price (৳)</TableHead>
                      <TableHead className="w-28">Sale Price</TableHead>
                      <TableHead className="w-24">Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                    ) : filtered.map(product => {
                      const isEdited = !!edits[product.id];
                      return (
                        <TableRow key={product.id} className={isEdited ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox checked={selected.has(product.id)} onCheckedChange={() => toggleSelect(product.id)} />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 text-sm"
                              value={String(getValue(product, "name") ?? "")}
                              onChange={e => setEdit(product.id, "name", e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{product.category}</TableCell>
                          <TableCell>
                            <Input type="number" className="h-8 text-sm" value={String(getValue(product, "price"))} onChange={e => setEdit(product.id, "price", e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" className="h-8 text-sm" value={String(getValue(product, "sale_price") ?? "")} onChange={e => setEdit(product.id, "sale_price", e.target.value || null)} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" className="h-8 text-sm" value={String(getValue(product, "stock") ?? 0)} onChange={e => setEdit(product.id, "stock", e.target.value)} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Product Edits ({auditLog.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Old</TableHead>
                      <TableHead>New</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLog.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">এখনও কোনো audit entry নেই</TableCell></TableRow>
                    ) : auditLog.map((row: any) => {
                      const p = productMap.get(row.product_id);
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-xs">{row.admin_email || "—"}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{p?.name || row.product_id.slice(0, 8)}</TableCell>
                          <TableCell><Badge variant="outline">{row.field}</Badge></TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">{row.old_value ?? "—"}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{row.new_value ?? "—"}</TableCell>
                          <TableCell className="text-xs">{row.source}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dry-run diff modal */}
      <Dialog open={dryRunOpen} onOpenChange={setDryRunOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" /> Dry-run — {diffRows.length} field change{diffRows.length !== 1 ? "s" : ""}
              {spamCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  <ShieldAlert className="w-3 h-3 mr-1" /> {spamCount} blocked
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {spamCount > 0 && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                {spamCount}টি row-এ spam/injection pattern detected — সেভ করা যাবে না। এই row-গুলো ঠিক করুন বা Reset চাপুন।
              </AlertDescription>
            </Alert>
          )}

          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diffRows.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No changes</TableCell></TableRow>
                ) : diffRows.map((r, i) => (
                  <TableRow key={i} className={r.spam ? "bg-destructive/10" : ""}>
                    <TableCell className="text-xs max-w-[180px] truncate">{r.name}</TableCell>
                    <TableCell><Badge variant="outline">{r.field}</Badge></TableCell>
                    <TableCell className="text-xs max-w-[240px] whitespace-pre-wrap text-muted-foreground line-through">{r.oldVal || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[240px] whitespace-pre-wrap font-medium">
                      {r.newVal || "—"}
                      {r.spam && <Badge variant="destructive" className="ml-2 text-[10px]">BLOCKED</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDryRunOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkSave} disabled={saving || diffRows.length === 0 || spamCount > 0}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "সেভ হচ্ছে..." : `Confirm & Save ${diffRows.length} change${diffRows.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default BulkProductEdit;
