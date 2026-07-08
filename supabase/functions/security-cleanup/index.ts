// Admin/cron callable cleanup. Invokes cleanup_security_data() RPC and sends
// completion/failure alerts through the configured channels.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Alerts = {
  email_enabled: boolean; email_to: string | null;
  slack_enabled: boolean; slack_webhook_url: string | null;
  webhook_enabled: boolean; webhook_url: string | null;
};

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
          to: [alerts.email_to], subject,
          html: `<pre style="font:12px monospace">${body}</pre><hr/><pre>${JSON.stringify(meta, null, 2)}</pre>`,
        }),
      }).catch((e) => console.error("email alert failed", e)));
    }
  }
  await Promise.all(jobs);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SR) {
    return new Response(JSON.stringify({ error: "misconfigured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sbHeaders = { apikey: SR, Authorization: `Bearer ${SR}` };

  const setRes = await fetch(`${SB_URL}/rest/v1/security_scan_settings?limit=1`, { headers: sbHeaders });
  const settingsRow = setRes.ok ? (await setRes.json())[0] : null;
  const alerts: Alerts = settingsRow?.alerts ?? {
    email_enabled: false, email_to: null, slack_enabled: false, slack_webhook_url: null,
    webhook_enabled: false, webhook_url: null,
  };

  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/cleanup_security_data`, {
      method: "POST",
      headers: { ...sbHeaders, "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`RPC failed ${res.status}: ${body}`);
    const parsed = JSON.parse(body);
    const summary = Array.isArray(parsed) ? parsed[0] : parsed;
    await sendAlert(alerts, "[Security] Cleanup complete",
      `CSP deleted: ${summary?.csp_deleted ?? 0}\nScan reports deleted: ${summary?.scan_deleted ?? 0}\nBlocks deleted: ${summary?.block_deleted ?? 0}`,
      summary);
    return new Response(body, {
      status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendAlert(alerts, "[Security] Cleanup FAILED", `Error: ${msg}`, {});
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
