// @ts-nocheck
/**
 * E2E: AI Product Studio shell layout invariants.
 *
 * Verifies that on /admin/ai-product-studio the sidebar, admin page header,
 * page title bar and hub tab bar all stay pinned — only the page content
 * container (`data-testid="admin-page-content"`) actually scrolls. This
 * matches the invariant enforced globally in tests/e2e/admin-shell.spec.ts
 * but pins it to the new studio route specifically so we catch regressions
 * that only reproduce on this page (e.g. an inner scroll container leaking
 * out, or the studio wrapping content outside <AdminLayout>).
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

async function isAdminReachable(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  return page.url().includes("/admin");
}

test.describe("AI Product Studio shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("only main content scrolls on /admin/ai-product-studio", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.goto(`${BASE_URL}/admin/ai-product-studio`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Sanity: the studio actually mounted.
    await expect(page.getByTestId("ai-studio-root")).toBeVisible();

    const content = page.getByTestId("admin-page-content");
    const sidebar = page.getByTestId("admin-sidebar");

    const before = await page.evaluate(() => {
      const q = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y };
      };
      return {
        sidebar: q('[data-testid="admin-sidebar"]'),
        header: q('[data-testid="admin-page-header"]'),
        title: q('[data-testid="admin-page-title"]'),
        tabs: document.querySelector('[role="tablist"]')
          ? (() => {
              const b = document.querySelector('[role="tablist"]')!.getBoundingClientRect();
              return { x: b.x, y: b.y };
            })()
          : null,
      };
    });

    // Force the content pane to scroll (studio has plenty of vertical UI once
    // drafts render; even the empty state is tall enough to accept scrollTop).
    await content.evaluate((el) => {
      el.style.minHeight = "3000px"; // ensure scroll room even before uploads
      el.scrollTo({ top: 1200 });
    });
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => {
      const q = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y };
      };
      const tabsEl = document.querySelector('[role="tablist"]');
      const scrollers: string[] = [];
      const allow = new Set(["admin-page-content"]);
      document.querySelectorAll<HTMLElement>("*").forEach((el) => {
        if (el.scrollTop > 0 || el.scrollLeft > 0) {
          const id = el.getAttribute("data-testid") || el.tagName.toLowerCase();
          if (!allow.has(id)) scrollers.push(id);
        }
      });
      return {
        sidebar: q('[data-testid="admin-sidebar"]'),
        header: q('[data-testid="admin-page-header"]'),
        title: q('[data-testid="admin-page-title"]'),
        tabs: tabsEl
          ? (() => {
              const b = tabsEl.getBoundingClientRect();
              return { x: b.x, y: b.y };
            })()
          : null,
        windowScrollY: window.scrollY,
        contentScrollTop: (document.querySelector('[data-testid="admin-page-content"]') as HTMLElement).scrollTop,
        unexpectedScrollers: scrollers,
      };
    });

    // Pinned elements never moved.
    for (const k of ["sidebar", "header", "title", "tabs"] as const) {
      if (before[k] && after[k]) {
        expect(after[k]!.y).toBeCloseTo(before[k]!.y, 0);
        expect(after[k]!.x).toBeCloseTo(before[k]!.x, 0);
      }
    }
    expect(after.windowScrollY).toBe(0);
    expect(after.contentScrollTop).toBeGreaterThan(0);
    expect(after.unexpectedScrollers).toEqual([]);
    await expect(sidebar).toBeVisible();
  });
});
