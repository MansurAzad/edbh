import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { serverTrack, getTrackingSessionId, type ServerTrackUserData } from "@/lib/server-tracking";

// Deterministic dedup key shared between browser pixel, GTM dataLayer, and server CAPI.
// Same (event + session + primary id + 1-min bucket) → identical event_id everywhere,
// so Meta Events Manager dedups Pixel↔CAPI and GA4 won't double-count.
const dedupKey = (event: string, primaryId: string = "") => {
  const sid = (getTrackingSessionId() || "anon").slice(0, 8);
  const bucket = Math.floor(Date.now() / 60000); // 60s window
  const key = primaryId ? primaryId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) : "_";
  return `${event}-${sid}-${key}-${bucket}`;
};
// Backwards-compat alias
const eid = (name: string) => dedupKey(name);

// Push to GTM dataLayer (GTM tags use these to fire GA4/Meta/etc)
const dlPush = (payload: Record<string, unknown>) => {
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  // Reset ecommerce object before each push (GTM best practice)
  if ((payload as any).ecommerce) w.dataLayer.push({ ecommerce: null });
  w.dataLayer.push(payload);
};

// True if a GTM container has loaded — used to avoid double-loading direct pixels
const gtmLoaded = () => {
  const w = window as any;
  return !!(w.google_tag_manager && Object.keys(w.google_tag_manager).length);
};

// Global tracking helpers — fire dataLayer (for GTM), browser pixel (fallback) and server CAPI
export const trackAddToCart = (
  product: { id: string; name: string; price: number; category: string },
  quantity: number,
) => {
  const event_id = dedupKey("add_to_cart", `${product.id}-${quantity}`);
  const value = product.price * quantity;
  dlPush({
    event: "add_to_cart",
    event_id,
    ecommerce: {
      currency: "BDT",
      value,
      items: [{ item_id: product.id, item_name: product.name, item_category: product.category, price: product.price, quantity }],
    },
  });
  const w = window as any;
  if (w.gtag) w.gtag("event", "add_to_cart", {
    currency: "BDT", value,
    items: [{ item_id: product.id, item_name: product.name, item_category: product.category, price: product.price, quantity }],
  });
  if (w.fbq) w.fbq("track", "AddToCart", {
    content_ids: [product.id], content_name: product.name, content_type: "product", value, currency: "BDT",
  }, { eventID: event_id });
  serverTrack({
    event_name: "add_to_cart", event_id,
    params: {
      currency: "BDT", value,
      content_ids: [product.id], content_name: product.name, content_type: "product",
      contents: [{ id: product.id, quantity, item_price: product.price }],
    },
  });
};

