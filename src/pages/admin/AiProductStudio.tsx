/**
 * AI Product Studio — bulk image upload → AI-generated product drafts → save.
 *
 * Flow:
 *  1. Admin uploads N images (drag/drop or picker). Each image is compressed +
 *     uploaded to Supabase Storage (`product-images` bucket) with a live
 *     per-image progress bar.
 *  2. For each uploaded image the browser calls the `analyze-product-image`
 *     edge function which returns a full product draft (Bangla name, category,
 *     fabric, work type, colors, price, description, SEO...). If analysis
 *     fails the image shows an error banner with Retry / Remove.
 *  3. Category / Subcategory / Fabric / Work Type are rendered as Select
 *     dropdowns backed by the existing products' option pool
 *     (`useProductFieldSuggestions`) — same values the manual Add Product form
 *     uses. Sizes render as toggle chips (52-58 default) and stock is a
 *     number input. Admin can edit every field, then bulk-save.
 *  4. A live status strip at the top summarises uploading / analysing /
 *     ready / saving / saved / failed counts. When all rows finish, a summary
 *     card highlights how many saved and how many failed.
 */
import { useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadProductImage } from "@/lib/storage-upload";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Sparkles,
  Upload,
  Loader2,
  X,
  RefreshCw,
  Save,
  ImagePlus,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProductFieldSuggestions } from "@/hooks/admin/useProductFieldSuggestions";

const DEFAULT_SIZES = ["52", "54", "56", "58"];
const SIZE_POOL = ["50", "52", "54", "56", "58", "60", "62"];
const DEFAULT_STOCK = 10;
const MAX_IMAGES = 20;
const NEW_VALUE = "__new__";

type DraftStatus = "uploading" | "analyzing" | "ready" | "saving" | "saved" | "error";

