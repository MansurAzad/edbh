// Generic fan-out: dataLayer (GTM) + gtag (GA4 direct) + fbq (Meta Pixel) +
// serverTrack (CAPI/edge function). One function instead of repeating the
// four-block pattern in every trackX wrapper.
import { serverTrack, type ServerTrackUserData } from "@/lib/server-tracking";

type AnyObj = Record<string, unknown>;

export interface TrackInput {
  /** GA4 event name; also pushed to dataLayer as `event`. */
  event: string;
  event_id: string;
  /** Ecommerce object (items, value, currency, transaction_id, …). */
  ecommerce?: AnyObj;
  /** Extra top-level dataLayer keys (search_term, method, …). */
  dl?: AnyObj;
  /** gtag(event, …) params. Defaults to the ecommerce object. */
  ga?: AnyObj;
  /** fbq("track", FB_NAME, params, { eventID }). null = skip Pixel. */
  fb?: { name: string; params?: AnyObj } | null;
  /** server-tracking edge function payload. null = skip CAPI. */
  capi?: { name: string; params?: AnyObj; user_data?: ServerTrackUserData } | null;
  /** user_data exposed to GTM tags (Enhanced Conversions etc). */
  user_data?: ServerTrackUserData;
}

function dlPush(payload: AnyObj) {
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  if (payload.ecommerce) w.dataLayer.push({ ecommerce: null });
  w.dataLayer.push(payload);
}

export function gtmLoaded(): boolean {
  const w = window as any;
  return !!(w.google_tag_manager && Object.keys(w.google_tag_manager).length);
}

export function fanout(input: TrackInput) {
  const { event, event_id, ecommerce, dl, ga, fb, capi, user_data } = input;

  // 1. GTM dataLayer (single source of truth when GTM is loaded)
  dlPush({
    event,
    event_id,
    ...(user_data ? { user_data } : {}),
    ...(ecommerce ? { ecommerce } : {}),
    ...(dl || {}),
  });

  // 2. GA4 direct (only meaningful if gtag is loaded outside GTM)
  const w = window as any;
  if (w.gtag) w.gtag("event", event, ga ?? ecommerce ?? {});

  // 3. Meta Pixel
  if (fb && w.fbq) w.fbq("track", fb.name, fb.params || {}, { eventID: event_id });

  // 4. Server-side CAPI / native analytics
  if (capi !== null) {
    const capiName = capi?.name || event;
    void serverTrack({
      event_name: capiName,
      event_id,
      user_data: capi?.user_data ?? user_data,
      params: capi?.params ?? (ecommerce as AnyObj) ?? {},
    });
  }
}
