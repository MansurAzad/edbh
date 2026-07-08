#!/usr/bin/env node
/**
 * bot-prerender smoke test.
 *
 * Hits the bot-prerender edge function with several bot User-Agents against
 * product / category / blog / home paths, then checks the returned HTML for
 * expected visible fields (name, price, stock, size, color, material) and
 * required <meta>/JSON-LD tags.
 *
 * Usage:
 *   node scripts/prerender-smoke-test.mjs
 *   node scripts/prerender-smoke-test.mjs --base https://izeabmhtxtrelfqgkuua.supabase.co
 *   node scripts/prerender-smoke-test.mjs --path /product/show/abaya-ibis-pink-1132
 *
 * Exit code = number of failed checks (0 = success).
 */

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) =>
    a.startsWith("--") ? [[a.slice(2), arr[i + 1] ?? true]] : []
  )
);

const BASE = args.base || "https://izeabmhtxtrelfqgkuua.supabase.co";
const ENDPOINT = `${BASE}/functions/v1/bot-prerender`;

const USER_AGENTS = {
  Googlebot:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  facebookexternalhit:
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  LinkedInBot:
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  Twitterbot: "Twitterbot/1.0",
  WhatsApp: "WhatsApp/2.23.20.79 A",
  Slackbot: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  ChatGPTUser: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) ChatGPT-User/1.0",
  PerplexityBot: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/bot)",
};

const PATHS = args.path
  ? [args.path]
  : [
      "/",
      "/shop?category=Abaya",
      "/product/show/abaya-ibis-pink-1132",
      "/blog",
    ];

// -- helpers --------------------------------------------------------------
const strip = (s) => s.replace(/\s+/g, " ").trim();
const has = (html, needle) => html.toLowerCase().includes(needle.toLowerCase());
const hasRe = (html, re) => re.test(html);

function checkCommonHead(html) {
  const c = [];
  c.push(["<title>", /<title>[^<]{5,}<\/title>/i.test(html)]);
  c.push(['meta description', /<meta[^>]+name=["']description["'][^>]*content=["'][^"']{10,}/i.test(html)]);
  c.push(["canonical", /<link[^>]+rel=["']canonical["']/i.test(html)]);
  c.push(["og:title", /<meta[^>]+property=["']og:title["']/i.test(html)]);
  c.push(["og:image", /<meta[^>]+property=["']og:image["']/i.test(html)]);
  c.push(["twitter:card", /<meta[^>]+name=["']twitter:card["']/i.test(html)]);
  c.push(["JSON-LD", /<script[^>]+type=["']application\/ld\+json["']/i.test(html)]);
  return c;
}

function checkProduct(html) {
  const c = [];
  c.push(["Product JSON-LD", /"@type"\s*:\s*"Product"/.test(html)]);
  c.push(["offers.price", /"price"\s*:\s*"?\d+/.test(html)]);
  c.push(["availability", /InStock|OutOfStock|PreOrder/.test(html)]);
  c.push(["visible price ৳/BDT", /৳|BDT|Tk\.?/i.test(html)]);
  c.push(["stock text", /stock|in stock|out of stock|স্টক/i.test(html)]);
  c.push(["size mentioned", /size|সাইজ/i.test(html)]);
  c.push(["color mentioned", /color|colou?r|রঙ/i.test(html)]);
  c.push(["material/fabric mentioned", /material|fabric|কাপড়|ফেব্রিক/i.test(html)]);
  c.push(["description block", /<p[^>]*>[^<]{20,}/i.test(html)]);
  return c;
}

function checkCategoryOrHome(html) {
  return [
    ["CollectionPage or WebSite JSON-LD", /"@type"\s*:\s*"(CollectionPage|WebSite|ItemList)"/.test(html)],
    ["product links present", /\/product\/(show\/)?[^"'\s]+/.test(html)],
  ];
}

function checkBlog(html) {
  return [
    ["Article or Blog JSON-LD", /"@type"\s*:\s*"(Article|BlogPosting|Blog)"/.test(html)],
    ["blog post link/title", /\/blog\/|blog|blogposting/i.test(html)],
  ];
}

function pathKind(p) {
  if (p.startsWith("/product")) return "product";
  if (p.startsWith("/blog")) return "blog";
  if (p === "/" || p.startsWith("/shop") || p.startsWith("/categories")) return "category";
  return "other";
}

// -- runner ---------------------------------------------------------------
const results = [];
let failed = 0;

for (const path of PATHS) {
  for (const [uaName, ua] of Object.entries(USER_AGENTS)) {
    const url = `${ENDPOINT}?path=${encodeURIComponent(path)}`;
    const rowHeader = `[${uaName}] ${path}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": ua } });
      const html = await res.text();
      const kind = pathKind(path);
      const checks = [
        ["status 200", res.status === 200],
        ["content-type html", (res.headers.get("content-type") || "").includes("text/html")],
        ["body length > 500", html.length > 500],
        ...checkCommonHead(html),
        ...(kind === "product" ? checkProduct(html) : []),
        ...(kind === "category" ? checkCategoryOrHome(html) : []),
        ...(kind === "blog" ? checkBlog(html) : []),
      ];
      const passed = checks.filter(([, ok]) => ok).length;
      const total = checks.length;
      const fails = checks.filter(([, ok]) => !ok).map(([n]) => n);
      failed += fails.length;

      console.log(
        `${fails.length === 0 ? "✅" : "❌"} ${rowHeader}  ${passed}/${total}` +
          (fails.length ? `  missing: ${fails.join(", ")}` : "")
      );
      results.push({ path, ua: uaName, status: res.status, passed, total, fails });
    } catch (e) {
      console.log(`💥 ${rowHeader}  ${e.message}`);
      failed++;
      results.push({ path, ua: uaName, error: e.message });
    }
  }
}

console.log("\n──────────── SUMMARY ────────────");
console.log(`total failed checks: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
