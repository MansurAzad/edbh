// Thin per-event wrappers. Each one only builds payload and delegates to
// fanout(). No more copy-pasted dataLayer/gtag/fbq/serverTrack blocks.
import { fanout } from "./core";
import { dedupKey } from "./dedup";
import type { ServerTrackUserData } from "@/lib/server-tracking";

type Product = { id: string; name: string; price: number; category?: string };
type CartItem = { id: string; name: string; price: number; quantity: number };

export function trackAddToCart(p: Product & { category: string }, quantity: number) {
  const value = p.price * quantity;
  const items = [{ item_id: p.id, item_name: p.name, item_category: p.category, price: p.price, quantity }];
  fanout({
    event: "add_to_cart",
    event_id: dedupKey("add_to_cart", `${p.id}-${quantity}`),
    ecommerce: { currency: "BDT", value, items },
    fb: { name: "AddToCart", params: { content_ids: [p.id], content_name: p.name, content_type: "product", value, currency: "BDT" } },
    capi: { name: "add_to_cart", params: {
      currency: "BDT", value,
      content_ids: [p.id], content_name: p.name, content_type: "product",
      contents: [{ id: p.id, quantity, item_price: p.price }],
    }},
  });
}

export function trackPurchase(
  orderId: string,
  total: number,
  items: CartItem[],
  userData?: ServerTrackUserData,
) {
  const gaItems = items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity }));
  fanout({
    event: "purchase",
    event_id: `purchase-${orderId}`,
    user_data: userData,
    ecommerce: { transaction_id: orderId, currency: "BDT", value: total, items: gaItems },
    fb: { name: "Purchase", params: {
      content_ids: items.map(i => i.id), content_type: "product",
      value: total, currency: "BDT", num_items: items.length,
    }},
    capi: {
      name: "purchase",
      user_data: { ...userData, external_id: orderId },
      params: {
        currency: "BDT", value: total, transaction_id: orderId,
        content_ids: items.map(i => i.id), content_type: "product",
        contents: items.map(i => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
        num_items: items.reduce((s, i) => s + i.quantity, 0),
      },
    },
  });
}

export function trackViewContent(p: Product & { category: string }) {
  const items = [{ item_id: p.id, item_name: p.name, item_category: p.category, price: p.price }];
  fanout({
    event: "view_item",
    event_id: dedupKey("view_item", p.id),
    ecommerce: { currency: "BDT", value: p.price, items },
    fb: { name: "ViewContent", params: {
      content_ids: [p.id], content_name: p.name, content_type: "product",
      value: p.price, currency: "BDT",
    }},
    capi: { name: "view_item", params: {
      currency: "BDT", value: p.price,
      content_ids: [p.id], content_name: p.name, content_category: p.category, content_type: "product",
    }},
  });
}

export function trackInitiateCheckout(
  total: number,
  items: CartItem[],
  userData?: ServerTrackUserData,
) {
  const idsKey = items.map(i => i.id).sort().join("_").slice(0, 32);
  const gaItems = items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity }));
  const num_items = items.reduce((s, i) => s + i.quantity, 0);
  fanout({
    event: "begin_checkout",
    event_id: dedupKey("begin_checkout", idsKey),
    user_data: userData,
    ecommerce: { currency: "BDT", value: total, items: gaItems },
    fb: { name: "InitiateCheckout", params: {
      content_ids: items.map(i => i.id), content_type: "product",
      value: total, currency: "BDT", num_items,
    }},
    capi: { name: "begin_checkout", user_data: userData, params: {
      currency: "BDT", value: total,
      content_ids: items.map(i => i.id), content_type: "product",
      contents: items.map(i => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
      num_items,
    }},
  });
}

export function trackSearch(query: string) {
  fanout({
    event: "search",
    event_id: dedupKey("search", query.slice(0, 24)),
    dl: { search_term: query },
    ga: { search_term: query },
    fb: { name: "Search", params: { search_string: query } },
    capi: { name: "search", params: { search_string: query } },
  });
}

export function trackAddToWishlist(p: Product) {
  const items = [{ item_id: p.id, item_name: p.name, price: p.price }];
  fanout({
    event: "add_to_wishlist",
    event_id: dedupKey("add_to_wishlist", p.id),
    ecommerce: { currency: "BDT", value: p.price, items },
    fb: { name: "AddToWishlist", params: {
      content_ids: [p.id], content_name: p.name, content_type: "product",
      value: p.price, currency: "BDT",
    }},
    capi: { name: "add_to_wishlist", params: {
      currency: "BDT", value: p.price,
      content_ids: [p.id], content_name: p.name, content_type: "product",
    }},
  });
}

export function trackLead(source: string = "newsletter", userData?: ServerTrackUserData) {
  fanout({
    event: "generate_lead",
    event_id: dedupKey("generate_lead", source),
    user_data: userData,
    dl: { method: source },
    ga: { method: source },
    fb: { name: "Lead", params: { content_name: source } },
    capi: { name: "generate_lead", user_data: userData, params: { content_name: source } },
  });
}

export function trackPageView(path: string, title: string, href: string) {
  fanout({
    event: "page_view",
    event_id: dedupKey("page_view", path.replace(/\//g, "_")),
    dl: { page_path: path, page_location: href, page_title: title },
    // Skip GA4 gtag('event', 'page_view') — GA4 config tag handles it automatically.
    ga: {},
    fb: { name: "PageView", params: {} },
    capi: { name: "page_view", params: { page_path: path, page_location: href, page_title: title } },
  });
}
