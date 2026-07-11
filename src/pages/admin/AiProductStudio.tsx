/**
 * AI Product Studio — bulk image upload → AI-generated product drafts → save.
 *
 * Highlights (this revision):
 *  - Configurable **parallelism** (1–6): a worker pool decides how many
 *    uploads/analyses run concurrently. Prevents rate-limits and lets the
 *    admin trade speed for stability.
 *  - **Cancel** button while work is in-flight: stops new tasks from starting
 *    and marks queued drafts as error("Cancelled"). In-flight uploads finish
 *    naturally (their fetch has no signal wired), but their analyse call is
 *    skipped once cancel is pressed.
 *  - **Retry preserves history**: each attempt bumps `attempts` and pushes the
 *    prior error into `errorHistory`, so admins can see exactly what failed
 *    on each try when they Retry a card.
 *  - **Inline validation** before Save All: every draft is checked for the
 *    mandatory Product-form fields (name, category, price, at least one
 *    size, positive stock). Missing fields show as a coloured inline banner
 *    on the card and a top-level summary; invalid drafts are skipped in the
 *    bulk save with an explanatory toast.
 */
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
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
  StopCircle,
  History,
  Download,
  FileJson,
  Gauge,
  Copy,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProductFieldSuggestions } from "@/hooks/admin/useProductFieldSuggestions";
import {
  DEFAULT_RULES,
  applyRule,
  type SizeRuleSet,
} from "@/lib/admin/aiStudio/sizeRules";
import { RuleBuilder } from "@/components/admin/aiStudio/RuleBuilder";
import { ImageZoomDialog } from "@/components/admin/aiStudio/ImageZoomDialog";
import {
  draftsToCsv,
  draftsToJson,
  download,
} from "@/lib/admin/aiStudio/exportDrafts";
import { validateSchema, type FieldError } from "@/lib/admin/aiStudio/validator";

const DEFAULT_SIZES = ["52", "54", "56", "58"];
const SIZE_POOL = ["50", "52", "54", "56", "58", "60", "62"];
const DEFAULT_STOCK = 10;
const MAX_IMAGES = 20;
const CONCURRENCY_OPTIONS = [1, 2, 3, 4, 6];

interface SkippedItem {
  filename: string;
  hash: string;
  reason: "existing-session" | "duplicate-in-batch";
}

type DraftStatus = "queued" | "uploading" | "analyzing" | "ready" | "saving" | "saved" | "error" | "cancelled";

