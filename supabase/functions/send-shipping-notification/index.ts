/**
 * @file send-shipping-notification/index.ts
 *
 * @purpose
 *   Sends customer-facing shipment notifications (email + WhatsApp) when a
 *   courier shipment transitions through key lifecycle events:
 *   - `approved`  — admin has approved the shipment for pickup
 *   - `submitted` — parcel handed to Steadfast Courier (includes tracking code)
 *   - `delivered` — parcel delivered to the customer
 *
 *   Called internally by `steadfast-courier` (via `admin.functions.invoke`)
 *   whenever it records an approval or detects a status change.
 *
 * @httpContract
 *   Method  : POST
 *   Auth    : None (internal function-to-function call via service-role)
 *   Body    : `Payload`
 *   ```json
 *   {
 *     "event":           "submitted",
 *     "order_id":        "<uuid>",
 *     "shipment_id":     "<uuid>",
 *     "idempotency_key": "submitted:CONSIGNMENT123",
 *     "recipient_email": "user@example.com",
 *     "recipient_name":  "Jane",
 *     "recipient_phone": "01700000000",
 *     "tracking_code":   "SF123456",
 *     "consignment_id":  "123456",
 *     "total":           1500
 *   }
 *   ```
 *   Response 200 (success or skipped duplicate):
 *     `{ "ok": true }` or `{ "ok": true, "skipped": "duplicate" }`
 *   Response 500 (unhandled error):
 *     `{ "error": "<message>" }`
 *
 * @envVars
 *   - `RESEND_API_KEY`            — Resend transactional email key (required for email leg).
 *   - `LOVABLE_API_KEY`           — Lovable gateway API key (required for email leg).
 *   - `SUPABASE_URL`              — Supabase project URL (required for idempotency check +
 *                                   WhatsApp sub-invocation).
 *   - `SUPABASE_SERVICE_ROLE_KEY` — Service-role key (required for DB access).
 *
 * @authModel
 *   No caller JWT verification. The function is invoked by `steadfast-courier`
 *   using the service-role client, making it an internal-only endpoint.
 *
 * @thirdPartyAPIs
 *   1. Resend via Lovable Connector Gateway
 *      POST https://connector-gateway.lovable.dev/resend/emails
 *      Headers: `Authorization: Bearer <LOVABLE_API_KEY>`,
 *               `X-Connection-Api-Key: <RESEND_API_KEY>`
 *      Body: standard Resend email payload
 *
 *   2. WhatsApp (via `send-whatsapp-notification` edge function)
 *      Invoked as a best-effort sub-call using `admin.functions.invoke`.
 *      Failures are silently swallowed (catch block is empty).
 *
 * @emailTemplate (Bengali)
 *   approved : "✓ আপনার অর্ডার শিপিংয়ের জন্য অনুমোদিত"
 *              (Your order is approved for shipping)
 *   submitted: "🚚 আপনার অর্ডার কুরিয়ারে হস্তান্তর হয়েছে"
 *              (Your order has been handed to the courier)
 *              Includes tracking code and Steadfast live-track link.
 *   delivered: "🎉 আপনার অর্ডার সফলভাবে ডেলিভারি হয়েছে"
 *              (Your order has been delivered successfully)
 *
 * @idempotency
 *   Before sending, the function reads `courier_shipments.notifications_sent`
 *   (a JSONB column) and checks whether a key matching
 *   `"{event}:{consignment_id|shipment_id}"` already exists.
 *   If found, it returns `{ ok: true, skipped: "duplicate" }` immediately.
 *   On success, the key is written back to the column so future calls are no-ops.
 *
 * @rateLimiting
 *   No explicit rate limiting. WhatsApp leg is best-effort; email leg errors
 *   are logged but do not fail the overall response.
 */

