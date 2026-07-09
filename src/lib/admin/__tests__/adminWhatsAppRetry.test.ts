/**
 * @file adminWhatsAppRetry.test.ts
 * @description Verifies that retrying a failed order via the admin helper:
 *   1. Opens a WhatsApp share window (or records the block reason)
 *   2. Inserts a new whatsapp_share_events row with actor='admin'
 *   3. Updates orders.whatsapp_share_status to reflect the new attempt
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// -- In-memory fixtures --------------------------------------------------------
const ORDER_ID = "order-uuid-1";
const ordersRow = {
  id: ORDER_ID,
  guest_name: "Test User",
  guest_email: "t@example.com",
  shipping_phone: "01712345678",
  shipping_address: "House 12, Road 5, Dhanmondi",
  shipping_city: "Dhaka",
  total: 1150,
  payment_method: "cod",
  advance_amount: 0,
  transaction_id: null,
  payment_phone: null,
  whatsapp_share_status: "failed",
  whatsapp_share_error: "previous popup blocked",
};
const orderItems = [
  {
    id: "oi-1",
    product_id: "p-1",
    product_name: "Dubai Embroidery Borka",
    quantity: 1,
    price: 1000,
    size: "M",
    color: "Black",
  },
];

// Captures every insert/update so tests can assert on them.
const captured: {
  eventInserts: Array<Record<string, unknown>>;
  orderUpdates: Array<Record<string, unknown>>;
} = { eventInserts: [], orderUpdates: [] };

// -- Mock the supabase client -------------------------------------------------
vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    if (table === "orders") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: ordersRow, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            captured.orderUpdates.push(patch);
            Object.assign(ordersRow, patch);
            return { data: null, error: null };
          },
        }),
      };
    }
    if (table === "order_items") {
      return {
        select: () => ({
          eq: async () => ({ data: orderItems, error: null }),
        }),
      };
    }
    if (table === "products") {
      return {
        select: () => ({
          in: async () => ({ data: [], error: null }),
        }),
      };
    }
    if (table === "whatsapp_share_events") {
      return {
        insert: (row: Record<string, unknown>) => {
          captured.eventInserts.push(row);
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id: `evt-${captured.eventInserts.length}` }, error: null }),
            }),
          };
        },
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

// -- System under test (must be imported AFTER vi.mock) -----------------------
import { retryWhatsAppShareForOrder } from "@/lib/admin/adminWhatsAppRetry";

describe("retryWhatsAppShareForOrder", () => {
  beforeEach(() => {
    captured.eventInserts.length = 0;
    captured.orderUpdates.length = 0;
    ordersRow.whatsapp_share_status = "failed";
    ordersRow.whatsapp_share_error = "previous popup blocked";
  });

  it("logs a new share event with actor='admin' and updates the order status when the popup opens", async () => {
    // Mock window.open to return a truthy window handle (i.e. NOT blocked).
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => ({ closed: false } as unknown as Window));

    const res = await retryWhatsAppShareForOrder(ORDER_ID);

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("retried");
    expect(res.actor).toBe("admin");

    // Exactly one event inserted with actor='admin' + status='retried'.
    expect(captured.eventInserts).toHaveLength(1);
    expect(captured.eventInserts[0]).toMatchObject({
      order_id: ORDER_ID,
      actor: "admin",
      status: "retried",
    });

    // Order row was updated to the new status.
    expect(captured.orderUpdates).toHaveLength(1);
    expect(captured.orderUpdates[0]).toMatchObject({
      whatsapp_share_status: "retried",
    });
    expect(ordersRow.whatsapp_share_status).toBe("retried");

    openSpy.mockRestore();
  });

  it("records a 'blocked' event (still actor='admin') when the browser blocks the popup", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const res = await retryWhatsAppShareForOrder(ORDER_ID);

    expect(res.status).toBe("blocked");
    expect(captured.eventInserts[0]).toMatchObject({
      order_id: ORDER_ID,
      actor: "admin",
      status: "blocked",
    });
    expect(captured.orderUpdates[0]).toMatchObject({
      whatsapp_share_status: "blocked",
    });

    openSpy.mockRestore();
  });
});
