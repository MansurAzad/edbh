/**
 * @fileoverview Shared TypeScript contracts for the checkout pipeline.
 *
 * This module is the single source of truth for every type, interface, and
 * constant that flows through the checkout experience — from coupon validation
 * all the way to payment method configuration.
 *
 * চেকআউট পাইপলাইনের সমস্ত টাইপ, ইন্টারফেস এবং কনস্ট্যান্ট এখানে সংজ্ঞায়িত।
 * নতুন টাইপ যোগ করতে হলে এই ফাইলেই যোগ করুন।
 *
 * @module lib/checkout/types
 */

// ---------------------------------------------------------------------------
// Coupon / Discount
// ---------------------------------------------------------------------------

/**
 * Represents a coupon that has already been validated and applied to an order.
 *
 * প্রযোজ্য কুপনের ডেটা স্ট্রাকচার। কুপন যাচাই হওয়ার পরেই এই অবজেক্ট তৈরি হয়।
 *
 * @example
 * const coupon: AppliedCoupon = {
 *   id: "abc123",
 *   code: "SAVE10",
 *   description: "10% off on all orders",
 *   discount_type: "percentage",
 *   discount_value: 10,
 *   minimum_order_amount: 500,
 * };
 */
export interface AppliedCoupon {
  /** Supabase primary-key UUID of the coupon row. কুপনের ডেটাবেস আইডি। */
  id: string;

  /**
   * Human-readable promotional code entered by the customer.
   * গ্রাহকের দেওয়া প্রোমো কোড (যেমন "SAVE10")।
   */
  code: string;

  /**
   * Optional marketing copy shown below the applied coupon badge.
   * কুপনের বিবরণ — null হলে UI তে দেখানো হয় না।
   */
  description: string | null;

  /**
   * Determines how the discount is calculated.
   * - `"percentage"` — discount_value % off the order subtotal.
   * - `"fixed"`      — flat ৳ amount deducted from the subtotal.
   *
   * ডিসকাউন্ট কীভাবে হিসাব হবে: "percentage" বা "fixed"।
   */
  discount_type: string;

  /**
   * Numeric magnitude of the discount.
   * For `percentage` coupons this is 0–100; for `fixed` it is a BDT amount.
   *
   * ডিসকাউন্টের পরিমাণ। percentage হলে 0-100, fixed হলে টাকার পরিমাণ।
   */
  discount_value: number;

  /**
   * Minimum cart subtotal (in BDT) required for this coupon to be valid.
   * null means no minimum is enforced.
   *
   * কুপন ব্যবহারের জন্য নূন্যতম অর্ডারের পরিমাণ (টাকায়)। null মানে কোনো শর্ত নেই।
   */
  minimum_order_amount: number | null;

  /**
   * How many times this coupon has been redeemed so far (used for usage-cap checks).
   * Optional because it is only needed during validation, not display.
   *
   * এই কুপন কতবার ব্যবহার হয়েছে — শুধুমাত্র যাচাইয়ের সময় দরকার।
   */
  current_uses?: number;
}

// ---------------------------------------------------------------------------
// Delivery / Shipping Zones
// ---------------------------------------------------------------------------

/**
 * A single geographic delivery zone fetched from the `delivery_zones` table.
 *
 * প্রতিটি ডেলিভারি জোনের ডেটা স্ট্রাকচার।
 * Supabase-এ `delivery_zones` টেবিল থেকে আনা হয়।
 *
 * @example
 * const dhaka: DeliveryZone = {
 *   id: "zone-01",
 *   zone_name: "ঢাকা সিটি",
 *   city: "Dhaka",
 *   shipping_charge: 60,
 *   estimated_days: 1,
 *   areas: ["Dhanmondi", "Mirpur", "Uttara"],
 * };
 */
export interface DeliveryZone {
  /** Supabase UUID primary key. ডেটাবেসের ইউনিক আইডি। */
  id: string;

  /**
   * Display name shown in the zone picker dropdown.
   * ডেলিভারি জোনের নাম (ড্রপডাউনে দেখানো হয়)।
   */
  zone_name: string;

