/**
 * @file FloatingCartSidebar.tsx
 * @module components/cart
 *
 * @description
 * The main slide-in cart / mini-checkout drawer used across the storefront.
 *
 * State machine (three mutually-exclusive "screens"):
 *   1. "cart"     — list of CartLineItem rows + subtotal CTA
 *   2. "checkout" — ShippingForm + PaymentSection + CouponInput
 *   3. orderPlaced — OrderSuccess confirmation (replaces both above)
 *
 * Key behaviours:
 *  - Fetches active delivery zones from Supabase when the user enters checkout.
 *  - Auto-matches a DeliveryZone from the typed city name; user can override
 *    via the dropdown (sets `zoneManuallySelected = true` to prevent overwrite).
 *  - Pre-fills shipping fields from the authenticated user's profile.
 *  - Validates all required fields before calling `placeOrder()`.
 *  - Fires a GA4 / Facebook Pixel purchase event via `trackPurchase()` on success.
 *  - Rate-limit errors returned by `placeOrder` are shown in Bengali toast copy.
 *
 * Bengali user-facing strings in this file:
 *  - "সেশন যাচাই হচ্ছে..." — session verification in progress — সেশন যাচাইয়ের বার্তা
 *  - "নাম, মোবাইল নম্বর এবং ঠিকানা..." — required field validation — ফর্ম ভ্যালিডেশন
 *  - "অর্ডার সফল! ✅" — order success toast — সফল অর্ডারের বার্তা
 *  - "অপেক্ষা করুন" — rate-limit toast title — রেট লিমিট বার্তা
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import CouponInput from "@/components/checkout/CouponInput";
import { trackPurchase } from "@/components/seo/AnalyticsTracker";
import { placeOrder } from "@/lib/order-placement";

import CartLineItem from "@/components/cart/CartLineItem";
import EmptyCart from "@/components/cart/EmptyCart";
import OrderSuccess from "@/components/cart/OrderSuccess";
import ShippingForm, { type ShippingInfo, type DeliveryZone } from "@/components/checkout/ShippingForm";
import PaymentSection, { type PaymentMethod, type PaymentMethodId } from "@/components/checkout/PaymentSection";
import CartSummary from "@/components/checkout/CartSummary";

/**
 * Static list of accepted payment methods rendered in PaymentSection.
 * `number` is the merchant's mobile-wallet number shown to the customer.
 */
const paymentMethods: PaymentMethod[] = [
  { id: "bkash",       name: "bKash",           icon: "📱", number: "01845853634" },
  { id: "nagad",       name: "Nagad",            icon: "💳", number: "01845853634" },
  { id: "advance_cod", name: "Advance + COD",    icon: "💰" },
  { id: "cod",         name: "Cash on Delivery", icon: "💵" },
];

/**
 * Blank shipping info object used to initialise (and reset) the form.
 * Kept as a module-level constant to avoid re-creating it on each render.
 */
const initialShipping: ShippingInfo = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  district: "",
};

/**
 * Props for the FloatingCartSidebar component.
 */
interface FloatingCartSidebarProps {
  /** Whether the drawer is currently visible. Controlled by parent. */
  open: boolean;
  /** Callback to close the drawer (sets `open = false` in parent). */
  onClose: () => void;
}

/**
 * FloatingCartSidebar — the slide-in cart / mini-checkout panel.
 *
 * Renders over a dark backdrop; clicking the backdrop calls `onClose`.
 * Internally manages a three-screen state machine: cart → checkout → success.
 *
 * @param props - {@link FloatingCartSidebarProps}
 * @returns An `AnimatePresence`-wrapped overlay + sliding panel, or nothing
 *          when `open` is false (exit animation plays first).
 */
