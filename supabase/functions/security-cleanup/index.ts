// Admin/cron callable cleanup. Invokes cleanup_security_data() RPC.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SR) {
    return new Response(JSON.stringify({ error: "misconfigured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const res = await fetch(`${SB_URL}/rest/v1/rpc/cleanup_security_data`, {
    method: "POST",
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