interface Draft {
  id: string;
  file?: File;
  imageUrl: string;
  status: DraftStatus;
  error?: string;
  progress: number;
  // AI fields
  name: string;
  category: string;
  subcategory: string;
  fabric: string;
  work_type: string;
  part: string;
  hijab_included: boolean;
  inner_included: boolean;
  colors: string; // comma sep
  sizes: string[];
  stock: number;
  price: number;
  sale_price: number | null;
  description: string;
  meta_title: string;
  meta_description: string;
  image_alt_text: string;
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyDraft(id: string, imageUrl: string, file?: File): Draft {
  return {
    id,
    file,
    imageUrl,
    status: "analyzing",
    progress: 0,
    name: "",
    category: "Abaya",
    subcategory: "",
    fabric: "",
    work_type: "",
    part: "1 Part",
    hijab_included: false,
    inner_included: false,
    colors: "",
    sizes: [...DEFAULT_SIZES],
    stock: DEFAULT_STOCK,
    price: 0,
    sale_price: null,
    description: "",
    meta_title: "",
    meta_description: "",
    image_alt_text: "",
  };
}

export default function AiProductStudio() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [globalBusy, setGlobalBusy] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: suggestions } = useProductFieldSuggestions();

  const updateDraft = useCallback((id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const analyzeOne = useCallback(async (id: string, imageUrl: string) => {
    updateDraft(id, { status: "analyzing", error: undefined });
    try {
      const { data, error } = await supabase.functions.invoke("analyze-product-image", {
        body: { imageUrl },
      });
      if (error) throw error;
      const d = data?.draft || {};
      updateDraft(id, {
        status: "ready",
        name: d.name || "",
        category: d.category || "Abaya",
        subcategory: d.subcategory || "",
        fabric: d.fabric || "",
        work_type: d.work_type || "",
        part: d.part || "1 Part",
        hijab_included: !!d.hijab_included,
        inner_included: !!d.inner_included,
        colors: Array.isArray(d.colors) ? d.colors.join(", ") : "",
        price: Number(d.estimated_price_bdt) || 0,
        sale_price: d.sale_price_bdt ? Number(d.sale_price_bdt) : null,
        description: d.description || "",
        meta_title: d.meta_title || "",
        meta_description: d.meta_description || "",
        image_alt_text: d.image_alt_text || "",
      });
    } catch (e: any) {
      const msg = e?.message || String(e);
      updateDraft(id, { status: "error", error: msg });
      toast.error(`AI বিশ্লেষণে ব্যর্থ: ${msg}`);
    }
  }, [updateDraft]);

  const handleFiles = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    if (drafts.length + imgs.length > MAX_IMAGES) {
      toast.error(`একসাথে সর্বোচ্চ ${MAX_IMAGES}টি ছবি`);
      return;
    }
    setGlobalBusy(true);
    for (const file of imgs) {
      const id = newId();
      setDrafts((prev) => [
        ...prev,
        { ...emptyDraft(id, "", file), status: "uploading", progress: 0 },
      ]);
      const res = await uploadProductImage(file, {
        folder: "ai-studio",
        onProgress: (e) => updateDraft(id, { progress: e.progress }),
      });
      if (!res.success || !res.url) {
        updateDraft(id, { status: "error", error: res.error || "Upload failed" });
        toast.error(`আপলোড ব্যর্থ: ${res.error}`);
        continue;
      }
      updateDraft(id, { imageUrl: res.url, progress: 100 });
      analyzeOne(id, res.url);
    }
    setGlobalBusy(false);
  }, [drafts.length, analyzeOne, updateDraft]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragRef.current?.classList.remove("ring-primary");
    const files = Array.from(e.dataTransfer.files || []);
    handleFiles(files);
  }, [handleFiles]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
    e.target.value = "";
  }, [handleFiles]);

  const removeDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const saveOne = useCallback(async (d: Draft): Promise<boolean> => {
    if (!d.name.trim() || !d.category.trim() || !d.price) {
      toast.error("Name, Category ও Price লাগবে");
      return false;
    }
    updateDraft(d.id, { status: "saving" });
    try {
      const payload = {
        name: d.name.trim(),
        category: d.category.trim(),
        subcategory: d.subcategory || null,
        price: d.price,
        sale_price: d.sale_price || null,
        stock: d.stock,
        description: d.description || null,
        material: d.fabric || null,
        fabric: d.fabric || null,
        work_type: d.work_type || null,
        part: d.part || null,
        hijab_included: d.hijab_included,
        inner_included: d.inner_included,
        sizes: d.sizes,
        colors: d.colors.split(",").map((c) => c.trim()).filter(Boolean),
        featured: false,
        image_url: d.imageUrl,
        image_alt_text: d.image_alt_text || null,
        meta_title: d.meta_title || null,
        meta_description: d.meta_description || null,
      };
      const { error } = await supabase.from("products").insert(payload as any);
      if (error) throw error;
      updateDraft(d.id, { status: "saved" });
      return true;
    } catch (e: any) {
      updateDraft(d.id, { status: "error", error: e?.message });
      toast.error(`সেভ ব্যর্থ: ${e?.message}`);
      return false;
    }
  }, [updateDraft]);

  const saveAll = useCallback(async () => {
    const ready = drafts.filter((d) => d.status === "ready");
    if (!ready.length) {
      toast.error("সেভ করার মতো কোনো ready draft নেই");
      return;
    }
    setGlobalBusy(true);
    let ok = 0;
    for (const d of ready) {
      const success = await saveOne(d);
      if (success) ok++;
    }
    setGlobalBusy(false);
    if (ok > 0) {
      toast.success(`${ok}টি প্রোডাক্ট যুক্ত হয়েছে!`);
      queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-products-count"] });
    }
  }, [drafts, saveOne, queryClient]);

  const counts = useMemo(() => {
    const c = { uploading: 0, analyzing: 0, ready: 0, saving: 0, saved: 0, error: 0 };
    for (const d of drafts) c[d.status]++;
    return c;
  }, [drafts]);

  const total = drafts.length;
  const inFlight = counts.uploading + counts.analyzing + counts.saving;
  const showSummary = total > 0 && inFlight === 0 && (counts.saved > 0 || counts.error > 0);

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="ai-studio-root">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-display font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              AI Product Studio
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              ছবি আপলোড করুন — AI প্রতিটি ছবি analyse করে full product draft তৈরি করবে
              (name, category, fabric, colors, price, description সহ)। Review করে Save All চাপুন।
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={saveAll} disabled={!counts.ready || globalBusy} data-testid="save-all">
              {globalBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save All ({counts.ready})
            </Button>
          </div>
        </div>

        {/* Live status strip */}
        {total > 0 && (
          <Card className="p-3" aria-live="polite" data-testid="status-strip">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">Total: {total}</Badge>
              {counts.uploading > 0 && <Badge className="bg-muted">Uploading: {counts.uploading}</Badge>}
              {counts.analyzing > 0 && (
                <Badge className="bg-blue-500/10 text-blue-700">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin inline" /> Analysing: {counts.analyzing}
                </Badge>
              )}
              <Badge className="bg-green-500/10 text-green-700">Ready: {counts.ready}</Badge>
              {counts.saving > 0 && <Badge className="bg-yellow-500/10 text-yellow-700">Saving: {counts.saving}</Badge>}
              <Badge className="bg-primary/10 text-primary">Saved: {counts.saved}</Badge>
              {counts.error > 0 && (
                <Badge className="bg-destructive/10 text-destructive">Failed: {counts.error}</Badge>
              )}
            </div>
          </Card>
        )}

        {/* Summary card when all work is complete */}
        {showSummary && (
          <Card className="p-4 border-primary/30" data-testid="summary-card">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-primary" />
              <div>
                <p className="font-medium">সব কাজ শেষ</p>
                <p className="text-sm text-muted-foreground">
                  {counts.saved}টি প্রোডাক্ট সফলভাবে যুক্ত হয়েছে
                  {counts.error > 0 ? `, ${counts.error}টি ছবিতে সমস্যা — retry করুন বা remove করুন।` : "।"}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Upload zone */}
        <Card
          ref={dragRef}
          onDragOver={(e) => { e.preventDefault(); dragRef.current?.classList.add("ring-primary"); }}
          onDragLeave={() => dragRef.current?.classList.remove("ring-primary")}
          onDrop={onDrop}
          className="border-2 border-dashed p-8 text-center ring-2 ring-transparent transition-colors"
        >
          <ImagePlus className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">এখানে ছবি ড্রাগ করুন অথবা</p>
          <label className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer hover:opacity-90">
            <Upload className="w-4 h-4" /> ছবি সিলেক্ট করুন
            <input type="file" multiple accept="image/*" className="hidden" onChange={onFileInput} />
          </label>
          <p className="text-xs text-muted-foreground mt-3">
            সর্বোচ্চ {MAX_IMAGES}টি ছবি একসাথে (JPG/PNG/WEBP)। প্রতিটি ছবির জন্য একটি product তৈরি হবে।
          </p>
        </Card>

        {/* Draft grid */}
        {drafts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {drafts.map((d) => (
              <DraftCard
                key={d.id}
                draft={d}
                suggestions={suggestions}
                onChange={(patch) => updateDraft(d.id, patch)}
                onRemove={() => removeDraft(d.id)}
                onReanalyze={() => d.imageUrl && analyzeOne(d.id, d.imageUrl)}
                onSave={() => saveOne(d)}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

/**
 * SelectWithNew — a Select that also lets the admin type a brand-new value
 * when their AI-generated option isn't already in the pool. We keep the
 * choice controlled by the parent's string state so it round-trips into the
 * DB insert exactly like the manual Add Product form's datalist input.
 */
function SelectWithNew({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  const inPool = value && options.includes(value);
  // If the AI produced a value that isn't yet in the pool we still want to
  // show it as the selected item; merge it in for this render.
  const merged = inPool || !value ? options : [value, ...options];
  return (
    <div className="space-y-1">
      <Select
        value={value || undefined}
        onValueChange={(v) => {
          if (v === NEW_VALUE) return;
          onChange(v);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {merged.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Or type a new ${placeholder.toLowerCase()}`}
        className="h-7 text-xs"
      />
    </div>
  );
}

function DraftCard({
  draft: d,
  suggestions,
  onChange,
  onRemove,
  onReanalyze,
  onSave,
}: {
  draft: Draft;
  suggestions?: ReturnType<typeof useProductFieldSuggestions>["data"];
  onChange: (p: Partial<Draft>) => void;
  onRemove: () => void;
  onReanalyze: () => void;
  onSave: () => void;
}) {
  const statusColor: Record<DraftStatus, string> = {
    uploading: "bg-muted",
    analyzing: "bg-blue-500/10 text-blue-600",
    ready: "bg-green-500/10 text-green-700",
    saving: "bg-yellow-500/10 text-yellow-700",
    saved: "bg-primary/10 text-primary",
    error: "bg-destructive/10 text-destructive",
  };

  const categoryOptions = suggestions?.categories ?? [];
  const subOptions = d.category
    ? suggestions?.subcategoriesByCategory[d.category] ?? []
    : [];
  const fabricOptions = suggestions?.fabrics ?? [];
  const workOptions = suggestions?.workTypes ?? [];

  const toggleSize = (s: string) => {
    const next = d.sizes.includes(s) ? d.sizes.filter((x) => x !== s) : [...d.sizes, s].sort();
    onChange({ sizes: next });
  };

  const isFailed = d.status === "error";

  return (
    <Card
      className={`p-4 space-y-3 ${isFailed ? "border-destructive/40" : ""}`}
      data-testid="draft-card"
      data-status={d.status}
    >
      <div className="flex gap-3">
        <div className="w-32 h-32 flex-shrink-0 rounded-md overflow-hidden bg-muted relative">
          {d.imageUrl ? (
            <img src={d.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Badge className={statusColor[d.status]} variant="secondary">
              {(d.status === "analyzing" || d.status === "saving") && (
                <Loader2 className="w-3 h-3 mr-1 animate-spin inline" />
              )}
              {d.status}
            </Badge>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={onReanalyze}
                disabled={!d.imageUrl || d.status === "analyzing"}
                data-testid="retry-btn"
                title="Re-analyse"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onRemove} data-testid="remove-btn" title="Remove">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {d.status === "uploading" && <Progress value={d.progress} className="h-2" />}
          {isFailed && (
            <div
              className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive space-y-2"
              role="alert"
            >
              <div className="flex items-start gap-1">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span className="break-all">{d.error || "Unknown error"}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={onReanalyze} disabled={!d.imageUrl}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
                </Button>
                <Button size="sm" variant="ghost" onClick={onRemove}>
                  <X className="w-3.5 h-3.5 mr-1" /> Remove
                </Button>
              </div>
            </div>
          )}
          <Input
            placeholder="Product name (Bangla)"
            value={d.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Category</Label>
          <SelectWithNew
            value={d.category}
            onChange={(v) => onChange({ category: v })}
            options={categoryOptions}
            placeholder="Category"
          />
        </div>
        <div>
          <Label className="text-xs">Subcategory</Label>
          <SelectWithNew
            value={d.subcategory}
            onChange={(v) => onChange({ subcategory: v })}
            options={subOptions}
            placeholder="Subcategory"
          />
        </div>
        <div>
          <Label className="text-xs">Fabric</Label>
          <SelectWithNew
            value={d.fabric}
            onChange={(v) => onChange({ fabric: v })}
            options={fabricOptions}
            placeholder="Fabric"
          />
        </div>
        <div>
          <Label className="text-xs">Work Type</Label>
          <SelectWithNew
            value={d.work_type}
            onChange={(v) => onChange({ work_type: v })}
            options={workOptions}
            placeholder="Work"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div>
          <Label className="text-xs">Part</Label>
          <Input value={d.part} onChange={(e) => onChange({ part: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Stock qty</Label>
          <Input
            type="number"
            min={0}
            value={d.stock}
            onChange={(e) => onChange({ stock: Math.max(0, Number(e.target.value) || 0) })}
            data-testid="stock-input"
          />
        </div>
        <div>
          <Label className="text-xs">Price ৳</Label>
          <Input
            type="number"
            value={d.price}
            onChange={(e) => onChange({ price: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs">Sale ৳</Label>
          <Input
            type="number"
            value={d.sale_price ?? ""}
            onChange={(e) =>
              onChange({ sale_price: e.target.value ? Number(e.target.value) : null })
            }
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Sizes (52–58 default)</Label>
        <div className="flex flex-wrap gap-1.5 mt-1" data-testid="size-chips">
          {SIZE_POOL.map((s) => {
            const active = d.sizes.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSize(s)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted border-input"
                }`}
                aria-pressed={active}
              >
                {s}"
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="text-xs">Colors (comma-separated)</Label>
        <Input value={d.colors} onChange={(e) => onChange({ colors: e.target.value })} />
        {suggestions?.colors?.length ? (
          <div className="flex flex-wrap gap-1 mt-1">
            {suggestions.colors.slice(0, 12).map((c) => (
              <button
                key={c}
                type="button"
                className="px-2 py-0.5 rounded text-[11px] border hover:bg-muted"
                onClick={() => {
                  const existing = d.colors.split(",").map((x) => x.trim()).filter(Boolean);
                  if (existing.includes(c)) return;
                  onChange({ colors: [...existing, c].join(", ") });
                }}
              >
                + {c}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.hijab_included}
            onChange={(e) => onChange({ hijab_included: e.target.checked })}
          />
          Hijab included
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.inner_included}
            onChange={(e) => onChange({ inner_included: e.target.checked })}
          />
          Inner included
        </label>
      </div>

      <div>
        <Label className="text-xs">Description (Bangla)</Label>
        <Textarea rows={5} value={d.description} onChange={(e) => onChange({ description: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Meta Title</Label>
          <Input value={d.meta_title} onChange={(e) => onChange({ meta_title: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Alt Text</Label>
          <Input value={d.image_alt_text} onChange={(e) => onChange({ image_alt_text: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Meta Description</Label>
          <Input value={d.meta_description} onChange={(e) => onChange({ meta_description: e.target.value })} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={onSave} disabled={d.status !== "ready" && d.status !== "error"}>
          <Save className="w-4 h-4 mr-2" /> Save this product
        </Button>
      </div>
    </Card>
  );
}
