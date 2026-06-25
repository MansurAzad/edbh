/**
 * @file send-whatsapp-notification/index.ts
 *
 * @purpose
 *   Sends a free-text WhatsApp message to a customer's phone number via the
 *   WhatsApp Business Cloud API (Meta Graph API). Used for order status updates
 *   and shipping notifications. Called by other edge functions as well as
 *   directly by the admin UI.
 *
 * @httpContract
 *   Method  : POST
 *   Auth    : None enforced (internal-only; caller must be trusted)
 *   Body    :
 *   ```json
 *   {
 *     "phone":          "01700000000",
 *     "customerName":   "Jane",
 *     "orderId":        "<uuid>",
 *     "status":         "shipped",
 *     "total":          1500,
 *     "trackingNumber": "SF123456",
 *     "courierName":    "Steadfast"
 *   }
 *   ```
 *   `customerName`, `trackingNumber`, `courierName` are optional.
 *   Response 200 (success):
 *     `{ "success": true, "data": <WhatsApp API response> }`
 *   Response 200 (credentials absent):
 *     `{ "success": false, "error": "WhatsApp not configured" }`
 *   Response 500 (API error or unhandled exception):
 *     `{ "success": false, "error": "<message>" }`
 *
 * @envVars
 *   - `WHATSAPP_ACCESS_TOKEN`    — Meta user/system access token with
 *                                  `whatsapp_business_messaging` permission.
 *   - `WHATSAPP_PHONE_NUMBER_ID` — The numeric phone-number ID of the
 *                                  sending WABA phone number (not the
 *                                  display phone number).
 *
 * @authModel
 *   No JWT check inside the function. Restrict invocation to internal
 *   server-side callers. If credentials are missing the function returns
 *   HTTP 200 with `success: false` (soft-fail) so callers aren't broken.
 *
 * @thirdPartyAPIs
 *   Meta WhatsApp Business Cloud API
 *   Endpoint : POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
 *   Auth     : `Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>`
 *   Payload  :
 *   ```json
 *   {
 *     "messaging_product": "whatsapp",
 *     "to": "<e164_without_plus>",
 *     "type": "text",
 *     "text": { "body": "<message>" }
 *   }
 *   ```
 *   Success  : 2xx + `{ messages: [{ id }] }`
 *   Failure  : 4xx/5xx — full response logged, error thrown
 *
 * @phoneNormalization
 *   Bangladesh-aware: leading `0` → prepend `880` (country code).
 *   If already starts with `880` or another country code, left as-is.
 *   Leading `+` is stripped (Meta API requires digits only).
 *
 * @messageFormat
 *   Plain text with WhatsApp bold markers (`*...*`).
 *   Includes: greeting, order short-ID, status sentence, total (৳),
 *   optional tracking number, optional courier name.
 *
 * @statusMap (English sentence fragments)
 *   pending   → "received and is being reviewed"
 *   confirmed → "confirmed! We're preparing it now"
 *   processing→ "being processed and will ship soon"
 *   shipped   → "shipped! It's on its way to you"
 *   delivered → "delivered! We hope you love it"
 *   cancelled → "cancelled as requested"
 *
 * @rateLimiting
 *   Meta enforces per-phone rate limits at the WABA level (varies by tier).
 *   No client-side throttling is implemented here.
 *
 * @idempotency
 *   Not idempotent — each invocation sends a new WhatsApp message.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Expected POST body fields. */
interface WhatsAppRequest {
  phone: string;          // Raw phone number (any common format)
  customerName: string;   // Used in greeting; optional — falls back to "Customer"
  orderId: string;        // UUID; first 8 chars shown in message
  status: string;         // Internal order status key
  total: number;          // Order total in BDT (৳)
  trackingNumber?: string; // Courier tracking number — appended if provided
  courierName?: string;    // Courier name (e.g. "Steadfast") — appended if provided
}

/**
 * Map internal order status keys to English message fragments
 * used in the WhatsApp notification body.
 *
 * @param status - Internal status string.
 * @returns Human-readable English sentence fragment.
 */
const getStatusMessage = (status: string): string => {
  const map: Record<string, string> = {
    pending:    "received and is being reviewed",
    confirmed:  "confirmed! We're preparing it now",
    processing: "being processed and will ship soon",
    shipped:    "shipped! It's on its way to you",
    delivered:  "delivered! We hope you love it",
    cancelled:  "cancelled as requested",
  };
  return map[status] || `updated to: ${status}`;
};

/** Main request handler. */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Environment ────────────────────────────────────────────────────────
    const WHATSAPP_ACCESS_TOKEN    = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    // Soft-fail: return HTTP 200 with error flag so callers don't crash
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.warn("WhatsApp credentials not configured, skipping notification");
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp not configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── Parse request ──────────────────────────────────────────────────────
    const { phone, customerName, orderId, status, total, trackingNumber, courierName }: WhatsAppRequest = await req.json();

    if (!phone || !orderId) {
      throw new Error("Missing required fields: phone and orderId");
    }

    // ── Phone normalisation ────────────────────────────────────────────────
    // Meta requires E.164 format WITHOUT the leading '+'.
    // Handles Bangladesh numbers (leading 0 → 880 country code).
    let formattedPhone = phone.replace(/[\s\-\(\)]/g, ""); // strip spaces, dashes, parens
    if (formattedPhone.startsWith("0")) {
      // Local Bangladeshi format: 01XXXXXXXXX → 8801XXXXXXXXX
      formattedPhone = "880" + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith("+") && !formattedPhone.startsWith("880")) {
      // No country code at all — assume Bangladesh
      formattedPhone = "880" + formattedPhone;
    }
    formattedPhone = formattedPhone.replace(/^\+/, ""); // remove leading + if present

    const shortOrderId = orderId.slice(0, 8).toUpperCase();
    const statusMsg    = getStatusMessage(status);

    // ── Build message body ─────────────────────────────────────────────────
    // WhatsApp plain-text format — *bold* wrapping uses WhatsApp markdown
    let messageBody = `Hello ${customerName || "Customer"}! 👋\n\n` +
      `Your order *#${shortOrderId}* has been ${statusMsg}.\n\n` +
      `💰 Total: ৳${total.toLocaleString()}\n`; // ৳ = Bangladeshi Taka

    if (trackingNumber) {
      messageBody += `📦 Tracking: ${trackingNumber}\n`;
    }
    if (courierName) {
      messageBody += `🚚 Courier: ${courierName}\n`;
    }

    messageBody += `\nThank you for shopping with *Dubai Borka House*! 🛍️`;

    // ── POST to Meta WhatsApp Cloud API ────────────────────────────────────
    // Endpoint uses the sending phone number's ID (not the display number)
    const waResponse = await fetch(
      `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp", // required field for Cloud API
          to: formattedPhone,
          type: "text",
          text: { body: messageBody },
        }),
      }
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      console.error("WhatsApp API error:", JSON.stringify(waData));
      throw new Error(`WhatsApp API error [${waResponse.status}]: ${JSON.stringify(waData)}`);
    }

    console.log("WhatsApp notification sent:", JSON.stringify(waData));

    return new Response(JSON.stringify({ success: true, data: waData }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending WhatsApp notification:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