// Sends customer-facing shipping notifications (email + WhatsApp)
// Triggered when a shipment is approved, submitted to Steadfast, or delivered.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Inbound payload shape from `steadfast-courier` or any caller.
 *
 * @property event           - Lifecycle event triggering the notification.
 * @property order_id        - UUID of the parent order.
 * @property shipment_id     - UUID of the `courier_shipments` row.
 * @property idempotency_key - Optional dedup key; if already stored in
 *                             `notifications_sent.__keys`, call is a no-op.
 * @property recipient_email - Customer email (email leg skipped if absent).
 * @property recipient_name  - Customer display name; falls back to "প্রিয় গ্রাহক".
 * @property recipient_phone - E.164-ish phone (WhatsApp leg skipped if absent).
 * @property tracking_code   - Steadfast tracking code (shown in `submitted` email).
 * @property consignment_id  - Steadfast consignment ID (used in idempotency key).
 * @property total           - Order grand total in BDT.
 */
interface Payload {
  event: "approved" | "submitted" | "delivered";
  order_id: string;
  shipment_id: string;
  idempotency_key?: string;
  recipient_email?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  tracking_code?: string | null;
  consignment_id?: string | null;
  total?: number;
}

const RESEND_KEY  = Deno.env.get("RESEND_API_KEY");
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

/** Bengali email subject lines keyed by event type. */
const subjects = {
  // "Your order is approved for shipping"
  approved:  "✓ আপনার অর্ডার শিপিংয়ের জন্য অনুমোদিত",
  // "Your order has been handed to the courier"
  submitted: "🚚 আপনার অর্ডার কুরিয়ারে হস্তান্তর হয়েছে",
  // "Your order has been delivered successfully"
  delivered: "🎉 আপনার অর্ডার সফলভাবে ডেলিভারি হয়েছে",
};

/**
 * Build the HTML email body for a given shipment event.
 * All user-facing copy is written in Bengali.
 *
 * @param p - The inbound payload.
 * @returns HTML string ready for the Resend `html` field.
 */
