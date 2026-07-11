// @ts-nocheck
/**
 * E2E: AI Product Studio analyze flow + provider fallback trace.
 *
 * Verifies:
 *  1. Admin can run the built-in audit and get a summarised pass/fail card.
 *  2. When an image is uploaded, the analyze-product-image edge function is
 *     called and the returned provider_used + attempts trace surface in the
 *     draft card ("Provider:" pill + "Fallback trace" details element).
 *  3. When the AI returns an incomplete draft (missing category/price/sizes),
 *     the validator surfaces a visible warning banner ("বাধ্যতামূলক তথ্য মিসিং").
 *
 * The edge function is mocked via page.route so the test does not depend on
 * live AI credit or the current provider chain.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

async function isAdminReachable(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  return page.url().includes("/admin");
}

/**
 * Intercepts the analyze-product-image edge function so tests can assert the
 * UI without a live AI call. Passes back a full draft + a two-provider
 * attempts trace where the first provider "failed" and the second succeeded.
 */
async function mockAnalyze(page: Page, opts: { valid: boolean }) {
  await page.route("**/functions/v1/analyze-product-image", (route) => {
    const body = opts.valid
      ? {
          draft: {
            name: "Playwright Test Abaya",
            category: "Abaya",
            subcategory: "Open Abaya",
            fabric: "Nida",
            work_type: "Embroidery",
            part: "1 Part",
            hijab_included: false,
            inner_included: false,
            colors: ["Black", "Gold"],
            estimated_price_bdt: 4500,
            sale_price_bdt: null,
            description:
              "A sample abaya used for automated tests. It has enough length to satisfy the validator.",
            meta_title: "Test Abaya",
            meta_description: "Test abaya description for e2e verification",
            image_alt_text: "Black test abaya",
          },
          provider_used: { name: "Lovable AI Gateway", model: "google/gemini-2.5-flash" },
          attempts: [
            { name: "Primary Custom", model: "gpt-4o-mini", ok: false, status: 401, latency_ms: 210, error: "HTTP 401: unauthorized" },
            { name: "Lovable AI Gateway", model: "google/gemini-2.5-flash", ok: true, status: 200, latency_ms: 1450 },
          ],
        }
      : {
          // Intentionally empty draft → validator should flag missing fields.
          draft: {
            name: "",
            category: "",
            colors: [],
            estimated_price_bdt: 0,
            description: "",
          },
          provider_used: { name: "Lovable AI Gateway", model: "google/gemini-2.5-flash" },
          attempts: [{ name: "Lovable AI Gateway", model: "google/gemini-2.5-flash", ok: true, status: 200, latency_ms: 900 }],
        };
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

/** Drops a 1x1 PNG through the studio's hidden `<input type="file">`. */
async function dropSampleImage(page: Page) {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
    "base64",
  );
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: png });
}

test.describe("AI Product Studio — analyze + audit", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1100 });
  });

  test("Run Audit surfaces summarised pass/fail card", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await page.goto(`${BASE_URL}/admin/ai-product-studio`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("ai-studio-root")).toBeVisible();

    await page.getByTestId("run-audit-btn").click();
    const report = page.getByTestId("audit-report");
    await expect(report).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("audit-summary")).toContainText(/\d+\/\d+ passed/);
    // At least one pass row rendered.
    await expect(page.getByTestId("audit-pass").first()).toBeVisible();
  });

  test("Analyze surfaces provider trace + last-used metrics", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await mockAnalyze(page, { valid: true });
    await page.goto(`${BASE_URL}/admin/ai-product-studio`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("ai-studio-root")).toBeVisible();

    await dropSampleImage(page);

    // Wait for the mocked analyze to resolve.
    await expect(page.getByTestId("provider-used")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("provider-used")).toContainText("Lovable AI Gateway");

    const trace = page.getByTestId("fallback-trace");
    await expect(trace).toBeVisible();
    // Both attempts appear in the trace (the failed one + the success).
    await expect(trace).toContainText("Primary Custom");
    await expect(trace).toContainText("HTTP 401");

    // Header metrics show the last-used provider + at least one per-provider badge.
    await expect(page.getByTestId("last-provider-used")).toContainText("Lovable AI Gateway");
    await expect(page.getByTestId("provider-metric").first()).toBeVisible();
  });

  test("Empty AI response triggers validator warning banner", async ({ page }) => {
    test.skip(!(await isAdminReachable(page)), "admin session required");
    await mockAnalyze(page, { valid: false });
    await page.goto(`${BASE_URL}/admin/ai-product-studio`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("ai-studio-root")).toBeVisible();

    await dropSampleImage(page);

    // Provider row must have arrived first so we know analysis completed.
    await expect(page.getByTestId("provider-used")).toBeVisible({ timeout: 15_000 });
    // Aggregate validator banner must appear for the missing-required-fields draft.
    await expect(page.getByTestId("validation-summary")).toBeVisible();
    await expect(page.getByTestId("validation-summary")).toContainText("বাধ্যতামূলক");
  });
});
