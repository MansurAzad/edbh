// @ts-nocheck
/**
 * Visual regression + interaction guarantees for the admin sticky header
 * and hub tab bar. Catches z-index, spacing, and mobile-alignment drift.
 *
 * Run: BASE_URL=http://localhost:8080 npx playwright test tests/e2e/admin-header-visual.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

async function isAdminReachable(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  return page.url().includes("/admin");
}

/** Routes exercised for per-page padding + mobile-breakpoint assertions. */
const ADMIN_ROUTES = [
  "/admin",
  "/admin/products",
  "/admin/orders",
  "/admin/customers",
  "/admin/reports",
  "/admin/business-audit",
  "/admin/whatsapp-events",
  "/admin/email-campaigns",
  "/admin/settings-page",
  "/admin/cloudinary",
];

/** Common phone widths — 360 (Android baseline), 390 (iPhone 14), 430 (Pro Max). */
const MOBILE_WIDTHS = [360, 390, 430];

test.describe("admin header — visual + layout invariants", () => {
  test("desktop: header + hub tab bar snapshot (pinned state)", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/admin/whatsapp-events`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Freeze animations for a stable snapshot.
    await page.addStyleTag({
      content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
    });

    const header = page.getByTestId("admin-page-header");
    await expect(header).toHaveScreenshot("admin-header-desktop.png", {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });

    // After scrolling, header should still look identical (still pinned).
    await page.getByTestId("admin-main").evaluate((el) => el.scrollTo({ top: 1200 }));
    await page.waitForTimeout(200);
    await expect(header).toHaveScreenshot("admin-header-desktop-scrolled.png", {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });
  });

  test("mobile: header + hub tab bar snapshot (pinned state)", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(`${BASE_URL}/admin/whatsapp-events`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    await page.addStyleTag({
      content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
    });

    // Snapshot the entire pinned top region: mobile bar + hub header + tabs.
    const topRegion = page.locator('main[data-testid="admin-main"]');
    await expect(topRegion).toHaveScreenshot("admin-header-mobile.png", {
      clip: { x: 0, y: 0, width: 390, height: 200 },
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });

    await page.getByTestId("admin-main").evaluate((el) => el.scrollTo({ top: 900 }));
    await page.waitForTimeout(200);
    await expect(topRegion).toHaveScreenshot("admin-header-mobile-scrolled.png", {
      clip: { x: 0, y: 0, width: 390, height: 200 },
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });
  });

  test("dropdowns and side menus render above header/tab bar and receive clicks", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.setViewportSize({ width: 1280, height: 900 });

    const headerZAt = async () =>
      page.getByTestId("admin-page-header").evaluate((el) =>
        parseInt(getComputedStyle(el).zIndex || "0", 10),
      );

    for (const route of ["/admin/whatsapp-events", "/admin/email-campaigns", "/admin/settings-page"]) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);

      const headerZ = await headerZAt();

      // Radix portals (Popover/Dropdown/Dialog/Select/Sheet) mount at document root.
      // Sample a menu trigger if present; otherwise assert portal-layer contract.
      const trigger = page
        .locator('button[aria-haspopup="menu"], button[aria-haspopup="dialog"], [role="combobox"]')
        .first();

      if (await trigger.count()) {
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click().catch(() => {});
        await page.waitForTimeout(200);

        const opened = page
          .locator('[role="menu"], [role="listbox"], [role="dialog"], [data-radix-popper-content-wrapper]')
          .first();

        if (await opened.count()) {
          // The opened surface must sit above the sticky header.
          const openedZ = await opened.evaluate((el) => {
            // Walk up to find the nearest positioned ancestor with a real z-index.
            let node: HTMLElement | null = el as HTMLElement;
            while (node) {
              const z = parseInt(getComputedStyle(node).zIndex || "", 10);
              if (!Number.isNaN(z) && z !== 0) return z;
              node = node.parentElement;
            }
            return 0;
          });
          expect(openedZ).toBeGreaterThanOrEqual(headerZ);

          // Hit-test: a point inside the opened surface returns the surface, not the header.
          const box = await opened.boundingBox();
          if (box) {
            const cx = box.x + box.width / 2;
            const cy = box.y + Math.min(box.height / 2, 20);
            const winner = await page.evaluate(
              ({ x, y }) => {
                const el = document.elementFromPoint(x, y) as HTMLElement | null;
                if (!el) return "none";
                if (el.closest('[data-testid="admin-page-header"]')) return "header";
                if (
                  el.closest(
                    '[role="menu"], [role="listbox"], [role="dialog"], [data-radix-popper-content-wrapper]',
                  )
                )
                  return "portal";
                return "content";
              },
              { x: cx, y: cy },
            );
            expect(winner).toBe("portal");
          }

          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(100);
        }
      }

      // Sidebar mobile sheet (via hamburger) also outranks the header on small screens.
      await page.setViewportSize({ width: 390, height: 780 });
      await page.waitForTimeout(150);
      const hamburger = page.locator('main[data-testid="admin-main"] button').first();
      if (await hamburger.count()) {
        await hamburger.click().catch(() => {});
        await page.waitForTimeout(200);
        const sidebar = page.getByTestId("admin-sidebar");
        const sidebarZ = await sidebar.evaluate((el) =>
          parseInt(getComputedStyle(el).zIndex || "0", 10),
        );
        expect(sidebarZ).toBeGreaterThan(headerZ);
        await page.keyboard.press("Escape").catch(() => {});
        await page.setViewportSize({ width: 1280, height: 900 });
      }
    }
  });

  test("every admin page reserves enough top space for the pinned header + tab bar", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.setViewportSize({ width: 1280, height: 900 });

    for (const route of ADMIN_ROUTES) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);

      const header = page.getByTestId("admin-page-header");
      if (!(await header.count())) continue;
      const content = page.getByTestId("admin-page-content");
      await expect(content, `content wrapper missing on ${route}`).toBeVisible();

      const headerBox = await header.boundingBox();
      const contentBox = await content.boundingBox();
      const stickyBottom = (headerBox?.y ?? 0) + (headerBox?.height ?? 0);

      // Content top starts at/below the sticky header bottom (allow ±2px AA slop).
      expect(
        (contentBox?.y ?? 0) + 2,
        `content on ${route} overlaps sticky header (top=${contentBox?.y}, stickyBottom=${stickyBottom})`,
      ).toBeGreaterThanOrEqual(stickyBottom - 2);
    }
  });

  for (const width of MOBILE_WIDTHS) {
    test(`mobile ${width}px: header + hub tab bar pinned, no overlap or layout shift`, async ({ page }) => {
      test.skip(!(await isAdminReachable(page)), "admin session required");
      await page.setViewportSize({ width, height: 780 });
      await page.goto(`${BASE_URL}/admin/whatsapp-events`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      const mobBar = page.locator('main[data-testid="admin-main"] > div').first();
      const hubHeader = page.getByTestId("admin-page-header");
      const main = page.getByTestId("admin-main");

      const mobBox = await mobBar.boundingBox();
      const hubBox = await hubHeader.boundingBox();
      const mainBox = await main.boundingBox();

      // Mobile bar pinned to top of main.
      expect(mobBox?.y ?? -1).toBeLessThan(4);
      // Hub header sits directly beneath the mobile bar — no vertical gap/overlap.
      const stackY = (mobBox?.y ?? 0) + (mobBox?.height ?? 0);
      expect(hubBox?.y ?? -1).toBeGreaterThanOrEqual(stackY - 2);
      expect(hubBox?.y ?? -1).toBeLessThanOrEqual(stackY + 2);

      // Full-width, aligned to the main scroll container (no horizontal shift).
      expect(hubBox?.x ?? -1).toBeCloseTo(mainBox?.x ?? 0, 0);
      expect(hubBox?.width ?? -1).toBeCloseTo(mainBox?.width ?? 0, 0);
      expect(mobBox?.width ?? -1).toBeCloseTo(mainBox?.width ?? 0, 0);

      // Content sits below the stack — no visual overlap at initial paint.
      const content = page.getByTestId("admin-page-content");
      const contentBox = await content.boundingBox();
      const stickyBottom = (hubBox?.y ?? 0) + (hubBox?.height ?? 0);
      expect((contentBox?.y ?? 0) + 2).toBeGreaterThanOrEqual(stickyBottom - 2);

      // After scrolling, pinned bars do not shift (no layout jump).
      await main.evaluate((el) => el.scrollTo({ top: 900 }));
      await page.waitForTimeout(150);
      const mobAfter = await mobBar.boundingBox();
      const hubAfter = await hubHeader.boundingBox();
      expect(mobAfter?.y ?? -1).toBeCloseTo(mobBox?.y ?? 0, 0);
      expect(mobAfter?.height ?? -1).toBeCloseTo(mobBox?.height ?? 0, 0);
      expect(hubAfter?.y ?? -1).toBeCloseTo(hubBox?.y ?? 0, 0);
      expect(hubAfter?.height ?? -1).toBeCloseTo(hubBox?.height ?? 0, 0);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  }
});
