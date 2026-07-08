#!/usr/bin/env node
/**
 * Validates public/sitemap.xml and public/robots.txt against src/App.tsx.
 *
 * Fails (exit 1) if:
 *   - Any indexable static route in App.tsx is missing from sitemap.xml
 *   - robots.txt is missing an Allow / Sitemap directive
 *   - robots.txt has a global `Disallow: /` (site-wide block)
 *   - robots.txt does not disallow known non-indexable paths
 *
 * Usage:  node scripts/validate-sitemap-robots.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const appTsx = readFileSync(resolve(root, "src/App.tsx"), "utf8");
const sitemap = readFileSync(resolve(root, "public/sitemap.xml"), "utf8");
const robots = readFileSync(resolve(root, "public/robots.txt"), "utf8");

// -- routes ---------------------------------------------------------------
const ROUTE_RE = /<Route\s+path="([^"]+)"/g;
const routes = [];
let m;
while ((m = ROUTE_RE.exec(appTsx))) routes.push(m[1]);

const NON_INDEXABLE = new Set([
  "*",
  "/auth",
  "/cart",
  "/checkout",
  "/profile",
  "/wishlist",
  "/order-tracking",
]);
const indexableStatic = routes.filter(
  (p) =>
    !p.includes(":") &&
    !p.startsWith("/admin") &&
    !NON_INDEXABLE.has(p) &&
    !p.startsWith("/track"),
);

// -- checks ---------------------------------------------------------------
const errors = [];

// 1. Sitemap coverage
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) =>
  x[1].replace(/^https?:\/\/[^/]+/, ""),
);
for (const route of indexableStatic) {
  const target = route === "/" ? "/" : route;
  if (!sitemapLocs.includes(target)) {
    errors.push(`sitemap.xml is missing indexable route: ${route}`);
  }
}

// 2. Sitemap must be well-formed
if (!/<\?xml/.test(sitemap)) errors.push("sitemap.xml missing XML declaration");
if (!/<urlset[^>]+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(sitemap))
  errors.push("sitemap.xml missing correct <urlset xmlns>");

// 3. Robots directives
if (!/User-agent:\s*\*/i.test(robots)) errors.push("robots.txt missing `User-agent: *` block");
if (/^\s*Disallow:\s*\/\s*$/im.test(robots) && !/Allow:\s*\//i.test(robots)) {
  errors.push("robots.txt has site-wide `Disallow: /` — this blocks all crawlers");
}
if (!/Sitemap:\s*https?:\/\//i.test(robots))
  errors.push("robots.txt missing `Sitemap:` directive");

// 4. Sensitive paths must be disallowed
const mustDisallow = ["/admin/", "/checkout", "/cart", "/profile", "/auth"];
for (const p of mustDisallow) {
  if (!new RegExp(`Disallow:\\s*${p.replace(/[/]/g, "\\/")}`, "i").test(robots)) {
    errors.push(`robots.txt missing \`Disallow: ${p}\``);
  }
}

// -- report ---------------------------------------------------------------
if (errors.length === 0) {
  console.log(`✅ sitemap.xml + robots.txt OK (${indexableStatic.length} indexable routes covered)`);
  process.exit(0);
}
console.log(`❌ sitemap/robots validation failed (${errors.length} issue${errors.length > 1 ? "s" : ""}):`);
for (const e of errors) console.log(`  - ${e}`);
process.exit(1);
