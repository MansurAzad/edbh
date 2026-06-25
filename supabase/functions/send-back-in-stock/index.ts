/**
 * @file send-back-in-stock/index.ts
 *
 * @purpose
 *   Sends "back in stock" email notifications to all customers who signed up
 *   for a stock alert on a specific product via the `back_in_stock_alerts` table.
 *   After each successful send the alert row is marked `notified = true` so the
 *   customer never receives duplicate emails (row-level idempotency).
 *
 * @httpContract
 *   Method : POST
 *   Auth   : None (called internally by admin triggers or other server functions)
 *   Body   : `{ "productId": "<uuid>" }`
 *   Response 200 (success) :
 *     `{ "success": true, "sent": <number>, "total": <number> }`
 *   Response 200 (no alerts):
 *     `{ "success": true, "sent": 0 }`
 *   Response 200 (email service missing):
 *     `{ "success": false, "error": "Email service not configured" }`
 *   Response 500 (unhandled error):
 *     `{ "success": false, "error": "<message>" }`
 *
 * @envVars
 *   - `RESEND_API_KEY`              — Resend transactional email API key (required).
 *   - `SUPABASE_URL`                — Supabase project URL (required).
 *   - `SUPABASE_SERVICE_ROLE_KEY`   — Service-role key for bypassing RLS (required).
 *
 * @authModel
 *   No caller authentication enforced; function is intended to be invoked by
 *   trusted server-side code only (e.g. a database trigger via pg_net, or an
 *   admin action). Protect the function URL if exposing it externally.
 *
 * @thirdPartyAPIs
 *   Resend (https://api.resend.com/emails)
 *   - Method : POST
 *   - Auth   : Bearer token (`RESEND_API_KEY`)
 *   - Body   : `{ from, to, subject, html }`
 *   - Returns: `{ id: string }` on 200; any non-2xx is treated as a failure
 *              for that recipient (logged, loop continues).
 *
 * @emailTemplate
 *   Subject : "🔔 {product.name} এখন স্টকে ফিরে এসেছে!"
 *             (Bengali: "{product.name} is back in stock!")
 *   Includes: product name, sale/regular price (৳), "Buy Now" CTA link.
 *
 * @rateLimiting
 *   Emails are sent sequentially in a `for` loop (not batched) so Resend's
 *   per-second limits are naturally respected. Each recipient is independent;
 *   a failure for one does not abort the rest.
 *
 * @idempotency
 *   Each alert row is updated to `notified = true` immediately after a
 *   successful send. Re-invoking for the same `productId` is safe — already-
 *   notified alerts are excluded by the `eq("notified", false)` filter.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers — allow browser callers from any origin (function is POST-only)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  // Handle CORS preflight so browser callers don't get blocked
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Environment ────────────────────────────────────────────────────────
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Soft-fail if Resend is not configured — avoids crashing scheduled calls
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Service-role client — bypasses RLS so we can read all alert rows
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Input validation ───────────────────────────────────────────────────
    const { productId } = await req.json();

    if (!productId) {
      throw new Error("Missing productId");
    }

    // ── Fetch product details ──────────────────────────────────────────────
    // We need name + price for the email template and the CTA URL
    const { data: product } = await supabase
      .from("products")
      .select("name, price, sale_price, slug, id")
      .eq("id", productId)
      .single();

    if (!product) {
      throw new Error("Product not found");
    }

    // ── Fetch pending alerts ───────────────────────────────────────────────
    // Only rows where `notified = false` — already-sent alerts are excluded
    const { data: alerts } = await supabase
      .from("back_in_stock_alerts")
      .select("id, email")
      .eq("product_id", productId)
      .eq("notified", false);

    // Nothing to send — return early with a zero-sent success response
    if (!alerts || alerts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Prefer sale_price if set; fallback to regular price
    const price = product.sale_price || product.price;
    // Canonical product URL used in the "Buy Now" CTA button
    const productUrl = `https://dubaiborkahousebd.lovable.app/product/${product.slug || product.id}`;
    let sentCount = 0;

    // ── Send per recipient ─────────────────────────────────────────────────
    // Sequential loop — intentional to stay within Resend rate limits and
    // allow individual failures without aborting the batch.
    for (const alert of alerts) {
      try {
        // POST to Resend email send endpoint
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Dubai Borka House <orders@dubaiborkehouse.com>",
            to: [alert.email],
            // Subject in Bengali: "{product.name} is back in stock!"
            subject: `🔔 ${product.name} এখন স্টকে ফিরে এসেছে!`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <!-- সুসংবাদ = Good news -->
                <h2 style="color: #b8860b;">সুসংবাদ! 🎉</h2>
                <!-- Bengali: "The product you were waiting for is back in stock!" -->
                <p>আপনি যে পণ্যটির জন্য অপেক্ষা করছিলেন, সেটি এখন স্টকে ফিরে এসেছে!</p>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 15px 0;">
                  <h3 style="margin: 0 0 5px;">${product.name}</h3>
                  <!-- ৳ = Bangladeshi Taka symbol -->
                  <p style="margin: 0; font-size: 18px; color: #b8860b; font-weight: bold;">৳${Number(price).toLocaleString()}</p>
                </div>
                <!-- CTA: "Buy Now →" (Bengali: এখনই কিনুন) -->
                <a href="${productUrl}" style="display: inline-block; background: #b8860b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  এখনই কিনুন →
                </a>
                <!-- Bengali: "Order quickly — limited stock!" -->
                <p style="margin-top: 20px; font-size: 12px; color: #999;">
                  দ্রুত অর্ডার করুন — স্টক সীমিত!
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 11px; color: #aaa;">Dubai Borka House — Premium Islamic Fashion</p>
              </div>
            `,
          }),
        });

        if (res.ok) {
          sentCount++;
          // ── Idempotency mark ─────────────────────────────────────────────
          // Mark as notified immediately so re-runs skip this recipient
          await supabase
            .from("back_in_stock_alerts")
            .update({ notified: true })
            .eq("id", alert.id);
        }
      } catch (emailErr) {
        // Log but continue — one failed recipient should not stop the batch
        console.error(`Failed to send to ${alert.email}:`, emailErr);
      }
    }

    console.log(`Back-in-stock: sent ${sentCount}/${alerts.length} emails for product ${product.name}`);

    // Return summary so callers know how many emails actually went out
    return new Response(
      JSON.stringify({ success: true, sent: sentCount, total: alerts.length }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-back-in-stock:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
