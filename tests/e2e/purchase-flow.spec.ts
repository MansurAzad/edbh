// @ts-nocheck
/**
 * E2E: Homepage → Product → AddToCart → Checkout → Order complete
 *
 * Verifies the Meta Pixel `fbq('track', …)` payload for each standard event
 * (content_ids, currency, value, event_id) — not just that the event fired.
 *
 * Additionally verifies that the /product/<slug> page is crawlable (bot-
 * prerender emits the product name, price, and JSON-LD without JS).
 *
 * Run:
 *   BASE_URL=http://localhost:8080 npx playwright test tests/e2e/purchase-flow.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const PRODUCT_SLUG = process.env.PRODUCT_SLUG || "";
const BOT_PRERENDER_URL =
  process.env.BOT_PRERENDER_URL ||
  "https://izeabmhtxtrelfqgkuua.supabase.co/functions/v1/bot-prerender";

type FbqCall = { method: string; event: string; params: Record<string, unknown>; opts: { eventID?: string } };

/**
 * Injects an fbq wrapper BEFORE app scripts load so every `fbq('track', ...)`
 * push is mirrored to `window.__fbqCalls` for later inspection.
 */
async function armFbqCapture(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__fbqCalls = [] as FbqCall[];
    const install = () => {
      const orig = w.fbq;
      w.fbq = function (method: string, event: string, params?: any, opts?: any) {
        try {
          w.__fbqCalls.push({ method, event, params: params || {}, opts: opts || {} });
        } catch { /* noop */ }
        if (typeof orig === "function") return orig.apply(w, arguments as any);
      };
      // Preserve internal fbq state used by the base pixel snippet.
      w.fbq.queue = (orig && orig.queue) || [];
      w.fbq.loaded = true;
      w.fbq.version = "2.0";
    };
    install();
    // Re-install if the base pixel snippet later overwrites window.fbq.
    Object.defineProperty(w, "_fbqInstalled", { value: true });
    setInterval(() => {
      if (w.fbq && !w.fbq.__wrapped) {
        const orig = w.fbq;
        w.fbq = function (...args: any[]) {
          try { w.__fbqCalls.push({ method: args[0], event: args[1], params: args[2] || {}, opts: args[3] || {} }); } catch {}
          return orig.apply(w, args as any);
        };
        w.fbq.__wrapped = true;
        w.fbq.queue = orig.queue || [];
      }
    }, 250);
  });
}

async function fbqCalls(page: Page, filter?: (c: FbqCall) => boolean): Promise<FbqCall[]> {
  const all = (await page.evaluate(() => (window as any).__fbqCalls || [])) as FbqCall[];
  const track = all.filter((c) => c.method === "track");
  return filter ? track.filter(filter) : track;
}

async function waitForFbq(page: Page, event: string, timeout = 15000) {
  await expect
    .poll(async () => (await fbqCalls(page, (c) => c.event === event)).length > 0, { timeout })
    .toBe(true);
}

