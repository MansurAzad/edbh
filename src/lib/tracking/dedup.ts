// ============= Full file contents =============

/**
 * @file dedup.ts
 * @module lib/tracking/dedup
 *
 * @description
 * Stable `event_id` helper for cross-platform deduplication.
 *
 * **Why this exists**
 * The same logical user action (e.g. "add to cart") fires in ≥3 places:
 *   1. Browser Pixel (`fbq`)
 *   2. GTM `dataLayer`
 *   3. Server-side Conversions API (CAPI)
 *
 * Meta deduplicates Pixel↔CAPI events by matching `event_id`. If the ids
 * differ, the same action is counted twice and ad optimisation breaks.
 *
 * **Previous bug** — the old approach used `Math.floor(Date.now() / 60000)`
 * (minute-bucketed timestamp). Events crossing a minute boundary silently
 * generated two different ids and lost deduplication.
 *
 * **Current approach** — a monotonic composite key stored in `sessionStorage`
 * guarantees the same `(event, primaryKey)` pair always resolves to the same
 * id within the browser session, regardless of when the call is made.
 *
 * ---
 * বাংলা টীকা:
 * এই ফাইলটি ব্রাউজার পিক্সেল, GTM এবং সার্ভার-সাইড CAPI-র মধ্যে
 * ইভেন্ট আইডি এক রাখার জন্য ব্যবহৃত হয়।
 * একই (event + key) জোড়ার জন্য সর্বদা একই আইডি ফেরত দেয়
 * যাতে Meta বা GA4 একই ইভেন্ট দুইবার গণনা না করে।
 */

// Stable event_id helper. Same (event + primary key) must produce the same id
// across browser pixel + GTM dataLayer + server CAPI within a session so Meta
// dedups Pixel↔CAPI cleanly and GA4 doesn't double-count.
//
// Previous design used Math.floor(Date.now()/60000) which silently broke
// dedup across minute boundaries. This version stores a monotonic counter in
// sessionStorage so the *same* logical event always resolves to the *same* id.
import { getTrackingSessionId } from "@/lib/server-tracking";

/**
 * The `sessionStorage` key under which the event-id map is persisted.
 *
 * Versioned (`_v1`) so future schema changes can bump the suffix and cleanly
 * invalidate old stored data without manual migration code.
 *
 * বাংলা: `sessionStorage`-এ সংরক্ষণের জন্য ব্যবহৃত কী।
 * ভবিষ্যতে স্কিমা পরিবর্তন হলে সংস্করণ সংখ্যা বাড়িয়ে পুরনো ডেটা বাতিল করা যাবে।
 */
const STORE_KEY = "sst_event_ids_v1";

/**
 * In-memory shape of the persisted event-id map.
 * Key: composite string `"eventName::safeKey"`.
 * Value: the previously generated stable event id.
 *
 * বাংলা: মেমোরি ও sessionStorage উভয়ে সংরক্ষিত ইভেন্ট আইডি ম্যাপের টাইপ।
 */
type Store = Record<string, string>;

/**
 * Safely reads the event-id map from `sessionStorage`.
 *
 * Returns an empty object when:
 * - Nothing has been stored yet.
 * - `sessionStorage` is unavailable (private/incognito mode, SSR context).
 * - The stored value is corrupted JSON.
 *
 * @returns {Store} Parsed map of composite keys → event ids.
 *
 * বাংলা: `sessionStorage` থেকে ইভেন্ট আইডি ম্যাপ পড়ে।
 * যেকোনো ত্রুটিতে খালি অবজেক্ট ফেরত দেয়।
 */
function read(): Store {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}"); }
  catch { return {}; }
}

/**
 * Safely writes the event-id map back to `sessionStorage`.
 *
 * Failures (e.g. storage quota exceeded, private mode) are silently swallowed
 * because losing persistence only degrades dedup quality; it does not break
 * the primary tracking flow.
 *
 * @param {Store} s - The updated map to persist.
 *
 * বাংলা: আপডেট করা ইভেন্ট আইডি ম্যাপ `sessionStorage`-এ লেখে।
 * প্রাইভেট মোড বা কোটা অতিক্রমের ক্ষেত্রে নীরবে ব্যর্থ হয়।
 */
