// Daily / on-demand security scan. Loads rules from `security_scan_settings`,
// sweeps text-bearing rows, saves report, and fires alerts on new critical
// findings or CSP spikes.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TARGETS = [
  { table: "products", cols: ["id", "name", "description"] },
  { table: "categories", cols: ["id", "name", "description"] },
  { table: "blog_posts", cols: ["id", "title", "content", "excerpt"] },
  { table: "site_content", cols: ["id", "section_key", "content"] },
  { table: "system_settings", cols: ["id", "key", "value"] },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Rules = {
  keywords: string[];
  tags: string[];
  uri_schemes: string[];
  hidden_css: string[];
  sensitivity: "low" | "medium" | "high";
};

type Alerts = {
  email_enabled: boolean; email_to: string | null;
  slack_enabled: boolean; slack_webhook_url: string | null;
  webhook_enabled: boolean; webhook_url: string | null;
  spike_threshold: number; spike_window_minutes: number;
  alert_on_critical: boolean;
};

function buildPatterns(rules: Rules) {
  const patterns: { name: string; re: RegExp; severity: "critical" | "warn" }[] = [];
  for (const k of rules.keywords ?? []) {
    patterns.push({ name: `spam:${k}`, re: new RegExp(escapeRe(k).replace(/\s+/g, "\\s*"), "i"), severity: "critical" });
  }
  for (const t of rules.tags ?? []) {
    patterns.push({ name: `html:${t}_tag`, re: new RegExp(`<\\s*${escapeRe(t)}\\b`, "i"), severity: "critical" });
  }
  for (const s of rules.uri_schemes ?? []) {
    patterns.push({ name: `uri:${s}`, re: new RegExp(escapeRe(s), "i"), severity: "critical" });
  }
  patterns.push({ name: "html:on_handler", re: /\son[a-z]+\s*=\s*["']/i, severity: "critical" });
  const cssSev = rules.sensitivity === "low" ? "warn" : (rules.sensitivity === "high" ? "critical" : "warn");
  for (const c of rules.hidden_css ?? []) {
    patterns.push({ name: `css:${c}`, re: new RegExp(escapeRe(c).replace(/\s*:\s*/, "\\s*:\\s*"), "i"), severity: cssSev as any });
  }
  return patterns;
}

async function sendAlert(alerts: Alerts, subject: string, body: string, meta: unknown) {
  const jobs: Promise<any>[] = [];
  if (alerts.webhook_enabled && alerts.webhook_url) {
    jobs.push(fetch(alerts.webhook_url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, meta, ts: new Date().toISOString() }),
    }).catch((e) => console.error("webhook alert failed", e)));
  }
  if (alerts.slack_enabled && alerts.slack_webhook_url) {
    jobs.push(fetch(alerts.slack_webhook_url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `*${subject}*\n${body}` }),
    }).catch((e) => console.error("slack alert failed", e)));
  }
  if (alerts.email_enabled && alerts.email_to) {
    const RESEND = Deno.env.get("RESEND_API_KEY");
    if (RESEND) {
      jobs.push(fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND}` },
        body: JSON.stringify({
          from: "Security <alerts@dubaiborkahouse.com>",
          to: [alerts.email_to],
          subject,
          html: `<pre style="font:12px monospace">${body}</pre><hr/><pre>${JSON.stringify(meta, null, 2)}</pre>`,
        }),
      }).catch((e) => console.error("email alert failed", e)));
    }
  }
  await Promise.all(jobs);
}

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
  const sbHeaders = { apikey: SR, Authorization: `Bearer ${SR}` };

  let triggeredBy = "manual";
  let triggeredUser: string | null = null;
  try {
    const body = req.method === "POST" ? await req.json() : {};
    triggeredBy = body?.triggered_by ?? triggeredBy;
    triggeredUser = body?.triggered_user ?? null;
  } catch {}

  // Load settings
  const setRes = await fetch(`${SB_URL}/rest/v1/security_scan_settings?limit=1`, { headers: sbHeaders });
  const settingsRow = setRes.ok ? (await setRes.json())[0] : null;
  const rules: Rules = settingsRow?.rules ?? {
    keywords: ["kinghorsetoto","slot gacor"], tags: ["script","iframe"],
    uri_schemes: ["javascript:"], hidden_css: ["display:none"], sensitivity: "high",
  };
  const alerts: Alerts = settingsRow?.alerts ?? {
    email_enabled: false, email_to: null, slack_enabled: false, slack_webhook_url: null,
    webhook_enabled: false, webhook_url: null,
    spike_threshold: 20, spike_window_minutes: 60, alert_on_critical: true,
  };
  const patterns = buildPatterns(rules);

  const findings: any[] = [];
  let critical = 0;

  const scanText = (row: any, table: string, col: string) => {
    const val = row?.[col];
    if (val == null) return;
    const text = typeof val === "string" ? val : JSON.stringify(val);
    for (const p of patterns) {
      const m = text.match(p.re);
      if (m) {
        if (p.severity === "critical") critical++;
        findings.push({
          table, column: col, row_id: row.id, pattern: p.name, severity: p.severity,
          excerpt: text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + m[0].length + 40),
        });
      }
    }
  };

  for (const t of TARGETS) {
    const url = `${SB_URL}/rest/v1/${t.table}?select=${encodeURIComponent(t.cols.join(","))}`;
    const res = await fetch(url, { headers: sbHeaders });
    if (!res.ok) {
      findings.push({ table: t.table, error: `fetch_failed:${res.status}`, severity: "warn" });
      continue;
    }
    const rows = await res.json();
    for (const row of rows) for (const col of t.cols) if (col !== "id") scanText(row, t.table, col);
  }

  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const blockRes = await fetch(
    `${SB_URL}/rest/v1/injection_block_log?select=source,reason,matched_pattern,created_at&created_at=gte.${since24h}`,
    { headers: sbHeaders },
  );
  const recentBlocks = blockRes.ok ? await blockRes.json() : [];

  // CSP spike detection
  const spikeSince = new Date(Date.now() - alerts.spike_window_minutes * 60 * 1000).toISOString();
  const cspSpikeRes = await fetch(
    `${SB_URL}/rest/v1/csp_reports?select=id&created_at=gte.${spikeSince}`,
    { headers: { ...sbHeaders, Prefer: "count=exact" } },
  );
  const cspCount = parseInt(cspSpikeRes.headers.get("content-range")?.split("/")[1] ?? "0", 10);
  const cspSpike = cspCount >= alerts.spike_threshold;

  const report = {
    triggered_by: triggeredBy, triggered_user: triggeredUser,
    status: "completed",
    total_findings: findings.length, critical_count: critical,
    duration_ms: Date.now() - start,
    findings: { items: findings, recent_blocks: recentBlocks, csp_last_window: cspCount, rules_snapshot: rules },
  };

  const ins = await fetch(`${SB_URL}/rest/v1/security_scan_reports`, {
    method: "POST",
    headers: { ...sbHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(report),
  });
  const saved = ins.ok ? (await ins.json())[0] : null;

  // Fire alerts
  const alertReasons: string[] = [];
  if (alerts.alert_on_critical && critical > 0) alertReasons.push(`${critical} critical finding(s)`);
  if (cspSpike) alertReasons.push(`CSP spike: ${cspCount} in ${alerts.spike_window_minutes}m (>=${alerts.spike_threshold})`);
  if (alertReasons.length) {
    await sendAlert(
      alerts,
      `[Security] Scan alert — ${alertReasons.join(", ")}`,
      `Trigger: ${triggeredBy}\nTotal findings: ${findings.length}\nCritical: ${critical}\nCSP window (${alerts.spike_window_minutes}m): ${cspCount}`,
      { report_id: saved?.id, top_findings: findings.slice(0, 20) },
    );
  }

  return new Response(JSON.stringify({ ok: true, report: saved ?? report, alerts_fired: alertReasons }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
