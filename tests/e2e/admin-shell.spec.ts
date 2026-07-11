// @ts-nocheck
/**
 * E2E: admin shell layout invariants.
 *
 * Verifies:
 *  1. Sidebar is sticky (stays in place when main content scrolls).
 *  2. Only the <main> region scrolls — document body does not scroll.
 *  3. Hub top-tab bar and sidebar highlight the current nested route.
 *
 * These tests rely on the app running at BASE_URL and an authenticated
 * admin session. If no session is available, they are skipped so CI does
 * not fail on unauth'd runs.
 *
 * Run: BASE_URL=http://localhost:8080 npx playwright test tests/e2e/admin-shell.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

async function isAdminReachable(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
  // Auth guard redirects unauth'd users away from /admin.
  await page.waitForTimeout(800);
  return page.url().includes("/admin");
}

test.describe("admin shell", () => {
  test("sidebar stays sticky while only main content scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    test.skip(!(await isAdminReachable(page)), "admin session required");

    const sidebar = page.getByTestId("admin-sidebar");
    const main = page.getByTestId("admin-main");
    await expect(sidebar).toBeVisible();

    const before = await sidebar.boundingBox();
    // Scroll the main region, not the window.
    await main.evaluate((el) => el.scrollTo({ top: 800 }));
    await page.waitForTimeout(150);
    const after = await sidebar.boundingBox();
    expect(after?.y).toBeCloseTo(before?.y ?? 0, 0);

    // Window itself must not have scrolled.
    const windowScrollY = await page.evaluate(() => window.scrollY);
    expect(windowScrollY).toBe(0);

    // Main region actually scrolled.
    const mainScrollTop = await main.evaluate((el) => el.scrollTop);
    expect(mainScrollTop).toBeGreaterThan(0);
  });

  test("route-based active state — sidebar + hub tabs highlight the nested route", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    test.skip(!(await isAdminReachable(page)), "admin session required");

    // Navigate into a hub member route (Marketing → WhatsApp Events).
    await page.goto(`${BASE_URL}/admin/whatsapp-events`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    // Sidebar: the Marketing & Comms entry should be active.
    const activeSidebarItems = page.locator(
      '[data-testid="admin-sidebar-item"][data-active="true"]',
    );
    await expect(activeSidebarItems).toHaveCount(1);
    await expect(activeSidebarItems).toHaveAttribute("data-path", "/admin/marketing-hub");

    // Top tab bar: exactly one tab should be selected, matching the URL.
    const activeTab = page.locator('[role="tab"][aria-selected="true"]');
    await expect(activeTab).toHaveCount(1);
    await expect(activeTab).toHaveText(/WhatsApp Events/i);

    // Switch to a Settings tab and re-verify.
    await page.goto(`${BASE_URL}/admin/security`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await expect(
      page.locator('[data-testid="admin-sidebar-item"][data-active="true"]'),
    ).toHaveAttribute("data-path", "/admin/settings");
    const activeSettingsTab = page.locator('[role="tab"][aria-selected="true"]');
    await expect(activeSettingsTab).toHaveText(/Security/i);
  });
});
