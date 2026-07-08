/**
 * SimpleCheckoutForm — Confirm Order interaction tests.
 *
 * Covers:
 *  1. Confirm Order button triggers `onConfirmOrder` exactly once per click.
 *  2. `processing=true` disables the button (submit-guard visual contract):
 *     multiple rapid clicks while processing MUST NOT re-fire the handler.
 *  3. Post-order share actions are wired through the parent contract:
 *     the parent decides what to do after `onConfirmOrder` (place order +
 *     auto-share to WhatsApp). This test verifies the form correctly hands
 *     off exactly one confirm signal and stays inert while processing.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SimpleCheckoutForm from "../SimpleCheckoutForm";
import type { CheckoutShippingInfo } from "@/lib/checkout/types";

function renderForm(overrides: Partial<Parameters<typeof SimpleCheckoutForm>[0]> = {}) {
  const shippingInfo: CheckoutShippingInfo = {
    fullName: "Rakib Ahmed", phone: "01712345678", email: "",
    address: "12/A Green Road, Dhaka", city: "", district: "", postalCode: "",
  };
  const onConfirmOrder = vi.fn();
  const props = {
    shippingInfo,
    setShippingInfo: vi.fn(),
    errors: {},
    deliveryNotes: "",
    setDeliveryNotes: vi.fn(),
    deliveryZones: [],
    selectedZone: null,
    onSelectZone: vi.fn(),
    showZoneSelector: false,
    selectedPayment: "cod" as const,
    setSelectedPayment: vi.fn(),
    advanceAmount: "",
    setAdvanceAmount: vi.fn(),
    advancePaymentMethod: "bkash" as const,
    setAdvancePaymentMethod: vi.fn(),
    transactionId: "",
    setTransactionId: vi.fn(),
    paymentPhone: "",
    setPaymentPhone: vi.fn(),
    finalTotal: 1650,
    processing: false,
    onConfirmOrder,
    ...overrides,
  };
  render(<SimpleCheckoutForm {...props} />);
  return { onConfirmOrder, props };
}

describe("SimpleCheckoutForm — Confirm Order + submit-guard", () => {
  it("fires onConfirmOrder once when the confirm button is clicked", () => {
    const { onConfirmOrder } = renderForm();
    const btn = screen.getByRole("button", { name: /অর্ডার কনফার্ম করুন/ });
    fireEvent.click(btn);
    expect(onConfirmOrder).toHaveBeenCalledTimes(1);
  });

  it("renders the final total inside the confirm button label", () => {
    renderForm({ finalTotal: 1650 });
    expect(
      screen.getByRole("button", { name: /অর্ডার কনফার্ম করুন.*১|1,?650/ })
    ).toBeInTheDocument();
  });

  it("disables the confirm button while processing (submit-guard contract)", () => {
    const { onConfirmOrder } = renderForm({ processing: true });
    const btn = screen.getByRole("button", { name: /প্রসেসিং/ });
    expect(btn).toBeDisabled();
    // Rapid double-click must not re-invoke — the guard is the disabled state.
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onConfirmOrder).not.toHaveBeenCalled();
  });

  it("renders inline errors for name/phone/address (validation surface)", () => {
    renderForm({
      errors: {
        fullName: "নাম দিন — এটি বাধ্যতামূলক",
        phone: "বাংলাদেশি মোবাইল ফরম্যাট নয়",
        address: "পুরো ঠিকানা দিন — এটি বাধ্যতামূলক",
      },
    });
    expect(screen.getByText(/নাম দিন/)).toBeInTheDocument();
    expect(screen.getByText(/মোবাইল ফরম্যাট/)).toBeInTheDocument();
    expect(screen.getByText(/পুরো ঠিকানা দিন/)).toBeInTheDocument();
  });

  it("hands off exactly one confirm signal so the parent can trigger the post-order share flow", () => {
    // The parent's onConfirmOrder handler is responsible for:
    //   1. Opening the AlertDialog / running submit-guard
    //   2. Calling placeOrder + shareOrderToWhatsApp
    // This test locks in the contract: one click -> one handoff, no more.
    const { onConfirmOrder } = renderForm();
    const btn = screen.getByRole("button", { name: /অর্ডার কনফার্ম করুন/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onConfirmOrder).toHaveBeenCalledTimes(3);
    // The submit-guard itself lives in the parent — see FloatingCartSidebar
    // and the createSubmitGuard unit test in src/lib/checkout/__tests__.
  });
});
