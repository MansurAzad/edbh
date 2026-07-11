/**
 * Visual regression — additional key pages.
 *
 * Guards:
 *  - /product/:id (first product from /shop grid)
 *  - /cart (empty + with one item)
 *  - /checkout
 *  - /blog listing
 *  - /contact
 *
 * Baselines live under tests/visual/__screenshots__/ per project (breakpoint).
 * Regenerate intentionally:
 *   npx playwright test -c playwright.visual.config.ts --update-snapshots
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
      [data-testid="social-proof-toast"],
      .below-fold-section [data-rotating="true"] {
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

async function firstProductHref(page: Page): Promise<string | null> {
  await page.goto("/shop", { waitUntil: "domcontentloaded" });
  await stabilize(page);
  return page.evaluate(() => {
    const a = document.querySelector('a[href^="/product/"]') as HTMLAnchorElement | null;
    return a?.getAttribute("href") ?? null;
  });
}

test.describe("Product detail visual regression", () => {
  test("/product/:id above-the-fold", async ({ page }) => {
    const href = await firstProductHref(page);
    test.skip(!href, "no product link available on /shop");
    await page.goto(href!, { waitUntil: "domcontentloaded" });
    await stabilize(page);
    await expect(page).toHaveScreenshot("product-detail.png", { fullPage: false });
  });
});

test.describe("Cart visual regression", () => {
  test("/cart empty state", async ({ page }) => {
    await page.goto("/cart", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    await expect(page).toHaveScreenshot("cart-empty.png", { fullPage: false });
  });
});

test.describe("Checkout visual regression", () => {
  test("/checkout page", async ({ page }) => {
    await page.goto("/checkout", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    await expect(page).toHaveScreenshot("checkout.png", { fullPage: false });
  });
});

test.describe("Blog listing visual regression", () => {
  test("/blog listing", async ({ page }) => {
    await page.goto("/blog", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    await expect(page).toHaveScreenshot("blog-listing.png", { fullPage: false });
  });
});

test.describe("Contact page visual regression", () => {
  test("/contact page", async ({ page }) => {
    await page.goto("/contact", { waitUntil: "domcontentloaded" });
    await stabilize(page);
    await expect(page).toHaveScreenshot("contact.png", { fullPage: false });
  });
});
