/**
 * Cloudflare Worker — bot-prerender proxy.
 *
 * Detects social/SEO crawler User-Agents and proxies /product, /shop,
 * /categories, /blog (and /) requests to the Supabase bot-prerender edge
 * function, returning fully server-rendered HTML with correct OG/Twitter/
 * JSON-LD tags. Human browsers hit the SPA directly (pass-through).
 *
 * ── Deploy ─────────────────────────────────────────────────────────────
 * 1. `npm i -g wrangler`
 * 2. Save this file as `src/worker.js` (or wherever your wrangler.toml points)
 * 3. wrangler.toml example:
 *
 *      name = "edbh-bot-prerender"
 *      main = "workers/bot-prerender-proxy.js"
 *      compatibility_date = "2025-01-01"
 *      routes = [
 *        { pattern = "edbh.lovable.app/*", zone_name = "lovable.app" }
 *      ]
 *      [vars]
 *      ORIGIN = "https://edbh.lovable.app"
 *      PRERENDER_ENDPOINT = "https://izeabmhtxtrelfqgkuua.supabase.co/functions/v1/bot-prerender"
 *
 * 4. `wrangler deploy`
 *
 * NOTE: Lovable's *.lovable.app subdomains cannot be attached to a Cloudflare
 * Worker directly — this worker must run in front of a custom domain (e.g.
 * dubaiborkahouse.com) that CNAMEs to the Lovable site.
 * ───────────────────────────────────────────────────────────────────────
 */

const BOT_UA = new RegExp(
  [
    "bot", "crawl", "spider", "slurp", "bingpreview",
    "facebookexternalhit", "facebot", "instagram",
    "whatsapp", "linkedinbot", "twitterbot",
    "slackbot", "discordbot", "telegrambot", "line-poker",
    "embedly", "quora link preview", "pinterestbot",
    "chatgpt-user", "gptbot", "oai-searchbot", "perplexitybot",
    "claudebot", "anthropic-ai", "google-extended", "applebot",
    "ahrefs", "semrush", "screaming frog", "mj12bot", "yandex",
  ].join("|"),
  "i"
);

// Paths we want to prerender. Everything else passes straight to origin.
const PRERENDER_PATHS = [
  /^\/$/,
  /^\/product(\/|$)/,
  /^\/shop(\/|\?|$)/,
  /^\/categories?(\/|\?|$)/,   // /category, /categories, /categories/abaya, /categories?foo=…
  /^\/category(\/|\?|$)/,
  /^\/blog(\/|\?|$)/,
];

function isBot(ua) {
  return !!ua && BOT_UA.test(ua);
}

function shouldPrerender(pathname) {
  return PRERENDER_PATHS.some((re) => re.test(pathname));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ua = request.headers.get("user-agent") || "";
    const origin = env.ORIGIN || "https://edbh.lovable.app";
    const prerender = env.PRERENDER_ENDPOINT || "https://izeabmhtxtrelfqgkuua.supabase.co/functions/v1/bot-prerender";

    // Static assets, admin, API — always pass through
    if (
      /\.(?:js|mjs|css|png|jpe?g|webp|avif|svg|ico|gif|mp4|webm|woff2?|ttf|txt|xml|json|map)$/i.test(url.pathname) ||
      url.pathname.startsWith("/admin") ||
      url.pathname.startsWith("/api")
    ) {
      return fetch(new Request(origin + url.pathname + url.search, request));
    }

    if (isBot(ua) && shouldPrerender(url.pathname)) {
      const target = new URL(prerender);
      target.searchParams.set("path", url.pathname + url.search);
      target.searchParams.set("force", "1");

      const cache = caches.default;
      const cacheKey = new Request(target.toString(), { method: "GET" });
      let cached = await cache.match(cacheKey);
      if (cached) return cached;

      // Request identity encoding: Supabase's gateway rewrites Content-Type
      // to `text/plain` on gzipped bodies, which trips some crawlers. Asking
      // for uncompressed responses keeps `text/html; charset=utf-8` intact.
      const upstream = await fetch(target.toString(), {
        headers: {
          "User-Agent": ua,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
        },
      });

      // Sniff HTML by body prefix — some gateway rewrites strip text/html
      // even when the body is real HTML.
      const bodyText = await upstream.text();
      const looksHtml = /^\s*<!doctype html/i.test(bodyText) ||
        (upstream.headers.get("content-type") || "").includes("text/html");

      if (upstream.ok && looksHtml) {
        const outHeaders = new Headers(upstream.headers);
        // Force the correct MIME on the crawler-facing response no matter
        // what the origin emitted, and drop stale encoding hints.
        outHeaders.set("Content-Type", "text/html; charset=utf-8");
        outHeaders.delete("Content-Encoding");
        outHeaders.delete("Content-Length");
        outHeaders.set("Cache-Control", "public, max-age=300, s-maxage=1800");
        outHeaders.set("X-Prerender", "1");
        const out = new Response(bodyText, { status: upstream.status, headers: outHeaders });
        await cache.put(cacheKey, out.clone());
        return out;
      }

      // Prerender failed or returned non-HTML — fall through to origin so
      // the crawler still gets *something* instead of a broken response.
      return fetch(new Request(origin + url.pathname + url.search, request));
    }

    // Human — pass through to Lovable origin
    return fetch(new Request(origin + url.pathname + url.search, request));
  },
};
