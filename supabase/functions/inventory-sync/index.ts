/**
 * Inventory Sync API — server-to-server REST API for an external inventory
 * software to pull products and push stock/price updates.
 *
 * Endpoints (all under /functions/v1/inventory-sync):
 *   GET  /ping                      → connection test
 *   GET  /products                  → paginated list (page/per_page OR cursor)
 *   GET  /products/:id              → full product (variants + gallery + images)
 *   POST /products/:id/stock        → update product (+ optional variant) stock
 *   POST /products/:id/price        → update price / sale_price
 *   POST /test-webhook              → send a signed sample payload to configured URL
 *
 * Auth: every request must include `x-api-key: <INVENTORY_SYNC_API_KEY>`.
 * Webhook delivery is HMAC-SHA256 signed using `INVENTORY_WEBHOOK_SECRET`
 * and sent as header `x-lovable-signature: sha256=<hex>`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ---- CORS ---------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---- Constant-time compare ---------------------------------------------
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- Rate limiter (per IP, 60 req/min, in-memory) ----------------------
const rateMap = new Map<string, number[]>();
function rateLimited(ip: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (rateMap.get(ip) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  rateMap.set(ip, arr);
  return arr.length > limit;
}

// ---- Supabase admin client ---------------------------------------------
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WEBHOOK_SECRET = Deno.env.get("INVENTORY_WEBHOOK_SECRET") ?? "";

// ---- Audit logger -------------------------------------------------------
async function logAudit(entry: {
  endpoint: string;
  method: string;
  ip: string;
  status_code: number;
  record_count?: number;
  product_id?: string | null;
  payload?: unknown;
  error_message?: string | null;
}) {
  try {
    await supabase.from("inventory_sync_audit_log").insert({
      ...entry,
      payload: entry.payload ? JSON.parse(JSON.stringify(entry.payload)) : null,
    });
  } catch {
    /* never let audit failure break the API */
  }
}

// ---- HMAC signing -------------------------------------------------------
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---- Webhook dispatcher -------------------------------------------------
/**
 * Send a signed webhook to the configured outbound URL.
 * Returns { delivered, status, error } — never throws.
 */
