/**
 * @file checkoutWhatsappFlow.test.ts
 * @description End-to-end integration test covering the checkout confirm →
 * submit-guard → WhatsApp auto-share → retry sequence, orchestrated at the
 * library level (no React needed).
 *
 * Sequence covered:
 *   1. Confirm Order acquires the submit-guard lock.
 *   2. A second Confirm click while processing is BLOCKED by the guard.
 *   3. The successful WhatsApp auto-share inserts a whatsapp_share_events
 *      row with actor='customer' and updates the order row.
 *   4. When the initial share fails (popup blocked), the admin/customer
 *      retry inserts a second event and flips the status.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// --- In-memory fixtures ------------------------------------------------------
const ORDER_ID = "e2e-order-1";
const orderRow = {
  id: ORDER_ID,
  guest_name: "E2E User",
  guest_email: "",
  shipping_phone: "01712345678",
  shipping_address: "House 1, Road 2, Dhaka",
  shipping_city: "Dhaka",
  total: 1150,
  payment_method: "cod",
  advance_amount: 0,
  transaction_id: null,
  payment_phone: null,
  whatsapp_share_status: null as string | null,
  whatsapp_share_error: null as string | null,
};
const orderItems = [
  { id: "oi-1", product_id: "p-1", product_name: "Test Borka",
    quantity: 1, price: 1000, size: "M", color: "Black" },
];
const captured = {
  events: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
};

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    if (table === "orders") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: orderRow, error: null }) }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            captured.updates.push(patch);
            Object.assign(orderRow, patch);
            return { data: null, error: null };
          },
        }),
      };
    }
    if (table === "order_items") {
      return { select: () => ({ eq: async () => ({ data: orderItems, error: null }) }) };
    }
    if (table === "products") {
      return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
    }
    if (table === "whatsapp_share_events") {
      return {
        insert: (row: Record<string, unknown>) => {
          captured.events.push(row);
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id: `evt-${captured.events.length}` }, error: null }),
            }),
          };
        },
        select: () => ({
          eq: () => ({
            order: async () => ({ data: [...captured.events], error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  };
  return {
    supabase: {
      from,
      functions: { invoke: async () => ({ data: null, error: new Error("skip cloud api in tests") }) },
    },
  };
});

// --- SUT ---------------------------------------------------------------------
import { createSubmitGuard } from "@/lib/checkout/submitGuard";
import { shareOrderToWhatsApp, type OrderReceipt } from "@/lib/checkout/whatsappShare";
import { retryWhatsAppShareForOrder } from "@/lib/admin/adminWhatsAppRetry";

const receipt: OrderReceipt = {
  orderId: ORDER_ID,
  items: [
    {
      id: "oi-1", product_id: "p-1", quantity: 1, size: "M", color: "Black",
      product: { id: "p-1", name: "Test Borka", price: 1000, sale_price: 0, image_url: "", category: "" },
    },
  ] as unknown as OrderReceipt["items"],
  shippingInfo: {
    fullName: "E2E User", phone: "01712345678", email: "",
    address: "House 1, Road 2, Dhaka", city: "Dhaka", district: "", postalCode: "",
  },
  subtotal: 1000, discountAmount: 0, shippingCost: 150, finalTotal: 1150,
  selectedPayment: "cod",
};

describe("E2E: Confirm → guard → auto-share → retry", () => {
  beforeEach(() => {
    captured.events.length = 0;
    captured.updates.length = 0;
    orderRow.whatsapp_share_status = null;
    orderRow.whatsapp_share_error = null;
  });

  it("runs the full flow: guard blocks double-click, auto-share succeeds, retry after a failed status flips it green", async () => {
    // STEP 1 — Confirm Order acquires the guard.
    const guard = createSubmitGuard();
    expect(guard.tryAcquire()).toBe(true);
    // STEP 2 — Second Confirm click is blocked while processing.
    expect(guard.tryAcquire()).toBe(false);
    expect(guard.isLocked()).toBe(true);

    // STEP 3 — Auto-share opens WhatsApp successfully (popup NOT blocked).
    const openSpy = vi.spyOn(window, "open")
      .mockImplementation(() => ({ closed: false } as unknown as Window));

    const first = await shareOrderToWhatsApp(receipt);
    expect(first.status).toBe("opened");
    expect(first.actor).toBe("customer");
    expect(captured.events.at(-1)).toMatchObject({
      order_id: ORDER_ID, actor: "customer", status: "opened",
    });
    expect(orderRow.whatsapp_share_status).toBe("opened");

    // Release the guard after the placeOrder + share completes.
    guard.release();
    expect(guard.isLocked()).toBe(false);

    // STEP 4 — Simulate a subsequent FAILED status (popup blocked this time).
    openSpy.mockImplementation(() => null);
    const blocked = await shareOrderToWhatsApp(receipt);
    expect(blocked.status).toBe("blocked");
    expect(blocked.error).toBeTruthy();
    expect(orderRow.whatsapp_share_status).toBe("blocked");

    // STEP 5 — Retry from admin flips it back to 'retried' with actor='admin'.
    openSpy.mockImplementation(() => ({ closed: false } as unknown as Window));
    const retry = await retryWhatsAppShareForOrder(ORDER_ID);
    expect(retry.status).toBe("retried");
    expect(retry.actor).toBe("admin");
    expect(captured.events.at(-1)).toMatchObject({
      order_id: ORDER_ID, actor: "admin", status: "retried",
    });
    expect(orderRow.whatsapp_share_status).toBe("retried");

    // Exactly 3 events total across the whole flow.
    expect(captured.events).toHaveLength(3);

    openSpy.mockRestore();
  });
});
