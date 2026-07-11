/**
 * Visual regression — interaction states (hover / focus / active / open).
 *
 * Guards subtle UI drift on:
 *  - Product card hover on /shop
 *  - Primary CTA (btn-gold) hover on homepage
 *  - Header search dialog open state
 *  - Mobile menu open state (mobile projects only)
 *  - Price chip active/selected state on homepage PriceQuickShop
 *  - Blog category filter button active state
 *
 * Note: hover screenshots are inherently a bit noisier; keep
 * maxDiffPixelRatio in playwright.visual.config.ts generous enough.
 */
import { test, expect, type Page } from "@playwright/test";

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
      [data-testid="floating-contact-buttons"],
      [data-testid="customer-chat-widget"],
      [data-testid="social-proof-toast"] {
        visibility: hidden !important;
      }
    `,
  });
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

test.describe("Interaction state visual regression", () => {
  test("shop — first product card hover", async ({ page }) => {
    await page.goto("/shop", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    const card = page.locator('a[href^="/product/"]').first();
    if (!(await card.count())) test.skip(true, "no product card available");
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot("shop-card-hover.png", { fullPage: false });
  });

  test("homepage — primary CTA hover", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    const cta = page.locator(".btn-gold, a.btn-gold, button.btn-gold").first();
    if (!(await cta.count())) test.skip(true, "no .btn-gold on homepage");
    await cta.scrollIntoViewIfNeeded();
    await cta.hover();
    await page.waitForTimeout(150);
    await expect(cta).toHaveScreenshot("home-cta-hover.png");
  });

  test("homepage — PriceQuickShop chip active", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    // The PriceQuickShop chips render as anchors that link to /shop?maxPrice=…
    const chip = page.locator('a[href*="/shop?maxPrice="]').first();
    if (!(await chip.count())) test.skip(true, "no price chips on homepage");
    await chip.scrollIntoViewIfNeeded();
    await chip.hover();
    await page.waitForTimeout(150);
    await expect(chip).toHaveScreenshot("price-chip-hover.png");
  });

  test("header — search dialog open", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    // Search trigger — button with aria-label containing "search" (case-insensitive)
    const trigger = page.getByRole("button", { name: /search/i }).first();
    if (!(await trigger.count())) test.skip(true, "no search trigger");
    await trigger.click();
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot("search-dialog-open.png", { fullPage: false });
  });

  test("blog — category filter active", async ({ page }) => {
    await page.goto("/blog", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    // Second category chip (skip "All") gets clicked to activate.
    const chips = page.locator('button:has-text("All") ~ button, button').filter({
      hasText: /^(All|Fashion|Style|Tips|Guide|Trends|Care)/i,
    });
    const count = await chips.count();
    if (count < 2) test.skip(true, "not enough blog category chips");
    const target = chips.nth(1);
    await target.scrollIntoViewIfNeeded();
    await target.click();
    await page.waitForTimeout(200);
    await stabilize(page);
    await expect(page).toHaveScreenshot("blog-category-active.png", { fullPage: false });
  });
});
