import { describe, it, expect } from "vitest";
import { createSubmitGuard } from "../submitGuard";

describe("createSubmitGuard (Confirm Order double-submit guard)", () => {
  it("first tryAcquire returns true, second returns false", () => {
    const g = createSubmitGuard();
    expect(g.tryAcquire()).toBe(true);
    expect(g.tryAcquire()).toBe(false);
    expect(g.isLocked()).toBe(true);
  });

  it("release restores availability for a subsequent attempt", () => {
    const g = createSubmitGuard();
    g.tryAcquire();
    g.release();
    expect(g.isLocked()).toBe(false);
    expect(g.tryAcquire()).toBe(true);
  });

  it("blocks a concurrent second click while the first async op is in flight", async () => {
    const g = createSubmitGuard();
    let placedOrders = 0;

    const placeOrder = async () => {
      if (!g.tryAcquire()) return "blocked";
      try {
        await new Promise((r) => setTimeout(r, 20));
        placedOrders += 1;
        return "placed";
      } finally {
        g.release();
      }
    };

    // Fire two "clicks" back-to-back without awaiting the first.
    const [first, second] = await Promise.all([placeOrder(), placeOrder()]);
    expect([first, second].sort()).toEqual(["blocked", "placed"]);
    expect(placedOrders).toBe(1);
  });
});