export const trackPurchase = (
  orderId: string,
  total: number,
  items: { id: string; name: string; price: number; quantity: number }[],
  userData?: ServerTrackUserData,
) => {
  const event_id = `purchase-${orderId}`;
  dlPush({
    event: "purchase",
    event_id,
    user_data: userData || {},
    ecommerce: {
      transaction_id: orderId, currency: "BDT", value: total,
      items: items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
    },
  });
  const w = window as any;
  if (w.gtag) w.gtag("event", "purchase", {
    transaction_id: orderId, currency: "BDT", value: total,
    items: items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
  });
  if (w.fbq) w.fbq("track", "Purchase", {
    content_ids: items.map(i => i.id), content_type: "product",
    value: total, currency: "BDT", num_items: items.length,
  }, { eventID: event_id });
  serverTrack({
    event_name: "purchase", event_id,
    user_data: { ...userData, external_id: orderId },
    params: {
      currency: "BDT", value: total, transaction_id: orderId,
      content_ids: items.map(i => i.id), content_type: "product",
      contents: items.map(i => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
      num_items: items.reduce((s, i) => s + i.quantity, 0),
    },
  });
};

export const trackViewContent = (product: { id: string; name: string; price: number; category: string }) => {
  const event_id = dedupKey("view_item", product.id);
  dlPush({
    event: "view_item",
    event_id,
    ecommerce: {
      currency: "BDT", value: product.price,
      items: [{ item_id: product.id, item_name: product.name, item_category: product.category, price: product.price }],
    },
  });
  const w = window as any;
  if (w.gtag) w.gtag("event", "view_item", {
    currency: "BDT", value: product.price,
    items: [{ item_id: product.id, item_name: product.name, item_category: product.category, price: product.price }],
  });
  if (w.fbq) w.fbq("track", "ViewContent", {
    content_ids: [product.id], content_name: product.name, content_type: "product",
    value: product.price, currency: "BDT",
  }, { eventID: event_id });
  serverTrack({
    event_name: "view_item", event_id,
    params: {
      currency: "BDT", value: product.price,
      content_ids: [product.id], content_name: product.name, content_category: product.category, content_type: "product",
    },
  });
};

export const trackInitiateCheckout = (
  total: number,
  items: { id: string; name: string; price: number; quantity: number }[],
  userData?: ServerTrackUserData,
) => {
  const event_id = dedupKey("begin_checkout", items.map(i => i.id).sort().join("_").slice(0, 32));
  dlPush({
    event: "begin_checkout",
    event_id,
    user_data: userData || {},
    ecommerce: {
      currency: "BDT", value: total,
      items: items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
    },
  });
  const w = window as any;
  if (w.gtag) w.gtag("event", "begin_checkout", {
    currency: "BDT", value: total,
    items: items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
  });
  if (w.fbq) w.fbq("track", "InitiateCheckout", {
    content_ids: items.map(i => i.id), content_type: "product",
    value: total, currency: "BDT",
    num_items: items.reduce((s, i) => s + i.quantity, 0),
  }, { eventID: event_id });
  serverTrack({
    event_name: "begin_checkout", event_id,
    user_data: userData,
    params: {
      currency: "BDT", value: total,
      content_ids: items.map(i => i.id), content_type: "product",
      contents: items.map(i => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
      num_items: items.reduce((s, i) => s + i.quantity, 0),
    },
  });
};

export const trackSearch = (query: string) => {
  const event_id = dedupKey("search", query.slice(0, 24));
  dlPush({ event: "search", event_id, search_term: query });
  const w = window as any;
  if (w.gtag) w.gtag("event", "search", { search_term: query });
  if (w.fbq) w.fbq("track", "Search", { search_string: query }, { eventID: event_id });
  serverTrack({ event_name: "search", event_id, params: { search_string: query } });
};

export const trackAddToWishlist = (product: { id: string; name: string; price: number }) => {
  const event_id = dedupKey("add_to_wishlist", product.id);
  dlPush({
    event: "add_to_wishlist", event_id,
    ecommerce: {
      currency: "BDT", value: product.price,
      items: [{ item_id: product.id, item_name: product.name, price: product.price }],
    },
  });
  const w = window as any;
  if (w.gtag) w.gtag("event", "add_to_wishlist", {
    currency: "BDT", value: product.price,
    items: [{ item_id: product.id, item_name: product.name, price: product.price }],
  });
  if (w.fbq) w.fbq("track", "AddToWishlist", {
    content_ids: [product.id], content_name: product.name, content_type: "product",
    value: product.price, currency: "BDT",
  }, { eventID: event_id });
  serverTrack({
    event_name: "add_to_wishlist", event_id,
    params: {
      currency: "BDT", value: product.price,
      content_ids: [product.id], content_name: product.name, content_type: "product",
    },
  });
};

export const trackLead = (source: string = "newsletter", userData?: ServerTrackUserData) => {
  const event_id = dedupKey("generate_lead", source);
  dlPush({ event: "generate_lead", event_id, user_data: userData || {}, method: source });
  const w = window as any;
  if (w.gtag) w.gtag("event", "generate_lead", { method: source });
  if (w.fbq) w.fbq("track", "Lead", { content_name: source }, { eventID: event_id });
  serverTrack({ event_name: "generate_lead", event_id, user_data: userData, params: { content_name: source } });
};

const AnalyticsTracker = () => {
  const location = useLocation();
  const [gaId, setGaId] = useState<string | null>(null);
  const [fbPixelId, setFbPixelId] = useState<string | null>(null);

  useEffect(() => {
    const fetchIds = async () => {
      const { data } = await supabase
        .from("site_content")
        .select("section_key, content")
        .in("section_key", ["google_analytics_id", "facebook_pixel_id"])
        .eq("is_active", true);
      if (data) {
        data.forEach((row) => {
          if (row.section_key === "google_analytics_id" && row.content) setGaId(row.content.trim());
          if (row.section_key === "facebook_pixel_id" && row.content) setFbPixelId(row.content.trim());
        });
      }
    };
    fetchIds();
  }, []);

  // GA4 direct injection — skip if GTM is loaded (GTM will manage it)
  useEffect(() => {
    if (!gaId) return;
    if (gtmLoaded()) return;
    if (document.getElementById("ga-script")) return;
    const script = document.createElement("script");
    script.id = "ga-script";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);
    const inlineScript = document.createElement("script");
    inlineScript.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`;
    document.head.appendChild(inlineScript);
  }, [gaId]);

  // Meta Pixel direct injection — skip if GTM is loaded (GTM will manage it)
  useEffect(() => {
    if (!fbPixelId) return;
    if (gtmLoaded()) return;
    if (document.getElementById("fb-pixel-script")) return;
    const script = document.createElement("script");
    script.id = "fb-pixel-script";
    script.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${fbPixelId}');fbq('track','PageView');`;
    document.head.appendChild(script);
  }, [fbPixelId]);

  useEffect(() => {
    const event_id = eid("page_view");
    // GTM dataLayer page_view (GA4 Configuration tag listens for this)
    dlPush({
      event: "page_view",
      event_id,
      page_path: location.pathname,
      page_location: window.location.href,
      page_title: document.title,
    });
    if (gaId && (window as any).gtag) {
      (window as any).gtag("config", gaId, { page_path: location.pathname });
    }
    if (fbPixelId && (window as any).fbq) {
      (window as any).fbq("track", "PageView", {}, { eventID: event_id });
    }
    // Server-side PageView (fires even when ad blockers strip pixel)
    serverTrack({
      event_name: "page_view", event_id,
      params: { page_path: location.pathname, page_location: window.location.href, page_title: document.title },
    });
  }, [location.pathname, gaId, fbPixelId]);

  return null;
};

export default AnalyticsTracker;
