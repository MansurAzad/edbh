import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SimpleCheckoutForm from "../SimpleCheckoutForm";
import type { CheckoutShippingInfo } from "@/lib/checkout/types";

// Minimal factory for props — tests only care about the error surface.
function renderWith(errors: {
  fullName?: string;
  phone?: string;
  address?: string;
}) {
  const shippingInfo: CheckoutShippingInfo = {
    fullName: "", phone: "", email: "", address: "",
    city: "", district: "", postalCode: "",
  };
  return render(
    <SimpleCheckoutForm
      shippingInfo={shippingInfo}
      setShippingInfo={vi.fn()}
      errors={errors}
      deliveryNotes=""
      setDeliveryNotes={vi.fn()}
      deliveryZones={[]}
      selectedZone={null}
      onSelectZone={vi.fn()}
      showZoneSelector={false}
      selectedPayment="cod"
      setSelectedPayment={vi.fn()}
      advanceAmount=""
      setAdvanceAmount={vi.fn()}
      advancePaymentMethod="bkash"
      setAdvancePaymentMethod={vi.fn()}
      transactionId=""
      setTransactionId={vi.fn()}
      paymentPhone=""
      setPaymentPhone={vi.fn()}
      finalTotal={0}
      processing={false}
      onConfirmOrder={vi.fn()}
    />
  );
}

describe("SimpleCheckoutForm — error rendering", () => {
  it("renders the fullName error message", () => {
    renderWith({ fullName: "নাম দিন — এটি বাধ্যতামূলক" });
    expect(screen.getByText(/নাম দিন — এটি বাধ্যতামূলক/)).toBeInTheDocument();
  });

  it("renders the phone error message", () => {
    renderWith({ phone: "বাংলাদেশি মোবাইল ফরম্যাট নয় (01 দিয়ে শুরু, ১১ সংখ্যা)" });
    expect(screen.getByText(/বাংলাদেশি মোবাইল ফরম্যাট/)).toBeInTheDocument();
  });

  it("renders the address error message", () => {
    renderWith({ address: "পুরো ঠিকানা দিন — এটি বাধ্যতামূলক" });
    expect(screen.getByText(/পুরো ঠিকানা দিন/)).toBeInTheDocument();
  });

  it("renders all three simultaneously when the whole form is empty", () => {
    renderWith({
      fullName: "নাম দিন — এটি বাধ্যতামূলক",
      phone: "মোবাইল নম্বর দিন — এটি বাধ্যতামূলক",
      address: "পুরো ঠিকানা দিন — এটি বাধ্যতামূলক",
    });
    expect(screen.getByText(/নাম দিন/)).toBeInTheDocument();
    expect(screen.getByText(/মোবাইল নম্বর দিন/)).toBeInTheDocument();
    expect(screen.getByText(/পুরো ঠিকানা দিন/)).toBeInTheDocument();
  });

  it("does not render error affordances when errors object is empty", () => {
    renderWith({});
    expect(screen.queryByText(/দিন — এটি বাধ্যতামূলক/)).toBeNull();
  });
});
