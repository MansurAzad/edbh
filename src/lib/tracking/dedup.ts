// Stable event_id helper. Same (event + primary key) must produce the same id
// across browser pixel + GTM dataLayer + server CAPI within a session so Meta
// dedups Pixel↔CAPI cleanly and GA4 doesn't double-count.
//
// Previous design used Math.floor(Date.now()/60000) which silently broke
// dedup across minute boundaries. This version stores a monotonic counter in
// sessionStorage so the *same* logical event always resolves to the *same* id.
import { getTrackingSessionId } from "@/lib/server-tracking";

const STORE_KEY = "sst_event_ids_v1";

type Store = Record<string, string>;

function read(): Store {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}"); }
  catch { return {}; }
}

function write(s: Store) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/**
 * Deterministic event id.
 * - `event` is the GA4-style event name (`add_to_cart`, `purchase`, ...).
 * - `key`   is the natural identifier (product id, order id, route, ...).
 *           Pass "" for events without a primary key (e.g. global page_view).
 */
export function dedupKey(event: string, key: string = ""): string {
  const sid = (getTrackingSessionId() || "anon").slice(0, 8);
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "_";
  const composite = `${event}::${safeKey}`;
  const store = read();
  if (store[composite]) return store[composite];
  const id = `${event}-${sid}-${safeKey}-${Date.now().toString(36)}`;
  store[composite] = id;
  write(store);
  return id;
}

// Back-compat alias used by older call sites.
export const eid = (name: string) => dedupKey(name);
