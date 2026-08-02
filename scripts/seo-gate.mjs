/**
 * SEO governance CI gate.
 *
 * Runs the SEO test suites and FAILS the build unless every test passes AND
 * at least MIN_TESTS of them ran. Deployment workflows depend on this job, so
 * a regression in meta/keyword/cannibalization/tag governance blocks deploy.
 *
 * Usage: node scripts/seo-gate.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";

const MIN_TESTS = Number(process.env.SEO_GATE_MIN_TESTS ?? 33);
const OUT = "seo-gate-report.json";

let exitCode = 0;
try {
  execFileSync(
    "bunx",
    ["vitest", "run", "src/lib/seo", "--reporter=json", `--outputFile=${OUT}`],
    { stdio: "inherit" },
  );
} catch {
  exitCode = 1;
}

if (!existsSync(OUT)) {
  console.error("❌ SEO gate: no test report produced — the suite failed to run.");
  process.exit(1);
}

const report = JSON.parse(readFileSync(OUT, "utf8"));
const passed = report.numPassedTests ?? 0;
const failed = report.numFailedTests ?? 0;
const total = report.numTotalTests ?? 0;
rmSync(OUT, { force: true });

console.log(`\nSEO governance gate: ${passed}/${total} passed, ${failed} failed (minimum ${MIN_TESTS}).`);

if (failed > 0 || exitCode !== 0) {
  console.error(`❌ SEO gate failed: ${failed} failing test(s). Deploy blocked.`);
  process.exit(1);
}
if (passed < MIN_TESTS) {
  console.error(
    `❌ SEO gate failed: only ${passed} SEO governance tests ran, expected at least ${MIN_TESTS}. ` +
      "Tests were removed or skipped — deploy blocked.",
  );
  process.exit(1);
}

console.log("✅ SEO governance gate passed.");
