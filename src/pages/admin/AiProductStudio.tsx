/**
 * AI Product Studio — bulk image upload → AI-generated product drafts → save.
 *
 * Flow:
 *  1. Admin uploads N images (drag/drop or picker). Each image is compressed +
 *     uploaded to Supabase Storage (`product-images` bucket).
 *  2. For each uploaded image the browser calls the `analyze-product-image`
 *     edge function which returns a full product draft (Bangla name, category,
 *     fabric, work type, colors, price, description, SEO...).
 *  3. Admin can edit any field inline, then bulk-save. Saved rows are inserted
 *     into `products` with stock=10 and sizes=52,54,56,58 by default.
 */
import { useState, useCallback, useRef } from "react";
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
import { toast } from "sonner";
import { Sparkles, Upload, Loader2, X, RefreshCw, Save, ImagePlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const DEFAULT_SIZES = ["52", "54", "56", "58"];
const DEFAULT_STOCK = 10;
const MAX_IMAGES = 20;

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
  colors: string; // comma sep for editing
  sizes: string; // comma sep
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
    sizes: DEFAULT_SIZES.join(","),
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
      // Placeholder draft while uploading
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
      // Fire AI analysis (do not await sequentially — parallel)
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
        sizes: d.sizes.split(",").map((s) => s.trim()).filter(Boolean),
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

  const readyCount = drafts.filter((d) => d.status === "ready").length;
  const savedCount = drafts.filter((d) => d.status === "saved").length;

  return (
    <AdminLayout>
      <div className="space-y-6">
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
            <Badge variant="secondary">Ready: {readyCount}</Badge>
            <Badge variant="secondary">Saved: {savedCount}</Badge>
            <Button onClick={saveAll} disabled={!readyCount || globalBusy}>
              {globalBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save All ({readyCount})
            </Button>
          </div>
        </div>

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

function DraftCard({
  draft: d,
  onChange,
  onRemove,
  onReanalyze,
  onSave,
}: {
  draft: Draft;
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

  return (
    <Card className="p-4 space-y-3">
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
              {d.status === "analyzing" && <Loader2 className="w-3 h-3 mr-1 animate-spin inline" />}
              {d.status}
            </Badge>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={onReanalyze} disabled={!d.imageUrl || d.status === "analyzing"}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onRemove}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {d.status === "uploading" && <Progress value={d.progress} className="h-2" />}
          {d.error && <p className="text-xs text-destructive">{d.error}</p>}
          <Input
            placeholder="Product name (Bangla)"
            value={d.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Category" value={d.category} onChange={(e) => onChange({ category: e.target.value })} />
            <Input placeholder="Subcategory" value={d.subcategory} onChange={(e) => onChange({ subcategory: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div>
          <Label className="text-xs">Fabric</Label>
          <Input value={d.fabric} onChange={(e) => onChange({ fabric: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Work</Label>
          <Input value={d.work_type} onChange={(e) => onChange({ work_type: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Part</Label>
          <Input value={d.part} onChange={(e) => onChange({ part: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Stock</Label>
          <Input type="number" value={d.stock} onChange={(e) => onChange({ stock: Number(e.target.value) || 0 })} />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Colors (comma-separated)</Label>
          <Input value={d.colors} onChange={(e) => onChange({ colors: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Sizes</Label>
          <Input value={d.sizes} onChange={(e) => onChange({ sizes: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Price ৳</Label>
          <Input type="number" value={d.price} onChange={(e) => onChange({ price: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <Label className="text-xs">Sale ৳</Label>
          <Input type="number" value={d.sale_price ?? ""} onChange={(e) => onChange({ sale_price: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.hijab_included} onChange={(e) => onChange({ hijab_included: e.target.checked })} />
          Hijab
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.inner_included} onChange={(e) => onChange({ inner_included: e.target.checked })} />
          Inner
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
