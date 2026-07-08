/**
 * bot-prerender — returns crawler-ready HTML for a given site path.
 *
 * Why this exists:
 *   The main site is a Vite SPA. Text-only crawlers (LinkedIn, Facebook,
 *   Slack, WhatsApp, Ahrefs, ChatGPT/Perplexity fetchers) do not execute
 *   JavaScript, so they see only the empty `<div id="root">` shell and can't
 *   extract product name/price/description. This function renders the same
 *   route's data as static HTML on the server so those crawlers get the full
 *   text + JSON-LD.
 *
 * How to use:
 *   GET .../functions/v1/bot-prerender?path=/product/<slug-or-id>
 *   GET .../functions/v1/bot-prerender?path=/shop?category=Abaya
 *   GET .../functions/v1/bot-prerender?path=/blog/<slug>
 *   GET .../functions/v1/bot-prerender?path=/                    (home)
 *
 *   Also accepts the raw path in the URL after the function name, e.g.
 *   .../functions/v1/bot-prerender/product/abaya-123
 *
 * Bot detection: if the caller's User-Agent is a known bot OR the
 *   `?force=1` query param is present, HTML is served. Otherwise the
 *   function 302-redirects to the real SPA URL so accidental human visits
 *   don't get a bare page.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SITE_URL = "https://dubaiborkahouse.com";
const SITE_NAME = "Dubai Borka House";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── helpers ────────────────────────────────────────────────────────────────
const escapeHtml = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const isBot = (ua: string): boolean =>
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|linkedin|twitterbot|slackbot|discordbot|telegrambot|embedly|quora link preview|showyoubot|outbrain|pinterest|developers\.google\.com\/\+\/web\/snippet|chatgpt|perplexity|claude|gpt|anthropic|openai|ahrefs|semrush|screaming frog|applebot/i.test(ua);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function absoluteImage(u: string | null | undefined): string {
  if (!u) return `${SITE_URL}/og-image.jpg`;
  if (/^https?:\/\//i.test(u)) return u;
  return `${SITE_URL}${u.startsWith("/") ? "" : "/"}${u}`;
}

// Build response headers that GUARANTEE Content-Type: text/html — spreading
// `corsHeaders` from @supabase/supabase-js@2/cors leaves a `Content-Type:
// text/plain` default that keeps winning even after `.set(...)` due to how
// its internal init interacts with the Response constructor. Bypass it by
// hand-authoring the CORS + cache + type headers here.
function htmlHeaders(cacheControl = "public, max-age=300, s-maxage=1800"): HeadersInit {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": cacheControl,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}
function textHeaders(): HeadersInit {
  return {
    "content-type": "text/plain; charset=utf-8",
    "access-control-allow-origin": "*",
  };
}

// ── page renderers ─────────────────────────────────────────────────────────
function shell({ title, description, canonical, ogImage, body, jsonLd }: {
  title: string; description: string; canonical: string; ogImage: string;
  body: string; jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}): string {
  const ld = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";
  return `<!doctype html>
<html lang="bn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
<meta name="robots" content="index,follow,max-image-preview:large">
${ld}
</head>
<body>
<header><a href="${SITE_URL}/">${SITE_NAME}</a></header>
<main>${body}</main>
<footer><p>Cash on Delivery বাংলাদেশে সর্বত্র · 3-day return · Contact: +880-1845-853634</p></footer>
</body>
</html>`;
}

async function renderProduct(idOrSlug: string): Promise<Response> {
  // PostgREST rejects `id.eq.<non-uuid>` with 400, which causes the whole
  // `.or(...)` filter to error out and return null. Only include id.eq when
  // the argument is a valid UUID.
  const cols = "id,name,description,price,sale_price,stock,category,image_url,slug,sizes,colors,material";
  const q = supabase.from("products").select(cols);
  const { data: p } = UUID_RE.test(idOrSlug)
    ? await q.or(`slug.eq.${idOrSlug},id.eq.${idOrSlug}`).maybeSingle()
    : await q.eq("slug", idOrSlug).maybeSingle();

  if (!p) return new Response("Product not found", { status: 404, headers: textHeaders() });

  const price = p.sale_price ?? p.price;
  const canonical = `${SITE_URL}/product/${p.slug || p.id}`;
  const availability = (p.stock ?? 0) > 0 ? "InStock" : "OutOfStock";
  const title = `${p.name} – ${p.category || "Islamic Fashion"} – ৳${price} | ${SITE_NAME}`;
  const description = (p.description || `${p.name} — কিনুন ${SITE_NAME} থেকে। প্রিমিয়াম ${p.category || "ফ্যাশন"}, মূল্য ৳${price}, Cash on Delivery।`).slice(0, 160);

  const body = `
<article>
  <h1>${escapeHtml(p.name)}</h1>
  <img src="${escapeHtml(absoluteImage(p.image_url))}" alt="${escapeHtml(p.name)}" width="600">
  <dl>
    <dt>Price</dt><dd><strong>৳${price}</strong>${p.sale_price ? ` <s>৳${p.price}</s>` : ""}</dd>
    <dt>Availability</dt><dd>${availability === "InStock" ? "In Stock" : "Out of Stock"}${p.stock != null ? ` (${p.stock})` : ""}</dd>
    <dt>Category</dt><dd>${escapeHtml(p.category || "")}</dd>
    ${p.sizes?.length ? `<dt>Sizes</dt><dd>${escapeHtml(p.sizes.join(", "))}</dd>` : ""}
    ${p.colors?.length ? `<dt>Colors</dt><dd>${escapeHtml(p.colors.join(", "))}</dd>` : ""}
    ${p.material ? `<dt>Material</dt><dd>${escapeHtml(p.material)}</dd>` : ""}
    ${p.sku ? `<dt>SKU</dt><dd>${escapeHtml(p.sku)}</dd>` : ""}
    <dt>Brand</dt><dd>${SITE_NAME}</dd>
  </dl>
  <section><h2>Description</h2><p>${escapeHtml(p.description || "").replace(/\n/g, "<br>")}</p></section>
  <section><h2>Delivery</h2><p>Cash on Delivery সারা বাংলাদেশে · Dhaka 1 দিন, Outside Dhaka 2–3 দিন · Shipping ৳80 থেকে।</p></section>
  <section><h2>Return Policy</h2><p>3 দিনের ভেতর free return / exchange, condition intact থাকলে।</p></section>
  <p><a href="${canonical}">View full product page →</a></p>
</article>`;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description || `${p.name} — ${SITE_NAME}`,
    image: absoluteImage(p.image_url),
    sku: p.sku || p.id,
    category: p.category,
    brand: { "@type": "Brand", name: SITE_NAME },
    ...(p.material ? { material: p.material } : {}),
    ...(p.colors?.length ? { color: p.colors.join(", ") } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "BDT",
      price,
      url: canonical,
      availability: `https://schema.org/${availability}`,
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: SITE_NAME },
      ...(p.sale_price ? { priceValidUntil: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0] } : {}),
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: "80", currency: "BDT" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "BD" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
          transitTime:  { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "BD",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 3,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      },
    },
  };

  return new Response(
    shell({ title, description, canonical, ogImage: absoluteImage(p.image_url), body, jsonLd }),
    { headers: htmlHeaders("public, max-age=300, s-maxage=600") },
  );
}

async function renderCategoryOrShop(category: string | null): Promise<Response> {
  let q = supabase.from("products").select("id,name,price,sale_price,stock,image_url,slug,category").gt("stock", 0).order("created_at", { ascending: false }).limit(60);
  if (category) q = q.eq("category", category);
  const { data: rows } = await q;

  const title = category
    ? `${category} Collection – Dubai Imported ${category} in Bangladesh | ${SITE_NAME}`
    : `Shop – Dubai Imported Abaya, Borka & Hijab Collection Bangladesh | ${SITE_NAME}`;
  const description = category
    ? `Premium Dubai imported ${category} collection — Cash on Delivery সারা বাংলাদেশে। ${rows?.length || 0}+ products available.`
    : `${SITE_NAME}-এর সম্পূর্ণ শপ — আবায়া, বোরকা, হিজাব, কাফতান কালেকশন। ${rows?.length || 0}+ products।`;
  const canonical = category ? `${SITE_URL}/shop?category=${encodeURIComponent(category)}` : `${SITE_URL}/shop`;

  const body = `
<h1>${escapeHtml(category ? `${category} Collection` : "Shop All Products")}</h1>
<p>${escapeHtml(description)}</p>
<ul>
${(rows || []).map(r => `  <li><a href="${SITE_URL}/product/${r.slug || r.id}">${escapeHtml(r.name)}</a> — ৳${r.sale_price ?? r.price}${(r.stock ?? 0) > 0 ? "" : " (Out of Stock)"}</li>`).join("\n")}
</ul>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: canonical,
    description,
    numberOfItems: rows?.length || 0,
  };

  return new Response(
    shell({ title, description, canonical, ogImage: `${SITE_URL}/og-image.jpg`, body, jsonLd }),
    { headers: htmlHeaders("public, max-age=300, s-maxage=600") },
  );
}

async function renderBlogPost(slug: string): Promise<Response> {
  const { data: post } = await supabase.from("blog_posts").select("*").eq("slug", slug).maybeSingle();
  if (!post) return new Response("Post not found", { status: 404, headers: textHeaders() });

  const canonical = `${SITE_URL}/blog/${post.slug}`;
  const title = `${post.title} | ${SITE_NAME}`;
  const description = (post.excerpt || post.title).slice(0, 160);
  const body = `
<article>
  <h1>${escapeHtml(post.title)}</h1>
  ${post.featured_image ? `<img src="${escapeHtml(absoluteImage(post.featured_image))}" alt="${escapeHtml(post.title)}">` : ""}
  <div>${(post.content || "").toString()}</div>
</article>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description,
    image: absoluteImage(post.featured_image),
    url: canonical,
    datePublished: post.created_at,
    dateModified: post.updated_at,
    publisher: { "@type": "Organization", name: SITE_NAME, logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.jpg` } },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
  };

  return new Response(
    shell({ title, description, canonical, ogImage: absoluteImage(post.featured_image), body, jsonLd }),
    { headers: htmlHeaders("public, max-age=600, s-maxage=3600") },
  );
}

async function renderBlogIndex(): Promise<Response> {
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("title,slug,excerpt,image_url,author_name,published_at,created_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(30);

  const canonical = `${SITE_URL}/blog`;
  const title = `Blog — Abaya, Borka & Hijab Style Guide Bangladesh | ${SITE_NAME}`;
  const description = "Abaya, Borka ও Hijab styling, care ও Dubai fashion guide — Dubai Borka House-এর blog।";

  const items = (posts || []).map((p) => ({
    "@type": "BlogPosting",
    headline: p.title,
    url: `${SITE_URL}/blog/${p.slug}`,
    image: absoluteImage(p.image_url),
    datePublished: p.published_at || p.created_at,
    author: { "@type": "Person", name: p.author_name || SITE_NAME },
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${SITE_NAME} Blog`,
    url: canonical,
    description,
    publisher: { "@type": "Organization", name: SITE_NAME, logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.jpg` } },
    blogPost: items,
  };

  const body = `
<h1>${SITE_NAME} Blog</h1>
<p>${escapeHtml(description)}</p>
<ul>
${(posts || []).map((p) => `  <li><a href="${SITE_URL}/blog/${p.slug}">${escapeHtml(p.title)}</a>${p.excerpt ? ` — ${escapeHtml(p.excerpt.slice(0, 140))}` : ""}</li>`).join("\n")}
</ul>`;

  return new Response(
    shell({ title, description, canonical, ogImage: `${SITE_URL}/og-image.jpg`, body, jsonLd }),
    { headers: htmlHeaders("public, max-age=600, s-maxage=3600") },
  );
}

async function renderHome(): Promise<Response> {
  const title = `${SITE_NAME} – Premium Dubai Imported Borka, Abaya & Hijab in Bangladesh`;
  const description = "Bangladesh-এর সেরা প্রিমিয়াম দুবাই ইম্পোর্টেড বোরকা, আবায়া, হিজাব ও কাফতান শপ। Cash on Delivery, সারা দেশে দ্রুত ডেলিভারি।";
  const canonical = `${SITE_URL}/`;

  const { data: featured } = await supabase
    .from("products")
    .select("id,name,price,sale_price,image_url,slug,stock")
    .gt("stock", 0)
    .order("created_at", { ascending: false })
    .limit(24);

  const productListItems = (featured || []).map((p, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: `${SITE_URL}/product/${p.slug || p.id}`,
    name: p.name,
    image: absoluteImage(p.image_url),
  }));

  // Emit BOTH schemas as an array — WebSite (with SearchAction) + CollectionPage
  // wrapping an ItemList of featured products.
  const jsonLd: Array<Record<string, unknown>> = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: canonical,
      description,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/shop?search={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      url: canonical,
      description,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: canonical },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: productListItems.length,
        itemListElement: productListItems,
      },
    },
  ];

  const body = `
<h1>${SITE_NAME}</h1>
<p>${escapeHtml(description)}</p>
<nav>
  <ul>
    <li><a href="${SITE_URL}/shop?category=Abaya">Abaya Collection</a></li>
    <li><a href="${SITE_URL}/shop?category=Borka">Borka Collection</a></li>
    <li><a href="${SITE_URL}/shop?category=Hijab">Hijab Collection</a></li>
    <li><a href="${SITE_URL}/shop?category=Kaftan">Kaftan Collection</a></li>
    <li><a href="${SITE_URL}/blog">Blog</a></li>
  </ul>
</nav>
<section>
  <h2>Featured Products</h2>
  <ul>
${(featured || []).map((p) => `    <li><a href="${SITE_URL}/product/${p.slug || p.id}">${escapeHtml(p.name)}</a> — ৳${p.sale_price ?? p.price}</li>`).join("\n")}
  </ul>
</section>`;

  return new Response(
    shell({ title, description, canonical, ogImage: `${SITE_URL}/og-image.jpg`, body, jsonLd }),
    { headers: htmlHeaders("public, max-age=600, s-maxage=1800") },
  );
}

// ── entrypoint ─────────────────────────────────────────────────────────────
// Wrap every response with a fresh Response that reuses the body + status but
// hard-sets Content-Type. The Supabase edge gateway appears to keep whatever
// text/plain default the runtime chose otherwise, even when the renderer
// itself supplied text/html.
function reheader(res: Response): Response {
  const status = res.status;
  const isHtml = status === 200; // renderers only emit 200 for HTML
  const headers = new Headers(res.headers);
  headers.set("content-type", isHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  return new Response(res.body, { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const ua = req.headers.get("user-agent") || "";
  const force = url.searchParams.get("force") === "1";

  let path = url.searchParams.get("path") || "";
  if (!path) {
    const m = url.pathname.match(/\/bot-prerender(\/.*)?$/);
    path = m?.[1] || "/";
  }
  if (!path.startsWith("/")) path = "/" + path;

  if (!force && !isBot(ua)) {
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: `${SITE_URL}${path}` } });
  }

  try {
    const productMatch = path.match(/^\/(?:product|p)\/(?:show\/)?([^/?]+)/);
    if (productMatch) return reheader(await renderProduct(decodeURIComponent(productMatch[1])));

    const blogMatch = path.match(/^\/blog\/([^/?]+)/);
    if (blogMatch) return reheader(await renderBlogPost(decodeURIComponent(blogMatch[1])));

    if (path.startsWith("/shop") || path.startsWith("/categor")) {
      const cat = new URL(`${SITE_URL}${path}`).searchParams.get("category");
      return reheader(await renderCategoryOrShop(cat));
    }

    return reheader(renderHome());
  } catch (err) {
    console.error("bot-prerender error:", err);
    return new Response(`Prerender error: ${err instanceof Error ? err.message : String(err)}`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }
});
