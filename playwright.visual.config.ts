import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression config — snapshots the premium homepage + /shop across
 * mobile / tablet / desktop breakpoints to catch UI drift.
 *
 * Run:
 *   BASE_URL=http://localhost:8080 npx playwright test -c playwright.visual.config.ts
 *   # update baselines after intentional visual changes:
 *   npx playwright test -c playwright.visual.config.ts --update-snapshots
 */
export default defineConfig({
  testDir: "./tests/visual",
  timeout: 60_000,
  expect: {
    // Allow ~0.3% pixel diff for antialiasing/font hinting jitter.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.003,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-visual" }]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:8080",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "mobile-small",
      use: { ...devices["iPhone SE"] },
    },
    {
      name: "mobile-large",
      use: { ...devices["iPhone 13 Pro Max"] },
    },
    {
      name: "tablet",
      use: { ...devices["iPad (gen 7)"] },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
    },
  ],
});
