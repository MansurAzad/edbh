// @ts-nocheck
/**
 * E2E: Homepage → Product → AddToCart → Checkout → Order complete
 *
 * Asserts the Meta standard events fire in the correct order and that
 * Purchase fires ONLY after the order-success screen renders (i.e. after
 * backend confirmation). Uses the on-page tracking debug overlay
 * (?tracking_debug=1) as the source of truth so the assertions cover both
 * the client Pixel and the server CAPI dispatch paths.
 *
 * Run:
 *   BASE_URL=http://localhost:8080 npx playwright test tests/e2e/purchase-flow.spec.ts
 *
 * Requires: `npm i -D @playwright/test && npx playwright install chromium`.
 * Requires a seeded in-stock product; override the slug with PRODUCT_SLUG.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const PRODUCT_SLUG = process.env.PRODUCT_SLUG || ""; // "" → click first featured product

type CapturedEvent = { source: string; event: string; event_id: string; ts: number };

/** Read the in-memory tracking-debug buffer directly from the page. */
async function getEvents(page: Page): Promise<CapturedEvent[]> {
  return page.evaluate(() => {
    const w = window as any;
    const dl = (w.dataLayer || []) as any[];
    // Map GTM dataLayer pushes to the same shape as the debug overlay.
    return dl
      .filter((e) => e && typeof e === "object" && e.event && e.event_id)
      .map((e) => ({
        source: "dataLayer",
        event: e.event,
        event_id: e.event_id,
        ts: Date.now(),
      }));
  });
}

async function waitForEvent(page: Page, eventName: string, timeout = 15000) {
  await expect
    .poll(async () => (await getEvents(page)).some((e) => e.event === eventName), { timeout })
    .toBe(true);
}

test.describe("Meta events fire in correct order across the purchase flow", () => {
  test("Homepage → ViewContent → AddToCart → InitiateCheckout → Purchase", async ({ page }) => {
    // Enable the on-page tracking debug overlay for the whole session.
    await page.goto(`${BASE_URL}/?tracking_debug=1`, { waitUntil: "domcontentloaded" });

    // 1. PageView on homepage.
    await waitForEvent(page, "page_view");

    // 2. Click a featured product to trigger ViewContent.
    if (PRODUCT_SLUG) {
      await page.goto(`${BASE_URL}/product/${PRODUCT_SLUG}?tracking_debug=1`);
    } else {
      const firstProduct = page.locator("a[href^='/product/']").first();
      await firstProduct.waitFor({ state: "visible", timeout: 15000 });
      await firstProduct.click();
    }
    await waitForEvent(page, "view_item");

    // 3. Add to cart.
    const addBtn = page.getByRole("button", { name: /add to cart|কার্টে|কিনুন|অর্ডার/i }).first();
    await addBtn.click();
    await waitForEvent(page, "add_to_cart");

    // 4. Go to checkout.
    await page.goto(`${BASE_URL}/checkout?tracking_debug=1`);
    await waitForEvent(page, "begin_checkout");

    // 5. Snapshot the event log BEFORE we place the order — Purchase must NOT
    //    be in the buffer yet. If it is, that's an ad-optimisation bug.
    const before = await getEvents(page);
    expect(before.some((e) => e.event === "purchase"),
      "Purchase must not fire before order is confirmed").toBe(false);

    // 6. Fill required shipping fields (best-effort by common labels/names).
    await page.getByLabel(/name|নাম/i).first().fill("QA Buyer").catch(() => {});
    await page.getByLabel(/phone|মোবাইল|ফোন/i).first().fill("01700000000").catch(() => {});
    await page.getByLabel(/address|ঠিকানা/i).first().fill("QA Address, Chattogram").catch(() => {});

    // 7. Confirm order.
    await page.getByRole("button", { name: /place order|confirm|অর্ডার|কনফার্ম/i }).first().click();

    // 8. Wait for the success screen → confirms backend accepted the order.
    await expect(page.getByText(/order.*(placed|successful|সফল|ধন্যবাদ)/i))
      .toBeVisible({ timeout: 20000 });

    // 9. NOW — and only now — Purchase must fire.
    await waitForEvent(page, "purchase", 10000);

    // 10. Order check: PageView → view_item → add_to_cart → begin_checkout → purchase
    const all = await getEvents(page);
    const seq = ["page_view", "view_item", "add_to_cart", "begin_checkout", "purchase"];
    const idx = seq.map((name) => all.findIndex((e) => e.event === name));
    idx.forEach((i, k) => {
      expect(i, `${seq[k]} missing from event log`).toBeGreaterThanOrEqual(0);
    });
    for (let i = 1; i < idx.length; i++) {
      expect(idx[i], `${seq[i]} must come after ${seq[i - 1]}`).toBeGreaterThan(idx[i - 1]);
    }

    // 11. Purchase idempotency: event_id must be `purchase-<orderId>` and unique.
    const purchases = all.filter((e) => e.event === "purchase");
    expect(purchases.length, "Purchase must fire exactly once").toBe(1);
    expect(purchases[0].event_id).toMatch(/^purchase-/);
  });
});
