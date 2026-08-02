/**
 * gsc-indexing edge function
 * Proxies Google Search Console (via Lovable connector gateway) for:
 *  - GET  ?action=sites                -> list verified sites
 *  - POST { action:"inspect", url }    -> URL inspection for the verified site
 *  - POST { action:"errors" }          -> searchAnalytics summary + inspection of top URLs
 *
 * Auth: requires the caller to be a signed-in admin (checked via user_roles).
 *
 * Reliability: every upstream call goes through `fetchWithRetry` which retries
 * transient 429/5xx/network errors with exponential backoff and emits a
 * structured log line for every attempt so the admin panel never shows an
 * empty result because of a single blip.
 */
// @ts-nocheck
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { log } from "../_shared/log.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";
const SITE_URL = "https://dubaiborkahouse.com/";
const FN = "gsc-indexing";

function headers() {
  return {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
    "X-Connection-Api-Key": Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY") ?? "",
    "Content-Type": "application/json",
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * fetchWithRetry — wraps fetch with exponential backoff on 429/5xx/network errors.
 * Logs every attempt so we can trace stale/empty results in Supabase logs.
 */
async function fetchWithRetry(
  label: string,
  url: string,
  init: RequestInit,
  maxAttempts = 3,
): Promise<{ status: number; body: any; ok: boolean; attempts: number }> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    try {
      const r = await fetch(url, init);
      const text = await r.text();
      let body: any = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
      const durationMs = Date.now() - started;
      const transient = r.status === 429 || r.status >= 500;
      log(transient && attempt < maxAttempts ? "warn" : "info", FN, "upstream_call", {
        label, url, attempt, status: r.status, ok: r.ok, durationMs,
      });
      if (r.ok || !transient || attempt === maxAttempts) {
        return { status: r.status, body, ok: r.ok, attempts: attempt };
      }
    } catch (e) {
      lastErr = e;
      log("warn", FN, "upstream_network_error", {
        label, url, attempt, error: String((e as Error)?.message ?? e),
        durationMs: Date.now() - started,
      });
      if (attempt === maxAttempts) break;
    }
    // Exponential backoff: 400ms, 800ms, 1600ms…
    await sleep(400 * 2 ** (attempt - 1));
  }
  log("error", FN, "upstream_exhausted", { label, url, maxAttempts, lastErr: String(lastErr) });
  return { status: 0, body: { error: String(lastErr ?? "exhausted") }, ok: false, attempts: maxAttempts };
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401, error: "missing token" };
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return { ok: false, status: 401, error: "not signed in" };
  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", u.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) return { ok: false, status: 403, error: "admin only" };
  return { ok: true, userId: u.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();
  const requestId = crypto.randomUUID();
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return errorResponse(guard.error, guard.status);

    const url = new URL(req.url);
    let action = url.searchParams.get("action") ?? "";
    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
      action = body.action ?? action;
    }

    log("info", FN, "request", { requestId, action, userId: guard.userId });

    if (!Deno.env.get("LOVABLE_API_KEY") || !Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY")) {
      log("warn", FN, "connector_not_linked", { requestId });
      return jsonResponse({
        connected: false,
        requestId,
        message: "Google Search Console connector not linked yet.",
      });
    }

    if (action === "sites" || (!action && req.method === "GET")) {
      const r = await fetchWithRetry("sites", `${GATEWAY}/webmasters/v3/sites`, { headers: headers() });
      return jsonResponse({ connected: true, requestId, status: r.status, attempts: r.attempts, ...(r.body ?? {}) });
    }

    // ---- Sitemap management -------------------------------------------------
    if (action === "sitemaps") {
      const r = await fetchWithRetry(
        "sitemaps",
        `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/sitemaps`,
        { headers: headers() },
      );
      return jsonResponse({ connected: true, requestId, status: r.status, attempts: r.attempts, siteUrl: SITE_URL, ...(r.body ?? {}) });
    }

    if (action === "submit-sitemap") {
      const sitemapUrl = String(body.sitemapUrl ?? `${SITE_URL}sitemap.xml`);
      const r = await fetchWithRetry(
        "submit-sitemap",
        `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
        { method: "PUT", headers: headers() },
      );
      log("info", FN, "sitemap_submitted", { requestId, sitemapUrl, status: r.status, ok: r.ok });
      return jsonResponse({
        connected: true, requestId, sitemapUrl, status: r.status, attempts: r.attempts,
        ok: r.ok, error: r.ok ? null : r.body,
      });
    }

    if (action === "inspect") {

      const target = String(body.url ?? SITE_URL);
      const r = await fetchWithRetry("inspect", `${GATEWAY}/v1/urlInspection/index:inspect`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ inspectionUrl: target, siteUrl: SITE_URL }),
      });
      return jsonResponse({
        connected: true, requestId, status: r.status, attempts: r.attempts, url: target, result: r.body,
      });
    }

    // ---- Google Indexing API: request (re)indexing for specific URLs -------
    // Sends urlNotifications:publish through the connector gateway and logs
    // every attempt (status + upstream body) into public.indexing_requests.
    if (action === "request-indexing") {
      const urls: string[] = Array.isArray(body.urls)
        ? body.urls.map((u: unknown) => String(u)).filter(Boolean).slice(0, 50)
        : [String(body.url ?? SITE_URL)];
      const type = body.type === "URL_DELETED" ? "URL_DELETED" : "URL_UPDATED";

      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const results = [];
      for (const target of urls) {
        const r = await fetchWithRetry("request-indexing", `${GATEWAY}/v3/urlNotifications:publish`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ url: target, type }),
        });
        const row = {
          url: target,
          request_type: type,
          status: r.ok ? "sent" : "failed",
          http_status: r.status,
          response: r.body ?? null,
          error: r.ok ? null : JSON.stringify(r.body ?? {}).slice(0, 1000),
          requested_by: guard.userId,
        };
        await admin.from("indexing_requests").insert(row);
        log(r.ok ? "info" : "error", FN, "indexing_request", {
          requestId, url: target, type, status: r.status, ok: r.ok,
        });
        results.push({ url: target, ok: r.ok, status: r.status, response: r.body });
      }

      const sent = results.filter((x) => x.ok).length;
      return jsonResponse({
        connected: true, requestId, type, sent, failed: results.length - sent, results,
      });
    }

    // ---- Recent indexing request history -----------------------------------
    if (action === "indexing-history") {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data, error } = await admin
        .from("indexing_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(Number(body.limit ?? 100));
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ connected: true, requestId, rows: data ?? [] });
    }

    if (action === "errors" || action === "summary") {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10);
      const encodedSite = encodeURIComponent(SITE_URL);
      const analytics = await fetchWithRetry(
        "searchAnalytics",
        `${GATEWAY}/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["page"], rowLimit: 25 }),
        },
      );
      const rows = Array.isArray(analytics.body?.rows) ? analytics.body.rows : [];

      // Always include the site root so the panel is never empty even before rows land.
      const targets = new Set<string>();
      targets.add(SITE_URL);
      for (const row of rows.slice(0, 10)) {
        const t = row.keys?.[0];
        if (t) targets.add(t);
      }

      const inspections = await Promise.all(
        Array.from(targets).map(async (target) => {
          const row = rows.find((r: any) => r.keys?.[0] === target);
          const r = await fetchWithRetry("inspect", `${GATEWAY}/v1/urlInspection/index:inspect`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ inspectionUrl: target, siteUrl: SITE_URL }),
          });
          return {
            url: target,
            clicks: row?.clicks,
            impressions: row?.impressions,
            attempts: r.attempts,
            result: r.body,
          };
        }),
      );

      log("info", FN, "summary_ready", {
        requestId, totalRows: rows.length, inspected: inspections.length,
        analyticsOk: analytics.ok, analyticsStatus: analytics.status,
      });

      return jsonResponse({
        connected: true,
        requestId,
        analyticsStatus: analytics.status,
        analyticsAttempts: analytics.attempts,
        siteUrl: SITE_URL,
        totalRows: rows.length,
        inspections,
        analyticsError: analytics.ok ? null : analytics.body,
      });
    }

    return errorResponse("unknown action", 400);
  } catch (e) {
    log("error", FN, "unhandled_error", { requestId, error: String((e as Error).message ?? e) });
    return errorResponse(String((e as Error).message ?? e), 500);
  }
});
