/**
 * @file tracking/core.ts
 * @module lib/tracking/core
 *
 * **Central fan-out dispatcher for all analytics events.**
 *
 * Every tracking event in the application flows through `fanout()`.  It fires
 * four destinations in a single call, eliminating the copy-paste pattern of
 * manually calling `dataLayer.push`, `gtag`, `fbq`, and `serverTrack` in each
 * event wrapper.
 *
 * ## Destination order
 * 1. **GTM dataLayer** — always fired; GTM tags consume it asynchronously.
 * 2. **GA4 direct (`gtag`)** — only fires if `window.gtag` exists outside GTM
 *    (e.g. a standalone GA4 snippet).  When GTM is present, the GA4 tag inside
 *    GTM handles it and this call is a harmless no-op.
 * 3. **Meta Pixel (`fbq`)** — fires if `window.fbq` exists and `fb !== null`.
 *    Pass `fb: null` explicitly to skip Pixel for a specific event.
 * 4. **Server-side CAPI** — delegates to `serverTrack()`.  Pass `capi: null`
 *    to skip entirely; omit `capi` to auto-generate from `event` + `ecommerce`.
 *
 * ## GTM dataLayer ecommerce clearing
 * GA4 requires clearing the previous ecommerce object before pushing a new one
 * (`{ ecommerce: null }`).  `dlPush()` handles this automatically whenever
 * `input.ecommerce` is present.
 *
 * ## Cross-module contract
 * - `tracking/events.ts` is the ONLY consumer of `fanout()`.
 * - `fanout()` does NOT deduplicate events itself — callers must generate
 *   stable IDs via `dedupKey()` from `tracking/dedup.ts`.
 * - `serverTrack()` is fire-and-forget; `fanout()` does not await it.
 */

// Generic fan-out: dataLayer (GTM) + gtag (GA4 direct) + fbq (Meta Pixel) +
// serverTrack (CAPI/edge function). One function instead of repeating the
// four-block pattern in every trackX wrapper.
import { serverTrack, type ServerTrackUserData } from "@/lib/server-tracking";
import { emitDebug } from "./debug";

/** Convenience alias — any plain object with string keys. */
type AnyObj = Record<string, unknown>;

/**
 * Unified input shape for `fanout()`.
 *
 * Only `event` and `event_id` are required.  All channel-specific fields
 * (`fb`, `capi`, `ecommerce`, etc.) are optional so individual event wrappers
 * only populate the fields relevant to that event type.
 */
export interface TrackInput {
  /**
   * GA4-style event name pushed as the `event` key in the GTM dataLayer.
   * Use snake_case per GA4 convention: `"add_to_cart"`, `"purchase"`, etc.
   */
  event: string;

  /**
   * Globally unique event ID.
   * **Must be identical** across the browser Pixel fire and the server CAPI
   * call for Meta deduplication to work.  Generate with `dedupKey()`.
   */
  event_id: string;

  /**
   * GA4 Enhanced Ecommerce object (`items`, `value`, `currency`,
   * `transaction_id`, …).  When present, `dlPush` clears the previous
   * ecommerce object first (GA4 requirement).
   */
  ecommerce?: AnyObj;

  /**
   * Extra top-level dataLayer keys merged alongside `event` and `event_id`.
   * Examples: `{ search_term: "saree" }`, `{ method: "newsletter" }`.
   */
  dl?: AnyObj;

  /**
   * Params passed as the third argument to `gtag("event", name, params)`.
   * When omitted, defaults to `ecommerce` (which is usually correct for
   * standard GA4 ecommerce events).
   */
  ga?: AnyObj;

  /**
   * Meta Pixel `fbq("track", …)` configuration.
   * - `name`   — Facebook standard event name (`"AddToCart"`, `"Purchase"`, …)
   * - `params` — custom data object forwarded as the second `fbq` argument.
   * Set to `null` to skip the Pixel fire for this event.
   */
  fb?: { name: string; params?: AnyObj } | null;

  /**
   * Server-side CAPI configuration forwarded to `serverTrack()`.
   * - `name`      — overrides `event` for the CAPI event name (optional).
   * - `params`    — event-specific parameters (ecommerce data, etc.).
   * - `user_data` — PII for match quality; merged with top-level `user_data`.
   * Set to `null` to skip CAPI entirely for this event.
   */
  capi?: { name: string; params?: AnyObj; user_data?: ServerTrackUserData } | null;

