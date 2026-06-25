export interface AppliedCoupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  minimum_order_amount: number | null;
  current_uses?: number;
}

export interface DeliveryZone {
  id: string;
  zone_name: string;
  city: string;
  shipping_charge: number;
  estimated_days: number | null;
  areas: string[] | null;
}

export interface CheckoutShippingInfo {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  district: string;
  postalCode: string;
}

export type PaymentMethodId = "bkash" | "nagad" | "advance_cod" | "cod";

export interface PaymentMethodOption {
  id: PaymentMethodId;
  name: string;
  icon: string;
  description: string;
  hasManual: boolean;
  number?: string;
}

export const paymentMethods: PaymentMethodOption[] = [
  { id: "bkash", name: "bKash", icon: "📱", description: "Pay via bKash", hasManual: true, number: "01845853634" },
  { id: "nagad", name: "Nagad", icon: "💳", description: "Pay via Nagad", hasManual: true, number: "01845853634" },
  { id: "advance_cod", name: "Advance + COD", icon: "💰", description: "Partial advance payment, rest on delivery", hasManual: false },
  { id: "cod", name: "Cash on Delivery", icon: "💵", description: "Full payment on delivery", hasManual: false },
];

export const emptyShippingInfo: CheckoutShippingInfo = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  district: "",
  postalCode: "",
};
