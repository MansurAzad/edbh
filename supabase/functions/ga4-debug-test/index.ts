/**
 * @file ga4-debug-test/index.ts
 *
 * @purpose
 *   Admin diagnostic tool that exercises the Google Analytics 4 Measurement
 *   Protocol to verify that the configured GA4 credentials are valid and that
 *   events reach DebugView.  Two requests are made:
 *
 *     1. POST /debug/mp/collect  – validates the event payload server-side
 *        (returns validationMessages) but does NOT register the hit in GA.
 *     2. POST /mp/collect        – actually sends the event so it appears
 *        immediately in GA4 DebugView (real-time) for visual confirmation.
 *
 * @http
 *   Method : POST (OPTIONS also handled for CORS pre-flight)
 *   Body   : (all fields optional)
 *     {
 *       client_id?      : string  – GA4 client ID (random UUID generated if omitted)
 *       event_name?     : string  – Event name (defaults to "admin_debug_test")
 *       test_event_code?: string  – Shows in DebugView (defaults to "ADMIN_DEBUG")
 *       params?         : object  – Additional event params merged into the payload
 *     }
 *
 * @response
 *   200 OK  : {
 *     ok: true, valid: boolean, measurement_id: string, client_id: string,
 *     event_name: string, payload: object, validation_messages: any[],
 *     live_status: number, debug_status: number
 *   }
 *   200     : { ok: false, error: "GA4 not configured ..." }  – missing env vars
 *   500     : { ok: false, error: string }
 *
 * @auth
 *   None from the caller — should be called only from authenticated admin UI.
 *   No Supabase auth enforced in this function (rely on frontend guards).
 *
 * @env
 *   GA4_MEASUREMENT_ID – GA4 property measurement ID (e.g. "G-XXXXXXX")
 *   GA4_API_SECRET     – Measurement Protocol API secret for the property
 *
 * @sideEffects
 *   - Sends a LIVE event to the GA4 property (visible in DebugView for ~60s).
 *     The event will NOT appear in standard GA4 reports (debug_mode=1).
 *   - No database reads or writes.
 */

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