  /**
   * User PII pushed to the GTM dataLayer as `user_data` (consumed by GTM's
   * Enhanced Conversions tag) and optionally forwarded to CAPI.
   */
  user_data?: ServerTrackUserData;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Pushes a payload to `window.dataLayer`, initialising the array if needed.
 * When `payload.ecommerce` is truthy, clears the previous ecommerce context
 * first — this is a GA4 + GTM best-practice requirement.
 *
 * @param payload - Object to push; must include at least `event`.
 */
function dlPush(payload: AnyObj) {
  const w = window as any;
  w.dataLayer = w.dataLayer || []; // Initialise dataLayer if GTM hasn't yet.
  // GA4 requires resetting ecommerce between events to avoid data bleed.
  if (payload.ecommerce) w.dataLayer.push({ ecommerce: null });
  w.dataLayer.push(payload);
}

// ─── Public exports ───────────────────────────────────────────────────────────

/**
 * Returns `true` if Google Tag Manager has fully initialised on the page.
 *
 * Useful for conditional logic that should only run when GTM is available,
 * e.g. suppressing duplicate gtag calls when GTM already handles them.
 *
 * @returns `true` when `window.google_tag_manager` exists and has at least
 *   one container loaded.
 */
export function gtmLoaded(): boolean {
  const w = window as any;
  return !!(w.google_tag_manager && Object.keys(w.google_tag_manager).length);
}

/**
 * Fires an analytics event across all four tracking destinations in one call.
 *
 * Execution is **synchronous** for steps 1–3 (dataLayer, gtag, fbq) and
 * **fire-and-forget async** for step 4 (serverTrack).  The function itself
 * returns `void` immediately.
 *
 * @param input - Unified event payload.  See `TrackInput` for field docs.
 *
 * @remarks
 * - Never call `fanout()` directly from UI components.  Use the typed wrappers
 *   in `tracking/events.ts` (`trackAddToCart`, `trackPurchase`, etc.).
 * - `capi: null` and `fb: null` are intentional skip signals.  Omitting the
 *   field lets `fanout` build a sensible default from `event` + `ecommerce`.
 *
 * @example
 * fanout({
 *   event:    "add_to_cart",
 *   event_id: dedupKey("add_to_cart", productId),
 *   ecommerce: { currency: "BDT", value: 500, items: [{ item_id: productId }] },
 *   fb:   { name: "AddToCart" },
 *   capi: { name: "add_to_cart" },
 * });
 */
export function fanout(input: TrackInput) {
  const { event, event_id, ecommerce, dl, ga, fb, capi, user_data } = input;

  // ── 1. GTM dataLayer ──────────────────────────────────────────────────────
  // This is the single source of truth when GTM is loaded.  GTM tags (GA4,
  // Meta, custom HTML) subscribe to these pushes and fire asynchronously.
  dlPush({
    event,
    event_id,
    ...(user_data  ? { user_data }  : {}),
    ...(ecommerce  ? { ecommerce }  : {}),
    ...(dl         || {}),
  });
  emitDebug({ ts: Date.now(), source: "dataLayer", event, event_id, params: { ecommerce, ...(dl || {}) } });

  // ── 2. GA4 direct (gtag) ──────────────────────────────────────────────────
  const w = window as any;
  if (w.gtag) {
    w.gtag("event", event, ga ?? ecommerce ?? {});
    emitDebug({ ts: Date.now(), source: "gtag", event, event_id, params: ga ?? (ecommerce as any) });
  }

  // ── 3. Meta Pixel (fbq) ───────────────────────────────────────────────────
  if (fb && w.fbq) {
    w.fbq("track", fb.name, fb.params || {}, { eventID: event_id });
    emitDebug({ ts: Date.now(), source: "pixel", event: fb.name, event_id, params: fb.params });
  }

  // ── 4. Server-side CAPI + native analytics_events DB ─────────────────────
  if (capi !== null) {
    const capiName = capi?.name || event;
    emitDebug({ ts: Date.now(), source: "capi", event: capiName, event_id, params: capi?.params ?? (ecommerce as any) });
    void serverTrack({
      event_name: capiName,
      event_id,
      user_data: capi?.user_data ?? user_data,
      params: capi?.params ?? (ecommerce as AnyObj) ?? {},
    });
  }
}
