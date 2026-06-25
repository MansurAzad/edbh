/**
 * @file supabase/functions/steadfast-courier/index.ts
 * @description Deno edge function – Steadfast Courier integration gateway.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP CONTRACT
 * ─────────────────────────────────────────────────────────────────────────────
 * Method : POST  (preflight OPTIONS is handled automatically)
 * URL    : <SUPABASE_FUNCTIONS_URL>/steadfast-courier
 * Headers:
 *   Authorization: Bearer <supabase_jwt>   ← required for every human-initiated
 *                                             call; omitted only for scheduled
 *                                             calls that supply `scheduled_secret`
 *   Content-Type: application/json
 *
 * Body (JSON):
 * {
 *   "action": "<action_name>",      // required – selects the handler branch
 *   "shipment_id": "<uuid>",        // required by: approve, submit_order,
 *                                   //              sync_status
 *   "scheduled_secret": "<secret>"  // optional – bypasses JWT auth for cron
 * }
 *
 * Success response: 200 { success: true, ...action-specific fields }
 * Error responses :
 *   400 { error: "Unknown action" }
 *   401 { error: "Unauthorized" }   – missing / invalid JWT
 *   403 { error: "Forbidden" }      – valid JWT but lacks shipping.manage perm
 *   500 { error: "<message>" }      – unhandled exception
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SUPPORTED ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * get_balance
 *   Proxies GET /get_balance from the Steadfast API and returns the raw JSON.
 *   No DB side-effects.  Useful for dashboard wallet-balance widgets.
 *   Response extra fields: { current_balance, currency, … } (Steadfast shape)
 *
 * approve
 *   Marks a shipment as admin-approved in courier_shipments, fires an
 *   "approved" customer notification, writes an audit log row, and then
 *   optionally auto-submits the shipment to Steadfast if the system setting
 *   courier_auto_submit.enabled is truthy.
 *   Required body field: shipment_id
 *   Response extra fields: { auto_submitted: boolean, submit_error: string|null }
 *
 * submit_order
 *   Calls submitShipment() for a single shipment: POSTs to Steadfast's
 *   /create_order endpoint, stores the returned consignment_id + tracking_code,
 *   updates the linked orders row, fires a "submitted" notification, and
 *   writes an audit log row.  Idempotent – throws if already submitted.
 *   Required body field: shipment_id
 *   Response extra fields: { result: <Steadfast create_order response> }
 *
 * sync_status
 *   Calls syncShipment() for a single shipment: GETs /status_by_cid/:cid,
 *   maps the raw Steadfast delivery_status through STATUS_MAP, updates
 *   courier_shipments + orders, handles COD settlement fields, fires a
 *   "delivered" notification on terminal delivered states, and writes an
 *   audit log row.
 *   Required body field: shipment_id
 *   Response extra fields: { status, raw_status, cod_status, terminal }
 *
 * bulk_sync  (alias: scheduled_sync)
 *   Fetches up to 50 non-terminal, already-submitted shipments and runs
 *   syncShipment() sequentially for each (honouring the MIN_INTERVAL_MS
 *   rate limit between Steadfast API calls).  Writes a single bulk audit
 *   log row summarising the run.
 *   Response extra fields: { synced, failed, results[] }
 *
 * auto_submit_pending
 *   Fetches up to 50 admin-approved shipments that have no consignment_id
 *   yet and calls submitShipment() for each sequentially.  Designed for a
 *   periodic cron job or a manual "drain the queue" operation.
 *   Response extra fields: { submitted, results[] }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENVIRONMENT VARIABLES
 * ─────────────────────────────────────────────────────────────────────────────
 * SUPABASE_URL              – Project REST/auth base URL (injected by platform)
 * SUPABASE_ANON_KEY         – Public anon key used to validate caller JWTs
 * SUPABASE_SERVICE_ROLE_KEY – Service-role key used for all privileged DB writes
 * STEADFAST_API_KEY         – Steadfast portal API key (also doubles as the
 *                             scheduled_secret value so cron callers can bypass
 *                             JWT auth without a separate secret)
 * STEADFAST_SECRET_KEY      – Steadfast portal secret key; sent as Secret-Key
 *                             header on every upstream request
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTH MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 * Two auth paths exist:
 *
 * 1. Human / client call  – Must supply a Supabase JWT in the Authorization
 *    header.  The function verifies it via supabase.auth.getUser(), then
 *    calls the has_permission("shipping.manage") RPC.  Users with the
 *    "admin" role are tagged actor.role="admin"; others become "moderator".
 *
 * 2. Scheduled / cron call – Body must include `scheduled_secret` equal to
 *    STEADFAST_API_KEY.  When matched, the Authorization header check is
 *    skipped entirely and actor is set to { role: "system" }.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOWNSTREAM STEADFAST COURIER API CONTRACT  (https://portal.packzy.com/api/v1)
 * ─────────────────────────────────────────────────────────────────────────────
 * All requests carry:
 *   Api-Key: <STEADFAST_API_KEY>
 *   Secret-Key: <STEADFAST_SECRET_KEY>
 *   Content-Type: application/json
 *
 * Endpoints used:
 *
 *   GET  /get_balance
 *     Response: { current_balance, currency }
 *
 *   POST /create_order
 *     Request : { invoice, recipient_name, recipient_phone, recipient_address,
 *                 cod_amount, note? }
 *     Response: { consignment: { consignment_id, tracking_code, status, … } }
 *
 *   GET  /status_by_cid/:consignment_id
 *     Response: { delivery_status|status, cod_amount?, cod_status? }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RETRY / RATE-LIMIT NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 * • callSteadfast() enforces a minimum 350 ms gap between successive Steadfast
 *   API calls (≈ 3 req/s), using a module-level timestamp `lastApiCallTs`.
 *   Note: because Deno edge function isolates may spin up multiple instances,
 *   this limiter is per-isolate, not global.
 *
 * • On HTTP 429 (rate limit) or HTTP 5xx (server error) the function retries
 *   up to `maxRetries` times (default 4) with exponential back-off:
 *     delay = min(8 000, 500 × 2^attempt) + random(0..249) ms
 *
 * • Transient network errors (ECONNRESET, EAI_AGAIN, fetch/timeout) also
 *   trigger the same retry path.
 *
 * • Non-retryable HTTP errors (4xx other than 429) surface immediately as
 *   thrown Error objects and are persisted to courier_shipments.error_message.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATABASE TABLES WRITTEN
 * ─────────────────────────────────────────────────────────────────────────────
 * courier_shipments   – primary shipment state store
 * courier_audit_logs  – append-only action/outcome log
 * orders              – status, tracking_number, payment_status updates
 * profiles            – read-only (used to resolve recipient name/email)
 *
 * Outbound function invocations:
 *   send-shipping-notification – idempotent email dispatch (events: approved,
 *                                submitted, delivered)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─────────────────────────────────────────────────────────────────────────────
// CORS – allow browser clients from any origin.
// The allow-headers list must include every header the Supabase JS client
// sends so preflight OPTIONS requests are accepted.
// ─────────────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // Must list every header the Supabase JS client and our callers send
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Root URL of the Steadfast Courier REST API (v1). */
const STEADFAST_BASE = "https://portal.packzy.com/api/v1";

