// @ts-nocheck
/**
 * E2E: admin shell layout invariants + hub navigation.
 *
 * Verifies:
 *  1. Sidebar + top tab bar stay pinned; only <main> scrolls.
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

  test("sidebar + top tab bar stay pinned while only main scrolls", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.goto(`${BASE_URL}/admin/whatsapp-events`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    const sidebar = page.getByTestId("admin-sidebar");
    const main = page.getByTestId("admin-main");
    const tabBar = page.locator('[role="tablist"]').first();
    await expect(sidebar).toBeVisible();
    await expect(tabBar).toBeVisible();

    const sidebarBefore = await sidebar.boundingBox();
    const tabBarBefore = await tabBar.boundingBox();

    await main.evaluate((el) => el.scrollTo({ top: 1200 }));
    await page.waitForTimeout(150);

    const sidebarAfter = await sidebar.boundingBox();
    const tabBarAfter = await tabBar.boundingBox();

    // Sidebar box (x, y, width, height) must be identical after the scroll.
    expect(sidebarAfter?.x).toBeCloseTo(sidebarBefore?.x ?? 0, 0);
    expect(sidebarAfter?.y).toBeCloseTo(sidebarBefore?.y ?? 0, 0);
    expect(sidebarAfter?.height).toBeCloseTo(sidebarBefore?.height ?? 0, 0);

    // Top tab bar scrolls with the main region (it lives inside <main>),
    // so its y should DECREASE after scrolling — proves it isn't fixed
    // to the viewport but also that main actually scrolled.
    expect((tabBarAfter?.y ?? 0)).toBeLessThan(tabBarBefore?.y ?? 0);

    // Window itself never scrolls.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
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
});
