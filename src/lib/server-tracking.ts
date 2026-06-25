/**
 * @file server-tracking.ts
 * @module lib/server-tracking
 *
 * **Client-side bridge to server-side event tracking.**
 *
 * This module is the lowest-level tracking primitive in the stack.  It is
 * responsible for:
 *
 * 1. **Persistent client identity** – a UUID stored in `localStorage` that
 *    survives browser restarts, allowing long-term user recognition without
 *    login.  Falls back to an ephemeral UUID if `localStorage` is unavailable
 *    (private mode, iframe sandbox, etc.).
 *
 * 2. **Session identity** – a UUID stored in `sessionStorage` that resets
 *    after 30 minutes of inactivity (`SESSION_TTL_MS`).  Each call to
 *    `getSessionId()` bumps the "last seen" timestamp, so the 30 min clock
 *    restarts on every event.
 *
 * 3. **UTM parameter extraction** – pulled from the current URL at the moment
 *    of the event so attribution is recorded even if the user navigates before
 *    the event fires.
 *
 * 4. **Facebook cookie forwarding** – `_fbp` (browser ID) and `_fbc` (click
 *    ID) cookies are attached to every payload so the server-side CAPI call
 *    can pass them to the Meta Conversions API for browser↔server dedup.
 *
 * 5. **Edge-function invocation** – `serverTrack()` invokes the
 *    `server-tracking` Supabase Edge Function (fire-and-forget with `void`).
 *    Failures are swallowed with a `console.warn` so a broken tracker never
 *    disrupts the UI.
 *
 * ## Data flow
 * ```
 * Browser event
 *   → fanout()          (tracking/core.ts)
 *   → serverTrack()     (this file)
 *   → supabase.functions.invoke("server-tracking")
 *   → Edge Function
 *       ├─ GA4 Measurement Protocol
 *       ├─ Meta CAPI
 *       └─ analytics_events (Supabase table)
 * ```
 *
 * ## Cross-module contract
 * - `tracking/dedup.ts` imports `getTrackingSessionId()` to embed the session
 *   prefix inside deterministic event IDs.
 * - `tracking/core.ts` calls `serverTrack()` as step 4 of `fanout()`.
 * - Do NOT call `serverTrack()` directly in UI components; use the wrappers in
 *   `tracking/events.ts` instead.
 *
 * ## Storage keys
 * | Key                | Store          | Lifetime         |
 * |--------------------|----------------|------------------|
 * | `sst_client_id`    | localStorage   | Forever (device) |
 * | `sst_session_id`   | sessionStorage | 30 min idle      |
 * | `sst_session_time` | sessionStorage | 30 min idle      |
 */

// Client-side helper to mirror browser events to server-side tracking edge function.
// Logs to GA4 + Meta CAPI + native analytics_events DB.
import { supabase } from "@/integrations/supabase/client";

// ─── Storage key constants ────────────────────────────────────────────────────

/** localStorage key for the long-lived, device-scoped client UUID. */
const CLIENT_ID_KEY = "sst_client_id";

/** sessionStorage key for the session-scoped UUID. */
const SESSION_ID_KEY = "sst_session_id";

/**
 * sessionStorage key recording the Unix timestamp (ms) of the last event,
 * used to detect session expiry via `SESSION_TTL_MS`.
 */
const SESSION_TIME_KEY = "sst_session_time";

/**
 * Session idle timeout in milliseconds (30 minutes).
 * If more than this duration passes between events, `getSessionId()` generates
 * a fresh session UUID, effectively starting a new session.
 */
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min idle

// ─── Identity helpers ─────────────────────────────────────────────────────────

/**
 * Returns the persistent client UUID from `localStorage`, creating and storing
 * one if it does not yet exist.
 *
 * @returns A UUID string that identifies this browser across sessions.
 *
 * @remarks
 * If `localStorage` throws (e.g. private browsing in certain browsers, or
 * cross-origin iframes), an ephemeral UUID is returned for this call only —
 * it will NOT be persisted.  The function never throws.
 *
 * @example
 * const cid = getClientId(); // "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
 */
function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      // First visit — generate a brand-new UUID and persist it.
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private mode, sandboxed iframe, etc.).
    // Return a one-off UUID; the client won't be recognised on the next event.
    return crypto.randomUUID();
  }
}

