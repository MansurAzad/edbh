/**
 * Inventory Sync API — server-to-server REST API for an external inventory
 * software to pull products and push stock/price updates.
 *
 * Endpoints (all under /functions/v1/inventory-sync):
 *   GET  /products                  → paginated products list
 *   GET  /products/:id              → full product detail
 *   POST /products/:id/stock        → update product (+ optional variant) stock
 *   POST /products/:id/price        → update price / sale_price
 *   GET  /ping                      → connection test
 *
 * Auth: every request must include the header `x-api-key: <INVENTORY_SYNC_API_KEY>`.
 * Compared in constant time to mitigate timing attacks.
 *
 * Rate limit: simple in-memory sliding window — 60 req/min per IP.
 *
 * Every request is recorded in `inventory_sync_audit_log` for the admin UI.
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

// ---- Constant-time string compare (timing-attack mitigation) -----------
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

// ---- Supabase admin client (service role) ------------------------------
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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
    // never let audit failure break the API
  }
}

// ---- Product serializer (consistent shape across all endpoints) --------
function serializeProduct(p: any) {
  const variants = (p.product_variants ?? []).map((v: any) => ({
    id: v.id,
    size: v.size,
    color: v.color,
    stock: v.stock,
    sku: v.sku,
    price_adjustment: Number(v.price_adjustment ?? 0),
    image_url: v.image_url,
    image_urls: v.image_urls ?? [],
  }));
  const gallery = (p.product_images ?? [])
    .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((img: any) => ({
      url: img.image_url,
      display_order: img.display_order ?? 0,
      alt_text: img.alt_text ?? null,
    }));
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
    video_url: p.video_url,
    variants,
    featured: !!p.featured,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

// ---- Handlers -----------------------------------------------------------

async function handleListProducts(url: URL) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("per_page") ?? "50", 10)),
  );
  const updatedSince = url.searchParams.get("updated_since");
  const category = url.searchParams.get("category");

  let q = supabase
    .from("products")
    .select(
      "*, product_variants(*), product_images(*)",
      { count: "exact" },
    )
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

async function handleUpdateStock(id: string, body: any) {
  // Body: { stock: number, variant?: { size?: string, color?: string, stock: number } }
  const stock = Number(body?.stock);
  if (!Number.isFinite(stock) || stock < 0) {
    return { status: 400, body: { error: "stock must be a non-negative number" } };
  }
  const { error } = await supabase
    .from("products")
    .update({ stock })
    .eq("id", id);
  if (error) throw error;

  if (body?.variant && (body.variant.size || body.variant.color)) {
    const vStock = Number(body.variant.stock);
    if (!Number.isFinite(vStock) || vStock < 0) {
      return { status: 400, body: { error: "variant.stock invalid" } };
    }
    let vq = supabase
      .from("product_variants")
      .update({ stock: vStock })
      .eq("product_id", id);
    if (body.variant.size) vq = vq.eq("size", body.variant.size);
    if (body.variant.color) vq = vq.eq("color", body.variant.color);
    const { error: vErr } = await vq;
    if (vErr) throw vErr;
  }

  return { status: 200, body: { ok: true, id, stock } };
}

async function handleUpdatePrice(id: string, body: any) {
  // Body: { price?: number, sale_price?: number | null }
  const patch: Record<string, unknown> = {};
  if (body?.price !== undefined) {
    const p = Number(body.price);
    if (!Number.isFinite(p) || p < 0) {
      return { status: 400, body: { error: "price must be a non-negative number" } };
    }
    patch.price = p;
  }
  if (body?.sale_price !== undefined) {
    if (body.sale_price === null) {
      patch.sale_price = null;
    } else {
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
  return { status: 200, body: { ok: true, id, ...patch } };
}

// ---- Main HTTP handler --------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  // Strip the function-name prefix so the remaining path is the route.
  // e.g. /functions/v1/inventory-sync/products → /products
  const path = url.pathname.replace(/^.*\/inventory-sync/, "") || "/";

  // ---- Auth ----
  const expected = Deno.env.get("INVENTORY_SYNC_API_KEY") ?? "";
  const provided = req.headers.get("x-api-key") ?? "";
  if (!expected) {
    return json({ error: "INVENTORY_SYNC_API_KEY not configured on server" }, 500);
  }
  if (!provided || !safeEqual(provided, expected)) {
    await logAudit({
      endpoint: path,
      method: req.method,
      ip,
      status_code: 401,
      error_message: "invalid_or_missing_api_key",
    });
    return json({ error: "Unauthorized" }, 401);
  }

  // ---- Rate limit ----
  if (rateLimited(ip)) {
    await logAudit({
      endpoint: path,
      method: req.method,
      ip,
      status_code: 429,
      error_message: "rate_limited",
    });
    return json({ error: "Rate limit exceeded (60 req/min)" }, 429);
  }

  try {
    // GET /ping — connection test
    if (req.method === "GET" && (path === "/" || path === "/ping")) {
      await logAudit({ endpoint: path, method: "GET", ip, status_code: 200 });
      return json({ ok: true, service: "inventory-sync", time: new Date().toISOString() });
    }

    // GET /products
    if (req.method === "GET" && path === "/products") {
      const result = await handleListProducts(url);
      await logAudit({
        endpoint: path,
        method: "GET",
        ip,
        status_code: 200,
        record_count: result.products.length,
      });
      return json(result);
    }

    // GET /products/:id
    const getMatch = path.match(/^\/products\/([^/]+)$/);
    if (req.method === "GET" && getMatch) {
      const id = getMatch[1];
      const product = await handleGetProduct(id);
      if (!product) {
        await logAudit({ endpoint: path, method: "GET", ip, status_code: 404, product_id: id });
        return json({ error: "Product not found" }, 404);
      }
      await logAudit({
        endpoint: path,
        method: "GET",
        ip,
        status_code: 200,
        record_count: 1,
        product_id: id,
      });
      return json(product);
    }

    // POST /products/:id/stock
    const stockMatch = path.match(/^\/products\/([^/]+)\/stock$/);
    if (req.method === "POST" && stockMatch) {
      const id = stockMatch[1];
      const body = await req.json().catch(() => ({}));
      const { status, body: respBody } = await handleUpdateStock(id, body);
      await logAudit({
        endpoint: path,
        method: "POST",
        ip,
        status_code: status,
        product_id: id,
        payload: body,
      });
      return json(respBody, status);
    }

    // POST /products/:id/price
    const priceMatch = path.match(/^\/products\/([^/]+)\/price$/);
    if (req.method === "POST" && priceMatch) {
      const id = priceMatch[1];
      const body = await req.json().catch(() => ({}));
      const { status, body: respBody } = await handleUpdatePrice(id, body);
      await logAudit({
        endpoint: path,
        method: "POST",
        ip,
        status_code: status,
        product_id: id,
        payload: body,
      });
      return json(respBody, status);
    }

    await logAudit({
      endpoint: path,
      method: req.method,
      ip,
      status_code: 404,
      error_message: "route_not_found",
    });
    return json({ error: "Route not found", path }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAudit({
      endpoint: path,
      method: req.method,
      ip,
      status_code: 500,
      error_message: message,
    });
    return json({ error: "Internal error", details: message }, 500);
  }
});