interface Draft {
  id: string;
  file?: File;
  imageUrl: string;
  status: DraftStatus;
  error?: string;
  /** Every failed attempt appended here so the admin sees the full retry history. */
  errorHistory: string[];
  /** Number of times AI analysis has been attempted (0 before first run). */
  attempts: number;
  progress: number;
  /** SHA-256 hex of the file bytes — used for de-dup across the current session. */
  fileHash?: string;
  /** Wall-clock timings (ms since epoch) for per-image duration metrics. */
  uploadStartedAt?: number;
  uploadEndedAt?: number;
  analyzeStartedAt?: number;
  analyzeEndedAt?: number;
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

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fmtMs(ms?: number): string {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
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
    errorHistory: [],
    attempts: 0,
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

/**
 * Required-field check that mirrors ProductFormDialog + the DB NOT NULL
 * constraints. Returns human-readable Bangla labels for anything missing.
 */
export function validateDraft(d: Draft): string[] {
  const missing: string[] = [];
  if (!d.name.trim()) missing.push("Name");
  if (!d.category.trim()) missing.push("Category");
  if (!d.price || d.price <= 0) missing.push("Price (>0)");
  if (!d.sizes || d.sizes.length === 0) missing.push("At least 1 Size");
  if (d.stock == null || d.stock < 0) missing.push("Stock (≥0)");
  if (d.sale_price != null && d.sale_price >= d.price) missing.push("Sale < Price");
  return missing;
}

export default function AiProductStudio() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [globalBusy, setGlobalBusy] = useState(false);
  const [concurrency, setConcurrency] = useState(3);
  const [rules, setRules] = useState<SizeRuleSet>(DEFAULT_RULES);
  const [skippedItems, setSkippedItems] = useState<SkippedItem[]>([]);
  const [batchStartedAt, setBatchStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [zoomFor, setZoomFor] = useState<Draft | null>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: suggestions } = useProductFieldSuggestions();

  // tick every 500ms so throughput/timers update while batch is running
  useEffect(() => {
    if (!batchStartedAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [batchStartedAt]);

  /**
   * Cancellation flag. When the admin clicks Cancel we set this ref → new
   * queue workers exit their loop and any analyseOne call that hasn't yet
   * left the client aborts (`shouldSkip` check below). Refs avoid stale
   * closures inside the pool workers.
   */
  const cancelRef = useRef(false);

  const updateDraft = useCallback((id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  /**
   * Run AI analysis on one draft. Preserves error history across retries so
   * the DraftCard can show a chronological list of what failed and why.
   */
  const analyzeOne = useCallback(async (id: string, imageUrl: string) => {
    const startedAt = Date.now();
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const nextHistory = d.error ? [...d.errorHistory, d.error] : d.errorHistory;
        return {
          ...d,
          status: "analyzing",
          error: undefined,
          errorHistory: nextHistory,
          attempts: d.attempts + 1,
          analyzeStartedAt: startedAt,
          analyzeEndedAt: undefined,
        };
      }),
    );

    if (cancelRef.current) {
      updateDraft(id, { status: "cancelled", error: "Cancelled before analysis started", analyzeEndedAt: Date.now() });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("analyze-product-image", {
        body: { imageUrl },
      });
      if (error) throw error;
      const d = data?.draft || {};
      const cat = d.category || "Abaya";
      const applied = applyRule({ category: cat }, rules);
      updateDraft(id, {
        status: "ready",
        analyzeEndedAt: Date.now(),
        name: d.name || "",
        category: cat,
        subcategory: d.subcategory || "",
        fabric: d.fabric || "",
        work_type: d.work_type || "",
        part: d.part || "1 Part",
        hijab_included: !!d.hijab_included,
        inner_included: !!d.inner_included,
        colors: Array.isArray(d.colors) ? d.colors.join(", ") : "",
        sizes: applied.sizes,
        stock: applied.stock,
        price: Number(d.estimated_price_bdt) || 0,
        sale_price: d.sale_price_bdt ? Number(d.sale_price_bdt) : null,
        description: d.description || "",
        meta_title: d.meta_title || "",
        meta_description: d.meta_description || "",
        image_alt_text: d.image_alt_text || "",
      });
    } catch (e: any) {
      const msg = e?.message || String(e);
      updateDraft(id, { status: "error", error: msg, analyzeEndedAt: Date.now() });
      toast.error(`AI বিশ্লেষণে ব্যর্থ: ${msg}`);
    }
  }, [updateDraft, rules]);


  /**
   * Worker-pool driven bulk upload. `concurrency` decides how many files
   * simultaneously go through upload → analyse. Each worker pops the next
   * task off a shared queue until either the queue is empty or Cancel is
   * pressed. Cancelled/queued tasks are marked as error("Cancelled").
   */
  const handleFiles = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;

    // ── De-dup: hash every incoming file first and drop any file whose
    //    hash already exists on a live draft (avoids re-analyse and
    //    accidental double-save of the same product image).
    const existingHashes = new Set(
      drafts.map((d) => d.fileHash).filter(Boolean) as string[],
    );
    const seenThisBatch = new Set<string>();
    const accepted: Array<{ id: string; file: File; fileHash: string }> = [];
    const newlySkipped: SkippedItem[] = [];
    for (const file of imgs) {
      let hash = "";
      try {
        hash = await sha256Hex(file);
      } catch {
        hash = `${file.name}:${file.size}:${file.lastModified}`;
      }
      if (existingHashes.has(hash)) {
        newlySkipped.push({ filename: file.name, hash, reason: "existing-session" });
        continue;
      }
      if (seenThisBatch.has(hash)) {
        newlySkipped.push({ filename: file.name, hash, reason: "duplicate-in-batch" });
        continue;
      }
      seenThisBatch.add(hash);
      accepted.push({ id: newId(), file, fileHash: hash });
    }
    if (newlySkipped.length > 0) {
      setSkippedItems((prev) => [...prev, ...newlySkipped]);
      toast.warning(`${newlySkipped.length}টি ডুপ্লিকেট ছবি স্কিপ করা হয়েছে`);
    }
    if (!accepted.length) return;
    if (drafts.length + accepted.length > MAX_IMAGES) {
      toast.error(`একসাথে সর্বোচ্চ ${MAX_IMAGES}টি ছবি`);
      return;
    }

    cancelRef.current = false;
    setGlobalBusy(true);
    setBatchStartedAt(Date.now());

    // Seed as queued so the admin sees the whole list, and so cancel can
    // distinguish untouched jobs from in-flight ones without racing.
    setDrafts((prev) => [
      ...prev,
      ...accepted.map((j) => ({
        ...emptyDraft(j.id, "", j.file),
        fileHash: j.fileHash,
        status: "queued" as DraftStatus,
      })),
    ]);

    const queue = [...accepted];
    const worker = async () => {
      while (queue.length > 0) {
        if (cancelRef.current) break;
        const job = queue.shift()!;
        const uploadStartedAt = Date.now();
        updateDraft(job.id, { status: "uploading", uploadStartedAt });
        try {
          const res = await uploadProductImage(job.file, {
            folder: "ai-studio",
            onProgress: (e) => updateDraft(job.id, { progress: e.progress }),
          });
          const uploadEndedAt = Date.now();
          if (cancelRef.current) {
            updateDraft(job.id, { status: "cancelled", error: "Cancelled after upload", uploadEndedAt });
            continue;
          }
          if (!res.success || !res.url) {
            updateDraft(job.id, { status: "error", error: res.error || "Upload failed", uploadEndedAt });
            toast.error(`আপলোড ব্যর্থ: ${res.error}`);
            continue;
          }
          updateDraft(job.id, { imageUrl: res.url, progress: 100, uploadEndedAt });
          await analyzeOne(job.id, res.url);
        } catch (e: any) {
          updateDraft(job.id, { status: "error", error: e?.message || "Unexpected error", uploadEndedAt: Date.now() });
        }
      }
    };

    const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
    await Promise.all(workers);

    // Only mark still-queued jobs as cancelled — never touch drafts that
    // have already reached ready/saved/error terminal states.
    if (cancelRef.current) {
      setDrafts((prev) =>
        prev.map((d) =>
          d.status === "queued"
            ? { ...d, status: "cancelled", error: "Cancelled before start" }
            : d,
        ),
      );
    }

    setGlobalBusy(false);
  }, [drafts, analyzeOne, updateDraft, concurrency]);


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

