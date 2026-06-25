/**
 * @file _shared/supabase.ts
 *
 * @purpose
 *   Singleton Supabase client factories used by all edge functions.
 *   Centralising client construction here avoids secret-access code
 *   scattered across functions and keeps configuration consistent.
 *
 * @httpContract
 *   Not an HTTP handler — import `adminClient` or `userClient` as needed.
 *
 * @envVars
 *   - `SUPABASE_URL`              — Project REST/realtime base URL (required by both factories).
 *   - `SUPABASE_SERVICE_ROLE_KEY` — Service-role JWT; bypasses RLS. Required by `adminClient`.
 *   - `SUPABASE_ANON_KEY`         — Anonymous/public JWT. Required by `userClient`.
 *
 * @authModel
 *   Two distinct privilege tiers:
 *   - `adminClient()` — service-role key, RLS bypassed. Use for trusted server work
 *     (e.g. inserting audit logs, reading any order).
 *   - `userClient(authHeader)` — caller's JWT forwarded, RLS enforced as that user.
 *     Use when the edge function acts on behalf of a logged-in user.
 *
 * @security
 *   Never expose `adminClient` results directly to untrusted callers.
 *   Always validate caller identity via `userClient().auth.getUser()` first,
 *   then switch to `adminClient` only for privileged mutations.
 *
 * @rateLimiting / @idempotency
 *   None — factory functions only; no network calls until the returned
 *   client is used.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// Read secrets once at module-load time.
// Deno caches env reads; these are not re-read per request.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

/**
 * Create a Supabase client authenticated with the **service-role key**.
 *
 * This client **bypasses Row Level Security** — use it only for trusted,
 * server-side operations such as writing audit logs, syncing courier status,
 * or reading data across user boundaries.
 *
 * Session persistence and token auto-refresh are disabled because edge
 * functions are stateless and short-lived.
 *
 * @throws {Error} if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are absent.
 * @returns A fully-configured `SupabaseClient` with service-role privileges.
 *
 * @example
 * const admin = adminClient();
 * const { data } = await admin.from("orders").select("*");
 */
export function adminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Create a Supabase client that forwards the **caller's JWT**.
 *
 * Row Level Security is enforced as the authenticated user, meaning this
 * client respects all RLS policies and can only read/write rows the user
 * is authorised to access.
 *
 * Pass `null` (or an absent header) to get an anonymous client — the anon
 * key is used but no user context is attached.
 *
 * @param authHeader - Raw `Authorization` header value (e.g. `"Bearer eyJ..."`),
 *                     or `null` / `undefined` for an unauthenticated request.
 * @returns A `SupabaseClient` scoped to the caller's identity.
 *
 * @example
 * const client = userClient(req.headers.get("Authorization"));
 * const { data: { user } } = await client.auth.getUser();
 */
export function userClient(authHeader: string | null): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Inject the caller's JWT so every query runs as that user
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });
}
