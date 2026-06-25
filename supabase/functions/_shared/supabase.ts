// Shared Supabase client factories. Use these instead of inlining createClient
// in every function so secret access and config stay in one place.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

/** Admin client (bypasses RLS). Use for trusted, server-only work. */
export function adminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anon client with the caller's JWT — enforces RLS as the calling user. */
export function userClient(authHeader: string | null): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });
}
