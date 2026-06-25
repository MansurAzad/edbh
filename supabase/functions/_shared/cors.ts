/**
 * @file _shared/cors.ts
 *
 * @purpose
 *   Centralised CORS + JSON response helpers shared by every edge function.
 *   Import from here so all functions stay in sync; never duplicate these
 *   headers inline.
 *
 * @httpContract
 *   Not an HTTP handler itself — utility exports consumed by handlers.
 *   Every handler that imports this file MUST respond to OPTIONS with
 *   `corsPreflight()` before any other logic.
 *
 * @envVars
 *   None. CORS headers are hard-coded to `*` via the supabase-js package.
 *
 * @authModel
 *   N/A — this module does not enforce auth; it only shapes responses.
 *
 * @rateLimiting
 *   None — pure utility.
 */

// Re-export the canonical CORS header set from @supabase/supabase-js so
// every function uses the same origin/header allow-list without duplication.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

export { corsHeaders };

/**
 * Build a successful JSON response that includes CORS headers and an optional
 * set of extra headers (e.g., `Content-Disposition` for file downloads).
 *
 * @param body        - Serialisable payload; will be `JSON.stringify`-ed.
 * @param status      - HTTP status code (default: 200).
 * @param extraHeaders - Additional headers merged on top of CORS + Content-Type.
 * @returns A `Response` with `Content-Type: application/json` and CORS headers.
 *
 * @example
 * return jsonResponse({ ok: true, data: result });
 * return jsonResponse({ created: true }, 201);
 */
export function jsonResponse(body: unknown, status: number = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    // Merge order: CORS first → Content-Type → caller overrides
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

/**
 * Build a standardised error JSON response.
 * Shape: `{ error: string, code: string | null }`
 *
 * @param error  - Human-readable error message.
 * @param status - HTTP status code (default: 400).
 * @param code   - Optional machine-readable error code (e.g. `"missing_field"`).
 * @returns A `Response` with error body and CORS headers.
 *
 * @example
 * return errorResponse("orderId is required", 400, "missing_order_id");
 */
export function errorResponse(error: string, status: number = 400, code?: string) {
  return jsonResponse({ error, code: code ?? null }, status);
}

/**
 * Respond to an HTTP OPTIONS preflight request.
 * Must be called before any async work to keep preflight latency minimal.
 *
 * @returns A plain-text `"ok"` response with CORS headers.
 *
 * @example
 * if (req.method === "OPTIONS") return corsPreflight();
 */
export function corsPreflight() {
  return new Response("ok", { headers: corsHeaders });
}
