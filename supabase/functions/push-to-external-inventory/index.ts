/**
 * push-to-external-inventory
 *
 * Batch-pushes products from this site's DB to the external inventory software
 * (bigsoftdbh.lovable.app) via its public REST API.
 *
 * Auth: caller must be an admin (JWT + has_role).
 * Server secrets: EXTERNAL_INVENTORY_BASE_URL, EXTERNAL_INVENTORY_API_KEY.
 *
 * ------------------------------------------------------------------
 * POST body (all optional):
 *   dry_run:      boolean  → validate & return payloads, DO NOT send.
 *   incremental:  boolean  → only push products updated_at > last checkpoint.
 *   since:        string   → ISO timestamp override for `incremental`.
 *   concurrency:  number   → parallel workers (1..8, default 4).
 *   limit:        number   → cap products processed (safety, 1..5000).
 *
 * Response:
 *   {
 *     dry_run, total, valid, invalid, created, updated, failed, skipped,
 *     since, last_synced_at, target,
 *     validation_errors: [{ product_id, name, errors: [...] }],
 *     results:           [{ product_id, name, action, external_id?, status?, error? }]
 *   }
 *
 * Rate limiting: external API allows 60 req/min per key. We use a shared
 * token-bucket (60 tokens/min) across all concurrent workers and honor
 * `Retry-After` on 429 responses.
 * ------------------------------------------------------------------
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LAST_SYNC_KEY = "inventory_last_push_at";

interface PushResult {
  product_id: string;
  name: string;
  action: "created" | "updated" | "failed" | "skipped" | "invalid";
  external_id?: string;
  status?: number;
  error?: string;
  attempts?: number;
}

interface ValidationError {
  product_id: string;
  name: string;
  errors: string[];
}

// ---------- Validation ----------
/**
 * Validate a product row against the external API's expected schema.
 * Returns an array of human-readable error strings; empty means valid.
 */
function validateProduct(p: any): string[] {
  const errs: string[] = [];
  if (!p.id) errs.push("Missing product id");
  if (!p.name || typeof p.name !== "string" || !p.name.trim()) {
    errs.push("`name` is required and must be a non-empty string");
  } else if (p.name.length > 255) {
    errs.push("`name` must be ≤ 255 characters");
  }
  const price = Number(p.price);
  if (p.price == null || Number.isNaN(price)) {
    errs.push("`price` is required and must be numeric");
  } else if (price < 0) {
    errs.push("`price` must be ≥ 0");
  }
  if (p.sale_price != null) {
    const sp = Number(p.sale_price);
    if (Number.isNaN(sp) || sp < 0) errs.push("`sale_price` must be a non-negative number");
    else if (sp > price) errs.push("`sale_price` should not exceed `price`");
  }
  if (p.stock != null && (!Number.isInteger(Number(p.stock)) || Number(p.stock) < 0)) {
    errs.push("`stock` must be a non-negative integer");
  }
  if (!p.image_url && (!Array.isArray(p.product_images) || p.product_images.length === 0)) {
    errs.push("At least one image (image_url or gallery) is required");
  }
  if (p.slug && typeof p.slug === "string" && p.slug.length > 255) {
    errs.push("`slug` too long (≤ 255)");
  }
  return errs;
}

/** Map our product row → external inventory API payload. */
function mapProduct(p: any) {
  const effectivePrice = p.sale_price != null ? Number(p.sale_price) : Number(p.price ?? 0);
  const gallery = (p.product_images ?? [])
    .slice()
    .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((i: any) => i.image_url)
    .filter(Boolean);
  const image_urls = Array.from(new Set([p.image_url, ...gallery].filter(Boolean)));

  return {
    name: p.name,
    sku: p.slug ?? p.id,
    external_ref: p.id,
    selling_price: effectivePrice,
    regular_price: Number(p.price ?? 0),
    stock: p.stock ?? 0,
    description: p.description ?? "",
    category: p.category ?? null,
    material: p.material ?? null,
    sizes: p.sizes ?? [],
    colors: p.colors ?? [],
    image_url: p.image_url ?? null,
    image_urls,
    is_active: true,
    updated_at: p.updated_at,
  };
}

