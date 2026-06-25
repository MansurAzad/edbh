/**
 * @file ai-provider-test/index.ts
 *
 * @purpose
 *   Admin utility that fires a single probe message at a stored AI-provider
 *   configuration (row in `ai_provider_settings`) and records the outcome.
 *   Use it from the admin panel to verify that an API key + model + base_url
 *   combination actually works before activating it for production chat.
 *
 * @http
 *   Method : POST
 *   Body   : { id: string, prompt?: string }
 *     - `id`     : UUID of the `ai_provider_settings` row to test.
 *     - `prompt` : Optional custom probe text (defaults to "Reply with exactly: OK").
 *   CORS   : Preflight OPTIONS → 200 "ok" with wildcard CORS headers.
 *
 * @response
 *   200 OK  : { ok: boolean, status: number, latency_ms: number,
 *               sample: string|null, error: string|null }
 *   400     : { error: "id required" }
 *   401     : { error: "Unauthorized" }        – no valid Supabase session
 *   403     : { error: "Forbidden" }           – authenticated but not admin
 *   404     : { error: "Provider not found" }
 *   500     : { error: string }
 *
 * @auth
 *   Requires a valid Supabase JWT (`Authorization: Bearer <token>`).
 *   The user is additionally checked for the `admin` role via the
 *   `has_role(_user_id, _role)` Postgres RPC.
 *
 * @env
 *   SUPABASE_URL              – Supabase project URL
 *   SUPABASE_ANON_KEY         – For user identity verification
 *   SUPABASE_SERVICE_ROLE_KEY – For privileged DB reads/writes
 *
 * @sideEffects
 *   - Sends one HTTP POST to the provider's `/chat/completions` endpoint.
 *   - Updates the tested row in `ai_provider_settings`:
 *       last_test_at, last_test_status ("ok"|"fail"), last_test_latency_ms,
 *       last_test_error, last_test_sample.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is an authenticated admin
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userRes.user.id, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { id, prompt } = await req.json();
    if (typeof id !== "string") {
      return new Response(JSON.stringify({ error: "id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error: rowErr } = await admin
      .from("ai_provider_settings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "Provider not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = String(row.base_url).replace(/\/$/, "") + "/chat/completions";
    const samplePrompt = (typeof prompt === "string" && prompt.trim()) || "Reply with exactly: OK";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${row.api_key}`,
      ...(row.extra_headers && typeof row.extra_headers === "object" ? row.extra_headers : {}),
    };

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    let status = 0, ok = false, errorMessage: string | null = null, sample: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: row.model,
          messages: [{ role: "user", content: samplePrompt }],
          max_tokens: 32,
          temperature: 0,
        }),
      });
      status = res.status;
      const text = await res.text();
      if (res.ok) {
        ok = true;
        try {
          const j = JSON.parse(text);
          sample = j?.choices?.[0]?.message?.content || text.slice(0, 200);
        } catch {
          sample = text.slice(0, 200);
        }
      } else {
        errorMessage = `HTTP ${status}: ${text.slice(0, 300)}`;
      }
    } catch (e: any) {
      errorMessage = e?.name === "AbortError" ? "Timed out after 15s" : (e?.message || String(e));
    } finally {
      clearTimeout(timer);
    }

    const latency = Date.now() - started;

    await admin.from("ai_provider_settings").update({
      last_test_at: new Date().toISOString(),
      last_test_status: ok ? "ok" : "fail",
      last_test_latency_ms: latency,
      last_test_error: errorMessage,
      last_test_sample: sample ? sample.slice(0, 500) : null,
    }).eq("id", id);

    return new Response(JSON.stringify({
      ok, status, latency_ms: latency, sample, error: errorMessage,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