// ─────────────────────────────────────────────────────────────────────────────
// STATUS MAPPING
// Maps every Steadfast delivery_status string (including legacy / approval-
// pending aliases) to three internal fields:
//   normalized  – canonical string stored in courier_shipments.delivery_status
//   orderStatus – value written to orders.status (null = leave unchanged)
//   terminal    – true means no further syncing is needed for this shipment
//   isFailure   – true for cancellation / failure / return outcomes
//   codStatus   – COD settlement state implied by this delivery status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Describes how a raw Steadfast delivery_status string maps to internal state.
 */
type StatusMeta = {
  /** Canonical status string stored in courier_shipments.delivery_status. */
  normalized: string;
  /** Value written to orders.status; null means "do not update". */
  orderStatus: string | null;
  /** When true, no further status syncing is required for this shipment. */
  terminal: boolean;
  /** True for cancellation, delivery failure, or return outcomes. */
  isFailure?: boolean;
  /**
   * COD settlement state implied by this delivery status.
   * Used to auto-populate courier_shipments.cod_payment_status on sync.
   */
  codStatus?: "paid" | "unpaid" | "partial" | "pending";
};

/**
 * Exhaustive mapping of every known Steadfast delivery_status value.
 * Keys are lower-cased Steadfast strings; some Steadfast statuses have
 * an `_approval_pending` variant that is identical in meaning but not yet
 * finalised – those are mapped to terminal: false to keep syncing active.
 */
const STATUS_MAP: Record<string, StatusMeta> = {
  // ── Pre-pickup / awaiting courier ─────────────────────────────────────────
  pending: { normalized: "pending", orderStatus: null, terminal: false },
  // Courier has received and is reviewing the shipment
  in_review: { normalized: "in_review", orderStatus: "courier_confirmed", terminal: false },
  // Alias Steadfast sometimes returns for the same "in review" state
  in_review_pending: { normalized: "in_review", orderStatus: "courier_confirmed", terminal: false },

  // ── Picked up / on the way ────────────────────────────────────────────────
  // Shipment is temporarily held (e.g. address issue)
  hold: { normalized: "hold", orderStatus: "courier_confirmed", terminal: false },
  // Unknown state – keep polling
  unknown: { normalized: "unknown", orderStatus: null, terminal: false },
  // Steadfast uses this when approval status is unclear
  unknown_approval: { normalized: "in_review", orderStatus: "courier_confirmed", terminal: false },
  // Primary in-transit status (Steadfast long-form)
  delivery_in_transit: { normalized: "in_transit", orderStatus: "shipped", terminal: false },
  // Short alias for the same in-transit state
  in_transit: { normalized: "in_transit", orderStatus: "shipped", terminal: false },

  // ── Terminal – successful delivery ────────────────────────────────────────
  // Fully delivered; COD is considered collected
  delivered: { normalized: "delivered", orderStatus: "delivered", terminal: true, codStatus: "paid" },
  // Delivered but awaiting merchant approval; not yet terminal
  delivered_approval_pending: { normalized: "delivered", orderStatus: "delivered", terminal: false, codStatus: "paid" },
  // Partial delivery (multi-parcel or partial drop); terminal
  partial_delivered: { normalized: "partial_delivered", orderStatus: "delivered", terminal: true, codStatus: "partial" },
  // Partial delivery still awaiting approval; keep polling
  partial_delivered_approval_pending: { normalized: "partial_delivered", orderStatus: "delivered", terminal: false, codStatus: "partial" },

  // ── Terminal – failure / return ───────────────────────────────────────────
  // Shipment cancelled before pickup; COD not collected
  cancelled: { normalized: "cancelled", orderStatus: "cancelled", terminal: true, isFailure: true },
  // Cancellation pending approval; not yet terminal
  cancelled_approval_pending: { normalized: "cancelled", orderStatus: "cancelled", terminal: false, isFailure: true },
  // Delivery attempted but failed (e.g. customer unreachable)
  delivery_failed: { normalized: "delivery_failed", orderStatus: "delivery_failed", terminal: true, isFailure: true },
  // Delivery failure pending approval; not yet terminal
  delivery_failed_approval_pending: { normalized: "delivery_failed", orderStatus: "delivery_failed", terminal: false, isFailure: true },
  // Shipment lost in transit
  lost: { normalized: "lost", orderStatus: "cancelled", terminal: true, isFailure: true },
  // Steadfast "return" key (short form)
  return: { normalized: "returned", orderStatus: "returned", terminal: true, isFailure: true },
  // Steadfast "returned" key (long form – both exist in the wild)
  returned: { normalized: "returned", orderStatus: "returned", terminal: true, isFailure: true },
};

