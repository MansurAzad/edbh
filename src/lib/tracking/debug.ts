/**
 * @file tracking/debug.ts
 * QA debug bus for tracking events. When enabled, every channel-fire (GTM
 * dataLayer, GA4 gtag, Meta Pixel client, Meta CAPI server) is broadcast to
 * subscribers so the on-page overlay can render a live log — useful for
 * verifying triggers against Meta Events Manager / Pixel Helper.
 *
 * Enable with `?tracking_debug=1` in the URL (persisted to localStorage) or by
 * setting `localStorage.tracking_debug = "1"` manually.
 */

export type TrackingSource = "dataLayer" | "gtag" | "pixel" | "capi";

export interface TrackingDebugEntry {
  ts: number;
  source: TrackingSource;
  event: string;      // GA4-style name (add_to_cart) OR Pixel name (AddToCart)
  event_id: string;
  params?: Record<string, unknown>;
}

const KEY = "tracking_debug";
const MAX_ENTRIES = 50;
const listeners = new Set<(e: TrackingDebugEntry) => void>();
const buffer: TrackingDebugEntry[] = [];

export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // URL flag activates + persists; ?tracking_debug=0 disables.
    const url = new URL(window.location.href);
    const q = url.searchParams.get(KEY);
    if (q === "1") localStorage.setItem(KEY, "1");
    else if (q === "0") localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function emitDebug(entry: TrackingDebugEntry) {
  if (!isDebugEnabled()) return;
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  listeners.forEach((fn) => { try { fn(entry); } catch { /* ignore */ } });
}

export function subscribeDebug(fn: (e: TrackingDebugEntry) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getDebugBuffer(): TrackingDebugEntry[] {
  return [...buffer];
}

export function clearDebugBuffer() {
  buffer.length = 0;
}
