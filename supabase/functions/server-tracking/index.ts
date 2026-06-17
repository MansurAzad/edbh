// Server-Side Tracking: forwards events to GA4 + Meta CAPI AND logs to analytics_events table
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const GA4_MEASUREMENT_ID = Deno.env.get("GA4_MEASUREMENT_ID");
const GA4_API_SECRET = Deno.env.get("GA4_API_SECRET");
const META_PIXEL_ID = Deno.env.get("META_PIXEL_ID");
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface TrackEventBody {
  event_name: string;
  client_id?: string;
  session_id?: string;
  user_id?: string;
  event_id?: string;
  event_source_url?: string;
  user_agent?: string;
  page_path?: string;
  page_title?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  user_data?: {
    email?: string; phone?: string; first_name?: string; last_name?: string;
    city?: string; country?: string; external_id?: string; fbp?: string; fbc?: string;
  };
  params?: Record<string, unknown>;
}

const META_EVENT_MAP: Record<string, string> = {
  purchase: "Purchase", add_to_cart: "AddToCart", view_item: "ViewContent",
  begin_checkout: "InitiateCheckout", search: "Search", generate_lead: "Lead",
  add_to_wishlist: "AddToWishlist", page_view: "PageView", sign_up: "CompleteRegistration",
};

function detectDevice(ua: string): string {
  if (/mobile|android|iphone|ipod/i.test(ua)) return "mobile";
  if (/tablet|ipad/i.test(ua)) return "tablet";
  return "desktop";
}
function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  if (/opr\//i.test(ua)) return "Opera";
  return "Other";
}
function detectOS(ua: string): string {
  if (/windows/i.test(ua)) return "Windows";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod|ios/i.test(ua)) return "iOS";
  if (/mac os/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Other";
}

async function sendGA4(body: TrackEventBody) {
  if (!GA4_MEASUREMENT_ID || !GA4_API_SECRET) return { skipped: "ga4_not_configured" };
  const payload = {
    client_id: body.client_id || crypto.randomUUID(),
    events: [{ name: body.event_name, params: { ...body.params, engagement_time_msec: 1 } }],
  };
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": body.user_agent || "" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, ok: res.ok };
}

async function sendMeta(body: TrackEventBody, clientIp: string) {
  if (!META_PIXEL_ID || !META_ACCESS_TOKEN) return { skipped: "meta_not_configured" };
  const metaName = META_EVENT_MAP[body.event_name] || body.event_name;
  const ud = body.user_data || {};
  const user_data: Record<string, unknown> = {
    client_ip_address: clientIp,
    client_user_agent: body.user_agent || "",
  };
  if (ud.email) user_data.em = [await sha256(ud.email)];
  if (ud.phone) user_data.ph = [await sha256(ud.phone.replace(/\D/g, ""))];
  if (ud.first_name) user_data.fn = [await sha256(ud.first_name)];
  if (ud.last_name) user_data.ln = [await sha256(ud.last_name)];
  if (ud.city) user_data.ct = [await sha256(ud.city)];
  if (ud.country) user_data.country = [await sha256(ud.country)];
  if (ud.external_id) user_data.external_id = [await sha256(ud.external_id)];
  if (ud.fbp) user_data.fbp = ud.fbp;
  if (ud.fbc) user_data.fbc = ud.fbc;

  const event = {
    event_name: metaName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: body.event_id,
    event_source_url: body.event_source_url,
    action_source: "website",
    user_data,
    custom_data: body.params || {},
  };
  const url = `https://graph.facebook.com/v18.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [event] }),
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, response: text.slice(0, 500) };
}

async function logToDb(body: TrackEventBody, clientIp: string) {
  try {
    const ua = body.user_agent || "";
    const params = body.params || {};
    const valueRaw = (params as any).value;
    const value = typeof valueRaw === "number" ? valueRaw : (typeof valueRaw === "string" ? Number(valueRaw) : null);
    const { error } = await admin.from("analytics_events").insert({
      event_name: body.event_name,
      page_path: body.page_path || (params as any).page_path || null,
      page_title: body.page_title || (params as any).page_title || null,
      referrer: body.referrer || null,
      session_id: body.session_id || null,
      client_id: body.client_id || null,
      user_id: body.user_id || null,
      device_type: detectDevice(ua),
      browser: detectBrowser(ua),
      os: detectOS(ua),
      ip_address: clientIp || null,
      user_agent: ua || null,
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
      value: Number.isFinite(value as number) ? value : null,
      currency: (params as any).currency || null,
      metadata: params,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as TrackEventBody;
    if (!body?.event_name) {
      return new Response(JSON.stringify({ error: "event_name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
      || req.headers.get("cf-connecting-ip") || "";
    body.user_agent = body.user_agent || req.headers.get("user-agent") || "";

    const [ga, meta, db] = await Promise.all([
      sendGA4(body),
      sendMeta(body, clientIp),
      logToDb(body, clientIp),
    ]);

    return new Response(JSON.stringify({ ok: true, ga, meta, db }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("server-tracking error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
