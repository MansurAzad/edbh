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
      "/categories/abaya",
      "/product/show/dubai-embroidery-borka",
      "/blog",
      "/faq",
    ];


// -- helpers --------------------------------------------------------------

// Extract every <script type="application/ld+json"> block and JSON.parse it.
function extractJsonLd(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const schemas = [];
  const errors = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) schemas.push(...parsed);
      else schemas.push(parsed);
    } catch (e) {
      errors.push(`JSON.parse failed: ${e.message} — snippet: ${raw.slice(0, 120)}…`);
    }
  }
  return { schemas, errors };
}

function collectTypes(node, out = new Set()) {
  if (!node) return out;
  if (Array.isArray(node)) { node.forEach((n) => collectTypes(n, out)); return out; }
  if (typeof node !== "object") return out;
  if (node["@type"]) {
    if (Array.isArray(node["@type"])) node["@type"].forEach((t) => out.add(t));
    else out.add(node["@type"]);
  }
  if (node["@graph"]) collectTypes(node["@graph"], out);
  Object.values(node).forEach((v) => { if (v && typeof v === "object") collectTypes(v, out); });
  return out;
}

function findByType(schemas, t) {
  const found = [];
  const walk = (n) => {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n !== "object") return;
    const nt = n["@type"];
    if (nt === t || (Array.isArray(nt) && nt.includes(t))) found.push(n);
    if (n["@graph"]) walk(n["@graph"]);
    Object.values(n).forEach((v) => { if (v && typeof v === "object") walk(v); });
  };
  schemas.forEach(walk);
  return found;
}

function validateJsonLd(schemas, parseErrors, kind) {
  const errs = [...parseErrors];
  const types = new Set();
  schemas.forEach((s) => collectTypes(s, types));

  if (kind === "product") {
    const products = findByType(schemas, "Product");
    if (products.length === 0) errs.push("Product schema not found");
    products.forEach((p, i) => {
      ["name", "image", "offers"].forEach((k) => { if (!p[k]) errs.push(`Product[${i}].${k} missing`); });
      const offers = p.offers;
      if (offers) {
        ["priceCurrency", "price", "availability"].forEach((k) => {
          if (offers[k] === undefined || offers[k] === null || offers[k] === "")
            errs.push(`Product[${i}].offers.${k} missing`);
        });
      }
    });
  }
  if (kind === "blog") {
    const arts = [
      ...findByType(schemas, "Article"),
      ...findByType(schemas, "BlogPosting"),
      ...findByType(schemas, "Blog"),
    ];
    if (arts.length === 0) errs.push("Article/BlogPosting/Blog schema not found");
  }
  if (kind === "category") {
    const has = ["CollectionPage", "ItemList", "WebSite"].some((t) => types.has(t));
    if (!has) errs.push("CollectionPage / ItemList / WebSite schema not found");
  }
  return { errors: errs, types: [...types] };
}

function snippetAround(html, needle, radius = 160) {
  const idx = html.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return null;
  return html.slice(Math.max(0, idx - radius), idx + needle.length + radius).replace(/\s+/g, " ");
}

