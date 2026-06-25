#!/usr/bin/env node
/**
 * Bundle-size budget checker (no extra deps).
 *
 * Scans `dist/assets` for `*.js` and `*.css` produced by Vite and compares
 * the gzipped size of each manualChunk against the budget defined below.
 *
 * Exits with code 1 (fails CI) when ANY budget is exceeded. Prints a
 * markdown table to stdout that surfaces nicely in a GitHub job summary.
 *
 * Usage:  node scripts/check-bundle-budget.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

// Budget in KB (gzipped). Patterns are matched against the chunk's
// filename prefix produced by Vite's manualChunks config in vite.config.ts.
const BUDGETS = {
  "vendor-react":    60,
  "vendor-ui":       110,
  "vendor-radix":    90,
  "vendor-supabase": 50,
  "vendor-charts":   120,
  // Loose budget for the storefront entry; tighten as we optimise.
  "index":           250,
};

const ASSETS_DIR = "dist/assets";

let dir;
try {
  dir = readdirSync(ASSETS_DIR);
} catch {
  console.error(`✖ ${ASSETS_DIR} not found — did you run \`bun run build\` first?`);
  process.exit(1);
}

const rows = [];
let failed = false;

for (const [prefix, budgetKb] of Object.entries(BUDGETS)) {
  // Vite emits e.g. `vendor-react-DEf123.js`. Match by prefix.
  const file = dir.find((f) => f.startsWith(prefix + "-") && f.endsWith(".js"));
  if (!file) {
    rows.push([prefix, "—", `${budgetKb} KB`, "⚠️  missing"]);
    continue;
  }
  const full = join(ASSETS_DIR, file);
  const raw = readFileSync(full);
  const gzipped = gzipSync(raw).length;
  const kb = +(gzipped / 1024).toFixed(1);
  const ok = kb <= budgetKb;
  if (!ok) failed = true;
  rows.push([prefix, `${kb} KB`, `${budgetKb} KB`, ok ? "✅" : "❌ over budget"]);
}

// Markdown summary (GH-friendly).
console.log("## Bundle Budget Report\n");
console.log("| Chunk | Gzipped | Budget | Status |");
console.log("|-------|---------|--------|--------|");
for (const r of rows) console.log(`| ${r.join(" | ")} |`);

if (failed) {
  console.error("\n✖ Bundle budget exceeded — see table above.");
  process.exit(1);
}
console.log("\n✓ All chunks within budget.");
