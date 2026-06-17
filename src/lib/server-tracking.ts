// Client-side helper to mirror browser events to server-side tracking edge function.
// Logs to GA4 + Meta CAPI + native analytics_events DB.
import { supabase } from "@/integrations/supabase/client";

const CLIENT_ID_KEY = "sst_client_id";
const SESSION_ID_KEY = "sst_session_id";
const SESSION_TIME_KEY = "sst_session_time";
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min idle

function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function getSessionId(): string {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(SESSION_TIME_KEY) || 0);
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id || (now - last) > SESSION_TTL_MS) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    sessionStorage.setItem(SESSION_TIME_KEY, String(now));
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : undefined;
}

function getUtm() {
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get("utm_source") || undefined,
      utm_medium: p.get("utm_medium") || undefined,
      utm_campaign: p.get("utm_campaign") || undefined,
    };
  } catch {
    return {};
  }
}

export interface ServerTrackUserData {
  email?: string; phone?: string; first_name?: string; last_name?: string;
  city?: string; country?: string; external_id?: string;
}

export interface ServerTrackOptions {
  event_name: string;
  event_id?: string;
  user_data?: ServerTrackUserData;
  params?: Record<string, unknown>;
}

export async function serverTrack(opts: ServerTrackOptions): Promise<void> {
  try {
    const utm = getUtm();
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } } as any));
    const payload = {
      event_name: opts.event_name,
      event_id: opts.event_id || `${opts.event_name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      client_id: getClientId(),
      session_id: getSessionId(),
      user_id: user?.id,
      event_source_url: typeof window !== "undefined" ? window.location.href : undefined,
      page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
      page_title: typeof document !== "undefined" ? document.title : undefined,
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      ...utm,
      user_data: {
        ...opts.user_data,
        fbp: getCookie("_fbp"),
        fbc: getCookie("_fbc"),
      },
      params: opts.params || {},
    };
    void supabase.functions.invoke("server-tracking", { body: payload });
  } catch (err) {
    console.warn("serverTrack failed:", err);
  }
}

export function getTrackingClientId() { return getClientId(); }
export function getTrackingSessionId() { return getSessionId(); }
