// CSP violation collector. Accepts browser CSP reports (application/csp-report,
// application/reports+json, or plain JSON) and stores them for admin review.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SR) {
    return new Response("misconfigured", { status: 500, headers: corsHeaders });
  }

  let raw: any = null;
  try {
    raw = await req.json();
  } catch {
    try { raw = { text: await req.text() }; } catch { raw = {}; }
  }

  // Normalize: report-uri legacy sends {"csp-report":{...}}; report-to sends [{body:{...}}]
  const rows: any[] = [];
  const pushOne = (r: any) => {
    if (!r) return;
    rows.push({
      document_uri: r["document-uri"] ?? r.documentURL ?? null,
      referrer: r.referrer ?? null,
      violated_directive: r["violated-directive"] ?? r.effectiveDirective ?? null,
      effective_directive: r["effective-directive"] ?? r.effectiveDirective ?? null,
      original_policy: r["original-policy"] ?? r.originalPolicy ?? null,
      blocked_uri: r["blocked-uri"] ?? r.blockedURL ?? null,
      status_code: r["status-code"] ?? r.statusCode ?? null,
      source_file: r["source-file"] ?? r.sourceFile ?? null,
      line_number: r["line-number"] ?? r.lineNumber ?? null,
      column_number: r["column-number"] ?? r.columnNumber ?? null,
      user_agent: req.headers.get("user-agent"),
      raw: r,
    });
  };
  if (Array.isArray(raw)) {
    for (const item of raw) pushOne(item?.body ?? item?.["csp-report"] ?? item);
  } else if (raw?.["csp-report"]) {
    pushOne(raw["csp-report"]);
  } else {
    pushOne(raw);
  }

  if (rows.length === 0) return new Response("ok", { headers: corsHeaders });

  const res = await fetch(`${SB_URL}/rest/v1/csp_reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SR,
      Authorization: `Bearer ${SR}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    console.error("csp-report insert failed", res.status, await res.text());
    return new Response("insert_failed", { status: 500, headers: corsHeaders });
  }
  return new Response("ok", { headers: corsHeaders });
});
