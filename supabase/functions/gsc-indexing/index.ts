/**
 * gsc-indexing edge function
 * Proxies Google Search Console (via Lovable connector gateway) for:
 *  - GET  ?action=sites                -> list verified sites
 *  - POST { action:"inspect", url }    -> URL inspection for the verified site
 *  - POST { action:"errors" }          -> searchAnalytics summary + inspection of top URLs
 *
 * Auth: requires the caller to be a signed-in admin (checked via user_roles).
 */
// @ts-nocheck
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";
const SITE_URL = "https://edbh.lovable.app/";

function headers() {
  return {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
    "X-Connection-Api-Key": Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY") ?? "",
    "Content-Type": "application/json",
  };
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
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();
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

    if (!Deno.env.get("LOVABLE_API_KEY") || !Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY")) {
      return jsonResponse({
        connected: false,
        message: "Google Search Console connector not linked yet.",
      });
    }

    if (action === "sites") {
      const r = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers: headers() });
      const j = await r.json();
      return jsonResponse({ connected: true, status: r.status, ...j });
    }

    if (action === "inspect") {
      const target = String(body.url ?? SITE_URL);
      const r = await fetch(`${GATEWAY}/v1/urlInspection/index:inspect`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ inspectionUrl: target, siteUrl: SITE_URL }),
      });
      const j = await r.json();
      return jsonResponse({ connected: true, status: r.status, url: target, result: j });
    }

    if (action === "errors" || action === "summary") {
      // Fetch analytics (top 25 pages by clicks last 28 days) then inspect each
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10);
      const encodedSite = encodeURIComponent(SITE_URL);
      const analyticsRes = await fetch(
        `${GATEWAY}/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            startDate: start,
            endDate: end,
            dimensions: ["page"],
            rowLimit: 25,
          }),
        },
      );
      const analytics = await analyticsRes.json();
      const rows = Array.isArray(analytics.rows) ? analytics.rows : [];

      const inspections = await Promise.all(
        rows.slice(0, 10).map(async (row: any) => {
          const target = row.keys?.[0];
          if (!target) return null;
          const r = await fetch(`${GATEWAY}/v1/urlInspection/index:inspect`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ inspectionUrl: target, siteUrl: SITE_URL }),
          });
          const j = await r.json();
          return { url: target, clicks: row.clicks, impressions: row.impressions, result: j };
        }),
      );

      return jsonResponse({
        connected: true,
        analyticsStatus: analyticsRes.status,
        siteUrl: SITE_URL,
        totalRows: rows.length,
        inspections: inspections.filter(Boolean),
        analyticsError: analyticsRes.ok ? null : analytics,
      });
    }

    return errorResponse("unknown action", 400);
  } catch (e) {
    console.error("gsc-indexing error", e);
    return errorResponse(String((e as Error).message ?? e), 500);
  }
});
