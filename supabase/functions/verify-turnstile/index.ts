/**
 * @file verify-turnstile/index.ts
 * @description Cloudflare Turnstile CAPTCHA Server-Side Verification Edge Function
 *
 * Verifies a Cloudflare Turnstile challenge token server-side so that the
 * secret key is never exposed to the browser. The function acts as a thin
 * proxy between the client and Cloudflare's `siteverify` endpoint.
 *
 * Why server-side?
 * ──────────────────
 * The Turnstile secret key MUST remain on the server. If it were used in the
 * browser, any visitor could read it from source and forge verifications.
 * This edge function keeps the key in a Supabase secret and only the function
 * runtime can read it.
 *
 * HTTP Contract
 * ─────────────
 * Method  : POST
 * Auth    : None (public endpoint – CORS-gated; the token itself is the proof)
 * Body    : JSON { token: string }
 *   – token : The `cf-turnstile-response` value from the browser widget.
 * Returns : JSON { success: boolean, score?: number }
 *   – success : true if Cloudflare confirmed the token is valid.
 *   – score   : optional risk score returned by Cloudflare (0.0–1.0).
 *   On missing token  → HTTP 400 { success: false, error }
 *   On missing secret → HTTP 500 { success: false, error }
 *   On network/parse  → HTTP 500 { success: false, error }
 *
 * External API
 * ────────────
 * POST https://challenges.cloudflare.com/turnstile/v0/siteverify
 * Body : multipart/form-data { secret, response, remoteip? }
 * Docs : https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * Environment Variables
 * ─────────────────────
 * TURNSTILE_SECRET_KEY – Cloudflare Turnstile secret key (from the Cloudflare dashboard).
 *
 * Client IP Forwarding
 * ────────────────────
 * Passing `remoteip` to Cloudflare improves accuracy of their bot detection model.
 * We extract the IP from `cf-connecting-ip` (set by Cloudflare CDN) or fall
 * back to `x-forwarded-for` (set by other proxies / load balancers).
 *
 * বাংলা নোট
 * ─────────
 * Cloudflare Turnstile-এর token server-side যাচাই করে। secret key
 * browser-এ না পাঠিয়ে এই edge function-এর মাধ্যমে Cloudflare-এ পাঠানো হয়।
 * ক্লায়েন্টের IP দিলে Cloudflare-এর bot detection আরো সঠিক হয়।
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CORS headers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Permissive CORS headers so any front-end origin can call this function.
 * The wide header list accommodates Supabase client SDK internal headers.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": [
    "authorization",
    "x-client-info",
    "apikey",
    "content-type",
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ].join(", "),
};

// ─────────────────────────────────────────────────────────────────────────────
// Main HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deno HTTP entry-point for the `verify-turnstile` edge function.
 *
 * Flow:
 *  1. Respond to CORS preflight (OPTIONS) immediately.
 *  2. Parse `token` from the JSON body; return 400 if missing.
 *  3. Read `TURNSTILE_SECRET_KEY` from env; return 500 if absent.
 *  4. Build a `multipart/form-data` payload including the secret, token,
 *     and optionally the real client IP.
 *  5. POST to Cloudflare `siteverify`; parse the JSON outcome.
 *  6. Return `{ success, score }` to the caller.
 *
 * বাংলা নোট: token পার্স করে, secret key পড়ে, Cloudflare-এ পাঠায়,
 * ফলাফল ক্লায়েন্টকে দেয়। IP ঐচ্ছিকভাবে পাঠানো হয়।
 */
serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Parse body ────────────────────────────────────────────────────────────
    const { token } = await req.json();

    // A token is mandatory; without it there is nothing to verify
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing token" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Read secret key ───────────────────────────────────────────────────────
    const secretKey = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (!secretKey) {
      // Log on the server side; never expose the configuration detail to the client
      console.error("TURNSTILE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Server misconfigured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Build multipart/form-data payload ─────────────────────────────────────
    // Cloudflare's siteverify endpoint only accepts multipart form data, not JSON.
    const formData = new FormData();
    formData.append("secret", secretKey);  // Turnstile secret key
    formData.append("response", token);    // Token from the browser widget

    // ── Extract and forward real client IP ────────────────────────────────────
    // `cf-connecting-ip` is set by Cloudflare's own edge when the request
    // passes through their network. `x-forwarded-for` is the standard proxy header.
    // Providing `remoteip` is optional but improves Cloudflare's bot model accuracy.
    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for");
    if (ip) formData.append("remoteip", ip);

    // ── POST to Cloudflare siteverify ─────────────────────────────────────────
    // Cloudflare handles Content-Type automatically when a FormData body is passed.
    const result = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
      },
    );

    // Parse the JSON outcome from Cloudflare
    const outcome = await result.json();

    // ── Return only the fields the client needs ───────────────────────────────
    // `outcome.success` – boolean: did the token pass?
    // `outcome.score`   – optional float: Cloudflare's risk score (0 = bot, 1 = human)
    return new Response(
      JSON.stringify({ success: outcome.success, score: outcome.score }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    // Log unexpected errors (network failure, JSON parse error, etc.)
    console.error("Turnstile verification error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Verification failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
