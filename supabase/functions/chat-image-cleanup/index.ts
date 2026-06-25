/**
 * @file chat-image-cleanup/index.ts
 *
 * @purpose
 *   Scheduled garbage-collector for the customer-chat image upload flow.
 *   Finds every row in `chat_uploads` whose `expires_at` timestamp has passed
 *   and that has not yet been marked deleted, removes the corresponding files
 *   from the `chat-uploads` Supabase Storage bucket, then flags the rows as
 *   deleted in the database.
 *
 *   Intended to be invoked by a pg_cron / Supabase Scheduled Function trigger
 *   — typically every 5–15 minutes — NOT called by end-users.
 *
 * @http
 *   Method : Any (GET or POST from the scheduler)
 *   Body   : None required.
 *   CORS   : Minimal (wildcard origin, no auth headers required by client).
 *
 * @response
 *   200 OK (no expired files)  : { deleted: 0 }
 *   200 OK (files cleaned)     : { deleted: number, paths: string[] }
 *   500                        : { error: string }
 *
 * @auth
 *   None from the caller — uses the service-role key internally.
 *   Should be restricted at the network/scheduler level (not publicly reachable).
 *
 * @env
 *   SUPABASE_URL              – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Required for storage deletion and DB updates
 *
 * @sideEffects
 *   1. Deletes files from the `chat-uploads` Storage bucket (batch remove).
 *      Storage errors are logged but do NOT block the DB update — this prevents
 *      infinite retries on already-deleted/missing files.
 *   2. Sets `deleted = true` and `deleted_at = now()` on all processed rows
 *      in `chat_uploads`.
 *   3. Processes up to 500 expired rows per invocation.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Find expired, not-yet-deleted uploads
    const { data: expired, error: selErr } = await admin
      .from("chat_uploads")
      .select("id, storage_path")
      .lt("expires_at", new Date().toISOString())
      .eq("deleted", false)
      .limit(500);

    if (selErr) throw selErr;

    if (!expired || expired.length === 0) {
      return new Response(JSON.stringify({ deleted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paths = expired.map((r) => r.storage_path);
    const ids = expired.map((r) => r.id);

    // Delete from storage (batch)
    const { error: delErr } = await admin.storage.from("chat-uploads").remove(paths);
    if (delErr) {
      console.error("Storage delete error:", delErr);
      // Continue and still mark deleted to avoid infinite retry on already-missing files
    }

    // Mark rows deleted
    const { error: updErr } = await admin
      .from("chat_uploads")
      .update({ deleted: true, deleted_at: new Date().toISOString() })
      .in("id", ids);

    if (updErr) console.error("DB update error:", updErr);

    console.log(`chat-image-cleanup: removed ${expired.length} files`);

    return new Response(
      JSON.stringify({ deleted: expired.length, paths }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("cleanup error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