function checkCommonHead(html) {
  return [
    ["<title>", /<title>[^<]{5,}<\/title>/i.test(html)],
    ["meta description", /<meta[^>]+name=["']description["'][^>]*content=["'][^"']{10,}/i.test(html)],
    ["canonical", /<link[^>]+rel=["']canonical["']/i.test(html)],
    ["og:title", /<meta[^>]+property=["']og:title["']/i.test(html)],
    ["og:description", /<meta[^>]+property=["']og:description["']/i.test(html)],
    ["og:image", /<meta[^>]+property=["']og:image["']/i.test(html)],
    ["og:url", /<meta[^>]+property=["']og:url["']/i.test(html)],
    ["og:type", /<meta[^>]+property=["']og:type["']/i.test(html)],
    ["twitter:card", /<meta[^>]+name=["']twitter:card["']/i.test(html)],
    ["twitter:title", /<meta[^>]+name=["']twitter:title["']/i.test(html)],
    ["JSON-LD", /<script[^>]+type=["']application\/ld\+json["']/i.test(html)],
  ];
}
function checkProduct(html) {
  return [
    ["visible price ৳/BDT/Tk", /৳|BDT|Tk\.?/i.test(html)],
    ["stock text", /stock|in stock|out of stock|স্টক/i.test(html)],
    ["size mentioned", /size|সাইজ/i.test(html)],
    ["color mentioned", /colou?r|রঙ/i.test(html)],
    ["material/fabric mentioned", /material|fabric|কাপড়|ফেব্রিক/i.test(html)],
    ["description block", /<p[^>]*>[^<]{20,}/i.test(html)],
  ];
}
function checkCategoryOrHome(html) {
  return [["product links present", /\/product\/(show\/)?[^"'\s]+/.test(html)]];
}
function checkBlog(html) {
  return [["blog link/title", /\/blog\/|blog|blogposting/i.test(html)]];
}

function pathKind(p) {
  if (p.startsWith("/product")) return "product";
  if (p.startsWith("/blog")) return "blog";
  if (p === "/" || p.startsWith("/shop") || p.startsWith("/categor")) return "category";
  return "other";
}

// -- runner ---------------------------------------------------------------
const results = [];
let failed = 0;
const missingSnippets = [];

for (const path of PATHS) {
  for (const [uaName, ua] of Object.entries(USER_AGENTS)) {
    const url = `${ENDPOINT}?path=${encodeURIComponent(path)}`;
    const rowHeader = `[${uaName}] ${path}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": ua } });
      const html = await res.text();
      const kind = pathKind(path);

      const { schemas, errors: parseErrs } = extractJsonLd(html);
      const jsonLd = validateJsonLd(schemas, parseErrs, kind);

      const fieldChecks = [
        ["status 200", res.status === 200],
        // Supabase's edge gateway sometimes rewrites content-type to text/plain
        // on gzip-compressed GET responses; accept if the body starts with an
        // HTML doctype instead.
        ["content-type html (or HTML body)",
          (res.headers.get("content-type") || "").includes("text/html") ||
          /^\s*<!doctype html/i.test(html)],
        ["body length > 500", html.length > 500],
        ...checkCommonHead(html),
        ...(kind === "product" ? checkProduct(html) : []),
        ...(kind === "category" ? checkCategoryOrHome(html) : []),
        ...(kind === "blog" ? checkBlog(html) : []),
        ["JSON-LD schema valid", jsonLd.errors.length === 0],
      ];

      const passed = fieldChecks.filter(([, ok]) => ok).length;
      const total = fieldChecks.length;
      const fails = fieldChecks.filter(([, ok]) => !ok).map(([n]) => n);
      failed += fails.length + jsonLd.errors.length;

      console.log(
        `${fails.length === 0 && jsonLd.errors.length === 0 ? "✅" : "❌"} ${rowHeader}  ${passed}/${total}` +
          (fails.length ? `  missing: ${fails.join(", ")}` : "") +
          (jsonLd.errors.length ? `  schema: ${jsonLd.errors.slice(0, 3).join(" | ")}` : "")
      );

      if (fails.length || jsonLd.errors.length) {
        const snip = {
          path, ua: uaName,
          missing: fails,
          schemaErrors: jsonLd.errors,
          schemaTypes: jsonLd.types,
          htmlHead: html.slice(0, 1500),
          bodyStart: html.slice(1500, 3500),
          snippets: {},
        };
        for (const f of fails) {
          const key = f.split(/\s+/)[0].replace(/[<>]/g, "");
          const s = snippetAround(html, key);
          if (s) snip.snippets[f] = s;
        }
        missingSnippets.push(snip);
      }

      results.push({ path, ua: uaName, status: res.status, passed, total, fails, schemaErrors: jsonLd.errors });
    } catch (e) {
      console.log(`💥 ${rowHeader}  ${e.message}`);
      failed++;
      results.push({ path, ua: uaName, error: e.message });
    }
  }
}

console.log("\n──────────── SUMMARY ────────────");
console.log(`total failed checks: ${failed}`);

if (missingSnippets.length && !args["no-report"]) {
  const fs = await import("node:fs");
  const p = args.report || `/tmp/prerender-smoke-report-${Date.now()}.json`;
  fs.writeFileSync(p, JSON.stringify({ generatedAt: new Date().toISOString(), results, missingSnippets }, null, 2));
  console.log(`report with HTML snippets: ${p}`);
}

process.exit(failed === 0 ? 0 : 1);