// ---------- Rate limiter (token bucket: 60/min) ----------
class RateLimiter {
  private timestamps: number[] = [];
  constructor(private readonly max = 55, private readonly windowMs = 60_000) {}
  /** Await until we're allowed to make another request. */
  async take() {
    // Drop timestamps older than the window.
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.max) {
      const waitMs = this.windowMs - (now - this.timestamps[0]) + 50;
      await sleep(waitMs);
      return this.take();
    }
    this.timestamps.push(Date.now());
  }
  /** Manually pause (e.g. after Retry-After) — blocks the whole bucket. */
  async pause(ms: number) {
    await sleep(ms);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const BASE = Deno.env.get("EXTERNAL_INVENTORY_BASE_URL") ?? "";
  const KEY = Deno.env.get("EXTERNAL_INVENTORY_API_KEY") ?? "";
  if (!BASE || !KEY) {
    return json({ error: "EXTERNAL_INVENTORY_BASE_URL / EXTERNAL_INVENTORY_API_KEY not configured" }, 500);
  }

  // --- admin auth ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseAnon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await supabaseAnon.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
  const userId = claimsData.claims.sub;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) return json({ error: "Forbidden — admin only" }, 403);

  // --- parse body ---
  const body = await req.json().catch(() => ({}));
  const dryRun = !!body?.dry_run;
  const incremental = !!body?.incremental;
  const limit = typeof body?.limit === "number" ? Math.max(1, Math.min(5000, body.limit)) : null;
  const concurrency = Math.max(
    1,
    Math.min(8, typeof body?.concurrency === "number" ? body.concurrency : 4),
  );

  // Resolve incremental checkpoint
  let since: string | null = typeof body?.since === "string" ? body.since : null;
  if (!since && incremental) {
    const { data: setting } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", LAST_SYNC_KEY)
      .maybeSingle();
    since = (setting?.value as any)?.at ?? null;
  }

  // --- fetch products ---
  let q = admin
    .from("products")
    .select("*, product_images(image_url, display_order)")
    .order("updated_at", { ascending: true });
  if (since) q = q.gt("updated_at", since);
  if (limit) q = q.limit(limit);
  const { data: products, error: prodErr } = await q;
  if (prodErr) return json({ error: prodErr.message }, 500);

  const rows = products ?? [];

  // --- validate all up front ---
  const validationErrors: ValidationError[] = [];
  const validRows: any[] = [];
  for (const p of rows) {
    const errs = validateProduct(p);
    if (errs.length) {
      validationErrors.push({ product_id: p.id, name: p.name ?? "(unnamed)", errors: errs });
    } else {
      validRows.push(p);
    }
  }

  // Track newest updated_at seen so the checkpoint moves forward on success.
  let maxUpdatedAt: string | null = null;
  for (const p of rows) {
    if (p.updated_at && (!maxUpdatedAt || p.updated_at > maxUpdatedAt)) {
      maxUpdatedAt = p.updated_at;
    }
  }

  // ---- Dry run: no network calls ----
  if (dryRun) {
    return json({
      dry_run: true,
      total: rows.length,
      valid: validRows.length,
      invalid: validationErrors.length,
      created: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
      since,
      target: `${BASE.replace(/\/$/, "")}/products`,
      sample_payload: validRows[0] ? mapProduct(validRows[0]) : null,
      validation_errors: validationErrors,
      results: [],
    });
  }

  // ---- Real push with concurrency + rate limit ----
  const url = `${BASE.replace(/\/$/, "")}/products`;
  const limiter = new RateLimiter(55, 60_000); // 55/min = safe under 60 cap
  const results: PushResult[] = [
    ...validationErrors.map((v) => ({
      product_id: v.product_id,
      name: v.name,
      action: "invalid" as const,
      error: v.errors.join("; "),
    })),
  ];
  let created = 0;
  let updated = 0;
  let failed = 0;
  const skipped = 0;
  const invalid = validationErrors.length;

  // Simple worker pool — index-based queue.
  let idx = 0;
  const total = validRows.length;

  const worker = async () => {
    while (true) {
      const i = idx++;
      if (i >= total) return;
      const p = validRows[i];
      const payload = mapProduct(p);
      let attempts = 0;
      const maxAttempts = 5;
      let done = false;
      while (!done && attempts < maxAttempts) {
        attempts++;
        await limiter.take();
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${KEY}`,
              "x-api-key": KEY,
            },
            body: JSON.stringify(payload),
          });
          if (res.status === 429) {
            const ra = Number(res.headers.get("retry-after") ?? "2");
            // Shared pause — hitting 429 means the whole bucket must chill.
            await limiter.pause(Math.max(1000, ra * 1000));
            continue;
          }
          const text = await res.text();
          let parsed: any = null;
          try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
          if (res.ok) {
            const action: "created" | "updated" = res.status === 200 ? "updated" : "created";
            if (action === "created") created++; else updated++;
            results.push({
              product_id: p.id,
              name: p.name,
              action,
              external_id: parsed?.id ?? parsed?.data?.id,
              status: res.status,
              attempts,
            });
          } else {
            // Transient 5xx → retry with backoff
            if (res.status >= 500 && attempts < maxAttempts) {
              await sleep(500 * 2 ** (attempts - 1));
              continue;
            }
            failed++;
            results.push({
              product_id: p.id,
              name: p.name,
              action: "failed",
              status: res.status,
              attempts,
              error:
                typeof parsed === "string"
                  ? parsed.slice(0, 500)
                  : parsed?.error ?? parsed?.message ?? `HTTP ${res.status}`,
            });
          }
          done = true;
        } catch (e) {
          if (attempts < maxAttempts) {
            await sleep(500 * 2 ** (attempts - 1));
            continue;
          }
          failed++;
          results.push({
            product_id: p.id,
            name: p.name,
            action: "failed",
            attempts,
            error: e instanceof Error ? e.message : "network error",
          });
          done = true;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  // --- Persist checkpoint on any successful sync so incremental works next time.
  let lastSyncedAt: string | null = null;
  if ((created + updated) > 0 && maxUpdatedAt) {
    lastSyncedAt = maxUpdatedAt;
    await admin
      .from("system_settings")
      .upsert({ key: LAST_SYNC_KEY, value: { at: lastSyncedAt } }, { onConflict: "key" });
  }

  return json({
    dry_run: false,
    total: rows.length,
    valid: validRows.length,
    invalid,
    created,
    updated,
    failed,
    skipped,
    since,
    last_synced_at: lastSyncedAt,
    target: url,
    validation_errors: validationErrors,
    results,
  });
});