/**
 * Returns the current session UUID, generating a new one if the session has
 * expired (idle > `SESSION_TTL_MS`) or if no session exists yet.
 *
 * **Side effect:** updates `sst_session_time` in `sessionStorage` to `now` on
 * every call, effectively resetting the 30-minute idle timer.
 *
 * @returns A UUID string scoped to the current browsing session.
 *
 * @remarks
 * `sessionStorage` is tab-scoped in most browsers, so opening a new tab
 * creates a fresh session automatically.  This function adds an additional
 * time-based TTL on top of the native tab-scope behaviour.
 *
 * If `sessionStorage` throws, an ephemeral UUID is returned (same caveat as
 * `getClientId`).
 */
function getSessionId(): string {
  try {
    const now = Date.now();
    // Read the timestamp of the last recorded event.
    const last = Number(sessionStorage.getItem(SESSION_TIME_KEY) || 0);
    let id = sessionStorage.getItem(SESSION_ID_KEY);

    // If no session exists OR the session has been idle beyond the TTL, start fresh.
    if (!id || (now - last) > SESSION_TTL_MS) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }

    // Always bump the "last seen" timestamp to reset the idle window.
    sessionStorage.setItem(SESSION_TIME_KEY, String(now));
    return id;
  } catch {
    // sessionStorage unavailable — return a transient UUID.
    return crypto.randomUUID();
  }
}

// ─── Browser data helpers ─────────────────────────────────────────────────────

/**
 * Reads a single cookie value by name from `document.cookie`.
 *
 * @param name - The exact cookie name to look up (case-sensitive).
 * @returns The decoded cookie value, or `undefined` if not found or if called
 *   outside a browser context (SSR).
 *
 * @remarks
 * Used to forward the `_fbp` and `_fbc` Facebook cookies to the CAPI payload.
 * The regex anchors on cookie boundaries (`(?:^|; )`) to avoid partial matches.
 */
function getCookie(name: string): string | undefined {
  // Guard for SSR / non-browser environments.
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : undefined;
}

/**
 * Extracts UTM attribution parameters from the current page URL.
 *
 * @returns An object with `utm_source`, `utm_medium`, and `utm_campaign`
 *   properties, each set to the string value or `undefined` if absent.
 *
 * @remarks
 * Only reads `window.location.search`; does NOT store UTMs across pages.
 * If you need cross-page UTM persistence, store them in `sessionStorage` on
 * landing and read them from there — that is intentionally out of scope here.
 *
 * Swallows errors silently so a missing `window` global (test environments,
 * SSR) does not crash.
 */
function getUtm() {
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source:   p.get("utm_source")   || undefined,
      utm_medium:   p.get("utm_medium")   || undefined,
      utm_campaign: p.get("utm_campaign") || undefined,
    };
  } catch {
    return {};
  }
}

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * PII fields forwarded to the Meta CAPI and GA4 Measurement Protocol.
 * All fields are optional; provide as many as are available to improve
 * match rates for server-side event attribution.
 *
 * @remarks
 * Values are hashed (SHA-256) inside the Edge Function before being sent to
 * Meta / Google.  Do NOT pre-hash them on the client.
 */
export interface ServerTrackUserData {
  /** Customer e-mail address (unhashed). */
  email?: string;
  /** Customer phone number in E.164 format, e.g. "+8801711000000". */
  phone?: string;
  /** Customer first name. */
  first_name?: string;
  /** Customer last name. */
  last_name?: string;
  /** Customer city. */
  city?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "BD". */
  country?: string;
  /**
   * Your application's internal user identifier (UUID or numeric string).
   * Used by the Edge Function as `external_id` in the CAPI payload.
   */
  external_id?: string;
}

/**
 * Options accepted by `serverTrack()`.
 */
export interface ServerTrackOptions {
  /**
   * Event name as recognised by the server-tracking Edge Function.
   * Use snake_case GA4 convention: `"add_to_cart"`, `"purchase"`, etc.
   */
  event_name: string;

  /**
   * Globally unique event ID used for **browser↔server deduplication**.
   * The same `event_id` must be sent from the browser Pixel AND the CAPI call
   * so Meta can de-duplicate them.  When omitted, a random ID is generated —
   * this is only safe for events that have no corresponding browser Pixel fire.
   *
   * Best practice: generate with `dedupKey()` from `@/lib/tracking/dedup.ts`
   * and pass it to both `fanout()` and this function via `capi.params`.
   */
  event_id?: string;

  /** Optional PII fields for CAPI / Enhanced Conversions match quality. */
  user_data?: ServerTrackUserData;

