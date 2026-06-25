/**
 * @file cloudinary-status/index.ts
 *
 * @purpose
 *   Lightweight health-check for Cloudinary credentials.  Rather than
 *   uploading a test file, it calls the Cloudinary Admin API's
 *   GET /resources/image?max_results=1 endpoint with HTTP Basic auth
 *   (api_key:api_secret) to verify that all three credentials are correct and
 *   that the Cloudinary API is reachable.
 *
 *   The response reveals the cloud_name in plain text and the last 4 chars of
 *   the API key (masked) but NEVER exposes the API secret.
 *
 * @http
 *   Method : GET or POST (OPTIONS also handled)
 *   Body   : None required.
 *
 * @response
 *   200 (credentials missing):
 *     { success: false, reachable: false, reason: "missing_credentials",
 *       message: "…" (Bengali guidance), configured: false, … }
 *   200 (invalid credentials / cloud_name):
 *     { success: false, reachable: true, reason: "invalid_credentials"|"invalid_cloud_name"|"api_error",
 *       http_status: number, message: string, latency_ms: number, … }
 *   200 (network unreachable):
 *     { success: false, reachable: false, reason: "network_error", message: string, … }
 *   200 (all OK):
 *     { success: true, reachable: true, latency_ms: number,
 *       message: "Cloudinary connection ✓", resources_sample_count: number, … }
 *   All responses include: configured, cloud_name, api_key_masked,
 *   api_secret_present, checked_at.
 *
 * @auth
 *   None from the caller — should be invoked from authenticated admin UI only.
 *
 * @env
 *   CLOUDINARY_CLOUD_NAME – Cloudinary cloud name
 *   CLOUDINARY_API_KEY    – Cloudinary API key (last 4 chars shown in response)
 *   CLOUDINARY_API_SECRET – Cloudinary API secret (existence confirmed, never exposed)
 *
 * @sideEffects
 *   One GET request to https://api.cloudinary.com/v1_1/{cloud}/resources/image
 *   (read-only, does not upload or modify any Cloudinary resources).
 *
 * @bilingual
 *   The "missing credentials" message is in Bengali:
 *   "Cloudinary credentials অসম্পূর্ণ। CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY
 *    এবং CLOUDINARY_API_SECRET — তিনটিই Backend → Secrets-এ সেট করুন।"
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Shorthand JSON response factory with CORS headers already merged.
 *
 * @param body   - JSON-serialisable response payload.
 * @param status - HTTP status code (default 200).
 */
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Masks a credential string: returns "••••" for short values,
 * or "••••<last4>" for longer ones.  Used to surface partial API key
 * in the status response without leaking the full secret.
 *
 * @param v - The credential string to mask (undefined treated as "").
 */
const mask = (v: string | undefined) => {
  if (!v) return "";
  if (v.length <= 4) return "••••";
  return "••••" + v.slice(-4);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "";
  const API_KEY = Deno.env.get("CLOUDINARY_API_KEY") || "";
  const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET") || "";

  const configured = Boolean(CLOUD_NAME && API_KEY && API_SECRET);

  const baseStatus = {
    configured,
    cloud_name: CLOUD_NAME || null,
    api_key_masked: mask(API_KEY),
    api_secret_present: Boolean(API_SECRET),
    checked_at: new Date().toISOString(),
  };

  if (!configured) {
    return json({
      success: false,
      reachable: false,
      reason: "missing_credentials",
      message:
        "Cloudinary credentials অসম্পূর্ণ। CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY এবং CLOUDINARY_API_SECRET — তিনটিই Backend → Secrets-এ সেট করুন।",
      ...baseStatus,
    });
  }

  // Lightweight reachability test: call /resources/image with admin auth (HEAD-ish).
  // This verifies cloud_name + key + secret without uploading anything.
  try {
    const auth = btoa(`${API_KEY}:${API_SECRET}`);
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image?max_results=1`;
    const started = Date.now();
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
    });
    const latency_ms = Date.now() - started;
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep text */
    }

    if (!res.ok) {
      const message =
        parsed?.error?.message || `Cloudinary API responded ${res.status}`;
      console.error("[cloudinary-status] failed", {
        status: res.status,
        message,
        cloud_name: CLOUD_NAME,
      });
      return json({
        success: false,
        reachable: true,
        reason:
          res.status === 401
            ? "invalid_credentials"
            : res.status === 404
            ? "invalid_cloud_name"
            : "api_error",
        http_status: res.status,
        message,
        latency_ms,
        ...baseStatus,
      });
    }

    return json({
      success: true,
      reachable: true,
      latency_ms,
      message: "Cloudinary connection ✓",
      resources_sample_count: Array.isArray(parsed?.resources)
        ? parsed.resources.length
        : 0,
      ...baseStatus,
    });
  } catch (err: any) {
    console.error("[cloudinary-status] network error", err);
    return json({
      success: false,
      reachable: false,
      reason: "network_error",
      message: err?.message || String(err),
      ...baseStatus,
    });
  }
});
