// ============= Full file contents =============

/**
 * @file events.ts
 * @module lib/tracking/events
 *
 * @description
 * Thin, per-event wrapper functions. Each function builds the minimum required
 * payload for GA4, Meta Pixel, and Meta CAPI, then delegates to {@link fanout}
 * which broadcasts to all three channels simultaneously.
 *
 * **Design rule** — no more copy-pasted `dataLayer`/`gtag`/`fbq`/`serverTrack`
 * blocks scattered across components. Every tracking call goes through one of
 * these wrappers so payload shape is consistent and easy to audit.
 *
 * **Currency** — all monetary values are in BDT (Bangladeshi Taka) by default
 * because this storefront is Bangladesh-focused.
 *
 * ---
 * বাংলা টীকা:
 * এই ফাইলটি প্রতিটি ইভেন্টের জন্য আলাদা র‍্যাপার ফাংশন ধারণ করে।
 * প্রতিটি ফাংশন পেলোড তৈরি করে `fanout()`-এ পাঠায় যা GA4, মেটা পিক্সেল
 * এবং সার্ভার CAPI — তিনটি চ্যানেলে একসাথে পাঠায়।
 * সব মুদ্রামান BDT (বাংলাদেশি টাকা)-তে।
 */

// Thin per-event wrappers. Each one only builds payload and delegates to
// fanout(). No more copy-pasted dataLayer/gtag/fbq/serverTrack blocks.
import { fanout } from "./core";
import { dedupKey } from "./dedup";
import type { ServerTrackUserData } from "@/lib/server-tracking";

/**
 * A single catalogue product as required by ecommerce tracking payloads.
 *
 * @property {string} id       - Unique product / SKU identifier.
 * @property {string} name     - Human-readable product name shown in reports.
 * @property {number} price    - Unit price in BDT.
 * @property {string} [category] - Optional product category (used in GA4 item lists).
 *
 * বাংলা: একটি পণ্যের তথ্য। আইডি, নাম, দাম (BDT) এবং ক্যাটাগরি।
 */
type Product = { id: string; name: string; price: number; category?: string };

/**
 * A product line-item inside a cart or order.
 * Extends {@link Product} concepts with a quantity field.
 *
 * @property {string} id       - Product / SKU identifier.
 * @property {string} name     - Product name.
 * @property {number} price    - Unit price in BDT.
 * @property {number} quantity - Number of units in the cart / order.
 *
 * বাংলা: কার্ট বা অর্ডারের মধ্যে একটি পণ্যের তথ্য, পরিমাণসহ।
 */
type CartItem = { id: string; name: string; price: number; quantity: number };

/**
 * Fires an `add_to_cart` event across all tracking channels.
 *
 * Channels covered:
 * - **GA4** — `ecommerce` item array with `item_id`, `item_name`, `item_category`.
 * - **Meta Pixel** — `AddToCart` standard event.
 * - **Meta CAPI** — `add_to_cart` server event with `contents` array.
 *
 * The `event_id` is keyed on `productId-quantity` so adding different quantities
 * of the same product to the cart generates distinct ids (each is a distinct action).
 *
 * @param {Product & { category: string }} p - The product being added to cart.
 *   `category` is required (not optional) because Meta Pixel expects it.
 * @param {number} quantity - Number of units being added.
 *
 * @example
 * trackAddToCart({ id: "p42", name: "Saree", price: 1200, category: "Clothing" }, 2);
 *
 * বাংলা: কার্টে পণ্য যোগ করার ইভেন্ট। GA4, মেটা পিক্সেল ও CAPI-তে পাঠায়।
 * ইভেন্ট আইডি পণ্য আইডি ও পরিমাণের সমন্বয়ে তৈরি।
 */
