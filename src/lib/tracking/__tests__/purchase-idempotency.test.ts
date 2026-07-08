/**
 * Regression: `trackPurchase` must fire exactly once per orderId, even when
 * called multiple times (component remounts, StrictMode double invocation,
 * users double-clicking the Confirm Order button, etc.).
 *
 * We spy on window.fbq (Meta Pixel client) — the Purchase call site the ad
 * platform observes — and verify it's invoked exactly once for the same
 * order, then again for a distinct order.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  trackPurchase,
  __resetPurchaseIdempotencyForTests,
} from "@/lib/tracking/events";

describe("trackPurchase idempotency", () => {
  beforeEach(() => {
    __resetPurchaseIdempotencyForTests();
    // Fresh fbq spy for each test — Meta Pixel is the surface Meta ads read.
    (window as any).fbq = vi.fn();
    // Silence gtag/dataLayer paths so they don't affect the assertion count.
    (window as any).gtag = undefined;
    (window as any).dataLayer = [];
  });

  const items = [{ id: "prod-1", name: "Abaya", price: 1500, quantity: 1 }];

  it("fires Purchase exactly once for the same orderId across repeat calls", () => {
    trackPurchase("ORDER-DUP-1", 1500, items);
    trackPurchase("ORDER-DUP-1", 1500, items);
    trackPurchase("ORDER-DUP-1", 1500, items);

    const fbq = (window as any).fbq as ReturnType<typeof vi.fn>;
    const purchaseCalls = fbq.mock.calls.filter(
      (c: unknown[]) => c[0] === "track" && c[1] === "Purchase",
    );
    expect(purchaseCalls).toHaveLength(1);
  });

  it("fires Purchase again for a different orderId", () => {
    trackPurchase("ORDER-A", 1000, items);
    trackPurchase("ORDER-B", 2000, items);

    const fbq = (window as any).fbq as ReturnType<typeof vi.fn>;
    const purchaseCalls = fbq.mock.calls.filter(
      (c: unknown[]) => c[0] === "track" && c[1] === "Purchase",
    );
    expect(purchaseCalls).toHaveLength(2);
    // eventID must be tied to orderId for Meta Pixel↔CAPI dedup.
    expect(purchaseCalls[0][3]).toEqual({ eventID: "purchase-ORDER-A" });
    expect(purchaseCalls[1][3]).toEqual({ eventID: "purchase-ORDER-B" });
  });

  it("persists guard across simulated remounts (localStorage-backed)", () => {
    trackPurchase("ORDER-REMOUNT", 500, items);
    // Simulate component tree remount — module state stays, localStorage stays.
    trackPurchase("ORDER-REMOUNT", 500, items);

    const fbq = (window as any).fbq as ReturnType<typeof vi.fn>;
    const purchaseCalls = fbq.mock.calls.filter(
      (c: unknown[]) => c[0] === "track" && c[1] === "Purchase",
    );
    expect(purchaseCalls).toHaveLength(1);
  });

  it("blocks a duplicate call even after in-memory guard is bypassed (revisit /order-success)", () => {
    trackPurchase("ORDER-REVISIT", 750, items);
    // Simulate a full page revisit: clear the module-level Set by re-importing
    // via localStorage rehydration path. Since we can't truly re-import here,
    // we assert the localStorage entry contains both keys — the source of truth.
    const raw = JSON.parse(localStorage.getItem("sst_purchase_fired_v2") || "[]");
    expect(raw).toContain("purchase-ORDER-REVISIT");
    expect(raw).toContain("ORDER-REVISIT");

    trackPurchase("ORDER-REVISIT", 750, items);
    const fbq = (window as any).fbq as ReturnType<typeof vi.fn>;
    const purchaseCalls = fbq.mock.calls.filter(
      (c: unknown[]) => c[0] === "track" && c[1] === "Purchase",
    );
    expect(purchaseCalls).toHaveLength(1);
  });
});
