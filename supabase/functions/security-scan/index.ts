// Daily / on-demand security scan. Sweeps text-bearing rows for injection
// patterns (spam keywords, script/iframe tags, inline handlers, hidden CSS)
// and stores findings to `security_scan_reports`. Admin-callable and cron-callable.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PATTERNS: { name: string; re: RegExp; severity: "critical" | "warn" }[] = [
  { name: "spam:kinghorsetoto", re: /kinghorsetoto/i, severity: "critical" },
  { name: "spam:slot_gacor", re: /slot\s*gacor/i, severity: "critical" },
  { name: "spam:judi_bola", re: /judi\s*bola/i, severity: "critical" },
  { name: "spam:fastoto", re: /fastoto/i, severity: "critical" },
  { name: "spam:intertogel", re: /intertogel/i, severity: "critical" },
  { name: "spam:royaltoto", re: /royaltoto/i, severity: "critical" },
  { name: "spam:98toto", re: /\b98toto\b/i, severity: "critical" },
  { name: "spam:togel", re: /(situs|prediksi)\s*togel/i, severity: "critical" },
  { name: "spam:casino_online", re: /casino\s*online/i, severity: "critical" },
  { name: "html:script_tag", re: /<\s*script\b/i, severity: "critical" },
  { name: "html:iframe_tag", re: /<\s*iframe\b/i, severity: "critical" },
  { name: "html:object_tag", re: /<\s*object\b/i, severity: "critical" },
  { name: "html:on_handler", re: /\son[a-z]+\s*=\s*["']/i, severity: "critical" },
  { name: "html:javascript_uri", re: /javascript\s*:/i, severity: "critical" },
  { name: "css:display_none", re: /display\s*:\s*none/i, severity: "warn" },
  { name: "css:visibility_hidden", re: /visibility\s*:\s*hidden/i, severity: "warn" },
  { name: "css:font_size_0", re: /font-size\s*:\s*0/i, severity: "warn" },
  { name: "css:hidden_position", re: /position\s*:\s*absolute\s*;\s*left\s*:\s*-/i, severity: "warn" },
];

const TARGETS = [
  { table: "products", cols: ["id", "name", "description"] },
  { table: "categories", cols: ["id", "name", "description"] },
  { table: "blog_posts", cols: ["id", "title", "content", "excerpt"] },
  { table: "site_content", cols: ["id", "section_key", "content"] },
  { table: "system_settings", cols: ["id", "key", "value"] },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const start = Date.now();
  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SR) {
    return new Response(JSON.stringify({ error: "misconfigured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse triggered_by (from cron body or admin UI)
  let triggeredBy = "manual";
  let triggeredUser: string | null = null;
  try {
    const body = req.method === "POST" ? await req.json() : {};
    triggeredBy = body?.triggered_by ?? triggeredBy;
    triggeredUser = body?.triggered_user ?? null;
  } catch { /* ignore */ }

  const findings: any[] = [];
  let critical = 0;

  const scanText = (row: any, table: string, col: string) => {
    const val = row?.[col];
    if (val == null) return;
    const text = typeof val === "string" ? val : JSON.stringify(val);
    for (const p of PATTERNS) {
      const m = text.match(p.re);
      if (m) {
        if (p.severity === "critical") critical++;
        findings.push({
          table,
          column: col,
          row_id: row.id,
          pattern: p.name,
          severity: p.severity,
          excerpt: text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + m[0].length + 40),
        });
      }
    }
  };

  for (const t of TARGETS) {
    const selectCols = t.cols.join(",");
    const url = `${SB_URL}/rest/v1/${t.table}?select=${encodeURIComponent(selectCols)}`;
    const res = await fetch(url, {
      headers: { apikey: SR, Authorization: `Bearer ${SR}` },
    });
    if (!res.ok) {
      findings.push({ table: t.table, error: `fetch_failed:${res.status}`, severity: "warn" });
      continue;
    }
    const rows = await res.json();
    for (const row of rows) {
      for (const col of t.cols) {
        if (col === "id") continue;
        scanText(row, t.table, col);
      }
    }
  }

  // Recent injection blocks (last 24h) contribute to summary
  const blockRes = await fetch(
    `${SB_URL}/rest/v1/injection_block_log?select=source,reason,matched_pattern,created_at&created_at=gte.${
      new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    }`,
    { headers: { apikey: SR, Authorization: `Bearer ${SR}` } },
  );
  const recentBlocks = blockRes.ok ? await blockRes.json() : [];

  const report = {
    triggered_by: triggeredBy,
    triggered_user: triggeredUser,
    status: "completed",
    total_findings: findings.length,
    critical_count: critical,
    duration_ms: Date.now() - start,
    findings: { items: findings, recent_blocks: recentBlocks },
  };

  const ins = await fetch(`${SB_URL}/rest/v1/security_scan_reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SR,
      Authorization: `Bearer ${SR}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(report),
  });
  const saved = ins.ok ? (await ins.json())[0] : null;
  if (!ins.ok) console.error("scan insert failed", ins.status, await ins.text());

  return new Response(JSON.stringify({ ok: true, report: saved ?? report }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
