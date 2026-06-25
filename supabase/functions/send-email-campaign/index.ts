/**
 * @file send-email-campaign/index.ts
 *
 * @purpose
 *   Sends a bulk marketing email campaign to a list of newsletter subscribers
 *   provided by the caller (typically the admin dashboard). Each subscriber
 *   receives a personalised HTML email via Resend.
 *
 * @httpContract
 *   Method : POST
 *   Auth   : None enforced at the function level (admin UI is the gatekeeper)
 *   Body   :
 *     ```json
 *     {
 *       "subject":     "Campaign subject line",
 *       "content":     "<p>HTML body injected into the template</p>",
 *       "subscribers": [
 *         { "email": "user@example.com", "name": "Jane" },
 *         { "email": "anon@example.com", "name": null }
 *       ]
 *     }
 *     ```
 *   Response 200 (success):
 *     `{ "sent": <number>, "failed": <number>, "errors": ["email@...", ...] }`
 *   Response 400 (validation failure):
 *     `{ "error": "Missing required fields" }`
 *   Response 500 (unhandled error):
 *     `{ "error": "Failed to send campaign" }`
 *
 * @envVars
 *   - `RESEND_API_KEY` — Resend transactional email API key (required).
 *
 * @authModel
 *   No JWT verification inside the function.
 *   Access should be restricted by Supabase Function invocation policies or
 *   by ensuring only authenticated admin requests reach this endpoint.
 *
 * @thirdPartyAPIs
 *   Resend (https://api.resend.com/emails)
 *   - Method  : POST
 *   - Auth    : `Authorization: Bearer <RESEND_API_KEY>`
 *   - Payload : `{ from, to: [email], subject, html }`
 *   - Success : HTTP 2xx — `sentCount++`
 *   - Failure : any non-2xx — email is added to `errors[]`; loop continues
 *
 * @emailTemplate
 *   From    : "Dubai Borka House <orders@dubaiborkehouse.com>"
 *   Subject : caller-supplied `subject`
 *   Body    : dark header + caller-supplied `content` HTML block + footer
 *   Personalisation: if `name` is provided, a Bengali greeting is prepended
 *     ("প্রিয় {name}," = "Dear {name},")
 *   Unsubscribe: footer instructs recipients to reply to the email
 *     ("আনসাবস্ক্রাইব করতে এই ইমেইলে রিপ্লাই করুন।" =
 *      "Reply to this email to unsubscribe.")
 *
 * @rateLimiting
 *   Subscribers are processed in batches of 10 using `Promise.all`, which
 *   bounds peak concurrency. Resend's free tier allows 100 emails/day;
 *   production keys can send more. No exponential back-off is implemented —
 *   failed addresses are simply collected in `errors[]`.
 *
 * @idempotency
 *   Not idempotent — re-sending the same payload re-sends to every subscriber.
 *   Deduplication must be handled by the caller (e.g., check campaign status
 *   before invoking).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Standard CORS header set for browser-initiated calls
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight before any async work
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Environment ────────────────────────────────────────────────────────
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    // ── Input validation ───────────────────────────────────────────────────
    const { subject, content, subscribers } = await req.json();

    if (!subject || !content || !Array.isArray(subscribers) || subscribers.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Counters and failure log returned to the caller
    let sentCount = 0;
    const errors: string[] = [];

    // ── Batch send ─────────────────────────────────────────────────────────
    // Process 10 subscribers at a time to balance throughput vs. Resend limits.
    // Promise.all within each batch allows parallel sends per batch window.
    for (let i = 0; i < subscribers.length; i += 10) {
      const batch = subscribers.slice(i, i + 10);
      
      await Promise.all(batch.map(async (sub: { email: string; name: string | null }) => {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "Dubai Borka House <orders@dubaiborkehouse.com>",
              to: [sub.email],
              subject: subject,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <!-- Branded header with dark/gold gradient -->
                  <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 12px; margin-bottom: 20px;">
                    <h1 style="color: #d4af37; margin: 0;">Dubai Borka House</h1>
                    <p style="color: #ccc; margin-top: 5px;">Premium Fashion</p>
                  </div>
                  <!-- Bengali personalised greeting: "Dear {name}," -->
                  ${sub.name ? `<p>প্রিয় ${sub.name},</p>` : ""}
                  <!-- Caller-supplied HTML content block -->
                  ${content}
                  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                  <p style="color: #999; font-size: 12px; text-align: center;">
                    Dubai Borka House - Premium Fashion<br>
                    <!-- Bengali: "Reply to this email to unsubscribe." -->
                    আনসাবস্ক্রাইব করতে এই ইমেইলে রিপ্লাই করুন।
                  </p>
                </div>
              `,
            }),
          });

          // Track send outcome per subscriber
          if (res.ok) sentCount++;
          else errors.push(sub.email); // collect failed addresses for caller review
        } catch {
          // Network-level errors also count as failures
          errors.push(sub.email);
        }
      }));
    }

    // Return full summary so the admin UI can display success/failure rates
    return new Response(
      JSON.stringify({ sent: sentCount, failed: errors.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Campaign error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send campaign" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
