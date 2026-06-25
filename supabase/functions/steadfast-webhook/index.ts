/**
 * @file steadfast-webhook/index.ts
 * @description Steadfast Courier Inbound Webhook Handler
 *
 * Receives real-time delivery status push notifications from Steadfast's courier
 * platform and synchronises them into the local `courier_shipments` and `orders`
 * tables. Every webhook call is also recorded in `courier_audit_logs`.
 *
 * HTTP Contract
 * ─────────────
 * Method  : POST (Steadfast sends POST; OPTIONS handled for CORS)
 * Auth    : Shared secret verified against `system_settings.courier_webhook_secret`
 *           Provided by Steadfast as either:
 *             – Query param  : ?secret=<value>
 *             – Request header: X-Webhook-Secret: <value>
 * Body    : JSON (Steadfast webhook payload)
 *   {
 *     consignment_id  : string   – primary lookup key
 *     tracking_code   : string   – fallback lookup key
 *     invoice         : string   – fallback lookup key
 *     status          : string   – delivery status string (see STATUS_MAP)
 *     delivery_status : string   – alias for status
 *     cod_amount      : number   – COD amount collected
 *     cod_status      : string   – "paid" | "partial" | ""
 *   }
 * Returns : JSON { success, status } on success or { error } on failure.
 *
 * Shipment Lookup Strategy
 * ────────────────────────
 * Steadfast may send any combination of identifiers. We try in priority order:
 *   1. consignment_id  (most reliable – Steadfast's own ID)
 *   2. tracking_code
 *   3. invoice number
 *
 * COD (Cash on Delivery) Status Handling
 * ───────────────────────────────────────
 * • delivered  → cod_payment_status = "paid", timestamps set
 * • cod_status = "partial" → cod_payment_status = "partial"
 * • Other statuses leave COD fields unchanged.
 *
 * Environment Variables
 * ─────────────────────
 * SUPABASE_URL              – Project REST endpoint.
 * SUPABASE_SERVICE_ROLE_KEY – Bypasses RLS for all DB writes.
 *
 * বাংলা নোট
 * ─────────
 * Steadfast থেকে ডেলিভারি স্ট্যাটাস আপডেট আসে এই webhook-এ।
 * shared secret দিয়ে যাচাই করে, তারপর shipment ও order আপডেট করে।
 * প্রতিটি কল audit log-এ রেকর্ড হয়।
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─────────────────────────────────────────────────────────────────────────────
// CORS headers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CORS headers – the webhook endpoint must also handle browser preflight
 * if the admin dashboard makes direct cross-origin test calls.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-webhook-secret",
};

// ─────────────────────────────────────────────────────────────────────────────
// Status mapping table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps every raw Steadfast `status` / `delivery_status` string to:
 *  – `normalized`  : our internal canonical status string stored in the DB
 *  – `orderStatus` : corresponding `orders.status` value (null = no change)
 *  – `codPaid`     : true if this status implies COD money was collected
 *
 * Any status not in this map is stored verbatim as `normalized` with no
 * order status update.
 *
 * বাংলা নোট: Steadfast-এর স্ট্যাটাস আমাদের DB-র স্ট্যাটাসে রূপান্তর করে।
 */
const STATUS_MAP: Record<
  string,
  { normalized: string; orderStatus: string | null; codPaid?: boolean }