async function deliverWebhook(event: string, data: unknown): Promise<{
  delivered: boolean;
  status: number | null;
  url: string | null;
  error: string | null;
}> {
  const { data: settings } = await supabase
    .from("system_settings")
    .select("key, value")
    .in("key", ["inventory_webhook_url", "inventory_webhook_enabled"]);

  const urlRow = settings?.find((s: any) => s.key === "inventory_webhook_url");
  const enRow = settings?.find((s: any) => s.key === "inventory_webhook_enabled");
  const url = (urlRow?.value as any)?.url ?? "";
  const enabled = !!(enRow?.value as any)?.enabled;

  if (!enabled || !url) {
    return { delivered: false, status: null, url: null, error: "webhook_disabled_or_unset" };
  }
  if (!WEBHOOK_SECRET) {
    return { delivered: false, status: null, url, error: "webhook_secret_missing" };
  }

  const payload = {
    event,
    sent_at: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);
  const signature = await hmacHex(WEBHOOK_SECRET, body);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-lovable-event": event,
        "x-lovable-signature": `sha256=${signature}`,
      },
      body,
    });
    return { delivered: res.ok, status: res.status, url, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { delivered: false, status: null, url, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

// ---- Product serializer ------------------------------------------------
function serializeProduct(p: any) {
  const variants = (p.product_variants ?? []).map((v: any) => ({
    id: v.id,
    size: v.size,
    color: v.color,
    stock: v.stock,
    sku: v.sku,
    price_adjustment: Number(v.price_adjustment ?? 0),
    image_url: v.image_url ?? null,
    image_urls: Array.isArray(v.image_urls) ? v.image_urls : [],
  }));
  const galleryRaw = [...(p.product_images ?? [])].sort(
    (a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );
  const gallery = galleryRaw.map((img: any) => ({
    id: img.id,
    url: img.image_url,
    display_order: img.display_order ?? 0,
    alt_text: img.alt_text ?? null,
  }));
  // Flat list of every image URL associated with this product
  // (main + gallery + per-variant), de-duplicated, order-preserved.
  const all = new Set<string>();
  if (p.image_url) all.add(p.image_url);
  for (const g of gallery) if (g.url) all.add(g.url);
  for (const v of variants) {
    if (v.image_url) all.add(v.image_url);
    for (const u of v.image_urls) if (u) all.add(u);
  }
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    price: Number(p.price ?? 0),
    sale_price: p.sale_price != null ? Number(p.sale_price) : null,
    stock: p.stock ?? 0,
    description: p.description,
    material: p.material,
    sizes: p.sizes ?? [],
    colors: p.colors ?? [],
    main_image: p.image_url,
    gallery,
    image_urls: Array.from(all),
    video_url: p.video_url,
    variants,
    featured: !!p.featured,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

// ---- Cursor encode/decode ----------------------------------------------
// Cursor is base64url of `${updated_at}|${id}` — opaque to clients.
function encodeCursor(updatedAt: string, id: string): string {
  return btoa(`${updatedAt}|${id}`).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function decodeCursor(c: string): { updated_at: string; id: string } | null {
  try {
    const padded = c.replace(/-/g, "+").replace(/_/g, "/");
    const [updated_at, id] = atob(padded + "===".slice((padded.length + 3) % 4)).split("|");
    if (!updated_at || !id) return null;
    return { updated_at, id };
  } catch {
    return null;
  }
}

// ---- Handlers -----------------------------------------------------------

async function handleListProducts(url: URL) {
  const perPage = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("per_page") ?? "50", 10)),
  );
  const updatedSince = url.searchParams.get("updated_since");
  const category = url.searchParams.get("category");
  const cursorParam = url.searchParams.get("cursor");

  // ---- Cursor mode (preferred for incremental sync) ----
  if (cursorParam !== null) {
    const cursor = cursorParam ? decodeCursor(cursorParam) : null;
    if (cursorParam && !cursor) {
      return { _error: { status: 400, message: "invalid cursor" } } as any;
    }
    let q = supabase
      .from("products")
      .select("*, product_variants(*), product_images(*)")
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(perPage + 1);

    if (updatedSince) q = q.gte("updated_at", updatedSince);
    if (category) q = q.eq("category", category);
    if (cursor) {
      // Keyset: rows strictly after (updated_at, id)
      // Postgres tuple comparison via .or()
      q = q.or(
        `updated_at.gt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},id.gt.${cursor.id})`,
      );
    }

    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    const hasMore = rows.length > perPage;
    const page = (hasMore ? rows.slice(0, perPage) : rows).map(serializeProduct);
    const last = page[page.length - 1];
    return {
      products: page,
      pagination: {
        mode: "cursor",
        per_page: perPage,
        has_more: hasMore,
        next_cursor: hasMore && last ? encodeCursor(last.updated_at, last.id) : null,
      },
      synced_at: new Date().toISOString(),
    };
  }

  // ---- Page mode (back-compat) ----
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  let q = supabase
    .from("products")
    .select("*, product_variants(*), product_images(*)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (updatedSince) q = q.gte("updated_at", updatedSince);
  if (category) q = q.eq("category", category);

  const { data, error, count } = await q;
  if (error) throw error;
  const products = (data ?? []).map(serializeProduct);
  const total = count ?? products.length;
  return {
    products,
    pagination: {
      mode: "page",
      page,
      per_page: perPage,
      total,
      total_pages: Math.max(1, Math.ceil(total / perPage)),
    },
    synced_at: new Date().toISOString(),
  };
}

async function handleGetProduct(id: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*, product_variants(*), product_images(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return serializeProduct(data);
}

async function fetchProductSummary(id: string) {
  const { data } = await supabase
    .from("products")
    .select("id, name, slug, price, sale_price, stock")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function handleUpdateStock(id: string, body: any) {
  const stock = Number(body?.stock);
  if (!Number.isFinite(stock) || stock < 0) {
    return { status: 400, body: { error: "stock must be a non-negative number" } };
  }
  const { error } = await supabase.from("products").update({ stock }).eq("id", id);
  if (error) throw error;

  let variantInfo: any = null;
  if (body?.variant && (body.variant.size || body.variant.color)) {
    const vStock = Number(body.variant.stock);
    if (!Number.isFinite(vStock) || vStock < 0) {
      return { status: 400, body: { error: "variant.stock invalid" } };
    }
    let vq = supabase.from("product_variants").update({ stock: vStock }).eq("product_id", id);
    if (body.variant.size) vq = vq.eq("size", body.variant.size);
    if (body.variant.color) vq = vq.eq("color", body.variant.color);
    const { error: vErr } = await vq;
    if (vErr) throw vErr;
    variantInfo = { size: body.variant.size ?? null, color: body.variant.color ?? null, stock: vStock };
  }

  // Fire-and-forget outbound webhook
  const summary = await fetchProductSummary(id);
  const delivery = await deliverWebhook("product.stock_updated", {
    product: summary,
    stock,
    variant: variantInfo,
  });

  return { status: 200, body: { ok: true, id, stock, webhook: delivery } };
}

async function handleUpdatePrice(id: string, body: any) {
  const patch: Record<string, unknown> = {};
  if (body?.price !== undefined) {
    const p = Number(body.price);
    if (!Number.isFinite(p) || p < 0) {
      return { status: 400, body: { error: "price must be a non-negative number" } };
    }
    patch.price = p;
  }
  if (body?.sale_price !== undefined) {
    if (body.sale_price === null) patch.sale_price = null;
    else {
      const sp = Number(body.sale_price);
      if (!Number.isFinite(sp) || sp < 0) {
        return { status: 400, body: { error: "sale_price must be a non-negative number or null" } };
      }
      patch.sale_price = sp;
    }
  }
  if (Object.keys(patch).length === 0) {
    return { status: 400, body: { error: "provide price and/or sale_price" } };
  }
  const { error } = await supabase.from("products").update(patch).eq("id", id);
  if (error) throw error;

  const summary = await fetchProductSummary(id);
  const delivery = await deliverWebhook("product.price_updated", {
    product: summary,
    changes: patch,
  });

  return { status: 200, body: { ok: true, id, ...patch, webhook: delivery } };
}

async function handleTestWebhook() {
  const delivery = await deliverWebhook("test.ping", {
    message: "Hello from Lovable inventory-sync — this is a test event.",
    sample_product: {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Sample Product",
      stock: 42,
      price: 999,
    },
  });
  // 200 even if webhook returned non-2xx; the UI inspects `delivery.status`.
  return { status: 200, body: { ok: true, ...delivery } };
}

// ---- Main handler -------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const path = url.pathname.replace(/^.*\/inventory-sync/, "") || "/";

  // Auth
  const expected = Deno.env.get("INVENTORY_SYNC_API_KEY") ?? "";
  const provided = req.headers.get("x-api-key") ?? "";
  if (!expected) return json({ error: "INVENTORY_SYNC_API_KEY not configured on server" }, 500);
  if (!provided || !safeEqual(provided, expected)) {
    await logAudit({ endpoint: path, method: req.method, ip, status_code: 401, error_message: "invalid_or_missing_api_key" });
    return json({ error: "Unauthorized" }, 401);
  }

  // Rate limit
  if (rateLimited(ip)) {
    await logAudit({ endpoint: path, method: req.method, ip, status_code: 429, error_message: "rate_limited" });
    return json({ error: "Rate limit exceeded (60 req/min)" }, 429);
  }

  try {
    if (req.method === "GET" && (path === "/" || path === "/ping")) {
      await logAudit({ endpoint: path, method: "GET", ip, status_code: 200 });
      return json({ ok: true, service: "inventory-sync", time: new Date().toISOString() });
    }

    if (req.method === "GET" && path === "/products") {
      const result: any = await handleListProducts(url);
      if (result._error) {
        await logAudit({ endpoint: path, method: "GET", ip, status_code: result._error.status, error_message: result._error.message });
        return json({ error: result._error.message }, result._error.status);
      }
      await logAudit({ endpoint: path, method: "GET", ip, status_code: 200, record_count: result.products.length });
      return json(result);
    }

    const getMatch = path.match(/^\/products\/([^/]+)$/);
    if (req.method === "GET" && getMatch) {
      const id = getMatch[1];
      const product = await handleGetProduct(id);
      if (!product) {
        await logAudit({ endpoint: path, method: "GET", ip, status_code: 404, product_id: id });
        return json({ error: "Product not found" }, 404);
      }
      await logAudit({ endpoint: path, method: "GET", ip, status_code: 200, record_count: 1, product_id: id });
      return json(product);
    }

    const stockMatch = path.match(/^\/products\/([^/]+)\/stock$/);
    if (req.method === "POST" && stockMatch) {
      const id = stockMatch[1];
      const body = await req.json().catch(() => ({}));
      const { status, body: respBody } = await handleUpdateStock(id, body);
      await logAudit({ endpoint: path, method: "POST", ip, status_code: status, product_id: id, payload: body });
      return json(respBody, status);
    }

    const priceMatch = path.match(/^\/products\/([^/]+)\/price$/);
    if (req.method === "POST" && priceMatch) {
      const id = priceMatch[1];
      const body = await req.json().catch(() => ({}));
      const { status, body: respBody } = await handleUpdatePrice(id, body);
      await logAudit({ endpoint: path, method: "POST", ip, status_code: status, product_id: id, payload: body });
      return json(respBody, status);
    }

    if (req.method === "POST" && path === "/test-webhook") {
      const { status, body: respBody } = await handleTestWebhook();
      await logAudit({
        endpoint: path,
        method: "POST",
        ip,
        status_code: status,
        payload: { result: respBody },
      });
      return json(respBody, status);
    }

    await logAudit({ endpoint: path, method: req.method, ip, status_code: 404, error_message: "route_not_found" });
    return json({ error: "Route not found", path }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAudit({ endpoint: path, method: req.method, ip, status_code: 500, error_message: message });
    return json({ error: "Internal error", details: message }, 500);
  }
});