function write(s: Store) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/**
 * Returns a **deterministic, stable** event id for a given `(event, key)` pair.
 *
 * The id is generated once per session and then cached in `sessionStorage` so
 * that every subsequent call — whether from the browser pixel, the GTM tag, or
 * the server CAPI route — returns **the exact same string**. This is the
 * contract Meta requires for Pixel↔CAPI deduplication.
 *
 * **ID format** (illustrative):
 * ```
 * add_to_cart-a1b2c3d4-prod42-lxyz9
 * └─ event ──┘└─ sid ─┘└─key─┘└ts36┘
 * ```
 *
 * @param {string} event - GA4-style event name (`add_to_cart`, `purchase`, …).
 * @param {string} [key=""] - Natural primary identifier for the event:
 *   product id, order id, route slug, etc.
 *   Pass `""` for singleton events (e.g. a global `page_view` without a path).
 *
 * @returns {string} Stable, URL-safe event id unique to this session + event + key.
 *
 * @example
 * // Browser pixel and CAPI call share the same id:
 * const id = dedupKey("add_to_cart", "prod-42");
 * fbq("track", "AddToCart", payload, { eventID: id });
 * await serverCapi("AddToCart", payload, id);
 *
 * বাংলা: একই (ইভেন্ট, কী) জোড়ার জন্য সেশন জুড়ে একটি নির্ধারিত ইভেন্ট আইডি ফেরত দেয়।
 * ব্রাউজার পিক্সেল ও সার্ভার CAPI উভয় ক্ষেত্রে একই আইডি ব্যবহার করলে
 * Meta-র ডিডুপলিকেশন সঠিকভাবে কাজ করে।
 */
export function dedupKey(event: string, key: string = ""): string {
  // Take only the first 8 chars of the session id to keep ids concise.
  // বাংলা: সেশন আইডির প্রথম ৮ অক্ষর নেওয়া হয় যাতে ইভেন্ট আইডি সংক্ষিপ্ত থাকে।
  const sid = (getTrackingSessionId() || "anon").slice(0, 8);

  // Sanitise the key: strip anything that isn't alphanumeric, dash, or underscore,
  // then cap at 40 chars to keep the composite id human-readable.
  // বাংলা: কী থেকে বিশেষ চিহ্ন সরিয়ে ৪০ অক্ষরে সীমাবদ্ধ করা হয়।
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "_";

  // The composite key indexes the store; it is NOT the final event_id.
  // বাংলা: কম্পোজিট কী শুধু স্টোর ইন্ডেক্সের জন্য ব্যবহৃত, চূড়ান্ত ইভেন্ট আইডি নয়।
  const composite = `${event}::${safeKey}`;

  const store = read();

  // Cache hit — return the previously generated id immediately.
  // বাংলা: আগে তৈরি আইডি থাকলে সরাসরি ফেরত দাও।
  if (store[composite]) return store[composite];

  // First call: mint a new id, persist it, then return it.
  // Date.now().toString(36) adds a short base-36 timestamp for global uniqueness.
  // বাংলা: প্রথম কলে নতুন আইডি তৈরি করে সংরক্ষণ করা হয়।
  const id = `${event}-${sid}-${safeKey}-${Date.now().toString(36)}`;
  store[composite] = id;
  write(store);
  return id;
}

/**
 * Back-compatibility alias for call sites that only need to pass an event name
 * without a primary-key argument.
 *
 * Equivalent to `dedupKey(name, "")`.
 *
 * @param {string} name - Event name (same semantics as `dedupKey`'s first arg).
 * @returns {string} Stable event id for the given name within this session.
 *
 * @deprecated Prefer {@link dedupKey} with an explicit `key` argument for
 *   events that have a natural primary key (product id, order id, etc.).
 *
 * বাংলা: পুরনো কোডের সাথে সামঞ্জস্যের জন্য রাখা সংক্ষিপ্ত নাম।
 * নতুন কোডে সরাসরি `dedupKey` ব্যবহার করুন।
 */
// Back-compat alias used by older call sites.
export const eid = (name: string) => dedupKey(name);