> = {
  // Pre-pickup states
  pending: { normalized: "pending", orderStatus: null },
  in_review: { normalized: "in_review", orderStatus: "courier_confirmed" },
  hold: { normalized: "hold", orderStatus: "courier_confirmed" },
  // In-transit states
  in_transit: { normalized: "in_transit", orderStatus: "shipped" },
  delivery_in_transit: { normalized: "in_transit", orderStatus: "shipped" },
  // Terminal success states
  delivered: {
    normalized: "delivered",
    orderStatus: "delivered",
    codPaid: true, // COD is collected on delivery
  },
  partial_delivered: {
    normalized: "partial_delivered",
    orderStatus: "delivered",
  },
  // Terminal failure states
  cancelled: { normalized: "cancelled", orderStatus: "cancelled" },
  delivery_failed: {
    normalized: "delivery_failed",
    orderStatus: "delivery_failed",
  },
  lost: { normalized: "lost", orderStatus: "cancelled" },
  // Return states – both aliases map to the same result
  return: { normalized: "returned", orderStatus: "returned" },
  returned: { normalized: "returned", orderStatus: "returned" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deno HTTP entry-point for the `steadfast-webhook` edge function.
 *
 * Flow:
 *  1. CORS preflight.
 *  2. Initialise service-role admin client (no user context needed).
 *  3. Authenticate the request: compare the provided secret against the value
 *     stored in `system_settings` (key = "courier_webhook_secret").
 *  4. Parse the webhook body; normalise field names (Steadfast uses aliases).
 *  5. Locate the matching shipment row by consignment_id → tracking_code → invoice.
 *  6. Build update object for `courier_shipments` including COD status.
 *  7. Optionally update `orders.status` if the new status has an order mapping.
 *  8. Write an audit log entry recording the raw and normalised status.
 *  9. Return `{ success: true, status }`.
 *
 * বাংলা নোট: Steadfast webhook যাচাই করে shipment ও order আপডেট করে,
 * তারপর audit log লেখে।
 */
Deno.serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Service-role admin client ─────────────────────────────────────────────
  // Service role is required because webhook calls carry no user JWT.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── Step 1: Authenticate via shared secret ────────────────────────────────
    // Accept the secret from either the X-Webhook-Secret header or ?secret= param
    const url = new URL(req.url);
    const provided =
      req.headers.get("x-webhook-secret") ||
      url.searchParams.get("secret") ||
      "";

    // The expected secret is stored as a JSON object { secret: "..." } in
    // system_settings to allow future rotation without function redeployment.
    const { data: setting } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "courier_webhook_secret")
      .single();

    const expected = setting?.value?.secret;
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: Parse webhook body ────────────────────────────────────────────
    // `catch(() => ({}))` means a malformed body returns an empty object and
    // the missing-identifier check below catches it gracefully.
    const body = await req.json().catch(() => ({}));

    // Normalise field names – Steadfast uses both camelCase and snake_case aliases
    const consignment_id = (
      body.consignment_id ??
      body.consignmentId ??
      ""
    )?.toString();
    const invoice = body.invoice ?? body.invoice_id ?? null;
    const tracking_code = body.tracking_code ?? null;
    const rawStatus = (
      body.status ??
      body.delivery_status ??
      ""
    )
      .toString()
      .toLowerCase();
    const cod_amount = Number(body.cod_amount ?? 0);
    const cod_status = (body.cod_status ?? "").toString().toLowerCase();

    // At least one shipment identifier must be present to perform a lookup
    if (!consignment_id && !invoice && !tracking_code) {
      return new Response(JSON.stringify({ error: "Missing identifier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 3: Look up the shipment row ──────────────────────────────────────
    // Priority: consignment_id (Steadfast's primary key) → tracking_code → invoice
    let q = admin.from("courier_shipments").select("*").limit(1);
    if (consignment_id) {
      q = q.eq("consignment_id", consignment_id);
    } else if (tracking_code) {
      q = q.eq("tracking_code", tracking_code);
    } else {
      q = q.eq("invoice", invoice);
    }

    const { data: ships } = await q;
    const ship = ships?.[0];

    if (!ship) {
      return new Response(JSON.stringify({ error: "Shipment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 4: Map status and build shipment update ──────────────────────────
    // Fall back to storing the raw status if not in the map
    const meta = STATUS_MAP[rawStatus] || {
      normalized: rawStatus || "unknown",
      orderStatus: null,
    };

    const updates: Record<string, unknown> = {
      delivery_status: meta.normalized,
      last_synced_at: new Date().toISOString(),
      // Store the full webhook payload for debugging / audit trail
      raw_response: body,
    };

    // ── COD status resolution ─────────────────────────────────────────────────
    if (meta.codPaid || cod_status === "paid") {
      // Full COD payment received
      updates.cod_payment_status = "paid";
      // Use the webhook's cod_amount if present, otherwise fall back to the
      // originally expected amount stored on the shipment row.
      updates.cod_paid_amount =
        cod_amount > 0 ? cod_amount : Number(ship.cod_amount);
      updates.cod_settled_at = new Date().toISOString();
    } else if (cod_status === "partial") {
      // Partial COD payment (e.g. partial_delivered)
      updates.cod_payment_status = "partial";
      if (cod_amount > 0) updates.cod_paid_amount = cod_amount;
    }
    // All other statuses: leave COD fields unchanged

    // Persist the shipment update
    await admin.from("courier_shipments").update(updates).eq("id", ship.id);

    // ── Step 5: Mirror status change to the parent order ─────────────────────
    if (meta.orderStatus) {
      const ou: Record<string, unknown> = { status: meta.orderStatus };

      // On delivery, mark the order as COD-collected and payment as paid
      if (meta.normalized === "delivered") {
        ou.cod_collected = true;
        ou.cod_collected_at = new Date().toISOString();
        ou.payment_status = "paid";
      }

      await admin.from("orders").update(ou).eq("id", ship.order_id);
    }

    // ── Step 6: Write audit log ───────────────────────────────────────────────
    // actor_role = "steadfast" identifies this as an inbound push (not a user action)
    await admin.from("courier_audit_logs").insert({
      shipment_id: ship.id,
      order_id: ship.order_id,
      action: "webhook",
      actor_role: "steadfast",
      success: true,
      details: {
        raw_status: rawStatus,
        normalized: meta.normalized,
      },
    });

    return new Response(
      JSON.stringify({ success: true, status: meta.normalized }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    // Surface error message without leaking a full stack trace
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