  /**
   * Arbitrary event parameters forwarded verbatim to the Edge Function.
   * Structure depends on the event type (GA4 ecommerce, Meta custom data, etc.)
   */
  params?: Record<string, unknown>;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fire a server-side tracking event via the `server-tracking` Supabase Edge
 * Function.  This is a **fire-and-forget** call — it never rejects, never
 * awaits a response, and never throws.
 *
 * The function enriches the caller-supplied `opts` with:
 * - `client_id` / `session_id`  — stable identity (see above)
 * - `user_id`                   — Supabase Auth UID (if logged in)
 * - `event_source_url`          — full `window.location.href`
 * - `page_path`                 — `window.location.pathname`
 * - `page_title`                — `document.title`
 * - `referrer`                  — `document.referrer`
 * - `user_agent`                — `navigator.userAgent`
 * - `utm_source/medium/campaign`— from the current URL query string
 * - `user_data._fbp` / `_fbc`  — Facebook browser/click ID cookies
 *
 * @param opts - Event name, optional ID, user data, and extra params.
 * @returns A Promise that always resolves to `void`.
 *
 * @remarks
 * - Do NOT await this in hot paths; the `void` ensures the promise is not
 *   surfaced to callers.
 * - Failures are logged with `console.warn` but never re-thrown, so a CAPI
 *   outage does not affect the user-facing purchase flow.
 * - The Edge Function URL is determined by the Supabase project configuration
 *   in `@/integrations/supabase/client`.
 *
 * @example
 * // Direct usage (prefer using fanout() / trackPurchase() wrappers instead):
 * await serverTrack({
 *   event_name: "purchase",
 *   event_id:   "purchase-order-123",
 *   user_data:  { phone: "+8801700000000" },
 *   params:     { value: 1500, currency: "BDT" },
 * });
 */
export async function serverTrack(opts: ServerTrackOptions): Promise<void> {
  try {
    // Collect UTM params from the URL at the time the event fires.
    const utm = getUtm();

    // Get the currently authenticated Supabase user, if any.
    // The `.catch()` ensures auth failures don't prevent event recording.
    const { data: { user } } = await supabase.auth.getUser().catch(
      () => ({ data: { user: null } } as any)
    );

    // Build the full event payload that the Edge Function expects.
    const payload = {
      event_name: opts.event_name,

      // Generate a fallback event_id if the caller did not provide one.
      // Format: "<event>-<timestamp>-<6-char random>" — unique enough for
      // fire-and-forget events that have no browser Pixel counterpart.
      event_id: opts.event_id
        || `${opts.event_name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

      // Stable identity signals.
      client_id: getClientId(),
      session_id: getSessionId(),

      // Authenticated user (null for anonymous visitors).
      user_id: user?.id,

      // Page context captured at event time.
      event_source_url: typeof window    !== "undefined" ? window.location.href   : undefined,
      page_path:        typeof window    !== "undefined" ? window.location.pathname: undefined,
      page_title:       typeof document  !== "undefined" ? document.title          : undefined,
      referrer:         typeof document  !== "undefined" ? document.referrer       : undefined,
      user_agent:       typeof navigator !== "undefined" ? navigator.userAgent     : undefined,

      // UTM attribution.
      ...utm,

      // Merge caller-supplied user_data with Facebook browser cookies.
      user_data: {
        ...opts.user_data,
        fbp: getCookie("_fbp"), // Facebook Browser ID — set by the Meta Pixel
        fbc: getCookie("_fbc"), // Facebook Click ID — set when clicking an ad
      },

      // Arbitrary event parameters (ecommerce data, search strings, etc.).
      params: opts.params || {},
    };

    // Fire-and-forget: we deliberately don't await or inspect the response.
    // The Edge Function writes to the DB and calls GA4/Meta independently.
    void supabase.functions.invoke("server-tracking", { body: payload });
  } catch (err) {
    // Swallow all errors — tracker failures must never bubble to the UI.
    console.warn("serverTrack failed:", err);
  }
}

// ─── Identity accessors (used by tracking/dedup.ts) ──────────────────────────

/**
 * Returns the device-scoped client UUID from `localStorage`.
 * Thin public wrapper around `getClientId()` for use outside this module.
 *
 * @returns Persistent client UUID string.
 */
export function getTrackingClientId() { return getClientId(); }

/**
 * Returns the current session UUID, resetting the 30-minute idle timer.
 * Consumed by `tracking/dedup.ts` to embed the session prefix in event IDs.
 *
 * @returns Session-scoped UUID string.
 */
export function getTrackingSessionId() { return getSessionId(); }
