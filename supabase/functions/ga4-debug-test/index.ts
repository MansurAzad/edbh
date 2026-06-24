// GA4 DebugView validator — sends a test event to GA4 MP /debug endpoint
// and returns the validation_messages so admins can verify their setup.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GA4_MEASUREMENT_ID = Deno.env.get("GA4_MEASUREMENT_ID");
const GA4_API_SECRET = Deno.env.get("GA4_API_SECRET");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GA4_MEASUREMENT_ID || !GA4_API_SECRET) {
      return new Response(
        JSON.stringify({ ok: false, error: "GA4 not configured (missing GA4_MEASUREMENT_ID or GA4_API_SECRET)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }

    const clientId = body.client_id || crypto.randomUUID();
    const eventName = body.event_name || "admin_debug_test";

    const payload = {
      client_id: clientId,
      // debug_mode + non_personalized_ads make event visible in DebugView immediately
      events: [{
        name: eventName,
        params: {
          debug_mode: 1,
          engagement_time_msec: 1,
          source: "admin_audit",
          test_event_code: body.test_event_code || "ADMIN_DEBUG",
          ...(body.params || {}),
        },
      }],
    };

    // /debug/mp/collect returns validationMessages (does NOT register the hit)
    const debugUrl = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;
    const debugRes = await fetch(debugUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const debugJson = await debugRes.json().catch(() => ({}));

    // /mp/collect actually delivers the hit so it shows up in DebugView
    const liveUrl = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;
    const liveRes = await fetch(liveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const validationMessages = (debugJson as any)?.validationMessages || [];
    const isValid = validationMessages.length === 0;

    return new Response(
      JSON.stringify({
        ok: true,
        valid: isValid,
        measurement_id: GA4_MEASUREMENT_ID,
        client_id: clientId,
        event_name: eventName,
        payload,
        validation_messages: validationMessages,
        live_status: liveRes.status,
        debug_status: debugRes.status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