  /**
   * Canonical city string used for auto-matching when the user types a city.
   * শহরের নাম — ব্যবহারকারীর ইনপুটের সাথে মিলিয়ে জোন অটো-সিলেক্ট করা হয়।
   */
  city: string;

  /**
   * Delivery charge in BDT added to the order total.
   * শিপিং চার্জ — অর্ডার মোটের সাথে যোগ হয়। (বাংলাদেশি টাকায়)
   */
  shipping_charge: number;

  /**
   * Estimated number of business days for delivery.
   * null when no SLA is defined for the zone.
   *
   * প্রাক্কলিত ডেলিভারি সময় (কর্মদিবসে)। null মানে নির্দিষ্ট নেই।
   */
  estimated_days: number | null;

  /**
   * Sub-areas or neighbourhoods within the zone shown as helper text.
   * null if the zone covers the whole city without sub-divisions.
   *
   * জোনের অন্তর্গত এলাকার তালিকা। null হলে পুরো শহর।
   */
  areas: string[] | null;
}

// ---------------------------------------------------------------------------
// Shipping / Recipient Information
// ---------------------------------------------------------------------------

/**
 * All the address fields collected in the checkout shipping step.
 *
 * চেকআউটের শিপিং ধাপে সংগ্রহ করা ঠিকানার সমস্ত তথ্য।
 *
 * Invariant: `fullName`, `phone`, and `address` are required before the user
 * can advance to payment. `email`, `district`, and `postalCode` are optional.
 *
 * @example
 * const info: CheckoutShippingInfo = {
 *   fullName: "রহিম উদ্দিন",
 *   phone: "01812345678",
 *   email: "",
 *   address: "বাড়ি ৫, রোড ৭, ধানমন্ডি",
 *   city: "Dhaka",
 *   district: "Dhaka",
 *   postalCode: "1209",
 * };
 */
export interface CheckoutShippingInfo {
  /**
   * Recipient's full name printed on the shipping label.
   * প্রাপকের পুরো নাম — শিপিং লেবেলে ছাপা হয়।
   */
  fullName: string;

  /**
   * Primary contact number (Bangladeshi mobile format preferred: 01XXXXXXXXX).
   * যোগাযোগের মোবাইল নম্বর।
   */
  phone: string;

  /**
   * Optional email — only collected for guest checkouts for order confirmation.
   * ঐচ্ছিক ইমেইল — গেস্ট চেকআউটে অর্ডার কনফার্মেশনের জন্য নেওয়া হয়।
   */
  email: string;

  /**
   * Street-level address including house/building number, road, and area.
   * বাড়ির নম্বর, রোড ও এলাকাসহ সম্পূর্ণ ঠিকানা।
   */
  address: string;

  /**
   * City name — drives auto-detection of the delivery zone via `useDeliveryZones`.
   * শহরের নাম — এটি থেকে ডেলিভারি জোন স্বয়ংক্রিয়ভাবে খোঁজা হয়।
   */
  city: string;

  /**
   * Administrative district — ঐচ্ছিক, প্রশাসনিক জেলার নাম।
   */
  district: string;

  /**
   * Bangladesh Post postal/ZIP code — ঐচ্ছিক, পোস্টাল কোড।
   */
  postalCode: string;
}

// ---------------------------------------------------------------------------
// Payment Methods
// ---------------------------------------------------------------------------

/**
 * Union type of all supported payment method identifiers.
 *
 * সব সমর্থিত পেমেন্ট পদ্ধতির আইডি।
 *
 * - `"bkash"`       — bKash mobile financial service
 * - `"nagad"`       — Nagad mobile financial service
 * - `"advance_cod"` — Partial advance + cash on delivery hybrid
 * - `"cod"`         — Full cash on delivery
 */
export type PaymentMethodId = "bkash" | "nagad" | "advance_cod" | "cod";

/**
 * Full configuration object for a single payment method option.
 * Used to render the payment method picker cards in the checkout UI.
 *
 * একটি পেমেন্ট পদ্ধতির সম্পূর্ণ কনফিগারেশন।
 * চেকআউটে পেমেন্ট কার্ড রেন্ডার করতে ব্যবহৃত হয়।
 */
