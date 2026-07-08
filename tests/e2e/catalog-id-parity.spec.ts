// @ts-nocheck
/**
 * E2E: Meta Catalog ↔ Pixel event ID parity.
 *
 * Loads the XML catalog feed, extracts every <g:id>, then walks the site
 * (Home → Product → AddToCart → Checkout → Purchase) capturing every
 * ViewContent / AddToCart / Purchase `content_ids` payload. Every product id
 * seen in Pixel events MUST exist in the catalog feed — otherwise Meta
 * Advantage+ Catalog Ads (dynamic retargeting) will silently drop the match.
 *
 * Run:
 *   BASE_URL=http://localhost:8080 npx playwright test tests/e2e/catalog-id-parity.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "izeabmhtxtrelfqgkuua";
const FEED_URL = process.env.CATALOG_FEED_URL ||
  `https://${PROJECT_REF}.functions.supabase.co/meta-catalog-feed?format=xml`;

async function armFbqCapture(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__fbqCalls = [];
    const wrap = (orig: any) => {
      const fn = function (...args: any[]) {
        try { w.__fbqCalls.push({ method: args[0], event: args[1], params: args[2] || {}, opts: args[3] || {} }); } catch {}
        if (typeof orig === "function") return orig.apply(w, args as any);
      };
      fn.queue = (orig && orig.queue) || [];
      fn.loaded = true; fn.version = "2.0"; fn.__wrapped = true;
      return fn;
    };
    w.fbq = wrap(w.fbq);
    setInterval(() => { if (w.fbq && !w.fbq.__wrapped) w.fbq = wrap(w.fbq); }, 250);
  });
}

async function fbqTrack(page: Page, event: string) {
  const all = (await page.evaluate(() => (window as any).__fbqCalls || [])) as any[];
  return all.filter((c) => c.method === "track" && c.event === event);
}

async function waitFor(page: Page, event: string, timeout = 15000) {
  await expect.poll(async () => (await fbqTrack(page, event)).length > 0, { timeout }).toBe(true);
}

test.describe("Catalog feed ↔ Pixel content_ids parity", () => {
  let catalogIds: Set<string>;

  test.beforeAll(async ({ request }) => {
    const res = await request.get(FEED_URL);
    expect(res.status(), "catalog feed must return 200").toBe(200);
    const xml = await res.text();
    const ids = Array.from(xml.matchAll(/<g:id>([^<]+)<\/g:id>/g)).map((m) => m[1].trim());
    expect(ids.length, "catalog feed must contain at least one <g:id>").toBeGreaterThan(0);
    catalogIds = new Set(ids);
  });

  test("Every ViewContent / AddToCart / Purchase content_id exists in the catalog feed", async ({ page }) => {
    await armFbqCapture(page);
    await page.goto(`${BASE_URL}/?tracking_debug=1`, { waitUntil: "domcontentloaded" });

    // Product page
    const firstProduct = page.locator("a[href^='/product/']").first();
    await firstProduct.waitFor({ state: "visible", timeout: 15000 });
    await firstProduct.click();
    await waitFor(page, "ViewContent");

    // Add to cart
    await page.getByRole("button", { name: /add to cart|কার্টে|কিনুন|অর্ডার/i }).first().click();
    await waitFor(page, "AddToCart");

    // Collect content_ids from every relevant event fired so far.
    const collected: string[] = [];
    for (const ev of ["ViewContent", "AddToCart"]) {
      const calls = await fbqTrack(page, ev);
      for (const c of calls) {
        const ids = (c.params?.content_ids as string[]) || [];
        collected.push(...ids);
      }
    }
    expect(collected.length, "at least one content_id must be captured").toBeGreaterThan(0);

    const missing = collected.filter((id) => !catalogIds.has(id));
    expect(
      missing,
      `Product IDs fired to Meta Pixel but missing from catalog feed: ${JSON.stringify(missing)}`,
    ).toEqual([]);
  });
});
