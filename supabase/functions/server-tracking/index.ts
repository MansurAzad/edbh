/**
 * @file server-tracking/index.ts
 * @description Server-Side Event Tracking Edge Function
 *
 * Receives a tracking event payload from the client, then **simultaneously**:
 *   1. Forwards the event to Google Analytics 4 via the Measurement Protocol API.
 *   2. Forwards the event to Meta (Facebook) Conversions API (CAPI).
 *   3. Persists the event to the `analytics_events` Supabase table for first-party analytics.
 *
 * Running all three legs in parallel (Promise.all) keeps the total latency equal
 * to the slowest of the three rather than their sum.
 *
 * HTTP Contract
 * ─────────────
 * Method : POST
 * Auth   : None (public endpoint – CORS-gated)
 * Body   : JSON – see {@link TrackEventBody}
 * Returns: JSON { ok, ga, meta, db }
 *   • ga   – GA4 result object (status / skipped reason)
 *   • meta – Meta CAPI result object (status / skipped reason)
 *   • db   – DB insert result object (ok / error)
 *
 * Environment Variables
 * ─────────────────────
 * GA4_MEASUREMENT_ID   – GA4 property measurement ID (e.g. "G-XXXXXXX")
 * GA4_API_SECRET       – GA4 Measurement Protocol API secret
 * META_PIXEL_ID        – Meta Pixel numeric ID
 * META_ACCESS_TOKEN    – Meta system-user access token with ads_management scope
 *
 * বাংলা নোট
 * ─────────
 * এই ফাংশন ক্লায়েন্ট থেকে ইভেন্ট ডেটা নিয়ে একই সাথে GA4, Meta CAPI
 * এবং Supabase ডেটাবেজে পাঠায়। Promise.all দিয়ে তিনটি কাজ সমান্তরালে হয়।
 */

