// Daily / on-demand security scan. Loads rules from `security_scan_settings`,
// sweeps text-bearing rows, saves report with progress/status/error tracking,
// and fires alerts on new critical findings or CSP spikes.
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
  const jsonHeaders = { ...sbHeaders, "Content-Type": "application/json" };

  let triggeredBy = "manual";
  let triggeredUser: string | null = null;
  let checkSchedule = false;
  try {
    const body = req.method === "POST" ? await req.json() : {};
    triggeredBy = body?.triggered_by ?? triggeredBy;
    triggeredUser = body?.triggered_user ?? null;
    checkSchedule = !!body?.check_schedule;
  } catch {}

  // Load settings
  const setRes = await fetch(`${SB_URL}/rest/v1/security_scan_settings?limit=1`, { headers: sbHeaders });
  const settingsRow = setRes.ok ? (await setRes.json())[0] : null;

  // Schedule gate — if this is a scheduled poll, only run when due.
  if (checkSchedule && settingsRow) {
    const sch = settingsRow.schedule ?? {};
    const skip = (reason: string, extra: Record<string, unknown> = {}) =>
      new Response(JSON.stringify({ ok: true, skipped: reason, ...extra }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!sch.enabled) return skip("schedule_disabled");

    const tz = sch.timezone ?? "UTC";
    const weekdays: number[] = Array.isArray(sch.weekdays) ? sch.weekdays : [0,1,2,3,4,5,6];
    const startTime: string = sch.start_time_of_day ?? "00:00";
    let parts: Record<string, string> = {};
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
      });
      for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
    } catch { parts = {}; }
    const dayMap: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    const wd = dayMap[parts.weekday ?? ""] ?? new Date().getUTCDay();
    if (!weekdays.includes(wd)) return skip("weekday_excluded", { wd });
    const hhmm = `${parts.hour ?? "00"}:${parts.minute ?? "00"}`;
    if (hhmm < startTime) return skip("before_start_time", { hhmm, startTime });

    const freq = Number(sch.frequency_hours ?? 24);
    const last = sch.last_run_at ? new Date(sch.last_run_at).getTime() : 0;
    if (Date.now() - last < freq * 3600 * 1000) {
      return skip("not_due", { next_in_ms: freq * 3600 * 1000 - (Date.now() - last) });
    }
  }

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

  // Insert queued row first so UI can show status live.
  const initRes = await fetch(`${SB_URL}/rest/v1/security_scan_reports`, {
    method: "POST",
    headers: { ...jsonHeaders, Prefer: "return=representation" },
    body: JSON.stringify({
      triggered_by: triggeredBy, triggered_user: triggeredUser,
      status: "running", progress: 0, total_findings: 0, critical_count: 0,
      findings: {},
    }),
  });
  const inserted = initRes.ok ? (await initRes.json())[0] : null;
  const reportId = inserted?.id;

  const updateReport = (patch: Record<string, unknown>) =>
    reportId
      ? fetch(`${SB_URL}/rest/v1/security_scan_reports?id=eq.${reportId}`, {
          method: "PATCH", headers: jsonHeaders,
          body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
        }).catch(() => {})
      : Promise.resolve();

  try {
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

    for (let ti = 0; ti < TARGETS.length; ti++) {
      const t = TARGETS[ti];
      const url = `${SB_URL}/rest/v1/${t.table}?select=${encodeURIComponent(t.cols.join(","))}`;
      const res = await fetch(url, { headers: sbHeaders });
      if (!res.ok) {
        findings.push({ table: t.table, error: `fetch_failed:${res.status}`, severity: "warn" });
      } else {
        const rows = await res.json();
        for (const row of rows) for (const col of t.cols) if (col !== "id") scanText(row, t.table, col);
      }
      await updateReport({
        progress: Math.round(((ti + 1) / TARGETS.length) * 90),
        total_findings: findings.length, critical_count: critical,
      });
    }

    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const blockRes = await fetch(
      `${SB_URL}/rest/v1/injection_block_log?select=source,reason,matched_pattern,created_at&created_at=gte.${since24h}`,
      { headers: sbHeaders },
    );
    const recentBlocks = blockRes.ok ? await blockRes.json() : [];

    const spikeSince = new Date(Date.now() - alerts.spike_window_minutes * 60 * 1000).toISOString();
    const cspSpikeRes = await fetch(
      `${SB_URL}/rest/v1/csp_reports?select=id&created_at=gte.${spikeSince}`,
      { headers: { ...sbHeaders, Prefer: "count=exact" } },
    );
    const cspCount = parseInt(cspSpikeRes.headers.get("content-range")?.split("/")[1] ?? "0", 10);
    const cspSpike = cspCount >= alerts.spike_threshold;

    const finalPatch = {
      status: "completed", progress: 100,
      total_findings: findings.length, critical_count: critical,
      duration_ms: Date.now() - start,
      findings: { items: findings, recent_blocks: recentBlocks, csp_last_window: cspCount, rules_snapshot: rules },
    };
    await updateReport(finalPatch);

    // Update schedule.last_run_at
    if (settingsRow) {
      const newSchedule = { ...(settingsRow.schedule ?? {}), last_run_at: new Date().toISOString() };
      await fetch(`${SB_URL}/rest/v1/security_scan_settings?id=eq.${settingsRow.id}`, {
        method: "PATCH", headers: jsonHeaders,
        body: JSON.stringify({ schedule: newSchedule }),
      }).catch(() => {});
    }

    // Fire alerts
    const alertReasons: string[] = [];
    if (alerts.alert_on_critical && critical > 0) alertReasons.push(`${critical} critical finding(s)`);
    if (cspSpike) alertReasons.push(`CSP spike: ${cspCount} in ${alerts.spike_window_minutes}m (>=${alerts.spike_threshold})`);
    if (alertReasons.length) {
      await sendAlert(
        alerts,
        `[Security] Scan alert — ${alertReasons.join(", ")}`,
        `Trigger: ${triggeredBy}\nTotal findings: ${findings.length}\nCritical: ${critical}\nCSP window (${alerts.spike_window_minutes}m): ${cspCount}`,
        { report_id: reportId, top_findings: findings.slice(0, 20) },
      );
    }

    return new Response(JSON.stringify({ ok: true, report_id: reportId, ...finalPatch, alerts_fired: alertReasons }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateReport({ status: "failed", error: msg, progress: 100, duration_ms: Date.now() - start });
    return new Response(JSON.stringify({ ok: false, error: msg, report_id: reportId }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