export interface PaymentMethodOption {
  /** Unique identifier — maps to `PaymentMethodId`. পেমেন্ট পদ্ধতির আইডি। */
  id: PaymentMethodId;

  /** Short display name shown on the card. সংক্ষিপ্ত নাম (যেমন "bKash")। */
  name: string;

  /**
   * Emoji or icon string rendered next to the method name.
   * পেমেন্ট আইকন (ইমোজি বা স্ট্রিং)।
   */
  icon: string;

  /**
   * One-line description of how the payment works.
   * পেমেন্ট পদ্ধতির সংক্ষিপ্ত বিবরণ।
   */
  description: string;

  /**
   * Whether this method requires the customer to manually enter a
   * transaction/reference number after completing payment in their app.
   *
   * ট্রানজেকশন নম্বর ম্যানুয়ালি ইনপুট করতে হবে কিনা।
   * bKash/Nagad-এর জন্য true, COD-এর জন্য false।
   */
  hasManual: boolean;

  /**
   * Business mobile wallet number to send payment to (bKash / Nagad only).
   * যে নম্বরে পেমেন্ট পাঠাতে হবে (শুধুমাত্র bKash/Nagad-এর জন্য প্রযোজ্য)।
   */
  number?: string;
}

// ---------------------------------------------------------------------------
// Static / Constant Data
// ---------------------------------------------------------------------------

/**
 * Master list of all payment methods available at checkout.
 *
 * চেকআউটে উপলব্ধ সব পেমেন্ট পদ্ধতির তালিকা।
 * নতুন পেমেন্ট পদ্ধতি যোগ করতে এই অ্যারেতে এন্ট্রি যোগ করুন।
 *
 * @constant
 */
export const paymentMethods: PaymentMethodOption[] = [
  // --- Mobile financial services that require a manual TX reference ---

  /**
   * bKash — most popular MFS in Bangladesh.
   * গ্রাহক bKash অ্যাপে পেমেন্ট করার পরে ট্রানজেকশন নম্বর দেবেন।
   */
  {
    id: "bkash",
    name: "bKash",
    icon: "📱",
    description: "Pay via bKash",
    hasManual: true,
    number: "01845853634",
  },

  /**
   * Nagad — second major MFS in Bangladesh.
   * Nagad অ্যাপে পেমেন্টের পর ট্রানজেকশন নম্বর দিতে হবে।
   */
  {
    id: "nagad",
    name: "Nagad",
    icon: "💳",
    description: "Pay via Nagad",
    hasManual: true,
    number: "01845853634",
  },

  // --- Hybrid / cash methods — no transaction number needed ---

  /**
   * Advance + COD: customer pays a partial advance via MFS and the rest on delivery.
   * আংশিক অগ্রিম দিয়ে বাকি টাকা ডেলিভারিতে পরিশোধ।
   */
  {
    id: "advance_cod",
    name: "Advance + COD",
    icon: "💰",
    description: "Partial advance payment, rest on delivery",
    hasManual: false,
  },

  /**
   * Full Cash on Delivery — no upfront payment required.
   * সম্পূর্ণ নগদ ডেলিভারিতে — কোনো অগ্রিম প্রয়োজন নেই।
   */
  {
    id: "cod",
    name: "Cash on Delivery",
    icon: "💵",
    description: "Full payment on delivery",
    hasManual: false,
  },
];

/**
 * Blank/empty shipping info object used to initialise the checkout form state.
 *
 * চেকআউট ফর্ম স্টেটের প্রাথমিক মান।
 * `useState(emptyShippingInfo)` বা `useReducer`-এর initial state হিসেবে ব্যবহার করুন।
 *
 * @constant
 * @example
 * const [shippingInfo, setShippingInfo] = useState<CheckoutShippingInfo>(emptyShippingInfo);
 */
export const emptyShippingInfo: CheckoutShippingInfo = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  district: "",
  postalCode: "",
};
