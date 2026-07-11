/**
 * Visual regression — premium homepage + /shop pages across breakpoints.
 *
 * Guards:
 *  - Homepage hero + premium sections (PriceQuickShop, PremiumDubaiCollection,
 *    DubaiImportedProof, ShowroomLocation, DeliveryReturnStrip).
 *  - /shop landing grid.
 *  - /shop?maxPrice=3000 filtered state (price chip → URL param wiring).
 *
 * Baselines live under tests/visual/__screenshots__/ per project (breakpoint).
 * Regenerate intentionally:
 *   npx playwright test -c playwright.visual.config.ts --update-snapshots
 */
import { test, expect, type Page } from "@playwright/test";

/**
 * Neutralize dynamic UI that would flap between runs:
 *  - carousel/rotation ticks
 *  - CSS animations & transitions
 *  - lazy-image blur-up placeholders
 *  - live "recent buyer" toasts
 * Then wait for network idle so above-the-fold images settle.
 */
async function stabilize(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      /* Hide widgets that vary per session and aren't part of the layout under test. */
      [data-testid="floating-contact-buttons"],
      [data-testid="customer-chat-widget"],
      [data-testid="social-proof-toast"],
      .below-fold-section [data-rotating="true"] {
        visibility: hidden !important;
      }
    `,
  });
  // Best-effort: wait for fonts + images to be ready.
  await page.evaluate(async () => {
    // @ts-ignore
    if (document.fonts?.ready) await document.fonts.ready;
    const imgs = Array.from(document.images);
    await Promise.all(
      imgs.map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(null); }),
      ),
    );
  });
  await page.waitForLoadState("networkidle").catch(() => {});
}

test.describe("Homepage visual regression", () => {
  test("premium homepage above-the-fold", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    await expect(page).toHaveScreenshot("home-hero.png", { fullPage: false });
  });

  test("premium homepage full-page", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Trigger lazy sections by scrolling to the bottom, then back to top.
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let y = 0;
        const step = () => {
          window.scrollTo(0, y);
          y += 400;
          if (y < document.body.scrollHeight) requestAnimationFrame(step);
          else resolve();
        };
        step();
      });
      window.scrollTo(0, 0);
    });
    await stabilize(page);
    await expect(page).toHaveScreenshot("home-full.png", { fullPage: true });
  });
});

test.describe("Shop visual regression", () => {
  test("/shop landing grid", async ({ page }) => {
    await page.goto("/shop", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    await expect(page).toHaveScreenshot("shop-landing.png", { fullPage: false });
  });

  test("/shop?maxPrice=3000 filter applied", async ({ page }) => {
    await page.goto("/shop?maxPrice=3000", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    await expect(page).toHaveScreenshot("shop-maxprice-3000.png", { fullPage: false });
  });
});