test.describe("Meta events fire in correct order with valid payloads", () => {
  test("Homepage → ViewContent → AddToCart → InitiateCheckout → Purchase", async ({ page }) => {
    await armFbqCapture(page);
    await page.goto(`${BASE_URL}/?tracking_debug=1`, { waitUntil: "domcontentloaded" });

    // 1. PageView
    await waitForFbq(page, "PageView");
    const pv = (await fbqCalls(page, (c) => c.event === "PageView"))[0];
    expect(pv.opts.eventID, "PageView must carry an eventID for CAPI dedup").toBeTruthy();

    // 2. Product page — either explicit slug or first featured product.
    if (PRODUCT_SLUG) {
      await page.goto(`${BASE_URL}/product/${PRODUCT_SLUG}?tracking_debug=1`);
    } else {
      const firstProduct = page.locator("a[href^='/product/']").first();
      await firstProduct.waitFor({ state: "visible", timeout: 15000 });
      await firstProduct.click();
    }
    await waitForFbq(page, "ViewContent");

    const vc = (await fbqCalls(page, (c) => c.event === "ViewContent"))[0];
    expect(vc.params.currency, "ViewContent.currency must be BDT").toBe("BDT");
    expect(vc.params.content_type).toBe("product");
    expect(Array.isArray(vc.params.content_ids)).toBe(true);
    expect((vc.params.content_ids as string[]).length).toBeGreaterThan(0);
    expect(typeof vc.params.value).toBe("number");
    expect(vc.params.value as number).toBeGreaterThan(0);
    expect(vc.opts.eventID).toMatch(/^view_item-/);
    const productId = (vc.params.content_ids as string[])[0];

    // 3. AddToCart — payload must reference the same product & positive value.
    await page.getByRole("button", { name: /add to cart|কার্টে|কিনুন|অর্ডার/i }).first().click();
    await waitForFbq(page, "AddToCart");
    const ac = (await fbqCalls(page, (c) => c.event === "AddToCart"))[0];
    expect(ac.params.currency).toBe("BDT");
    expect(ac.params.content_type).toBe("product");
    expect(ac.params.content_ids).toContain(productId);
    expect(typeof ac.params.value).toBe("number");
    expect(ac.params.value as number).toBeGreaterThan(0);
    expect(ac.opts.eventID).toMatch(/^add_to_cart-/);

    // 4. InitiateCheckout
    await page.goto(`${BASE_URL}/checkout?tracking_debug=1`);
    await waitForFbq(page, "InitiateCheckout");
    const ic = (await fbqCalls(page, (c) => c.event === "InitiateCheckout"))[0];
    expect(ic.params.currency).toBe("BDT");
    expect(ic.params.content_type).toBe("product");
    expect((ic.params.content_ids as string[]).length).toBeGreaterThan(0);
    expect(typeof ic.params.value).toBe("number");
    expect(ic.params.value as number).toBeGreaterThan(0);
    expect(typeof ic.params.num_items).toBe("number");
    expect(ic.opts.eventID).toMatch(/^begin_checkout-/);

    // 5. Purchase MUST NOT be present before Confirm Order is clicked.
    expect((await fbqCalls(page, (c) => c.event === "Purchase")).length,
      "Purchase must not fire before order is confirmed").toBe(0);

    // 6. Fill shipping fields best-effort.
    await page.getByLabel(/name|নাম/i).first().fill("QA Buyer").catch(() => {});
    await page.getByLabel(/phone|মোবাইল|ফোন/i).first().fill("01700000000").catch(() => {});
    await page.getByLabel(/address|ঠিকানা/i).first().fill("QA Address, Chattogram").catch(() => {});

    // 7. Place order.
    await page.getByRole("button", { name: /place order|confirm|অর্ডার|কনফার্ম/i }).first().click();

    // 8. Wait for the confirmed order screen.
    await expect(page.getByText(/order.*(placed|successful|সফল|ধন্যবাদ)/i))
      .toBeVisible({ timeout: 20000 });

    // 9. Purchase now fires — assert full payload.
    await waitForFbq(page, "Purchase", 10000);
    const purchases = await fbqCalls(page, (c) => c.event === "Purchase");
    expect(purchases.length, "Purchase must fire exactly once").toBe(1);
    const pu = purchases[0];
    expect(pu.params.currency).toBe("BDT");
    expect(pu.params.content_type).toBe("product");
    expect(pu.params.content_ids).toContain(productId);
    expect(typeof pu.params.value).toBe("number");
    expect(pu.params.value as number).toBeGreaterThan(0);
    expect(typeof pu.params.num_items).toBe("number");
    expect(pu.params.num_items as number).toBeGreaterThan(0);
    // Purchase.eventID = `purchase-<orderId>` — used for Pixel↔CAPI dedup.
    expect(pu.opts.eventID).toMatch(/^purchase-.+/);
  });

  test("Product page is crawlable — bot-prerender emits name, price, and Product JSON-LD", async ({ request }) => {
    test.skip(!PRODUCT_SLUG, "Set PRODUCT_SLUG env to run the crawlability check");

    const res = await request.get(`${BOT_PRERENDER_URL}?path=/product/${PRODUCT_SLUG}&force=1`, {
      headers: { "user-agent": "facebookexternalhit/1.1" },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();

    // Structural crawler expectations — same fields Meta Catalog needs.
    expect(html, "must include product name in raw HTML").toMatch(/<h1[^>]*>[^<]+<\/h1>/i);
    expect(html, "must include price marker").toMatch(/৳\s?\d/);
    expect(html, "must include canonical link").toMatch(/<link rel="canonical"/i);
    expect(html, "must include Open Graph type=product").toMatch(/property="og:type"\s+content="product"/i);
    expect(html, "must include Product JSON-LD").toMatch(/"@type"\s*:\s*"Product"/);
    expect(html, "must include BreadcrumbList JSON-LD").toMatch(/"@type"\s*:\s*"BreadcrumbList"/);
  });
});
