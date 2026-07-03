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
 *   dry_run:          boolean → validate & return payloads, DO NOT send.
 *   incremental:      boolean → only push products updated_at > last checkpoint.
 *   since:            string  → ISO timestamp override for `incremental`.
 *   concurrency:      number  → parallel workers (1..8, default 4).
 *   limit:            number  → cap products processed (safety, 1..5000).
 *   reset_checkpoint: boolean → clears the stored checkpoint before running.
 *
 * Response: see the JSON returned at the bottom.
 *
 * Live progress: the function upserts `system_settings.inventory_push_progress`
 * every ~800 ms so the admin UI can poll it and render real-time counters.
 * ------------------------------------------------------------------
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mapProduct, validateProduct } from "./validator.ts";

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
const PROGRESS_KEY = "inventory_push_progress";

interface PushResult {
  product_id: string;
  name: string;
  action: "created" | "updated" | "failed" | "skipped" | "invalid";
  external_id?: string;
  status?: number;
  error?: string;
  attempts?: number;
  worker?: number;
}

interface ValidationError {
  product_id: string;
  name: string;
  errors: string[];
}

// ---------- Rate limiter (token bucket) ----------
class RateLimiter {
  private timestamps: number[] = [];
  constructor(private readonly max = 55, private readonly windowMs = 60_000) {}
  async take() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.max) {
      const waitMs = this.windowMs - (now - this.timestamps[0]) + 50;
      await sleep(waitMs);
      return this.take();
    }
    this.timestamps.push(Date.now());
  }
  async pause(ms: number) { await sleep(ms); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const BASE = Deno.env.get("EXTERNAL_INVENTORY_BASE_URL") ?? "";
  const KEY = Deno.env.get("EXTERNAL_INVENTORY_API_KEY") ?? "";
  if (!BASE || !KEY) {
    return json({ error: "EXTERNAL_INVENTORY_BASE_URL / EXTERNAL_INVENTORY_API_KEY not configured" }, 500);
  }

  // --- admin auth (using getUser — getClaims is not in the deployed SDK version) ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseAnon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: "Unauthorized", detail: userErr?.message }, 401);
  }
  const userId = userData.user.id;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) return json({ error: "Forbidden — admin only" }, 403);

  // --- parse body ---
  const body = await req.json().catch(() => ({}));
  const dryRun = !!body?.dry_run;
  const incremental = !!body?.incremental;
  const resetCheckpoint = !!body?.reset_checkpoint;
  const limit = typeof body?.limit === "number" ? Math.max(1, Math.min(5000, body.limit)) : null;
  const concurrency = Math.max(
    1,
    Math.min(8, typeof body?.concurrency === "number" ? body.concurrency : 4),
  );

  // Handle checkpoint reset up-front.
  if (resetCheckpoint) {
    await admin.from("system_settings").upsert(
      { key: LAST_SYNC_KEY, value: { at: null } },
      { onConflict: "key" },
    );
    if (body?.only_reset) {
      return json({ ok: true, reset: true });
    }
  }

  // Resolve incremental checkpoint (unless just cleared)
  let since: string | null = typeof body?.since === "string" ? body.since : null;
  if (!since && incremental && !resetCheckpoint) {
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

  // Track newest updated_at so the checkpoint moves forward on success.
  let maxUpdatedAt: string | null = null;
  for (const p of rows) {
    if (p.updated_at && (!maxUpdatedAt || p.updated_at > maxUpdatedAt)) {
      maxUpdatedAt = p.updated_at;
    }
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // Utility to write live progress (throttled).
  let lastProgressAt = 0;
  const writeProgress = async (snapshot: Record<string, unknown>, force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressAt < 800) return;
    lastProgressAt = now;
    try {
      await admin.from("system_settings").upsert(
        {
          key: PROGRESS_KEY,
          value: {
            run_id: runId,
            started_at: startedAt,
            updated_at: new Date().toISOString(),
            ...snapshot,
          },
        },
        { onConflict: "key" },
      );
    } catch { /* progress write failures are non-fatal */ }
  };

  // ---- Dry run: no network calls ----
  if (dryRun) {
    await writeProgress({
      status: "done",
      dry_run: true,
      total: rows.length,
      valid: validRows.length,
      invalid: validationErrors.length,
      done_count: rows.length,
      created: 0, updated: 0, failed: 0, retries: 0,
      recent: [],
      in_flight: [],
    }, true);
    return json({
      dry_run: true,
      run_id: runId,
      total: rows.length,
      valid: validRows.length,
      invalid: validationErrors.length,
      created: 0, updated: 0, failed: 0, skipped: 0,
      since,
      target: `${BASE.replace(/\/$/, "")}/products`,
      sample_payload: validRows[0] ? mapProduct(validRows[0]) : null,
      validation_errors: validationErrors,
      results: [],
    });
  }

  // ---- Real push with concurrency + rate limit ----
  const url = `${BASE.replace(/\/$/, "")}/products`;
  const limiter = new RateLimiter(55, 60_000);
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
  let retries = 0;
  let doneCount = 0;
  const total = validRows.length;
  const recent: Array<{ name: string; action: string; status?: number }> = [];
  const inFlight = new Map<number, { product_id: string; name: string; attempts: number }>();

  await writeProgress({
    status: "running",
    dry_run: false,
    total: rows.length,
    valid: total,
    invalid: validationErrors.length,
    done_count: 0,
    created: 0, updated: 0, failed: 0, retries: 0,
    recent: [],
    in_flight: [],
    concurrency,
  }, true);

  const emitProgress = (force = false) =>
    writeProgress({
      status: "running",
      dry_run: false,
      total: rows.length,
      valid: total,
      invalid: validationErrors.length,
      done_count: doneCount,
      created, updated, failed, retries,
      recent: recent.slice(-8),
      in_flight: Array.from(inFlight.entries()).map(([w, v]) => ({ worker: w, ...v })),
      concurrency,
    }, force);

  let idx = 0;
  const worker = async (workerId: number) => {
    while (true) {
      const i = idx++;
      if (i >= total) return;
      const p = validRows[i];
      const payload = mapProduct(p);
      inFlight.set(workerId, { product_id: p.id, name: p.name, attempts: 0 });
      await emitProgress();
      let attempts = 0;
      const maxAttempts = 5;
      let done = false;
      while (!done && attempts < maxAttempts) {
        attempts++;
        if (attempts > 1) retries++;
        inFlight.set(workerId, { product_id: p.id, name: p.name, attempts });
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
            await res.text().catch(() => {});
            const ra = Number(res.headers.get("retry-after") ?? "2");
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
              product_id: p.id, name: p.name, action,
              external_id: parsed?.id ?? parsed?.data?.id,
              status: res.status, attempts, worker: workerId,
            });
            recent.push({ name: p.name, action, status: res.status });
          } else {
            if (res.status >= 500 && attempts < maxAttempts) {
              await sleep(500 * 2 ** (attempts - 1));
              continue;
            }
            failed++;
            const errMsg = typeof parsed === "string"
              ? parsed.slice(0, 500)
              : parsed?.error ?? parsed?.message ?? `HTTP ${res.status}`;
            results.push({
              product_id: p.id, name: p.name, action: "failed",
              status: res.status, attempts, error: errMsg, worker: workerId,
            });
            recent.push({ name: p.name, action: "failed", status: res.status });
          }
          done = true;
        } catch (e) {
          if (attempts < maxAttempts) {
            await sleep(500 * 2 ** (attempts - 1));
            continue;
          }
          failed++;
          results.push({
            product_id: p.id, name: p.name, action: "failed",
            attempts, worker: workerId,
            error: e instanceof Error ? e.message : "network error",
          });
          recent.push({ name: p.name, action: "failed" });
          done = true;
        }
      }
      doneCount++;
      inFlight.delete(workerId);
      await emitProgress();
    }
  };

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));

  // Persist checkpoint if anything succeeded.
  let lastSyncedAt: string | null = null;
  if ((created + updated) > 0 && maxUpdatedAt) {
    lastSyncedAt = maxUpdatedAt;
    await admin
      .from("system_settings")
      .upsert({ key: LAST_SYNC_KEY, value: { at: lastSyncedAt } }, { onConflict: "key" });
  }

  await writeProgress({
    status: "done",
    dry_run: false,
    total: rows.length,
    valid: total,
    invalid: validationErrors.length,
    done_count: doneCount,
    created, updated, failed, retries,
    recent: recent.slice(-8),
    in_flight: [],
    concurrency,
    last_synced_at: lastSyncedAt,
  }, true);

  return json({
    dry_run: false,
    run_id: runId,
    total: rows.length,
    valid: total,
    invalid: validationErrors.length,
    created, updated, failed, retries, skipped: 0,
    since,
    last_synced_at: lastSyncedAt,
    target: url,
    validation_errors: validationErrors,
    results,
  });
});