  const cancelAll = useCallback(() => {
    cancelRef.current = true;
    toast.message("Cancelling — running tasks will stop shortly");
  }, []);

  const saveOne = useCallback(async (d: Draft): Promise<boolean> => {
    const missing = validateDraft(d);
    if (missing.length) {
      toast.error(`Missing: ${missing.join(", ")}`);
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
    const valid = ready.filter((d) => validateDraft(d).length === 0);
    const invalidCount = ready.length - valid.length;
    if (invalidCount > 0) {
      toast.warning(`${invalidCount}টি draft-এ বাধ্যতামূলক তথ্য মিসিং — স্কিপ করা হবে`);
    }
    if (!valid.length) return;
    setGlobalBusy(true);
    let ok = 0;
    for (const d of valid) {
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
    const c = { queued: 0, uploading: 0, analyzing: 0, ready: 0, saving: 0, saved: 0, error: 0, cancelled: 0 };
    for (const d of drafts) c[d.status]++;
    return c;
  }, [drafts]);

  const invalidReadyCount = useMemo(
    () => drafts.filter((d) => d.status === "ready" && validateSchema(d as any).length > 0).length,
    [drafts],
  );

  const total = drafts.length;
  const inFlight = counts.queued + counts.uploading + counts.analyzing + counts.saving;
  const showSummary = total > 0 && inFlight === 0 && (counts.saved > 0 || counts.error > 0 || counts.cancelled > 0);

  // Batch throughput: how many drafts have moved past analysis / were saved.
  const processed = counts.ready + counts.saved + counts.error + counts.cancelled;
  const elapsedMs = batchStartedAt ? now - batchStartedAt : 0;
  const throughput = elapsedMs > 0 && processed > 0
    ? (processed / (elapsedMs / 1000))
    : 0;

  // Reset batch timer once everything is idle.
  useEffect(() => {
    if (batchStartedAt && inFlight === 0) {
      // keep the value so the summary shows final throughput; only clear on next batch
    }
  }, [batchStartedAt, inFlight]);

  const applyRulesToAll = useCallback(() => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.status !== "ready") return d;
        const { sizes, stock } = applyRule({ category: d.category }, rules);
        return { ...d, sizes, stock };
      }),
    );
    toast.success("Rules applied to all ready drafts");
  }, [rules]);

  const exportCsv = useCallback(() => {
    if (!drafts.length) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    download(`ai-studio-drafts-${stamp}.csv`, draftsToCsv(drafts as any), "text/csv");
  }, [drafts]);

  const exportJson = useCallback(() => {
    if (!drafts.length) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    download(`ai-studio-drafts-${stamp}.json`, draftsToJson(drafts as any), "application/json");
  }, [drafts]);




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
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Parallel</Label>
              <Select
                value={String(concurrency)}
                onValueChange={(v) => setConcurrency(Number(v))}
                disabled={inFlight > 0}
              >
                <SelectTrigger className="h-9 w-20" data-testid="concurrency-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONCURRENCY_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inFlight > 0 && (
              <Button variant="destructive" onClick={cancelAll} data-testid="cancel-btn">
                <StopCircle className="w-4 h-4 mr-2" /> Cancel
              </Button>
            )}
            <Button variant="outline" onClick={exportCsv} disabled={!drafts.length} data-testid="export-csv">
              <Download className="w-4 h-4 mr-2" /> CSV
            </Button>
            <Button variant="outline" onClick={exportJson} disabled={!drafts.length} data-testid="export-json">
              <FileJson className="w-4 h-4 mr-2" /> JSON
            </Button>
            <Button onClick={saveAll} disabled={!counts.ready || globalBusy} data-testid="save-all">
              {globalBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save All ({counts.ready})
            </Button>
          </div>
        </div>

        {/* Rule builder for size/stock auto-fill with per-category exceptions */}
        <RuleBuilder rules={rules} onChange={setRules} onApplyAll={applyRulesToAll} />

        {/* Live status strip with overall progress + throughput */}
        {total > 0 && (
          <Card className="p-3 space-y-2" aria-live="polite" data-testid="status-strip">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">Total: {total}</Badge>
              <Badge className="bg-muted" data-testid="count-uploaded">
                Uploaded: {total - counts.queued}
              </Badge>
              <Badge className="bg-blue-500/10 text-blue-700" data-testid="count-analyzed">
                Analyzed: {counts.ready + counts.saved}
              </Badge>
              <Badge className="bg-green-500/10 text-green-700" data-testid="count-ready">Ready: {counts.ready}</Badge>
              <Badge className="bg-primary/10 text-primary" data-testid="count-saved">Saved: {counts.saved}</Badge>
              {counts.cancelled > 0 && (
                <Badge className="bg-muted text-muted-foreground" data-testid="count-cancelled">
                  Cancelled: {counts.cancelled}
                </Badge>
              )}
              {counts.error > 0 && (
                <Badge className="bg-destructive/10 text-destructive">Failed: {counts.error}</Badge>
              )}
              {batchStartedAt && (
                <Badge variant="outline" data-testid="throughput" title="Average images per second">
                  <Gauge className="w-3 h-3 mr-1" />
                  {throughput.toFixed(2)} img/s · {(elapsedMs / 1000).toFixed(1)}s
                </Badge>
              )}
            </div>
            <Progress value={total ? (processed / total) * 100 : 0} className="h-1.5" />
          </Card>
        )}

        {/* Skipped duplicates */}
        {skippedItems.length > 0 && (
          <Card className="p-3 border-orange-500/40 bg-orange-500/5" data-testid="skipped-card">
            <details>
              <summary className="cursor-pointer text-sm flex items-center gap-2">
                <Copy className="w-4 h-4 text-orange-700" />
                <span className="font-medium">{skippedItems.length}টি ডুপ্লিকেট ছবি স্কিপ হয়েছে</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6"
                  onClick={(e) => { e.preventDefault(); setSkippedItems([]); }}
                >
                  Clear
                </Button>
              </summary>
              <ul className="mt-2 space-y-1 text-xs">
                {skippedItems.map((s, i) => (
                  <li key={i} className="flex gap-2 items-center">
                    <Badge variant="outline" className="text-[9px]">
                      {s.reason === "existing-session" ? "already-added" : "in-batch-dupe"}
                    </Badge>
                    <span className="font-medium">{s.filename}</span>
                    <span className="font-mono text-muted-foreground">sha256:{s.hash.slice(0, 12)}…</span>
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        )}

        {/* Aggregate validation warning */}
        {invalidReadyCount > 0 && (
          <Card
            className="p-3 border-yellow-500/40 bg-yellow-500/5"
            role="status"
            data-testid="validation-summary"
          >
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-700" />
              <span>
                <strong>{invalidReadyCount}</strong>টি ready draft-এ বাধ্যতামূলক তথ্য মিসিং।
                Save All চাপলে সেগুলো স্কিপ হবে — কার্ডে হলুদ warning দেখে ফিল্ডগুলো পূরণ করুন।
              </span>
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
            বর্তমান parallel: {concurrency}।
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
                onZoom={() => setZoomFor(d)}
              />
            ))}
          </div>
        )}
      </div>
      {zoomFor && (
        <ImageZoomDialog
          open={!!zoomFor}
          onOpenChange={(v) => !v && setZoomFor(null)}
          imageUrl={zoomFor.imageUrl}
          filename={zoomFor.file?.name}
          hash={zoomFor.fileHash}
        />
      )}
    </AdminLayout>
  );
}

