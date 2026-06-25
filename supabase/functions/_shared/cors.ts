// Shared CORS headers + JSON response helper. Import from here so every
// edge function stays in sync.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

export { corsHeaders };

export function jsonResponse(body: unknown, status: number = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

export function errorResponse(error: string, status: number = 400, code?: string) {
  return jsonResponse({ error, code: code ?? null }, status);
}

export function corsPreflight() {
  return new Response("ok", { headers: corsHeaders });
}
