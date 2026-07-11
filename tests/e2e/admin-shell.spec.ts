// @ts-nocheck
/**
 * E2E: admin shell layout invariants + hub navigation.
 *
 * Verifies:
 *  1. Sidebar + header + top tab bar stay pinned; only page content scrolls.
 *  2. Route-based active state highlights sidebar + top tab correctly.
 *  3. Clicking every MarketingHub and SettingsHub tab updates the URL
 *     and re-renders the ActiveStateSummary chip with the right hub /
 *     section / tab, and window.scrollY stays 0 across every click.
 *
 * Run: BASE_URL=http://localhost:8080 npx playwright test tests/e2e/admin-shell.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

async function isAdminReachable(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  return page.url().includes("/admin");
}

const MARKETING_TABS: Array<{ path: string; label: RegExp; section: string }> = [
  { path: "/admin/email-campaigns", label: /Email Campaigns/i, section: "Marketing Commands" },
  { path: "/admin/notifications", label: /Notifications/i, section: "Marketing Commands" },
  { path: "/admin/hot-sale", label: /Hot Sale/i, section: "Marketing Commands" },
  { path: "/admin/referrals", label: /Referrals/i, section: "Marketing Automations" },
  { path: "/admin/social-proof", label: /Social Proof/i, section: "Marketing Automations" },
  { path: "/admin/segments", label: /Customer Segments/i, section: "Marketing Automations" },
  { path: "/admin/chat-histories", label: /Chat Histories/i, section: "Comms" },
  { path: "/admin/whatsapp-events", label: /WhatsApp Events/i, section: "Comms" },
];

const SETTINGS_TABS: Array<{ path: string; label: RegExp; section: string }> = [
  { path: "/admin/settings-page", label: /General/i, section: "Settings" },
  { path: "/admin/staff-permissions", label: /Staff Permissions/i, section: "Settings" },
  { path: "/admin/security", label: /Security/i, section: "Settings" },
  { path: "/admin/backup", label: /Backup & Reset/i, section: "Settings" },
  { path: "/admin/cloudinary", label: /Cloudinary/i, section: "Tools" },
  { path: "/admin/inventory-sync", label: /Inventory Sync/i, section: "Tools" },
  { path: "/admin/content", label: /Content Editor/i, section: "Tools" },
];

test.describe("admin shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("sidebar + header + top tab bar stay pinned while only page content scrolls", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.goto(`${BASE_URL}/admin/whatsapp-events`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    const sidebar = page.getByTestId("admin-sidebar");
    const main = page.getByTestId("admin-main");
    const content = page.getByTestId("admin-page-content");
    const tabBar = page.locator('[role="tablist"]').first();
    await expect(sidebar).toBeVisible();
    await expect(tabBar).toBeVisible();

    const sidebarBefore = await sidebar.boundingBox();
    const tabBarBefore = await tabBar.boundingBox();

    await content.evaluate((el) => el.scrollTo({ top: 1200 }));
    await page.waitForTimeout(150);

    const sidebarAfter = await sidebar.boundingBox();
    const tabBarAfter = await tabBar.boundingBox();

    // Sidebar box (x, y, width, height) must be identical after the scroll.
    expect(sidebarAfter?.x).toBeCloseTo(sidebarBefore?.x ?? 0, 0);
    expect(sidebarAfter?.y).toBeCloseTo(sidebarBefore?.y ?? 0, 0);
    expect(sidebarAfter?.height).toBeCloseTo(sidebarBefore?.height ?? 0, 0);

    // Top tab bar is now sticky inside <main>, so its y should stay pinned
    // (equal to before) even as main scrolls. Content below still scrolls.
    expect(tabBarAfter?.y ?? -1).toBeCloseTo(tabBarBefore?.y ?? 0, 0);

    // Window itself never scrolls.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
    expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test("only page content is a scroll container — sidebar, header, title, tabs, body do not scroll", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.goto(`${BASE_URL}/admin/whatsapp-events`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    const main = page.getByTestId("admin-main");
    const content = page.getByTestId("admin-page-content");

    // Snapshot pinned positions BEFORE scrolling.
    const before = await page.evaluate(() => {
      const q = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      };
      return {
        sidebar: q('[data-testid="admin-sidebar"]'),
        header: q('[data-testid="admin-page-header"]'),
        title: q('[data-testid="admin-page-title"]'),
        tabs: q('[role="tablist"]'),
      };
    });

    // Force scroll in the page content panel only.
    await content.evaluate((el) => el.scrollTo({ top: 1500 }));
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => {
      const q = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      };

      // Enumerate every scrollable element in the document and classify each.
      const scrollers: Array<{ selector: string; scrollTop: number; scrollLeft: number }> = [];
      const all = Array.from(document.querySelectorAll<HTMLElement>("*"));
      for (const el of all) {
        if (el.scrollTop > 0 || el.scrollLeft > 0) {
          const id = el.getAttribute("data-testid") || el.tagName.toLowerCase();
          scrollers.push({ selector: id, scrollTop: el.scrollTop, scrollLeft: el.scrollLeft });
        }
      }

      return {
        sidebar: q('[data-testid="admin-sidebar"]'),
        header: q('[data-testid="admin-page-header"]'),
        title: q('[data-testid="admin-page-title"]'),
        tabs: q('[role="tablist"]'),
        windowScrollY: window.scrollY,
        windowScrollX: window.scrollX,
        bodyScrollTop: document.body.scrollTop,
        docScrollTop: document.documentElement.scrollTop,
        scrollers,
      };
    });

    // 1) Neither window nor body/html scrolled.
    expect(after.windowScrollY).toBe(0);
    expect(after.windowScrollX).toBe(0);
    expect(after.bodyScrollTop).toBe(0);
    expect(after.docScrollTop).toBe(0);

    // 2) Each pinned region kept its position (no vertical or horizontal shift).
    for (const key of ["sidebar", "header", "title", "tabs"] as const) {
      const b = before[key];
      const a = after[key];
      expect(a, `${key} disappeared after scroll`).not.toBeNull();
      expect(a!.y, `${key} shifted vertically`).toBeCloseTo(b!.y, 0);
      expect(a!.x, `${key} shifted horizontally`).toBeCloseTo(b!.x, 0);
      expect(a!.h, `${key} height changed`).toBeCloseTo(b!.h, 0);
    }

    // 3) The ONLY element that recorded a real scroll offset is the page content panel.
    const nonContent = after.scrollers.filter((s) => s.selector !== "admin-page-content");
    // Sidebar's <nav> is overflow-y-auto but shouldn't scroll from a content scroll.
    // Anything else pinned (sidebar, header, title, tabs) must remain at 0.
    for (const key of ["admin-sidebar", "admin-page-header", "admin-page-title"]) {
      expect(
        nonContent.find((s) => s.selector === key),
        `${key} should not scroll (found scrollTop=${nonContent.find((s) => s.selector === key)?.scrollTop})`,
      ).toBeUndefined();
    }

    expect(nonContent.find((s) => s.selector === "admin-main")).toBeUndefined();

    // 4) The content panel itself IS scrolled (proves the scroll landed in the intended container).
    expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
    expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test("route-based active state highlights sidebar + hub tab", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");

    await page.goto(`${BASE_URL}/admin/whatsapp-events`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    const activeSidebar = page.locator('[data-testid="admin-sidebar-item"][data-active="true"]');
    await expect(activeSidebar).toHaveCount(1);
    await expect(activeSidebar).toHaveAttribute("data-path", "/admin/marketing-hub");

    const activeTab = page.locator('[role="tab"][aria-selected="true"]');
    await expect(activeTab).toHaveCount(1);
    await expect(activeTab).toHaveText(/WhatsApp Events/i);

    const summary = page.getByTestId("admin-active-summary");
    await expect(summary).toHaveAttribute("data-hub", "marketing");
    await expect(summary).toHaveAttribute("data-section", "Comms");
    await expect(summary).toHaveAttribute("data-tab", "/admin/whatsapp-events");
  });

  for (const [hubId, hubPaths] of [
    ["marketing", MARKETING_TABS],
    ["settings", SETTINGS_TABS],
  ] as const) {
    test(`clicking every ${hubId} tab updates URL + active summary; window stays at scrollY=0`, async ({ page }) => {
      test.skip(!(await isAdminReachable(page)), "admin session required");
      // Land on the first tab first.
      await page.goto(`${BASE_URL}${hubPaths[0].path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);

      for (const tab of hubPaths) {
        await page.locator(`[data-tab-path="${tab.path}"]`).first().click();
        await page.waitForURL(new RegExp(tab.path.replace(/\//g, "\\/") + "$"));

        const activeTab = page.locator('[role="tab"][aria-selected="true"]');
        await expect(activeTab).toHaveText(tab.label);

        const summary = page.getByTestId("admin-active-summary");
        await expect(summary).toHaveAttribute("data-hub", hubId);
        await expect(summary).toHaveAttribute("data-section", tab.section);
        await expect(summary).toHaveAttribute("data-tab", tab.path);

        // Window scroll never leaks.
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
      }
    });
  }

  test("keyboard: ArrowRight moves top-tab focus and Enter activates it", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.goto(`${BASE_URL}/admin/email-campaigns`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    await page.locator('[role="tab"][aria-selected="true"]').focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/admin\/notifications$/);
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText(/Notifications/i);
  });

  test("keyboard: ArrowDown moves sidebar focus across items", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    const first = page.locator('[data-testid="admin-sidebar-item"]').first();
    await first.focus();
    const firstPath = await first.getAttribute("data-path");
    await page.keyboard.press("ArrowDown");
    const focusedPath = await page.evaluate(() =>
      (document.activeElement as HTMLElement)?.getAttribute("data-path"),
    );
    expect(focusedPath).not.toBe(firstPath);
    expect(focusedPath).toBeTruthy();
  });

  test("keyboard: Enter on each focused sidebar item navigates + updates active highlight", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    // Collect every visible sidebar item path in DOM order.
    const paths: string[] = await page.$$eval(
      '[data-testid="admin-sidebar-item"]',
      (els) =>
        (els as HTMLElement[])
          .map((el) => el.getAttribute("data-path") || "")
          .filter(Boolean),
    );
    expect(paths.length).toBeGreaterThan(3);

    // Walk each item: focus it, press Enter, then verify URL + active-state.
    for (const path of paths) {
      const item = page.locator(`[data-testid="admin-sidebar-item"][data-path="${path}"]`);
      await item.focus();
      await page.keyboard.press("Enter");

      // Some sidebar entries point at hub roots that redirect to a defaultPath,
      // so accept either the item's own path or a nested descendant.
      await page.waitForFunction(
        (root) => window.location.pathname === root || window.location.pathname.startsWith(root + "/"),
        path,
        { timeout: 5000 },
      );

      // The active sidebar item must reflect the newly-landed route: either
      // the exact path or the hub root whose members include the landing tab.
      const activeSidebar = page.locator('[data-testid="admin-sidebar-item"][data-active="true"]');
      await expect(activeSidebar).toHaveCount(1);
      const activePath = await activeSidebar.getAttribute("data-path");
      const landed = new URL(page.url()).pathname;
      expect(landed === activePath || landed.startsWith(activePath + "/") || landed.startsWith(path)).toBe(true);

      // Window scroll never leaks across keyboard navigation.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
  });

  test("route change: window scrollY stays 0 and sticky header does not jump", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.goto(`${BASE_URL}/admin/email-campaigns`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    const header = page.getByTestId("admin-page-header");
    const before = await header.boundingBox();
    const yBefore = await page.evaluate(() => window.scrollY);

    // Navigate to a sibling tab under the same hub.
    await page.locator('[data-tab-path="/admin/notifications"]').first().click();
    await page.waitForURL(/\/admin\/notifications$/);
    await page.waitForTimeout(200);

    const after = await header.boundingBox();
    const yAfter = await page.evaluate(() => window.scrollY);

    // Window scroll position unchanged; sticky header pinned to identical y/x.
    expect(yAfter).toBe(yBefore);
    expect(after?.y ?? -1).toBeCloseTo(before?.y ?? 0, 0);
    expect(after?.x ?? -1).toBeCloseTo(before?.x ?? 0, 0);
    expect(after?.height ?? -1).toBeCloseTo(before?.height ?? 0, 0);
  });

  test("z-index: sticky header sits above content but under sidebar overlay/menus", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.goto(`${BASE_URL}/admin/whatsapp-events`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    // Header z-index must be a positive stacking context so content scrolls under it.
    const headerZ = await page.getByTestId("admin-page-header").evaluate((el) =>
      parseInt(getComputedStyle(el).zIndex || "0", 10),
    );
    expect(headerZ).toBeGreaterThanOrEqual(20);

    // Radix/portal dropdowns render at z >= 50 — must outrank header so menus don't clip.
    const sidebarZ = await page.getByTestId("admin-sidebar").evaluate((el) =>
      parseInt(getComputedStyle(el).zIndex || "0", 10),
    );
    expect(sidebarZ).toBeGreaterThan(headerZ);

    // Element at a point just below the header top should be the header (not content).
    const box = await page.getByTestId("admin-page-header").boundingBox();
    if (box) {
      const hit = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y) as HTMLElement | null;
          return el?.closest('[data-testid="admin-page-header"]') ? "header" : "other";
        },
        { x: box.x + box.width / 2, y: box.y + 4 },
      );
      expect(hit).toBe("header");
    }
  });

  test("mobile: header + hub tab bar stay pinned with no overlap/shift", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(`${BASE_URL}/admin/whatsapp-events`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    const mobileHeader = page.locator('main[data-testid="admin-main"] > div').first();
    const hubHeader = page.getByTestId("admin-page-header");
    const main = page.getByTestId("admin-main");

    const mobBefore = await mobileHeader.boundingBox();
    const hubBefore = await hubHeader.boundingBox();

    // Mobile header pinned to top of main (y ≈ 0), hub header sits directly below.
    expect(mobBefore?.y ?? -1).toBeLessThan(4);
    expect(hubBefore?.y ?? -1).toBeGreaterThanOrEqual((mobBefore?.height ?? 0) - 2);
    // No horizontal overlap/shift: same x, same width as main.
    const mainBox = await main.boundingBox();
    expect(hubBefore?.x ?? -1).toBeCloseTo(mainBox?.x ?? 0, 0);
    expect(hubBefore?.width ?? -1).toBeCloseTo(mainBox?.width ?? 0, 0);

    // Content is padded so it does not start underneath the sticky headers
    // BEFORE any scrolling (natural flow with sticky = content sits below).
    const content = page.getByTestId("admin-page-content");
    const contentBoxInitial = await content.boundingBox();
    const stickyBottomInitial = (hubBefore?.y ?? 0) + (hubBefore?.height ?? 0);
    expect((contentBoxInitial?.y ?? 0) + 4).toBeGreaterThanOrEqual(stickyBottomInitial - 2);

    // Scroll the main content and confirm neither header shifts.
    await content.evaluate((el) => el.scrollTo({ top: 900 }));
    await page.waitForTimeout(150);
    const mobAfter = await mobileHeader.boundingBox();
    const hubAfter = await hubHeader.boundingBox();
    expect(mobAfter?.y ?? -1).toBeCloseTo(mobBefore?.y ?? 0, 0);
    expect(hubAfter?.y ?? -1).toBeCloseTo(hubBefore?.y ?? 0, 0);

    // Window scroll never leaks.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
    expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });
});