/**
 * SelectWithNew — a Select that also lets the admin type a brand-new value
 * when their AI-generated option isn't already in the pool.
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
  const merged = inPool || !value ? options : [value, ...options];
  return (
    <div className="space-y-1">
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {merged.map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
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
  onZoom,
}: {
  draft: Draft;
  suggestions?: ReturnType<typeof useProductFieldSuggestions>["data"];
  onChange: (p: Partial<Draft>) => void;
  onRemove: () => void;
  onReanalyze: () => void;
  onSave: () => void;
  onZoom?: () => void;
}) {
  const statusColor: Record<DraftStatus, string> = {
    queued: "bg-muted text-muted-foreground",
    uploading: "bg-muted",
    analyzing: "bg-blue-500/10 text-blue-600",
    ready: "bg-green-500/10 text-green-700",
    saving: "bg-yellow-500/10 text-yellow-700",
    saved: "bg-primary/10 text-primary",
    error: "bg-destructive/10 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
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
  const schemaErrors: FieldError[] = d.status === "ready" ? validateSchema(d as any) : [];
  const hasMissing = schemaErrors.length > 0;
  const errorFields = new Set(schemaErrors.map((e) => e.field));
  const fieldClass = (name: string) =>
    errorFields.has(name as any) ? "ring-2 ring-yellow-500/60 rounded-md" : "";

  return (
    <Card
      className={`p-4 space-y-3 ${isFailed ? "border-destructive/40" : hasMissing ? "border-yellow-500/40" : ""}`}
      data-testid="draft-card"
      data-status={d.status}
    >
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onZoom}
          className="w-32 h-32 flex-shrink-0 rounded-md overflow-hidden bg-muted relative group cursor-zoom-in"
          data-testid="thumb-zoom"
          disabled={!d.imageUrl}
        >
          {d.imageUrl ? (
            <>
              <img src={d.imageUrl} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
              {d.fileHash && (
                <span className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/60 text-white font-mono px-1 py-0.5 truncate">
                  {d.fileHash.slice(0, 10)}…
                </span>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge className={statusColor[d.status]} variant="secondary">
                {(d.status === "analyzing" || d.status === "saving") && (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin inline" />
                )}
                {d.status}
              </Badge>
              {d.attempts > 1 && (
                <Badge variant="outline" className="text-[10px]" title="Attempt count">
                  <History className="w-3 h-3 mr-1" /> #{d.attempts}
                </Badge>
              )}
            </div>
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

          {/* Per-image timing metrics — visible once a phase has started. */}
          {(d.uploadStartedAt || d.analyzeStartedAt) && (
            <div
              className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground"
              data-testid="timing-metrics"
            >
              {d.uploadStartedAt && (
                <span title="Upload duration">
                  ⬆ upload: {fmtMs((d.uploadEndedAt ?? Date.now()) - d.uploadStartedAt)}
                </span>
              )}
              {d.analyzeStartedAt && (
                <span title="AI analyse duration">
                  🤖 analyse: {fmtMs((d.analyzeEndedAt ?? Date.now()) - d.analyzeStartedAt)}
                </span>
              )}
              {d.uploadStartedAt && (d.analyzeEndedAt || d.uploadEndedAt) && (
                <span title="Total wall time">
                  Σ total: {fmtMs((d.analyzeEndedAt ?? d.uploadEndedAt ?? Date.now()) - d.uploadStartedAt)}
                </span>
              )}
            </div>
          )}

          {/* Current failure banner */}
          {isFailed && (
            <div
              className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive space-y-2"
              role="alert"
              data-testid="error-banner"
            >
              <div className="flex items-start gap-1">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span className="break-all">
                  <strong>Attempt {d.attempts || 1}:</strong> {d.error || "Unknown error"}
                </span>
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

          {/* Persistent history of previous failed attempts (only shown when
              there is prior history so admins can see what changed after
              Retry). Never removed once populated so context isn't lost. */}
          {d.errorHistory.length > 0 && (
            <details className="text-xs text-muted-foreground" data-testid="error-history">
              <summary className="cursor-pointer flex items-center gap-1">
                <History className="w-3 h-3" />
                Previous attempts ({d.errorHistory.length})
              </summary>
              <ol className="mt-1 list-decimal pl-5 space-y-0.5">
                {d.errorHistory.map((msg, i) => (
                  <li key={i} className="break-all">{msg}</li>
                ))}
              </ol>
            </details>
          )}

          <Input
            placeholder="Product name (Bangla)"
            value={d.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
      </div>

      {/* Inline validation banner for ready-but-incomplete drafts */}
      {hasMissing && (
        <div
          className="rounded border border-yellow-500/40 bg-yellow-500/5 p-2 text-xs text-yellow-800 flex items-start gap-2"
          role="status"
          data-testid="validation-banner"
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>
            <strong>বাধ্যতামূলক তথ্য মিসিং:</strong>{" "}
            {schemaErrors.map((e) => `${e.label} (${e.message})`).join(" · ")}
          </div>
        </div>
      )}

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
        <Button
          size="sm"
          onClick={onSave}
          disabled={d.status !== "ready" || hasMissing}
          title={hasMissing ? `Missing: ${schemaErrors.map((e) => e.label).join(", ")}` : undefined}
        >
          <Save className="w-4 h-4 mr-2" /> Save this product
        </Button>
      </div>
    </Card>
  );
}