const FloatingCartSidebar = ({ open, onClose }: FloatingCartSidebarProps) => {
  // ─── Context / hooks ─────────────────────────────────────────────────────
  const { items, total, itemCount, updateQuantity, removeItem, clearCart } = useCart();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // ─── UI state ────────────────────────────────────────────────────────────
  /** Controls which screen is shown: cart list or checkout form. */
  const [mode, setMode] = useState<"cart" | "checkout">("cart");
  /** True while the async `placeOrder` call is in-flight — disables the CTA. */
  const [processing, setProcessing] = useState(false);
  /** Flipped to true after a successful order; triggers the success screen. */
  const [orderPlaced, setOrderPlaced] = useState(false);
  /** Stores the UUID of the just-placed order for display and tracking. */
  const [orderId, setOrderId] = useState<string | null>(null);

  // ─── Checkout form state ──────────────────────────────────────────────────
  const [shippingInfo, setShippingInfo] = useState<ShippingInfo>(initialShipping);
  /** Currently selected payment method identifier. Defaults to COD. */
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethodId>("cod");
  /** Mobile-wallet transaction ID entered by the user after sending money. */
  const [transactionId, setTransactionId] = useState("");
  /** The phone number the user used to send the mobile-wallet payment. */
  const [paymentPhone, setPaymentPhone] = useState("");
  /** Advance+COD sub-method: which wallet was used for the advance payment. */
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState<"bkash" | "nagad">("bkash");
  /** Amount in BDT sent as advance for the Advance+COD payment method. */
  const [advanceAmount, setAdvanceAmount] = useState("");
  /** Optional free-text note for the delivery rider. */
  const [deliveryNotes, setDeliveryNotes] = useState("");

  // ─── Coupon state ─────────────────────────────────────────────────────────
  /** The coupon object returned from Supabase after a successful validation. */
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  /** Computed discount value in BDT — 0 when no coupon is applied. */
  const [discountAmount, setDiscountAmount] = useState(0);

  // ─── Delivery zone state ──────────────────────────────────────────────────
  /** All active zones fetched from `delivery_zones` table. */
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  /** Zone currently selected (auto or manual). Determines `shippingCost`. */
  const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(null);
  /**
   * Flag that prevents the auto-match from overwriting a user's explicit
   * dropdown selection when the city field changes afterwards.
   */
  const [zoneManuallySelected, setZoneManuallySelected] = useState(false);

  // ─── Derived totals ───────────────────────────────────────────────────────
  /** Shipping charge for the selected zone; 0 when no zone is chosen yet. */
  const shippingCost = selectedZone?.shipping_charge ?? 0;
  /** Cart total after applying any coupon discount. */
  const subtotalAfterDiscount = total - discountAmount;
  /**
   * Grand total = (cart total − discount) + shipping.
   * Shipping is only added when there are items in the cart (`total > 0`)
   * to avoid showing a phantom shipping cost on an empty cart edge-case.
   */
  const finalTotal = subtotalAfterDiscount + (total > 0 ? shippingCost : 0);

  // ─── Effect: fetch delivery zones ─────────────────────────────────────────
  /**
   * Lazily fetches active delivery zones from Supabase only when the drawer
   * is open AND the user has advanced to the checkout mode.
   * Sorted by ascending shipping_charge so cheapest option appears first.
   *
   * Side effect: writes to `deliveryZones` state.
   * No cleanup needed — Supabase client handles request cancellation internally.
   */
  useEffect(() => {
    // Guard: only run when the sidebar is open and in checkout mode.
    if (!(open && mode === "checkout")) return;
    supabase
      .from("delivery_zones")
      .select("*")
      .eq("is_active", true)
      .order("shipping_charge")
      .then(({ data }) => { if (data) setDeliveryZones(data); });
  }, [open, mode]);

  // ─── Zone auto-matching logic ─────────────────────────────────────────────
  /**
   * Attempts to match a DeliveryZone from a free-text city string.
   * Match priority (first hit wins):
   *  1. Exact city match (case-insensitive).
   *  2. Zone whose `zone_name` contains the city substring.
   *  3. Any zone area entry that contains the city substring.
   *  4. The first zone whose name includes "outside" (catch-all for rural).
   *  5. The very first zone in the sorted list (final fallback).
   *
   * Memoised with `useCallback` so it can be used as a stable dep in effects.
   *
   * @param cityValue - Raw city text from the shipping form input.
   * @returns A matching {@link DeliveryZone} or `null` if the zones list is empty.
   */
  const findMatchingZone = useCallback(
    (cityValue: string) => {
      const cityLower = cityValue.toLowerCase().trim();
      // Empty city → no match possible.
      if (!cityLower) return null;
      return (
        // 1. Exact city field match.
        deliveryZones.find((zone) =>
          zone.city.toLowerCase() === cityLower ||
          // 2. Zone name contains the city string.
          zone.zone_name.toLowerCase().includes(cityLower) ||
          // 3. Any area tag within the zone contains the city string.
          zone.areas?.some((area) => area.toLowerCase().includes(cityLower))
        ) ||
        // 4. "Outside Dhaka" or similar catch-all zone.
        deliveryZones.find((zone) => zone.zone_name.toLowerCase().includes("outside")) ||
        // 5. Absolute fallback: first zone (cheapest due to ordering).
        deliveryZones[0] ||
        null
      );
    },
    [deliveryZones]
  );

  /**
   * Re-runs auto-match whenever the typed city or zones list changes.
   * Skipped when the user has already made a manual dropdown selection
   * to avoid overwriting their explicit choice.
   */
  useEffect(() => {
    if (zoneManuallySelected || !shippingInfo.city || deliveryZones.length === 0) return;
    setSelectedZone(findMatchingZone(shippingInfo.city));
  }, [shippingInfo.city, deliveryZones, zoneManuallySelected, findMatchingZone]);

  // ─── Effect: pre-fill from user profile ───────────────────────────────────
  /**
   * When an authenticated user opens the checkout screen for the first time,
   * this effect fetches their stored profile and pre-populates name, phone,
   * address, and city so they don't have to retype.
   *
   * Uses `maybeSingle()` to avoid throwing when no profile row exists yet.
   * Merges into existing state with a functional updater so any values already
   * typed by the user are NOT overwritten (only empty fields are filled).
   *
   * Side effect: writes to `shippingInfo` state.
   */
  useEffect(() => {
    // Only attempt pre-fill when a user is logged in and on the checkout screen.
    if (!user || mode !== "checkout") return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        // Prefer existing form value (prev.X) over profile data when already filled.
        setShippingInfo((prev) => ({
          ...prev,
          fullName: data.full_name || prev.fullName,
          phone:    data.phone    || prev.phone,
          address:  data.address  || prev.address,
          city:     data.city     || prev.city,
        }));
      });
  }, [user, mode]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  /**
   * Updates the city field in shippingInfo AND resets `zoneManuallySelected`
   * so the auto-match effect can run again for the new city value.
   *
   * @param city - New city string typed by the user.
   */
  const handleCityChange = (city: string) => {
    // Reset manual flag so auto-match can re-fire for the new city value.
    setZoneManuallySelected(false);
    setShippingInfo((p) => ({ ...p, city }));
  };

  /**
   * Handles an explicit zone selection from the dropdown.
   * Sets `zoneManuallySelected = true` to prevent auto-match from overriding.
   *
   * @param zone - The chosen DeliveryZone, or null to clear.
   */
  const handleZoneSelect = (zone: DeliveryZone | null) => {
    // Mark as manual so auto-match won't overwrite this selection.
    setZoneManuallySelected(true);
    setSelectedZone(zone);
  };

  /**
   * Validates the checkout form before submitting.
   * Returns a Bengali error string when a check fails, or `null` when valid.
   *
   * Checks in order:
   *  1. Auth session still loading (race condition guard).
   *  2. Required shipping fields are present.
   *  3. Cart is not empty.
   *  4. A delivery zone has been selected (when zones exist).
   *  5. Mobile-wallet methods require transactionId + paymentPhone.
   *  6. Advance+COD requires advance amount > 0, transactionId, paymentPhone.
   *
   * @returns Error message string (Bengali) or `null` if all checks pass.
   */
  const validate = (): string | null => {
    // Guard against race condition where auth session is still resolving.
    if (authLoading) return "সেশন যাচাই হচ্ছে, আবার চেষ্টা করুন"; // "Session verifying, please try again"
    // Core shipping fields are mandatory regardless of payment method.
    if (!shippingInfo.fullName || !shippingInfo.phone || !shippingInfo.address) {
      return "নাম, মোবাইল নম্বর এবং ঠিকানা অবশ্যই পূরণ করুন"; // "Name, phone and address are required"
    }
    // Prevent submitting an empty cart (shouldn't normally reach here).
    if (items.length === 0) return "কার্টে পণ্য যোগ করুন"; // "Add items to cart"
    // Zone selection is mandatory only when zones have been loaded from DB.
    if (deliveryZones.length > 0 && !selectedZone) {
      return "ড্রপডাউন থেকে একটি ডেলিভারি জোন নির্বাচন করুন"; // "Select a delivery zone from dropdown"
    }
    // bKash / Nagad: both transaction ID and sending phone are required.
    if (
      (selectedPayment === "bkash" || selectedPayment === "nagad") &&
      (!transactionId.trim() || !paymentPhone.trim())
    ) {
      return "Transaction ID এবং পেমেন্ট নম্বর দিন"; // "Provide Transaction ID and payment phone"
    }
    // Advance+COD: additionally requires a positive advance amount.
    if (
      selectedPayment === "advance_cod" &&
      (!advanceAmount || Number(advanceAmount) <= 0 || !transactionId.trim() || !paymentPhone.trim())
    ) {
      return "অগ্রিম পরিমাণ, Transaction ID এবং পেমেন্ট নম্বর দিন"; // "Provide advance amount, TxID, and phone"
    }
    return null; // All checks passed.
  };

  /**
   * Async handler for the "Confirm Order" button.
   *
   * Flow:
   *  1. Run `validate()` — show destructive toast and bail on failure.
   *  2. Set `processing = true` to disable the button and show spinner text.
   *  3. Call `placeOrder()` from lib/order-placement with full checkout data.
   *  4. Clear the cart, store the new orderId, flip `orderPlaced` to show success screen.
   *  5. Fire `trackPurchase()` analytics event (GA4 / Meta Pixel).
   *  6. Show success toast in Bengali.
   *  7. On error: check if the error message is a Bengali rate-limit message and
   *     display it verbatim; otherwise show a generic Bengali error toast.
   *
   * Side effects: clears cart, fires analytics, shows toasts, updates local state.
   */
  const handlePlaceOrder = async () => {
    const error = validate();
    if (error) {
      // "তথ্য অসম্পূর্ণ" — "Information incomplete" — ভ্যালিডেশন ব্যর্থতার টোস্ট
      toast({ title: "তথ্য অসম্পূর্ণ", description: error, variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      // Delegate all Supabase write operations to lib/order-placement.
      // advanceAmount is only sent when the advance_cod method is selected.
      const { orderId: generatedOrderId, finalTotal: confirmedTotal } = await placeOrder({
        items,
        shippingInfo,
        selectedZoneId: selectedZone?.id || null,
        deliveryNotes,
        selectedPayment,
        transactionId,
        paymentPhone,
        advancePaymentMethod,
        advanceAmount: selectedPayment === "advance_cod" ? Number(advanceAmount) || 0 : null,
        appliedCoupon: appliedCoupon ? { id: appliedCoupon.id, code: appliedCoupon.code } : null,
      });

      // Clear cart after successful persistence to prevent double-ordering.
      await clearCart();
      setOrderId(generatedOrderId);
      setOrderPlaced(true); // Switches drawer to the OrderSuccess screen.

      // Fire GA4 / Meta Pixel purchase event with line-item details.
      trackPurchase(
        generatedOrderId,
        confirmedTotal,
        items.map((item) => ({
          id: item.product_id,
          name: item.product.name,
          price: item.product.sale_price || item.product.price,
          quantity: item.quantity,
        }))
      );

      // "অর্ডার সফল! ✅" — "Order successful!" — সফল অর্ডারের টোস্ট বার্তা
      toast({ title: "অর্ডার সফল! ✅", description: "আপনার অর্ডারটি সফলভাবে সম্পন্ন হয়েছে।" });
    } catch (err: any) {
      console.error("Order error:", err);
      const msg = err?.message || err?.details || "";
      // Detect Bengali rate-limit messages returned by the edge function.
      // These contain time-duration strings like "১০ মিনিট" or "২৪ ঘণ্টা".
      const isRateLimit = msg.includes("১০ মিনিট") || msg.includes("২৪ ঘণ্টা") || msg.includes("সর্বোচ্চ");
      toast({
        // "অপেক্ষা করুন" — "Please wait" — রেট লিমিট টোস্ট
        title: isRateLimit ? "অপেক্ষা করুন" : "Error",
        description: isRateLimit ? msg : "অর্ডার দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।",
        variant: "destructive",
      });
    } finally {
      // Always re-enable the button regardless of success or failure.
      setProcessing(false);
    }
  };

  /**
   * Resets all checkout-related state and closes the drawer.
   * Called after the user clicks either action button on the success screen.
   */
  const resetCheckout = () => {
    setMode("cart");
    setOrderPlaced(false);
    setOrderId(null);
    onClose();
  };

  /**
   * Dynamic header title for the drawer panel.
   * Changes based on current screen:
   *  - "অর্ডার সম্পন্ন ✅" when order is placed — "Order Complete"
   *  - "চেকআউট"           during checkout mode — "Checkout"
   *  - "কার্ট (N)"         in cart mode, showing item count — "Cart (N)"
   */
  const headerTitle = orderPlaced
    ? "অর্ডার সম্পন্ন ✅"           // "Order Complete ✅" — অর্ডার সম্পন্নের শিরোনাম
    : mode === "checkout"
    ? "চেকআউট"                      // "Checkout" — চেকআউট শিরোনাম
    : `কার্ট (${itemCount})`;       // "Cart (N)" — কার্টের শিরোনাম, আইটেম সংখ্যাসহ

  return (
    // AnimatePresence enables the exit animation when `open` flips to false.
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop overlay ── clicking it closes the drawer ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* ── Sliding panel — enters from the right edge ── */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            // Spring physics give it a natural deceleration feel.
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-background border-l border-border z-50 flex flex-col shadow-2xl"
          >
            {/* ── Header bar ─────────────────────────────────────── */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary" />
                {/* Dynamic title: changes between cart/checkout/success screens */}
                <h2 className="font-display text-lg font-semibold">{headerTitle}</h2>
              </div>
              {/* Close button: resets checkout state when on success screen */}
              <button
                onClick={orderPlaced ? resetCheckout : onClose}
                aria-label="Close"
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Scrollable body ─────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-4">
              {orderPlaced ? (
                // Screen 3: order success confirmation
                <OrderSuccess orderId={orderId} onAfterAction={resetCheckout} />
              ) : mode === "cart" ? (
                // Screen 1a: empty cart placeholder
                items.length === 0 ? (
                  <EmptyCart onClose={onClose} />
                ) : (
                  // Screen 1b: list of cart items
                  <div className="space-y-3">
                    {items.map((item) => (
                      <CartLineItem
                        key={item.id}
                        item={item}
                        // Pass inline quantity arithmetic here; CartLineItem stays pure.
                        onIncrement={(it) => updateQuantity(it.id, it.quantity + 1)}
                        onDecrement={(it) => updateQuantity(it.id, it.quantity - 1)}
                        onRemove={removeItem}
                      />
                    ))}
                  </div>
                )
              ) : (
                // Screen 2: checkout form (shipping + payment + coupon)
                <div className="space-y-4">
                  <ShippingForm
                    shippingInfo={shippingInfo}
                    onShippingChange={setShippingInfo}
                    deliveryZones={deliveryZones}
                    selectedZone={selectedZone}
                    onZoneSelect={handleZoneSelect}
                    onCityChange={handleCityChange}
                    isGuest={!user}
                    deliveryNotes={deliveryNotes}
                    onDeliveryNotesChange={setDeliveryNotes}
                  />
                  <PaymentSection
                    methods={paymentMethods}
                    selectedPayment={selectedPayment}
                    onSelectPayment={setSelectedPayment}
                    transactionId={transactionId}
                    onTransactionIdChange={setTransactionId}
                    paymentPhone={paymentPhone}
                    onPaymentPhoneChange={setPaymentPhone}
                    advancePaymentMethod={advancePaymentMethod}
                    onAdvancePaymentMethodChange={setAdvancePaymentMethod}
                    advanceAmount={advanceAmount}
                    onAdvanceAmountChange={setAdvanceAmount}
                  />
                  <CouponInput
                    subtotal={total}
                    appliedCoupon={appliedCoupon}
                    onApplyCoupon={(coupon, discount) => {
                      // Store both the coupon object (for display / order submission)
                      // and the computed discount value (for the totals display).
                      setAppliedCoupon(coupon);
                      setDiscountAmount(discount);
                    }}
                    onRemoveCoupon={() => {
                      // Clear coupon state; derived totals recompute automatically.
                      setAppliedCoupon(null);
                      setDiscountAmount(0);
                    }}
                  />
                </div>
              )}
            </div>

            {/* ── Sticky footer: totals + CTA buttons ─────────────── */}
            {/* Hidden when order is placed OR when cart is empty. */}
            {!orderPlaced && items.length > 0 && (
              <div className="border-t border-border p-4 space-y-3">
                {/* Totals summary — shows shipping row only in checkout mode */}
                <CartSummary
                  subtotal={total}
                  discount={discountAmount}
                  shippingCost={shippingCost}
                  // In cart mode show subtotal-after-discount; in checkout add shipping.
                  total={mode === "checkout" ? finalTotal : subtotalAfterDiscount}
                  showShipping={mode === "checkout"}
                  hasZone={!!selectedZone}
                />

                {mode === "cart" ? (
                  // "চেকআউট করুন" — "Proceed to Checkout" — চেকআউট বাটন
                  <Button onClick={() => setMode("checkout")} className="w-full btn-gold">
                    চেকআউট করুন <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <div className="space-y-2">
                    {/* "অর্ডার কনফার্ম করুন" — "Confirm Order" — অর্ডার কনফার্ম বাটন
                        Disabled while the async placeOrder call is running. */}
                    <Button onClick={handlePlaceOrder} disabled={processing} className="w-full btn-gold">
                      {/* "প্রসেসিং..." — "Processing..." — প্রসেসিং অবস্থার বাটন লেখা */}
                      {processing ? "প্রসেসিং..." : "অর্ডার কনফার্ম করুন"}
                    </Button>
                    {/* "← কার্টে ফিরে যান" — "Back to Cart" — কার্টে ফিরে যাওয়ার বাটন */}
                    <Button variant="outline" onClick={() => setMode("cart")} className="w-full text-sm">
                      ← কার্টে ফিরে যান
                    </Button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default FloatingCartSidebar;
