/**
 * push-to-external-inventory
 *
 * Pushes every product from this site's DB to the user's external inventory
 * software (bigsoftdbh.lovable.app) via its public REST API.
 *
 * Auth: caller must be an admin (JWT validated via getClaims + has_role).
 * Uses EXTERNAL_INVENTORY_API_KEY + EXTERNAL_INVENTORY_BASE_URL server secrets.
 *
 * Endpoint (POST): no body needed. Optional { dry_run: true } returns the
 * mapped payload for the first product without sending anything.
 *
 * Response: { total, created, updated, failed, skipped, errors: [...] }
 *
 * Rate-limit strategy: external API allows 60 req/min per key → we pause
 * ~1100ms between requests and honor Retry-After on 429.
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

interface PushResult {
  product_id: string;
  name: string;
  action: "created" | "updated" | "failed" | "skipped";
  external_id?: string;
  status?: number;
  error?: string;
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
    external_ref: p.id, // our UUID — helps dedupe
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
  };
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

  // --- optional body ---
  const body = await req.json().catch(() => ({}));
  const dryRun = !!body?.dry_run;
  const limit = typeof body?.limit === "number" ? Math.max(1, Math.min(5000, body.limit)) : null;

  // --- fetch all products ---
  let q = admin
    .from("products")
    .select("*, product_images(image_url, display_order)")
    .order("created_at", { ascending: true });
  if (limit) q = q.limit(limit);
  const { data: products, error: prodErr } = await q;
  if (prodErr) return json({ error: prodErr.message }, 500);

  if (dryRun) {
    return json({
      dry_run: true,
      total: products?.length ?? 0,
      sample_payload: products?.[0] ? mapProduct(products[0]) : null,
      target: `${BASE.replace(/\/$/, "")}/products`,
    });
  }

  const results: PushResult[] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  const url = `${BASE.replace(/\/$/, "")}/products`;

  for (const p of products ?? []) {
    const payload = mapProduct(p);
    try {
      let attempt = 0;
      // Retry loop for 429
      // We cap at 3 retries; wait Retry-After (or exponential) between.
      // Success returns break out.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${KEY}`,
            "x-api-key": KEY,
          },
          body: JSON.stringify(payload),
        });

        if (res.status === 429 && attempt < 3) {
          const ra = Number(res.headers.get("retry-after") ?? "2");
          await sleep(Math.max(1000, ra * 1000));
          attempt++;
          continue;
        }

        const text = await res.text();
        let parsed: any = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

        if (res.ok) {
          const action: "created" | "updated" =
            res.status === 200 ? "updated" : "created";
          if (action === "created") created++;
          else updated++;
          results.push({
            product_id: p.id,
            name: p.name,
            action,
            external_id: parsed?.id ?? parsed?.data?.id,
            status: res.status,
          });
        } else {
          failed++;
          results.push({
            product_id: p.id,
            name: p.name,
            action: "failed",
            status: res.status,
            error: typeof parsed === "string" ? parsed.slice(0, 300) : (parsed?.error ?? parsed?.message ?? `HTTP ${res.status}`),
          });
        }
        break;
      }
    } catch (e) {
      failed++;
      results.push({
        product_id: p.id,
        name: p.name,
        action: "failed",
        error: e instanceof Error ? e.message : "network error",
      });
    }

    // Pace requests: 60 req/min = 1 per second. 1.1s gives headroom.
    await sleep(1100);
  }

  return json({
    total: products?.length ?? 0,
    created,
    updated,
    failed,
    skipped,
    target: url,
    results,
  });
});