/**
 * Converts a raw Steadfast delivery_status string into a {@link StatusMeta}
 * object.  Unknown values produce a safe default (non-terminal, no order
 * update) so unrecognised future statuses don't break the system.
 *
 * @param raw - Raw delivery_status string from Steadfast (may be null/undefined)
 * @returns Resolved StatusMeta; falls back to `{ normalized: raw, orderStatus: null, terminal: false }`.
 */
const mapStatus = (raw: string | null | undefined): StatusMeta => {
  // Normalise to lower-case trimmed string so lookup is case-insensitive
  const key = (raw || "").toString().trim().toLowerCase();
  return (
    // Return the mapped entry or a safe passthrough default for unknown values
    STATUS_MAP[key] || {
      normalized: key || "unknown", // preserve the raw value so it's still visible
      orderStatus: null,            // do not touch the order status for unknowns
      terminal: false,              // keep polling – we might recognise it later
    }
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITING & RETRY-WITH-BACKOFF
// All calls to the Steadfast API are routed through callSteadfast() which
// enforces a minimum inter-request gap and retries transient failures.
// ─────────────────────────────────────────────────────────────────────────────

/** Tiny promise-based sleep helper used by the rate limiter and retry backoff. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Unix-ms timestamp of the most recent Steadfast API call made by this
 * isolate instance.  Used to enforce MIN_INTERVAL_MS between requests.
 * Note: this is per-isolate; concurrent isolates do not share this value.
 */
let lastApiCallTs = 0;

/**
 * Minimum milliseconds between successive Steadfast API calls.
 * 350 ms ≈ 2.86 req/s, safely within Steadfast's undocumented rate limit
 * which is empirically observed to be around 3–5 req/s per API key.
 */
const MIN_INTERVAL_MS = 350; // ~3 req/sec, well within Steadfast limits

/**
 * Authenticated HTTP client for the Steadfast Courier API.
 *
 * Features:
 *  - Enforces MIN_INTERVAL_MS gap between calls (module-level rate limiter)
 *  - Retries HTTP 429 / 5xx and transient network errors with exponential
 *    back-off: `min(8 000, 500 × 2^attempt) + jitter(0..249 ms)`
 *  - Parses JSON response body; falls back to `{ raw: text }` if not JSON
 *  - Throws a descriptive Error on non-retryable HTTP failures
 *
 * @param path       - API path relative to STEADFAST_BASE, e.g. "/get_balance"
 * @param method     - HTTP method; Steadfast uses GET (reads) and POST (writes)
 * @param body       - Optional request body; serialised as JSON when provided
 * @param maxRetries - Maximum number of retry attempts (default 4 → 5 total tries)
 * @returns Parsed JSON response body from Steadfast
 * @throws Error if all retry attempts are exhausted or a non-retryable error occurs
 */
const callSteadfast = async (
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  maxRetries = 4,
) => {
  // Read credentials from environment; fail fast if either is missing
  const apiKey = Deno.env.get("STEADFAST_API_KEY");
  const secretKey = Deno.env.get("STEADFAST_SECRET_KEY");
  if (!apiKey || !secretKey) {
    // Surface a clear error rather than a cryptic 401 from Steadfast
    throw new Error("Steadfast API credentials missing");
  }

  let attempt = 0;         // current attempt index (0-based)
  let lastErr: Error | null = null; // preserves the last error for re-throwing

  // Retry loop: attempt index runs from 0 to maxRetries (inclusive)
  while (attempt <= maxRetries) {
    // ── Rate limiting ────────────────────────────────────────────────────────
    // Calculate how long to wait before this call to respect MIN_INTERVAL_MS
    const wait = MIN_INTERVAL_MS - (Date.now() - lastApiCallTs);
    if (wait > 0) await sleep(wait); // throttle if the last call was too recent
    lastApiCallTs = Date.now();      // record the timestamp of this call

    try {
      // ── Upstream HTTP request ──────────────────────────────────────────────
      const res = await fetch(`${STEADFAST_BASE}${path}`, {
        method,
        headers: {
          "Api-Key": apiKey,            // Steadfast authentication header 1
          "Secret-Key": secretKey,      // Steadfast authentication header 2
          "Content-Type": "application/json",
        },
        // Only attach a body for POST requests; undefined omits the header
        body: body ? JSON.stringify(body) : undefined,
      });

      // ── Response parsing ───────────────────────────────────────────────────
      const text = await res.text(); // always read as text first to avoid stream errors
      let json: any = {};
      try {
        // Attempt JSON parse; Steadfast always returns JSON on success
        json = text ? JSON.parse(text) : {};
      } catch {
        // If the body is not valid JSON (e.g. an HTML error page), wrap it
        json = { raw: text };
      }

      // ── Retry on rate-limit or transient server errors ─────────────────────
      if (res.status === 429 || res.status >= 500) {
        // Exponential back-off with ±125 ms jitter to avoid thundering-herd
        const backoff = Math.min(8000, 500 * 2 ** attempt) +
          Math.floor(Math.random() * 250);
        console.warn(
          `Steadfast ${path} ${res.status} → retry ${attempt + 1}/${maxRetries} in ${backoff}ms`,
        );
        await sleep(backoff); // wait before the next attempt
        attempt++;
        // Preserve the error so it can be re-thrown if retries are exhausted
        lastErr = new Error(
          `Steadfast ${path} [${res.status}]: ${JSON.stringify(json)}`,
        );
        continue; // jump to next iteration without executing code below
      }

      // ── Non-retryable HTTP error (4xx except 429) ──────────────────────────
      if (!res.ok) {
        // Throw immediately – retrying would not help (e.g. bad payload, 404)
        throw new Error(
          `Steadfast ${path} failed [${res.status}]: ${JSON.stringify(json)}`,
        );
      }

      // ── Success ────────────────────────────────────────────────────────────
      return json; // return the parsed response to the caller
    } catch (e) {
      // ── Network / fetch errors (no HTTP response at all) ───────────────────
      lastErr = e as Error;
      const msg = lastErr.message || "";
      // Only retry on well-known transient network error patterns
      if (
        attempt < maxRetries &&
        /network|fetch|timeout|ECONNRESET|EAI_AGAIN/i.test(msg)
      ) {
        // Same exponential back-off schedule as the HTTP 5xx path
        const backoff = Math.min(8000, 500 * 2 ** attempt) +
          Math.floor(Math.random() * 250);
        console.warn(`Steadfast ${path} network err → retry in ${backoff}ms`);
        await sleep(backoff); // wait before retrying
        attempt++;
        continue; // jump to next iteration
      }
      // Non-transient or max retries reached – propagate immediately
      throw lastErr;
    }
  }
  // All retry attempts exhausted – throw the last captured error
  throw lastErr || new Error("Steadfast call failed after retries");
};

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG HELPER
// Every meaningful action (approve, submit, sync, bulk_sync) records an
// append-only row in the courier_audit_logs table.  Failures in the audit
// write itself are swallowed so they never abort the main operation.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts a single row into `courier_audit_logs`.
 * Errors are caught and logged to console so an audit write failure never
 * propagates to the caller or masks the original operation result.
 *
 * @param admin  - Supabase service-role client (bypasses RLS)
 * @param params - Fields to persist; all nullable fields default to null.
 */
const audit = async (
  admin: any,
  params: {
    /** UUID of the courier_shipments row this action relates to (if any). */
    shipment_id?: string | null;
    /** UUID of the orders row this action relates to (if any). */
    order_id?: string | null;
    /** Action name, e.g. "approve", "submit", "sync", "bulk_sync". */
    action: string;
    /** UUID of the user who triggered the action; null for system/cron. */
    actor_user_id?: string | null;
    /** "admin", "moderator", or "system". */
    actor_role?: string | null;
    /** Whether the action completed without throwing. */
    success: boolean;
    /** Human-readable error message; null on success. */
    error_message?: string | null;
    /** Arbitrary key-value bag for action-specific diagnostic data. */
    details?: Record<string, unknown>;
  },
) => {
  try {
    // Write the audit row using the service-role client so RLS is bypassed
    await admin.from("courier_audit_logs").insert({
      shipment_id: params.shipment_id || null,
      order_id: params.order_id || null,
      action: params.action,
      actor_user_id: params.actor_user_id || null,
      actor_role: params.actor_role || null,
      success: params.success,
      error_message: params.error_message || null,
      details: params.details || {}, // JSONB column; empty object when omitted
    });
  } catch (e) {
    // Audit failures must not disrupt the main flow – log and continue
    console.error("audit insert failed", e);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENT CUSTOMER NOTIFICATIONS
// Each notification event (approved, submitted, delivered) is sent at most
// once per shipment.  Idempotency is enforced via the notifications_sent JSONB
// column on courier_shipments which stores both a shorthand event key and a
// compound idempotency key (event:consignment_id).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fires a customer notification through the `send-shipping-notification`
 * edge function, then marks the event as sent in `courier_shipments` to
 * prevent duplicate emails.
 *
 * Idempotency key format: `"<event>:<consignment_id|shipment_uuid>"`
 *
 * The function is intentionally fire-and-forget from the caller's perspective:
 * all errors are swallowed so a notification failure never fails a sync/submit.
 *
 * @param admin    - Supabase service-role client
 * @param shipment - Full courier_shipments row
 * @param event    - Notification lifecycle event
 */
const notify = async (
  admin: any,
  shipment: any,
  event: "approved" | "submitted" | "delivered",
) => {
  try {
    // Load the existing notifications_sent map from the shipment row
    const sent = (shipment.notifications_sent || {}) as Record<string, any>;

    // Build a compound idempotency key: event + consignment (or shipment uuid)
    const idemKey = `${event}:${shipment.consignment_id || shipment.id}`;

    // Skip if already sent via either the short event key or the compound key
    if (sent[event] || sent[`__keys`]?.[idemKey]) return;

    // ── Resolve the order to get recipient details ─────────────────────────
    const { data: order } = await admin
      .from("orders")
      .select("id, guest_name, guest_email, shipping_phone, user_id, total")
      .eq("id", shipment.order_id)
      .single();
    if (!order) return; // no order found – cannot notify; bail silently

    // Start with guest contact details (guest checkout path)
    let email = order.guest_email as string | null;
    let name = (order.guest_name as string | null) || shipment.recipient_name;

    // If no guest email, attempt to resolve from the linked user profile
    if (!email && order.user_id) {
      // Fetch the display name from the profiles table
      const { data: prof } = await admin
        .from("profiles")
        .select("full_name")
        .eq("user_id", order.user_id)
        .single();
      name = prof?.full_name || name; // prefer profile name over shipment name

      try {
        // Fetch the user's auth email via the admin API (not available via RLS)
        const { data: u } = await admin.auth.admin.getUserById(order.user_id);
        email = u?.user?.email || null;
      } catch (_) { /* ignore – email remains null if admin.getUserById fails */ }
    }

    // ── Invoke the send-shipping-notification edge function ────────────────
    // The callee handles its own idempotency check via the idempotency_key
    await admin.functions.invoke("send-shipping-notification", {
      body: {
        event,                                  // "approved" | "submitted" | "delivered"
        idempotency_key: idemKey,               // prevent duplicate sends inside the mailer
        order_id: order.id,
        shipment_id: shipment.id,
        recipient_email: email,
        recipient_name: name,
        recipient_phone: shipment.recipient_phone,
        tracking_code: shipment.tracking_code,
        consignment_id: shipment.consignment_id,
        total: order.total,                     // used in email body (COD amount)
      },
    });

    // ── Persist the idempotency markers so duplicates are prevented ────────
    // Record the compound key with a timestamp inside the __keys sub-map
    const keys = (sent.__keys || {}) as Record<string, string>;
    keys[idemKey] = new Date().toISOString(); // ISO timestamp as a receipt
    sent[event] = new Date().toISOString();   // short-form key for quick look-up
    sent.__keys = keys;                        // write back the updated sub-map

    // Persist the updated notifications_sent JSONB to the DB row
    await admin
      .from("courier_shipments")
      .update({ notifications_sent: sent })
      .eq("id", shipment.id);
  } catch (e) {
    // Never let notification failures propagate – log and continue
    console.error("notify error", e);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBMIT HELPER  (used by both the submit_order action and auto_submit_pending)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submits a single courier_shipments row to the Steadfast /create_order
 * endpoint and persists the resulting consignment data.
 *
 * Pre-conditions (throws if violated):
 *  - Shipment must exist in courier_shipments
 *  - admin_approved must be true
 *  - consignment_id must be null (idempotency guard – no double-submit)
 *
 * Side-effects on success:
 *  - Updates courier_shipments: consignment_id, tracking_code, delivery_status,
 *    status="submitted", submitted_at, last_synced_at, raw_response
 *  - Updates orders: tracking_number, courier_name, status
 *  - Fires "submitted" customer notification (idempotent)
 *  - Inserts a success audit log row
 *
 * Side-effects on failure:
 *  - Updates courier_shipments.error_message
 *  - Inserts a failure audit log row
 *  - Re-throws the original error to the caller
 *
 * @param admin      - Supabase service-role client
 * @param shipmentId - UUID of the courier_shipments row to submit
 * @param actor      - Identity of the initiating user (user_id + role)
 * @returns Raw JSON response from Steadfast's /create_order endpoint
 * @throws Error if pre-conditions are not met or Steadfast call fails
 */
const submitShipment = async (
  admin: any,
  shipmentId: string,
  actor?: { user_id?: string; role?: string },
) => {
  // ── Load shipment row ──────────────────────────────────────────────────────
  const { data: ship, error: shipErr } = await admin
    .from("courier_shipments")
    .select("*")
    .eq("id", shipmentId)
    .single();
  if (shipErr || !ship) throw new Error("Shipment not found");

  // ── Pre-condition guards ───────────────────────────────────────────────────
  if (!ship.admin_approved) throw new Error("Admin approval required");   // must be approved first
  if (ship.consignment_id) throw new Error("Already submitted");          // idempotency guard

  // ── Build Steadfast /create_order payload ─────────────────────────────────
  const payload = {
    // Use stored invoice number or generate a fallback from the shipment UUID
    invoice: ship.invoice || `INV-${ship.id.slice(0, 8)}`,
    recipient_name: ship.recipient_name,
    recipient_phone: ship.recipient_phone,
    recipient_address: ship.recipient_address,
    // Ensure cod_amount is a number; Steadfast rejects strings
    cod_amount: Number(ship.cod_amount) || 0,
    // Note field is optional; omit key entirely when absent to keep payload clean
    note: ship.note || undefined,
  };

  try {
    // ── Call Steadfast /create_order ───────────────────────────────────────
    // POST to Steadfast; callSteadfast() handles auth headers and retry logic
    const result = await callSteadfast("/create_order", "POST", payload);

    // Extract the consignment object nested inside the Steadfast response
    const consignment = result?.consignment || {};

    // Map the returned status through STATUS_MAP to get our normalized form
    const meta = mapStatus(consignment.status);

    // ── Persist Steadfast response to courier_shipments ────────────────────
    await admin
      .from("courier_shipments")
      .update({
        consignment_id: consignment.consignment_id?.toString() || null, // Steadfast returns numeric IDs
        tracking_code: consignment.tracking_code || null,
        delivery_status: meta.normalized,              // e.g. "pending" or "in_review"
        status: "submitted",                           // internal lifecycle status
        submitted_at: new Date().toISOString(),        // timestamp of successful submission
        last_synced_at: new Date().toISOString(),      // treat submission as first sync
        raw_response: result,                          // store full Steadfast payload for debugging
        error_message: null,                           // clear any previous error
      })
      .eq("id", shipmentId);

    // ── Update the linked order with tracking info ─────────────────────────
    if (consignment.tracking_code) {
      // Only update if Steadfast actually returned a tracking code
      await admin
        .from("orders")
        .update({
          tracking_number: consignment.tracking_code,
          courier_name: "Steadfast",                   // fixed – this function is Steadfast-specific
          status: meta.orderStatus || "courier_confirmed", // default when mapStatus returns null
        })
        .eq("id", ship.order_id);
    }

    // ── Fire idempotent "submitted" notification ───────────────────────────
    // Re-fetch the row so notifications_sent is fresh (update above changed it)
    const { data: refreshed } = await admin
      .from("courier_shipments")
      .select("*")
      .eq("id", shipmentId)
      .single();
    if (refreshed) await notify(admin, refreshed, "submitted");

    // ── Write success audit log ────────────────────────────────────────────
    await audit(admin, {
      shipment_id: shipmentId,
      order_id: ship.order_id,
      action: "submit",
      actor_user_id: actor?.user_id,
      actor_role: actor?.role,
      success: true,
      details: {
        consignment_id: consignment.consignment_id,
        tracking_code: consignment.tracking_code,
      },
    });

    return result; // propagate Steadfast response to the HTTP handler
  } catch (e) {
    // ── Persist error and write failure audit log ──────────────────────────
    const msg = (e as Error).message;
    // Store the error message so operators can see it in the dashboard
    await admin
      .from("courier_shipments")
      .update({ error_message: msg })
      .eq("id", shipmentId);
    await audit(admin, {
      shipment_id: shipmentId,
      order_id: ship.order_id,
      action: "submit",
      actor_user_id: actor?.user_id,
      actor_role: actor?.role,
      success: false,
      error_message: msg,
    });
    throw e; // re-throw so the HTTP handler can return the correct status
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SYNC HELPER  (used by sync_status, bulk_sync / scheduled_sync)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Syncs the delivery status of a single submitted shipment from Steadfast
 * using the /status_by_cid/:consignment_id endpoint.
 *
 * Pre-conditions (throws if violated):
 *  - Shipment must have a non-null consignment_id
 *
 * Side-effects on success:
 *  - Updates courier_shipments: delivery_status, last_synced_at, raw_response,
 *    and COD fields (cod_payment_status, cod_paid_amount, cod_settled_at)
 *  - Updates orders: status, and on delivery cod_collected + payment_status
 *  - Fires "delivered" customer notification when terminal delivered (idempotent)
 *  - Inserts a success audit log row
 *
 * Side-effects on failure:
 *  - Updates courier_shipments.error_message + last_synced_at (so cron records
 *    that a sync was attempted even when it failed)
 *  - Inserts a failure audit log row
 *  - Re-throws the original error
 *
 * @param admin      - Supabase service-role client
 * @param shipmentId - UUID of the courier_shipments row to sync
 * @param actor      - Identity of the initiating user/system
 * @returns Summary object with normalized status and COD/terminal flags
 * @throws Error if Steadfast call fails or pre-condition is violated
 */
const syncShipment = async (
  admin: any,
  shipmentId: string,
  actor?: { user_id?: string; role?: string },
) => {
  // ── Load shipment row ──────────────────────────────────────────────────────
  const { data: ship } = await admin
    .from("courier_shipments")
    .select("*")
    .eq("id", shipmentId)
    .single();
  // Cannot sync without a consignment_id – Steadfast requires it for look-up
  if (!ship?.consignment_id) throw new Error("No consignment to sync");

  try {
    // ── Fetch live status from Steadfast ───────────────────────────────────
    // GET /status_by_cid/:consignment_id returns { delivery_status, cod_amount?, … }
    const data = await callSteadfast(
      `/status_by_cid/${ship.consignment_id}`, // consignment_id injected into path
      "GET",
    );

    // Steadfast response may use either "delivery_status" or "status" key
    const rawStatus = data?.delivery_status || data?.status || null;

    // Translate the raw Steadfast string into our internal meta object
    const meta = mapStatus(rawStatus);

    // ── Build the update object for courier_shipments ──────────────────────
    const updates: Record<string, unknown> = {
      delivery_status: meta.normalized,           // canonical status after mapping
      last_synced_at: new Date().toISOString(),   // always update so cron knows it ran
      raw_response: data,                          // store full Steadfast payload for debugging
      error_message: null,                         // clear any previous error on success
    };

    // ── COD settlement logic ───────────────────────────────────────────────
    // Steadfast returns cod_amount on delivered consignments.  We map it to
    // our cod_payment_status / cod_paid_amount / cod_settled_at fields.
    const codAmt = Number(data?.cod_amount || 0);

    if (meta.codStatus === "paid" || meta.normalized === "delivered") {
      // Full delivery – mark COD as fully paid and record the settled amount
      updates.cod_payment_status = "paid";
      // Use Steadfast's returned amount when available; fall back to stored amount
      updates.cod_paid_amount = codAmt > 0 ? codAmt : Number(ship.cod_amount);
      updates.cod_settled_at = new Date().toISOString(); // first settlement timestamp
    } else if (meta.codStatus === "partial") {
      // Partial delivery – mark as partially paid
      updates.cod_payment_status = "partial";
      if (codAmt > 0) updates.cod_paid_amount = codAmt; // record partial amount
    } else if (data?.cod_status && data.cod_status !== ship.cod_payment_status) {
      // Steadfast returned an explicit cod_status that differs from what we have
      // (e.g. "pending", "unpaid") – sync it without overriding our local logic
      updates.cod_payment_status = data.cod_status;
    }
    // If none of the above conditions match, leave cod_payment_status unchanged

    // ── Persist updates to courier_shipments ──────────────────────────────
    await admin.from("courier_shipments").update(updates).eq("id", shipmentId);

    // ── Update the linked order status ────────────────────────────────────
    if (meta.orderStatus) {
      // Only update when STATUS_MAP provides a non-null orderStatus
      const orderUpdates: Record<string, unknown> = { status: meta.orderStatus };

      if (meta.normalized === "delivered") {
        // On full delivery also mark the order's COD as collected
        orderUpdates.cod_collected = true;
        orderUpdates.cod_collected_at = new Date().toISOString();
        orderUpdates.payment_status = "paid"; // order is considered paid on delivery
      }

      await admin.from("orders").update(orderUpdates).eq("id", ship.order_id);
    }

    // ── Fire idempotent "delivered" notification ───────────────────────────
    if (meta.normalized === "delivered") {
      // Re-fetch the row so notifications_sent reflects the latest state
      const { data: refreshed } = await admin
        .from("courier_shipments")
        .select("*")
        .eq("id", shipmentId)
        .single();
      if (refreshed) await notify(admin, refreshed, "delivered");
    }

    // ── Write success audit log ────────────────────────────────────────────
    await audit(admin, {
      shipment_id: shipmentId,
      order_id: ship.order_id,
      action: "sync",
      actor_user_id: actor?.user_id,
      actor_role: actor?.role,
      success: true,
      details: {
        raw_status: rawStatus,                // what Steadfast actually returned
        normalized: meta.normalized,          // what we mapped it to
        terminal: meta.terminal,              // whether we'll keep polling
      },
    });

    // Return a summary for the HTTP response and bulk_sync aggregation
    return {
      status: meta.normalized,
      raw_status: rawStatus,
      cod_status: updates.cod_payment_status || ship.cod_payment_status, // merged value
      terminal: meta.terminal, // caller uses this to decide whether to keep syncing
    };
  } catch (e) {
    // ── Persist error and write failure audit log ──────────────────────────
    const msg = (e as Error).message;
    // Still update last_synced_at so cron doesn't retry this in tight loops
    await admin
      .from("courier_shipments")
      .update({ error_message: msg, last_synced_at: new Date().toISOString() })
      .eq("id", shipmentId);
    await audit(admin, {
      shipment_id: shipmentId,
      order_id: ship.order_id,
      action: "sync",
      actor_user_id: actor?.user_id,
      actor_role: actor?.role,
      success: false,
      error_message: msg,
    });
    throw e; // re-throw so bulk_sync can record the per-row failure
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DENO SERVE – main request handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Entry point for every HTTP request to this edge function.
 *
 * Flow:
 *  1. Handle CORS preflight (OPTIONS) immediately.
 *  2. Parse the JSON body and extract `action`, `shipment_id`, `scheduled_secret`.
 *  3. Instantiate a service-role Supabase client for privileged DB writes.
 *  4. Determine auth path: scheduled (secret matches) or user JWT.
 *  5. For user JWT path: validate token, verify `shipping.manage` permission,
 *     resolve actor role (admin vs moderator).
 *  6. Dispatch to the appropriate action handler.
 *  7. Catch-all returns 500 with the error message.
 */
Deno.serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  // Browsers send OPTIONS before cross-origin POST requests; respond immediately
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Parse request body ──────────────────────────────────────────────────
    // Fall back to an empty object if the body is missing or not valid JSON
    const body = await req.json().catch(() => ({}));

    // Destructure the three top-level fields from the body
    const { action, shipment_id, scheduled_secret } = body;

    // ── Service-role Supabase client ────────────────────────────────────────
    // Used for all DB writes; bypasses row-level security so the function can
    // update any row regardless of the authenticated user's permissions
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,             // injected by Supabase platform
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // never exposed to the client
    );

    // ── Auth path resolution ────────────────────────────────────────────────
    // A scheduled/cron call can bypass JWT auth by presenting the API key as
    // a shared secret.  This is safe because STEADFAST_API_KEY is a server-
    // side secret and is never sent to browser clients.
    const isScheduled = scheduled_secret &&
      scheduled_secret === Deno.env.get("STEADFAST_API_KEY");

    // Default actor for scheduled/system calls; overwritten below for human callers
    let actor: { user_id?: string; role?: string } = { role: "system" };

    if (!isScheduled) {
      // ── Human / client call – validate JWT ────────────────────────────────
      const authHeader = req.headers.get("Authorization");

      // Reject requests that have no Bearer token at all
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build an anon client scoped to the caller's JWT so getUser() validates it
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!, // anon key is fine here – auth validates the JWT
        { global: { headers: { Authorization: authHeader } } },
      );

      // Verify the JWT and extract the user; this call hits the Supabase auth server
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user?.id) {
        // Invalid, expired, or revoked token
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = userData.user.id;

      // ── Permission check via RPC ───────────────────────────────────────────
      // has_permission() checks the user's roles/permissions in the DB;
      // shipping.manage is required for all courier actions
      const { data: hasPerm } = await supabase.rpc("has_permission", {
        _user_id: userId,
        _permission: "shipping.manage",
      });
      if (!hasPerm) {
        // User is authenticated but lacks the required permission
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Resolve actor role for audit logs ──────────────────────────────────
      // Admins get slightly broader trust in audit trails (e.g. approve action)
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      // Tag the actor so audit rows distinguish admin vs. moderator actions
      actor = { user_id: userId, role: isAdmin ? "admin" : "moderator" };
    }
    // At this point `actor` is set for all code paths (scheduled or human)

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: get_balance
    // Proxy a balance check to Steadfast; no DB side-effects.
    // Useful for dashboard widgets that show the merchant's wallet balance.
    // ════════════════════════════════════════════════════════════════════════
    if (action === "get_balance") {
      // Direct pass-through – return Steadfast's raw JSON to the caller
      const data = await callSteadfast("/get_balance", "GET");
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: approve
    // Admin-approves a shipment.  Optionally auto-submits if the
    // courier_auto_submit system setting has `enabled: true`.
    // Required body field: shipment_id
    // ════════════════════════════════════════════════════════════════════════
    if (action === "approve") {
      // ── Read the courier_auto_submit system setting ──────────────────────
      // Stored as JSONB in system_settings; key is "courier_auto_submit"
      const { data: setting } = await admin
        .from("system_settings")
        .select("value")
        .eq("key", "courier_auto_submit")
        .single();
      // Default to false if the setting row is absent or value.enabled is falsy
      const autoSubmit = !!setting?.value?.enabled;

      // ── Mark the shipment as admin-approved ──────────────────────────────
      await admin
        .from("courier_shipments")
        .update({
          admin_approved: true,
          approved_by: actor.user_id || null, // null for system/cron approvals
          approved_at: new Date().toISOString(),
        })
        .eq("id", shipment_id);

      // ── Re-fetch the shipment so notify() has fresh data ─────────────────
      const { data: ship } = await admin
        .from("courier_shipments")
        .select("*")
        .eq("id", shipment_id)
        .single();

      // Fire the idempotent "approved" customer notification
      if (ship) await notify(admin, ship, "approved");

      // ── Write audit log for the approval action ──────────────────────────
      await audit(admin, {
        shipment_id,
        order_id: ship?.order_id,
        action: "approve",
        actor_user_id: actor.user_id,
        actor_role: actor.role,
        success: true,
        details: { auto_submit: autoSubmit }, // record whether auto-submit was triggered
      });

      // ── Conditional auto-submit ───────────────────────────────────────────
      let submitResult: any = null;
      let submitError: string | null = null;
      if (autoSubmit && ship && !ship.consignment_id) {
        // Auto-submit is enabled and the shipment has not been submitted yet
        try {
          submitResult = await submitShipment(admin, shipment_id, actor);
        } catch (e) {
          // Capture auto-submit errors without failing the approval response
          submitError = (e as Error).message;
        }
      }

      // Return approval outcome along with auto-submit status
      return new Response(
        JSON.stringify({
          success: true,
          auto_submitted: !!submitResult,       // true only if submit succeeded
          submit_error: submitError,             // null on success or when not attempted
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: submit_order
    // Manually submits a single approved shipment to Steadfast.
    // Throws if not approved or already submitted (idempotency).
    // Required body field: shipment_id
    // ════════════════════════════════════════════════════════════════════════
    if (action === "submit_order") {
      // Delegate to the shared submitShipment helper; it handles all DB writes
      const result = await submitShipment(admin, shipment_id, actor);
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: sync_status
    // Fetches the latest delivery status for a single submitted shipment
    // from Steadfast and persists the result.
    // Required body field: shipment_id
    // ════════════════════════════════════════════════════════════════════════
    if (action === "sync_status") {
      // Delegate to the shared syncShipment helper; it handles all DB writes
      const r = await syncShipment(admin, shipment_id, actor);
      // Spread the sync result (status, raw_status, cod_status, terminal) into the response
      return new Response(JSON.stringify({ success: true, ...r }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: bulk_sync  (alias: scheduled_sync)
    // Syncs up to 50 non-terminal, submitted shipments in a single call.
    // Processes them sequentially to respect the MIN_INTERVAL_MS rate limit.
    // Typically triggered by a Supabase scheduled function (cron) using the
    // scheduled_secret bypass, or manually by an admin for a catch-up sync.
    // ════════════════════════════════════════════════════════════════════════
    if (action === "bulk_sync" || action === "scheduled_sync") {
      // ── Fetch eligible shipments ─────────────────────────────────────────
      // Only rows that:
      //   1. Have a consignment_id (i.e. have been submitted to Steadfast)
      //   2. Are NOT in a terminal delivery status (no point re-syncing)
      // Limit to 50 to avoid edge function timeouts (Steadfast calls are ~350 ms each)
      const { data: rows } = await admin
        .from("courier_shipments")
        .select("id, consignment_id, delivery_status")
        .not("consignment_id", "is", null) // must have been submitted
        .not(
          "delivery_status",
          "in",
          // Exclude all terminal statuses; these will never change on Steadfast's side
          "(delivered,cancelled,lost,delivery_failed,returned,partial_delivered)",
        )
        .limit(50); // cap batch size to stay within edge function timeout budget

      const results: any[] = []; // per-row sync outcomes accumulated here
      let okCount = 0;
      let failCount = 0;

      // Process each shipment sequentially (not in parallel) to honour the
      // per-isolate MIN_INTERVAL_MS rate limiter inside callSteadfast()
      for (const r of rows || []) {
        try {
          const out = await syncShipment(admin, r.id, actor);
          results.push({ id: r.id, ok: true, ...out }); // include status summary
          okCount++;
        } catch (e) {
          // Record the per-row failure but continue syncing the rest
          results.push({ id: r.id, ok: false, error: (e as Error).message });
          failCount++;
        }
      }

      // ── Write a single aggregate audit log for the whole batch ───────────
      await audit(admin, {
        action: "bulk_sync",
        actor_user_id: actor.user_id,
        actor_role: actor.role,
        success: failCount === 0, // success only if every row succeeded
        details: { total: results.length, ok: okCount, failed: failCount },
      });

      return new Response(
        JSON.stringify({
          success: true,
          synced: okCount,   // number of successfully synced shipments
          failed: failCount, // number of shipments that errored
          results,           // per-row detail for debugging
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: auto_submit_pending
    // Submits up to 50 admin-approved shipments that are still waiting in the
    // queue (consignment_id is null, status="pending").  Designed for:
    //   - Cron-based drain using the scheduled_secret bypass
    //   - Manual "submit all pending" from the admin dashboard
    // ════════════════════════════════════════════════════════════════════════
    if (action === "auto_submit_pending") {
      // ── Fetch approved-but-unsubmitted shipments ─────────────────────────
      // Conditions:
      //   admin_approved = true  → operator has reviewed and approved
      //   consignment_id IS NULL → not yet sent to Steadfast
      //   status = "pending"     → internal lifecycle hasn't moved forward
      const { data: rows } = await admin
        .from("courier_shipments")
        .select("id")
        .eq("admin_approved", true)   // must be approved
        .is("consignment_id", null)   // must not already be submitted
        .eq("status", "pending")      // must still be in the initial pending state
        .limit(50);                   // cap to avoid edge function timeout

      const results: any[] = []; // per-row submit outcomes

      // Process sequentially to respect Steadfast's rate limit
      for (const r of rows || []) {
        try {
          await submitShipment(admin, r.id, actor);
          results.push({ id: r.id, ok: true });
        } catch (e) {
          // Record failure but continue processing remaining shipments
          results.push({ id: r.id, ok: false, error: (e as Error).message });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          submitted: results.length, // total attempted (ok + failed)
          results,                   // per-row detail for debugging
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Unknown action ──────────────────────────────────────────────────────
    // Return 400 with a clear error rather than silently doing nothing
    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    // ── Top-level error handler ─────────────────────────────────────────────
    // Catches any unhandled exception from auth, action handlers, or helpers
    const msg = e instanceof Error ? e.message : String(e);
    console.error("steadfast-courier error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