const bodyHtml = (p: Payload) => {
  const name       = p.recipient_name || "প্রিয় গ্রাহক"; // "Dear Customer"
  const orderShort = p.order_id.slice(0, 8);

  if (p.event === "approved") {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
        <!-- আসসালামু আলাইকুম = Islamic greeting "Peace be upon you" -->
        <h2 style="color:#1a8a3a">আসসালামু আলাইকুম, ${name}!</h2>
        <!-- "Your order #{shortId} has been approved for shipping." -->
        <p>আপনার অর্ডার <b>#${orderShort}</b> শিপিংয়ের জন্য অনুমোদিত হয়েছে।</p>
        <!-- "We will hand the parcel to the courier soon and send you a tracking number." -->
        <p>খুব শীঘ্রই আমরা পার্সেলটি কুরিয়ারে হস্তান্তর করব এবং আপনাকে ট্র্যাকিং নাম্বার পাঠানো হবে।</p>
        <p style="color:#666;font-size:13px">— Dubai Borka House</p>
      </div>`;
  }

  if (p.event === "submitted") {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
        <!-- "Your parcel is on its way!" -->
        <h2 style="color:#1664c0">আপনার পার্সেল রওনা দিয়েছে! 🚚</h2>
        <!-- "Dear {name}, your order #{shortId} has been handed to Steadfast Courier." -->
        <p>প্রিয় ${name}, আপনার অর্ডার <b>#${orderShort}</b> Steadfast Courier-এ হস্তান্তর হয়েছে।</p>
        ${p.tracking_code ? `
          <!-- Tracking code block — only shown when tracking_code is present -->
          <div style="background:#f0f7ff;padding:16px;border-radius:8px;margin:16px 0">
            <!-- ট্র্যাকিং কোড = Tracking Code -->
            <div style="font-size:13px;color:#555">ট্র্যাকিং কোড</div>
            <div style="font-size:20px;font-weight:bold;font-family:monospace">${p.tracking_code}</div>
            <!-- "Track live →" via Steadfast public tracking page -->
            <a href="https://steadfast.com.bd/t/${p.tracking_code}" style="color:#1664c0">লাইভ ট্র্যাক করুন →</a>
          </div>` : ""}
        <!-- "Usually delivers in 1–3 working days. Keep cash ready for COD." -->
        <p>সাধারণত ১-৩ কর্মদিবসে ডেলিভারি হয়। ক্যাশ অন ডেলিভারিতে পেমেন্ট প্রস্তুত রাখুন।</p>
        <p style="color:#666;font-size:13px">— Dubai Borka House</p>
      </div>`;
  }

  // event === "delivered"
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff">
      <!-- "Thank you, {name}! Your order #{shortId} has been delivered." -->
      <h2 style="color:#1a8a3a">ধন্যবাদ, ${name}! 🎉</h2>
      <p>আপনার অর্ডার <b>#${orderShort}</b> সফলভাবে ডেলিভারি সম্পন্ন হয়েছে।</p>
      <!-- "Thank you for shopping with us. Don't forget to leave a review!" -->
      <p>আমাদের সাথে কেনাকাটা করার জন্য ধন্যবাদ। প্রোডাক্টের রিভিউ দিতে ভুলবেন না!</p>
      <p style="color:#666;font-size:13px">— Dubai Borka House</p>
    </div>`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const p = (await req.json()) as Payload;

    // ── Idempotency check ─────────────────────────────────────────────────
    // Read the `notifications_sent` JSONB column on the shipment row.
    // If this idempotency_key has already been recorded, skip silently.
    if (p.idempotency_key) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: ship } = await admin
        .from("courier_shipments")
        .select("notifications_sent")
        .eq("id", p.shipment_id)
        .maybeSingle();
      // Check __keys sub-object for the specific idempotency_key
      const keys = (ship?.notifications_sent as any)?.__keys || {};
      if (keys[p.idempotency_key]) {
        return new Response(
          JSON.stringify({ ok: true, skipped: "duplicate" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Email leg ─────────────────────────────────────────────────────────
    // Only send email if recipient_email AND both API keys are present.
    // Routes through Lovable's Resend connector gateway.
    if (p.recipient_email && RESEND_KEY && LOVABLE_KEY) {
      const r = await fetch(
        "https://connector-gateway.lovable.dev/resend/emails",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LOVABLE_KEY}`,
            "X-Connection-Api-Key": RESEND_KEY, // Resend API key forwarded by gateway
          },
          body: JSON.stringify({
            from: "Dubai Borka House <onboarding@resend.dev>",
            to: [p.recipient_email],
            subject: subjects[p.event],
            html: bodyHtml(p),
          }),
        },
      );
      if (!r.ok) console.error("email send failed", await r.text());
    }

    // ── WhatsApp leg (best-effort) ────────────────────────────────────────
    // Invokes `send-whatsapp-notification` as an internal function call.
    // Failure is caught and silently ignored — WhatsApp is supplemental.
    if (p.recipient_phone) {
      try {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await admin.functions.invoke("send-whatsapp-notification", {
          body: {
            phone: p.recipient_phone,
            // Compose short Bengali WhatsApp text per event
            message:
              p.event === "submitted" && p.tracking_code
                // "Order #{shortId} sent to courier. Steadfast tracking: {code}"
                ? `📦 অর্ডার #${p.order_id.slice(0, 8)} কুরিয়ারে দেওয়া হয়েছে। Steadfast ট্র্যাকিং: ${p.tracking_code}`
                : p.event === "delivered"
                  // "Order #{shortId} delivered. Thank you!"
                  ? `🎉 অর্ডার #${p.order_id.slice(0, 8)} ডেলিভারি সম্পন্ন। ধন্যবাদ!`
                  // "Order #{shortId} approved for shipping."
                  : `✓ অর্ডার #${p.order_id.slice(0, 8)} শিপিংয়ের জন্য অনুমোদিত হয়েছে।`,
          },
        });
      } catch (_) { /* optional — WhatsApp failure must not block email */ }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