export function trackAddToCart(p: Product & { category: string }, quantity: number) {
  // Total value = unit price × quantity, used by both GA4 and Meta.
  // বাংলা: মোট মূল্য = একক মূল্য × পরিমাণ।
  const value = p.price * quantity;

  // GA4 `items` array — one entry per product line-item.
  // বাংলা: GA4-এর জন্য আইটেম অ্যারে।
  const items = [{ item_id: p.id, item_name: p.name, item_category: p.category, price: p.price, quantity }];

  fanout({
    event: "add_to_cart",
    // Keyed on product + quantity so repeat add-to-cart actions each get their own id.
    // বাংলা: পণ্য আইডি ও পরিমাণ দিয়ে ইউনিক ইভেন্ট আইডি তৈরি।
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

/**
 * Fires a `purchase` event across all tracking channels.
 *
 * Channels covered:
 * - **GA4** — `ecommerce` object with `transaction_id`, full items array.
 * - **Meta Pixel** — `Purchase` standard event.
 * - **Meta CAPI** — `purchase` server event; `external_id` is set to `orderId`
 *   for server-side identity matching.
 *
 * Unlike other events, purchase uses a **hard-coded** `event_id` of
 * `"purchase-{orderId}"` rather than `dedupKey()` because the order id itself
 * is already globally unique and must survive beyond a single browser session
 * (e.g. server re-sends via CAPI webhook after payment confirmation).
 *
 * @param {string} orderId - Unique order / transaction identifier.
 * @param {number} total   - Grand total in BDT.
 * @param {CartItem[]} items - Ordered line-items.
 * @param {ServerTrackUserData} [userData] - Optional hashed PII forwarded to
 *   CAPI for enhanced match (phone, email, name, etc.).
 *
 * @example
 * trackPurchase("ORD-9001", 3600, cartItems, { em: hashedEmail, ph: hashedPhone });
 *
 * বাংলা: ক্রয় সম্পন্ন হওয়ার ইভেন্ট। অর্ডার আইডি দিয়ে ইউনিক ইভেন্ট আইডি তৈরি।
 * সার্ভার CAPI-তে ব্যবহারকারীর হ্যাশ করা তথ্যও পাঠানো যায়।
 */
const PURCHASE_FIRED_KEY = "sst_purchase_fired_v2";
// Synchronous in-memory guard so back-to-back calls in the same tick
// (StrictMode double invoke, rapid double-click) are blocked before the
// async localStorage read/write completes.
const purchaseFiredMemory = new Set<string>();

/** Persisted set of eventIds for which Purchase has already been fired. */
function purchaseAlreadyFired(eventId: string, orderId: string): boolean {
  if (purchaseFiredMemory.has(eventId) || purchaseFiredMemory.has(orderId)) return true;
  if (typeof window === "undefined" || !eventId) return false;
  try {
    const raw = localStorage.getItem(PURCHASE_FIRED_KEY) || "[]";
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) && (arr.includes(eventId) || arr.includes(orderId));
  } catch { return false; }
}
function markPurchaseFired(eventId: string, orderId: string) {
  purchaseFiredMemory.add(eventId);
  purchaseFiredMemory.add(orderId);
  if (typeof window === "undefined" || !eventId) return;
  try {
    const raw = localStorage.getItem(PURCHASE_FIRED_KEY) || "[]";
    const arr = JSON.parse(raw) as string[];
    const next = Array.isArray(arr) ? arr : [];
    for (const k of [eventId, orderId]) if (k && !next.includes(k)) next.push(k);
    // Cap at 200 most-recent keys to keep localStorage bounded.
    while (next.length > 200) next.shift();
    localStorage.setItem(PURCHASE_FIRED_KEY, JSON.stringify(next));
  } catch { /* private mode / quota — degrade to non-persistent */ }
}
/** Test-only reset helper. */
export function __resetPurchaseIdempotencyForTests() {
  purchaseFiredMemory.clear();
  try { localStorage.removeItem(PURCHASE_FIRED_KEY); } catch { /* noop */ }
}

export function trackPurchase(
  orderId: string,
  total: number,
  items: CartItem[],
  userData?: ServerTrackUserData,
) {
  const eventId = `purchase-${orderId}`;
  // Idempotency: guard on both event_id and orderId so component remounts,
  // StrictMode double renders, revisits to /order-success, and rapid double-
  // clicks all no-op after the first successful call.
  // বাংলা: একই event_id / orderId-এর জন্য Purchase একবারই fire করবে।
  if (purchaseAlreadyFired(eventId, orderId)) {
    if (typeof console !== "undefined") {
      console.info("[tracking] Purchase already fired for", eventId, "— skipping duplicate");
    }
    return;
  }
  markPurchaseFired(eventId, orderId);

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

/**
 * Fires a `view_item` event when a visitor lands on a product detail page.
 *
 * Channels covered:
 * - **GA4** — `ecommerce` with single-item array.
 * - **Meta Pixel** — `ViewContent` standard event.
 * - **Meta CAPI** — `view_item` server event.
 *
 * @param {Product & { category: string }} p - The product currently being viewed.
 *   `category` is mandatory for Meta's content categorisation.
 *
 * @example
 * trackViewContent({ id: "p99", name: "Katan Saree", price: 4500, category: "Saree" });
 *
 * বাংলা: পণ্যের বিস্তারিত পেজ দেখার ইভেন্ট।
 * GA4, পিক্সেল ও CAPI-তে পণ্যের তথ্য পাঠায়।
 */
export function trackViewContent(p: Product & { category: string }) {
  // Single-item array — GA4 item list requires an array even for one product.
  // বাংলা: একটি পণ্যের জন্যও GA4 অ্যারে প্রয়োজন।
  const items = [{ item_id: p.id, item_name: p.name, item_category: p.category, price: p.price }];

  fanout({
    event: "view_item",
    // Keyed on product id — same product page always shares one id per session.
    // বাংলা: একই পণ্য পেজের জন্য সেশনে একটিই আইডি থাকে।
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

/**
 * Fires a `begin_checkout` event when the user initiates the checkout flow.
 *
 * Channels covered:
 * - **GA4** — `ecommerce` with full items array.
 * - **Meta Pixel** — `InitiateCheckout` standard event.
 * - **Meta CAPI** — `begin_checkout` server event with `contents` array.
 *
 * The dedup key is derived from the **sorted** list of product ids so the same
 * cart always generates the same key regardless of item insertion order.
 *
 * @param {number} total            - Cart grand total in BDT.
 * @param {CartItem[]} items        - All line-items currently in the cart.
 * @param {ServerTrackUserData} [userData] - Optional hashed PII for CAPI enhanced match.
 *
 * @example
 * trackInitiateCheckout(7200, cartItems, { em: hashedEmail });
 *
 * বাংলা: চেকআউট শুরু করার ইভেন্ট।
 * কার্টের সব পণ্য আইডি সাজিয়ে (sort) ডিডুপ কী তৈরি করা হয়।
 */
export function trackInitiateCheckout(
  total: number,
  items: CartItem[],
  userData?: ServerTrackUserData,
) {
  // Sort ids so cart order doesn't affect the dedup key.
  // Truncate to 32 chars to stay within sessionStorage key length budget.
  // বাংলা: আইডি সাজিয়ে এবং ৩২ অক্ষরে কেটে ডিডুপ কী তৈরি।
  const idsKey = items.map(i => i.id).sort().join("_").slice(0, 32);

  const gaItems = items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity }));

  // Sum all quantities for Meta's `num_items` field.
  // বাংলা: Meta-র `num_items`-এর জন্য সব পরিমাণের যোগফল।
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

/**
 * Fires a `search` event when the user submits a search query.
 *
 * Channels covered:
 * - **GA4** — `search` event with `search_term` parameter.
 * - **GTM dataLayer** — `dl.search_term` passthrough.
 * - **Meta Pixel** — `Search` standard event with `search_string`.
 * - **Meta CAPI** — `search` server event.
 *
 * The query is truncated to 24 chars for the dedup key to keep stored ids small,
 * but the full query string is forwarded in all payload fields.
 *
 * @param {string} query - The raw search term entered by the user.
 *
 * @example
 * trackSearch("red banarasi saree");
 *
 * বাংলা: সার্চ ইভেন্ট। ব্যবহারকারীর সার্চ শব্দ GA4, GTM, পিক্সেল ও CAPI-তে পাঠায়।
 * ডিডুপ কী-র জন্য সার্চ শব্দ ২৪ অক্ষরে কাটা হয়।
 */
export function trackSearch(query: string) {
  fanout({
    event: "search",
    // Truncate to 24 chars for the key; full query still goes in params.
    // বাংলা: কী ২৪ অক্ষরে সীমাবদ্ধ, কিন্তু পেলোডে পুরো সার্চ শব্দ পাঠানো হয়।
    event_id: dedupKey("search", query.slice(0, 24)),
    dl: { search_term: query },
    ga: { search_term: query },
    fb: { name: "Search", params: { search_string: query } },
    capi: { name: "search", params: { search_string: query } },
  });
}

/**
 * Fires an `add_to_wishlist` event when the user saves a product.
 *
 * Channels covered:
 * - **GA4** — `ecommerce` with single-item array.
 * - **Meta Pixel** — `AddToWishlist` standard event.
 * - **Meta CAPI** — `add_to_wishlist` server event.
 *
 * @param {Product} p - The product being saved to the wishlist.
 *   `category` is optional here because Meta's `AddToWishlist` event does not
 *   require it (unlike `AddToCart`).
 *
 * @example
 * trackAddToWishlist({ id: "p7", name: "Silk Dupatta", price: 850 });
 *
 * বাংলা: পছন্দের তালিকায় পণ্য যোগ করার ইভেন্ট।
 * পণ্যের দাম BDT-তে পাঠানো হয়।
 */
export function trackAddToWishlist(p: Product) {
  // Single-item GA4 array.
  // বাংলা: GA4-এর জন্য একটি আইটেমের অ্যারে।
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

/**
 * Fires a `generate_lead` event when the user submits a lead capture form
 * (newsletter sign-up, contact form, etc.).
 *
 * Channels covered:
 * - **GA4** — `generate_lead` with `method` parameter identifying the form source.
 * - **GTM dataLayer** — `dl.method` passthrough.
 * - **Meta Pixel** — `Lead` standard event with `content_name` = source.
 * - **Meta CAPI** — `generate_lead` server event; includes hashed PII when available.
 *
 * @param {string} [source="newsletter"] - Identifies which form generated the lead.
 *   Examples: `"newsletter"`, `"contact"`, `"popup"`.
 * @param {ServerTrackUserData} [userData] - Optional hashed PII (email, phone) for
 *   CAPI enhanced match — particularly useful for lead quality scoring in Meta Ads.
 *
 * @example
 * trackLead("popup", { em: hashedEmail });
 *
 * বাংলা: লিড ক্যাপচার ফর্ম সাবমিটের ইভেন্ট।
 * উৎস (newsletter, contact ইত্যাদি) এবং ব্যবহারকারীর হ্যাশ তথ্য পাঠানো যায়।
 */
export function trackLead(source: string = "newsletter", userData?: ServerTrackUserData) {
  fanout({
    event: "generate_lead",
    // Keyed on the source name so each lead channel gets its own dedup id.
    // বাংলা: প্রতিটি ফর্ম সোর্সের জন্য আলাদা ডিডুপ আইডি।
    event_id: dedupKey("generate_lead", source),
    user_data: userData,
    dl: { method: source },
    ga: { method: source },
    fb: { name: "Lead", params: { content_name: source } },
    capi: { name: "generate_lead", user_data: userData, params: { content_name: source } },
  });
}

/**
 * Fires a `page_view` event on client-side route changes.
 *
 * Channels covered:
 * - **GTM dataLayer** — pushes `page_path`, `page_location`, `page_title` so
 *   GTM tags that rely on a custom `page_view` trigger are activated.
 * - **GA4 gtag** — intentionally **skipped** (`ga: {}`). GA4's own `config` tag
 *   fires `page_view` automatically on every `history` change; firing it again
 *   would double-count pageviews.
 * - **Meta Pixel** — `PageView` standard event (no custom parameters needed).
 * - **Meta CAPI** — `page_view` server event with full URL context.
 *
 * @param {string} path  - URL pathname (e.g. `/products/saree-123`).
 * @param {string} title - `document.title` at the time of the route change.
 * @param {string} href  - Full `window.location.href` (includes query string).
 *
 * @example
 * // Typically called inside a router `useEffect` or equivalent:
 * trackPageView(router.pathname, document.title, window.location.href);
 *
 * বাংলা: প্রতিটি পেজ লোড বা রুট পরিবর্তনের ইভেন্ট।
 * GA4 নিজেই পেজ ভিউ ট্র্যাক করে তাই GA4-এ আলাদা ইভেন্ট পাঠানো হয় না।
 * পিক্সেল ও CAPI-তে পেজের পথ ও শিরোনাম পাঠানো হয়।
 */
export function trackPageView(path: string, title: string, href: string) {
  fanout({
    event: "page_view",
    // Replace slashes with underscores to create a valid dedup key component.
    // বাংলা: পথের স্ল্যাশ আন্ডারস্কোরে পরিবর্তন করে ডিডুপ কী তৈরি।
    event_id: dedupKey("page_view", path.replace(/\//g, "_")),
    dl: { page_path: path, page_location: href, page_title: title },
    // Skip GA4 gtag('event', 'page_view') — GA4 config tag handles it automatically.
    // বাংলা: GA4 config ট্যাগ নিজেই page_view পাঠায়, তাই এখানে খালি রাখা হয়েছে।
    ga: {},
    fb: { name: "PageView", params: {} },
    capi: { name: "page_view", params: { page_path: path, page_location: href, page_title: title } },
  });
}

/**
 * Fires a Meta `Contact` standard event when the user initiates contact via
 * WhatsApp, Messenger, phone call, or the contact form. Meta recommends
 * `Contact` for messaging-app clicks and `Lead` for form submissions —
 * this wrapper handles the Contact side; use {@link trackLead} for forms.
 *
 * Channels covered:
 * - **GA4** — `contact` custom event with `method` parameter.
 * - **GTM dataLayer** — `dl.method` passthrough.
 * - **Meta Pixel** — `Contact` standard event.
 * - **Meta CAPI** — `contact` server event.
 *
 * @param {string} method - Which channel the user used: `"whatsapp"`, `"messenger"`,
 *   `"call"`, `"email"`, `"contact_form"`, etc.
 * @param {ServerTrackUserData} [userData] - Optional hashed PII for CAPI enhanced match.
 *
 * @example
 * trackContact("whatsapp");
 *
 * বাংলা: WhatsApp/Messenger/Call ক্লিকের ইভেন্ট। Meta `Contact` standard event
 * হিসেবে পাঠায় — ফর্ম সাবমিটের জন্য `trackLead` ব্যবহার করুন।
 */
export function trackContact(method: string, userData?: ServerTrackUserData) {
  fanout({
    event: "contact",
    event_id: dedupKey("contact", method),
    user_data: userData,
    dl: { method },
    ga: { method },
    fb: { name: "Contact", params: { content_name: method } },
    capi: { name: "contact", user_data: userData, params: { content_name: method } },
  });
}