// Shared CORS / response helpers (supabase/functions/_shared/cors.ts)
import { corsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
// Service-role Supabase admin client (supabase/functions/_shared/supabase.ts)
import { adminClient } from "../_shared/supabase.ts";
// Structured logging helper (supabase/functions/_shared/log.ts)
import { log } from "../_shared/log.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Environment variable bindings
// These are read once at cold-start so missing values are caught early.
// ─────────────────────────────────────────────────────────────────────────────

/** GA4 Measurement Protocol measurement ID (e.g. "G-XXXXXXX"). */
const GA4_MEASUREMENT_ID = Deno.env.get("GA4_MEASUREMENT_ID");

/** GA4 Measurement Protocol API secret – scoped to the property above. */
const GA4_API_SECRET = Deno.env.get("GA4_API_SECRET");

/** Meta Pixel numeric ID used in the CAPI endpoint path. */
const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID");

/**
 * Meta system-user access token.
 * Requires `ads_management` permission and the pixel to be in the token's ad account.
 */
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");

// ─────────────────────────────────────────────────────────────────────────────
// Supabase admin client (service-role – bypasses RLS)
// ─────────────────────────────────────────────────────────────────────────────

/** Service-role client; only used for server-side DB writes. */
const admin = adminClient();

// ─────────────────────────────────────────────────────────────────────────────
// Crypto helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a SHA-256 hex digest of `value` after trimming and lower-casing it.
 *
 * Used to hash PII (email, phone, name, city, country, external_id) before
 * sending to Meta CAPI, as required by Meta's data normalisation spec.
 *
 * বাংলা নোট: Meta-র নিয়ম অনুযায়ী ব্যক্তিগত তথ্য (ইমেইল, ফোন) SHA-256 দিয়ে
 * হ্যাশ করে পাঠাতে হয়।
 *
 * @param value - Raw PII string to hash.
 * @returns Lowercase hex-encoded SHA-256 digest.
 */
async function sha256(value: string): Promise<string> {
  // Encode the normalised string to UTF-8 bytes
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  // Use the Web Crypto API available in Deno
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  // Convert ArrayBuffer → Uint8Array → hex string
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Request / payload types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape of the JSON body expected by the POST handler.
 *
 * All fields except `event_name` are optional; the function is designed to
 * degrade gracefully when fields are absent.
 *
 * বাংলা নোট: POST বডিতে event_name বাধ্যতামূলক; বাকি সব ঐচ্ছিক।
 */
interface TrackEventBody {
  /** GA4 / Meta event name, e.g. "purchase", "page_view". Required. */
  event_name: string;
  /** GA4 client_id (typically stored in the _ga cookie on the browser). */
  client_id?: string;
  /** GA4 session_id for session-scoped analysis. */
  session_id?: string;
  /** Authenticated Supabase user UUID, if the visitor is logged in. */
  user_id?: string;
  /**
   * Deduplication ID shared between client-side pixel and server CAPI.
   * Meta uses this to avoid double-counting the same event.
   */
  event_id?: string;
  /** Canonical URL of the page where the event occurred. */
  event_source_url?: string;
  /** User-Agent string forwarded from the browser. */
  user_agent?: string;
  /** URL path (e.g. "/products/abaya-xyz"). */
  page_path?: string;
  /** <title> of the page. */
  page_title?: string;
  /** HTTP Referer header value from the browser. */
  referrer?: string;
  /** UTM source tag (e.g. "facebook"). */
  utm_source?: string;
  /** UTM medium tag (e.g. "cpc"). */
  utm_medium?: string;
  /** UTM campaign tag (e.g. "ramadan-sale"). */
  utm_campaign?: string;
  /**
   * Structured PII block used only for Meta CAPI hashing.
   * The `fbp` / `fbc` values are Meta first-party cookie values and are
   * sent un-hashed per Meta's specification.
   */
  user_data?: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    city?: string;
    country?: string;
    /** Internal user identifier (e.g. Supabase UUID). */
    external_id?: string;
    /** Meta _fbp cookie value – browser-generated, not hashed. */
    fbp?: string;
    /** Meta _fbc cookie value – click ID, not hashed. */
    fbc?: string;
  };
  /** Arbitrary event parameters forwarded verbatim to GA4 and stored in DB. */
  params?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta event name mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps internal GA4-style event names to Meta Standard Event names.
 *
 * If the incoming `event_name` is not in this map the raw name is forwarded
 * to Meta as a custom event.
 *
 * বাংলা নোট: GA4-এর ইভেন্ট নামগুলো Meta-র নামে রূপান্তর করতে এই ম্যাপ ব্যবহার হয়।
 */
const META_EVENT_MAP: Record<string, string> = {
  purchase: "Purchase",
  add_to_cart: "AddToCart",
  view_item: "ViewContent",
  begin_checkout: "InitiateCheckout",
  search: "Search",
  generate_lead: "Lead",
  add_to_wishlist: "AddToWishlist",
  page_view: "PageView",
  sign_up: "CompleteRegistration",
};

// ─────────────────────────────────────────────────────────────────────────────
// User-Agent parsers
// These are intentionally lightweight regex checks rather than a full UA
// library to keep the function bundle small and cold-start fast.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects the broad device category from a User-Agent string.
 *
 * Returns `"mobile"`, `"tablet"`, or `"desktop"`.
 *
 * বাংলা নোট: User-Agent থেকে ডিভাইসের ধরন (মোবাইল/ট্যাবলেট/ডেস্কটপ) বের করে।
 *
 * @param ua - Raw User-Agent header value.
 */
function detectDevice(ua: string): string {
  // Order matters: check mobile before tablet to avoid false positives
  if (/mobile|android|iphone|ipod/i.test(ua)) return "mobile";
  if (/tablet|ipad/i.test(ua)) return "tablet";
  return "desktop";
}

/**
 * Detects the browser from a User-Agent string.
 *
 * Edge must be checked before Chrome because Edge UA strings contain "Chrome".
 *
 * @param ua - Raw User-Agent header value.
 * @returns Browser name string.
 */
function detectBrowser(ua: string): string {
  // Edge contains "Edg/" in modern UA strings – must be checked first
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  // Safari must come after Chrome/Firefox because Safari UA also contains "Safari"
  if (/safari/i.test(ua)) return "Safari";
  if (/opr\//i.test(ua)) return "Opera";
  return "Other";
}

/**
 * Detects the operating system from a User-Agent string.
 *
 * @param ua - Raw User-Agent header value.
 * @returns OS name string.
 */
function detectOS(ua: string): string {
  if (/windows/i.test(ua)) return "Windows";
  if (/android/i.test(ua)) return "Android";
  // iOS check covers iPhone, iPad (including iPad OS 13+), and iPod
  if (/iphone|ipad|ipod|ios/i.test(ua)) return "iOS";
  if (/mac os/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Other";
}

// ─────────────────────────────────────────────────────────────────────────────
// GA4 Measurement Protocol sender
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a single event to the **Google Analytics 4 Measurement Protocol** endpoint.
 *
 * Reference: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 *
 * If either `GA4_MEASUREMENT_ID` or `GA4_API_SECRET` is missing the function
 * short-circuits and returns a `{ skipped }` sentinel so the caller can report
 * which integrations were active.
 *
 * বাংলা নোট: GA4 Measurement Protocol-এ একটি ইভেন্ট পাঠায়।
 * কনফিগ না থাকলে স্কিপ করে { skipped } ফেরত দেয়।
 *
 * @param body - Validated {@link TrackEventBody} from the request.
 * @returns Object with HTTP status or a `{ skipped }` reason.
 */
async function sendGA4(body: TrackEventBody) {
  // Guard: skip gracefully if env vars are absent
  if (!GA4_MEASUREMENT_ID || !GA4_API_SECRET) {
    return { skipped: "ga4_not_configured" };
  }

  // Build the Measurement Protocol payload
  const payload = {
    // client_id is required by GA4; fall back to a random UUID if not provided
    client_id: body.client_id || crypto.randomUUID(),
    events: [
      {
        name: body.event_name,
        params: {
          // Spread all custom params, then add engagement_time_msec (required
          // by GA4 MP to register the event as an engaged session hit)
          ...body.params,
          engagement_time_msec: 1,
        },
      },
    ],
  };

  // GA4 Measurement Protocol endpoint – credentials passed as query params
  const url =
    `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Forwarding the original user-agent so GA4 can do device detection
      "User-Agent": body.user_agent || "",
    },
    body: JSON.stringify(payload),
  });

  return { status: res.status, ok: res.ok };
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta Conversions API sender
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a single event to the **Meta (Facebook) Conversions API** (CAPI).
 *
 * Reference: https://developers.facebook.com/docs/marketing-api/conversions-api
 *
 * All PII fields in `user_data` are individually SHA-256-hashed per Meta's
 * normalisation requirements before transmission. `fbp` and `fbc` cookie values
 * are forwarded un-hashed as required by Meta's spec.
 *
 * If either `META_PIXEL_ID` or `META_ACCESS_TOKEN` is missing the function
 * returns a `{ skipped }` sentinel.
 *
 * বাংলা নোট: Meta CAPI-তে ইভেন্ট পাঠায়। সব PII তথ্য SHA-256 দিয়ে হ্যাশ
 * করে পাঠানো হয়। fbp ও fbc কুকি মান হ্যাশ ছাড়া পাঠানো হয়।
 *
 * @param body     - Validated {@link TrackEventBody} from the request.
 * @param clientIp - Real client IP extracted from request headers.
 * @returns Object with HTTP status, ok flag, and truncated response body.
 */
async function sendMeta(body: TrackEventBody, clientIp: string) {
  // Guard: skip gracefully if env vars are absent
  if (!META_PIXEL_ID || !META_ACCESS_TOKEN) {
    return { skipped: "meta_not_configured" };
  }

  // Map the internal event name to its Meta Standard Event counterpart,
  // or use the raw name if it is already a custom event.
  const metaName = META_EVENT_MAP[body.event_name] || body.event_name;

  const ud = body.user_data || {};

  // Build the user_data object; only include fields that are present
  const user_data: Record<string, unknown> = {
    // These two are never hashed per Meta spec
    client_ip_address: clientIp,
    client_user_agent: body.user_agent || "",
  };

  // Hash each PII field individually (Meta expects an array per field)
  if (ud.email) user_data.em = [await sha256(ud.email)];
  // Strip non-digit characters from phone before hashing (Meta normalisation rule)
  if (ud.phone) user_data.ph = [await sha256(ud.phone.replace(/\D/g, ""))];
  if (ud.first_name) user_data.fn = [await sha256(ud.first_name)];
  if (ud.last_name) user_data.ln = [await sha256(ud.last_name)];
  if (ud.city) user_data.ct = [await sha256(ud.city)];
  if (ud.country) user_data.country = [await sha256(ud.country)];
  if (ud.external_id) user_data.external_id = [await sha256(ud.external_id)];
  // Cookie values are forwarded raw (not hashed)
  if (ud.fbp) user_data.fbp = ud.fbp;
  if (ud.fbc) user_data.fbc = ud.fbc;

  // Construct the CAPI event object
  const event = {
    event_name: metaName,
    // Unix epoch in seconds – required by Meta
    event_time: Math.floor(Date.now() / 1000),
    // Deduplication ID – should match the browser pixel's eventID parameter
    event_id: body.event_id,
    event_source_url: body.event_source_url,
    // "website" is the correct action_source for server-side web events
    action_source: "website",
    user_data,
    // All other custom params go into custom_data
    custom_data: body.params || {},
  };

  // Graph API endpoint for CAPI – access token passed as query param
  const url = `https://graph.facebook.com/v18.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Meta CAPI accepts an array of events; we always send one at a time here
    body: JSON.stringify({ data: [event] }),
  });

  const text = await res.text();
  // Truncate the response body to avoid storing very large error payloads
  return { status: res.status, ok: res.ok, response: text.slice(0, 500) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Database logger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persists the tracking event to the `analytics_events` Supabase table.
 *
 * Uses the service-role admin client so no RLS policies are evaluated.
 * All errors are caught and returned as `{ ok: false, error }` objects so
 * a DB failure never blocks the response to the caller.
 *
 * Column mapping highlights:
 *  - `device_type`, `browser`, `os`  – derived from the User-Agent string
 *  - `value` / `currency`            – coerced from `params.value` / `params.currency`
 *  - `metadata`                      – full `params` blob stored as JSONB
 *
 * বাংলা নোট: ইভেন্ট ডেটা analytics_events টেবিলে সংরক্ষণ করে।
 * ডিভাইস তথ্য User-Agent থেকে বের করে। যেকোনো এরর ধরে { ok: false } ফেরত দেয়।
 *
 * @param body     - Validated {@link TrackEventBody} from the request.
 * @param clientIp - Real client IP extracted from request headers.
 * @returns `{ ok: true }` on success or `{ ok: false, error }` on failure.
 */
async function logToDb(body: TrackEventBody, clientIp: string) {
  try {
    const ua = body.user_agent || "";
    const params = body.params || {};

    // Coerce the `value` param to a number; null if absent or non-numeric
    const valueRaw = (params as any).value;
    const value =
      typeof valueRaw === "number"
        ? valueRaw
        : typeof valueRaw === "string"
        ? Number(valueRaw)
        : null;

    const { error } = await admin.from("analytics_events").insert({
      event_name: body.event_name,
      // page_path can come from the top-level field or inside params
      page_path: body.page_path || (params as any).page_path || null,
      page_title: body.page_title || (params as any).page_title || null,
      referrer: body.referrer || null,
      session_id: body.session_id || null,
      client_id: body.client_id || null,
      user_id: body.user_id || null,
      // UA-derived device attributes
      device_type: detectDevice(ua),
      browser: detectBrowser(ua),
      os: detectOS(ua),
      ip_address: clientIp || null,
      user_agent: ua || null,
      // UTM attribution fields
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
      // Only store a finite numeric value; discard NaN / Infinity
      value: Number.isFinite(value as number) ? value : null,
      currency: (params as any).currency || null,
      // Full params blob stored as JSONB for ad-hoc querying
      metadata: params,
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    // Surface unexpected errors as a string so the caller can log them
    return { ok: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deno HTTP entry-point for the `server-tracking` edge function.
 *
 * Flow:
 *  1. Handle CORS preflight (OPTIONS).
 *  2. Parse JSON body; validate required `event_name` field.
 *  3. Extract real client IP from `x-forwarded-for` or `cf-connecting-ip`.
 *  4. Fall back to the request's own `user-agent` header if not in the body.
 *  5. Fan out to GA4, Meta CAPI, and the DB concurrently via Promise.all.
 *  6. Return a combined result object.
 *
 * বাংলা নোট: মূল HTTP হ্যান্ডলার। CORS preflight সামলায়, JSON পার্স করে,
 * তারপর GA4, Meta ও DB-তে একসাথে ইভেন্ট পাঠায়।
 */
Deno.serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") return corsPreflight();

  try {
    // ── Parse body ────────────────────────────────────────────────────────────
    const body = (await req.json()) as TrackEventBody;

    // `event_name` is the only required field; everything else is optional
    if (!body?.event_name) {
      return errorResponse("event_name required", 400, "missing_event_name");
    }

    // ── Client IP extraction ──────────────────────────────────────────────────
    // Prefer `x-forwarded-for` (first hop) for proxied/CDN environments.
    // Fall back to `cf-connecting-ip` (Cloudflare's reliable real-IP header).
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("cf-connecting-ip") ||
      "";

    // Allow the body to override the user-agent, but fall back to the header
    body.user_agent = body.user_agent || req.headers.get("user-agent") || "";

    // ── Fan out: GA4 + Meta CAPI + DB insert (concurrent) ────────────────────
    // All three run in parallel; an individual failure returns an error object
    // rather than rejecting the whole Promise.all, because each leg has its
    // own try/catch or early-return guard.
    const [ga, meta, db] = await Promise.all([
      sendGA4(body),
      sendMeta(body, clientIp),
      logToDb(body, clientIp),
    ]);

    // ── Return combined result ────────────────────────────────────────────────
    return jsonResponse({ ok: true, ga, meta, db });
  } catch (err) {
    // Unexpected top-level error (e.g. malformed JSON, network issue)
    log("error", "server-tracking", "unhandled", { err: String(err) });
    return errorResponse(String(err), 500, "internal_error");
  }
});
