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

const paymentMethods: PaymentMethod[] = [
  { id: "bkash", name: "bKash", icon: "📱", number: "01845853634" },
  { id: "nagad", name: "Nagad", icon: "💳", number: "01845853634" },
  { id: "advance_cod", name: "Advance + COD", icon: "💰" },
  { id: "cod", name: "Cash on Delivery", icon: "💵" },
];

const initialShipping: ShippingInfo = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  district: "",
};

interface FloatingCartSidebarProps {
  open: boolean;
  onClose: () => void;
}

const FloatingCartSidebar = ({ open, onClose }: FloatingCartSidebarProps) => {
  const { items, total, itemCount, updateQuantity, removeItem, clearCart } = useCart();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"cart" | "checkout">("cart");
  const [processing, setProcessing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const [shippingInfo, setShippingInfo] = useState<ShippingInfo>(initialShipping);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethodId>("cod");
  const [transactionId, setTransactionId] = useState("");
  const [paymentPhone, setPaymentPhone] = useState("");
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState<"bkash" | "nagad">("bkash");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(null);
  const [zoneManuallySelected, setZoneManuallySelected] = useState(false);

  const shippingCost = selectedZone?.shipping_charge ?? 0;
  const subtotalAfterDiscount = total - discountAmount;
  const finalTotal = subtotalAfterDiscount + (total > 0 ? shippingCost : 0);

  // Fetch delivery zones when entering checkout
  useEffect(() => {
    if (!(open && mode === "checkout")) return;
    supabase
      .from("delivery_zones")
      .select("*")
      .eq("is_active", true)
      .order("shipping_charge")
      .then(({ data }) => { if (data) setDeliveryZones(data); });
  }, [open, mode]);

  // Auto-match a zone from the city the user typed
  const findMatchingZone = useCallback(
    (cityValue: string) => {
      const cityLower = cityValue.toLowerCase().trim();
      if (!cityLower) return null;
      return (
        deliveryZones.find((zone) =>
          zone.city.toLowerCase() === cityLower ||
          zone.zone_name.toLowerCase().includes(cityLower) ||
          zone.areas?.some((area) => area.toLowerCase().includes(cityLower))
        ) ||
        deliveryZones.find((zone) => zone.zone_name.toLowerCase().includes("outside")) ||
        deliveryZones[0] ||
        null
      );
    },
    [deliveryZones]
  );

  useEffect(() => {
    if (zoneManuallySelected || !shippingInfo.city || deliveryZones.length === 0) return;
    setSelectedZone(findMatchingZone(shippingInfo.city));
  }, [shippingInfo.city, deliveryZones, zoneManuallySelected, findMatchingZone]);

  // Prefill from user profile
  useEffect(() => {
    if (!user || mode !== "checkout") return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setShippingInfo((prev) => ({
          ...prev,
          fullName: data.full_name || prev.fullName,
          phone: data.phone || prev.phone,
          address: data.address || prev.address,
          city: data.city || prev.city,
        }));
      });
  }, [user, mode]);

  const handleCityChange = (city: string) => {
    setZoneManuallySelected(false);
    setShippingInfo((p) => ({ ...p, city }));
  };

  const handleZoneSelect = (zone: DeliveryZone | null) => {
    setZoneManuallySelected(true);
    setSelectedZone(zone);
  };

  const validate = (): string | null => {
    if (authLoading) return "সেশন যাচাই হচ্ছে, আবার চেষ্টা করুন";
    if (!shippingInfo.fullName || !shippingInfo.phone || !shippingInfo.address) {
      return "নাম, মোবাইল নম্বর এবং ঠিকানা অবশ্যই পূরণ করুন";
    }
    if (items.length === 0) return "কার্টে পণ্য যোগ করুন";
    if (deliveryZones.length > 0 && !selectedZone) {
      return "ড্রপডাউন থেকে একটি ডেলিভারি জোন নির্বাচন করুন";
    }
    if (
      (selectedPayment === "bkash" || selectedPayment === "nagad") &&
      (!transactionId.trim() || !paymentPhone.trim())
    ) {
      return "Transaction ID এবং পেমেন্ট নম্বর দিন";
    }
    if (
      selectedPayment === "advance_cod" &&
      (!advanceAmount || Number(advanceAmount) <= 0 || !transactionId.trim() || !paymentPhone.trim())
    ) {
      return "অগ্রিম পরিমাণ, Transaction ID এবং পেমেন্ট নম্বর দিন";
    }
    return null;
  };

  const handlePlaceOrder = async () => {
    const error = validate();
    if (error) {
      toast({ title: "তথ্য অসম্পূর্ণ", description: error, variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
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

      await clearCart();
      setOrderId(generatedOrderId);
      setOrderPlaced(true);

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

      toast({ title: "অর্ডার সফল! ✅", description: "আপনার অর্ডারটি সফলভাবে সম্পন্ন হয়েছে।" });
    } catch (err: any) {
      console.error("Order error:", err);
      const msg = err?.message || err?.details || "";
      const isRateLimit = msg.includes("১০ মিনিট") || msg.includes("২৪ ঘণ্টা") || msg.includes("সর্বোচ্চ");
      toast({
        title: isRateLimit ? "অপেক্ষা করুন" : "Error",
        description: isRateLimit ? msg : "অর্ডার দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const resetCheckout = () => {
    setMode("cart");
    setOrderPlaced(false);
    setOrderId(null);
    onClose();
  };

  const headerTitle = orderPlaced
    ? "অর্ডার সম্পন্ন ✅"
    : mode === "checkout"
    ? "চেকআউট"
    : `কার্ট (${itemCount})`;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-background border-l border-border z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary" />
                <h2 className="font-display text-lg font-semibold">{headerTitle}</h2>
              </div>
              <button
                onClick={orderPlaced ? resetCheckout : onClose}
                aria-label="Close"
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {orderPlaced ? (
                <OrderSuccess orderId={orderId} onAfterAction={resetCheckout} />
              ) : mode === "cart" ? (
                items.length === 0 ? (
                  <EmptyCart onClose={onClose} />
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <CartLineItem
                        key={item.id}
                        item={item}
                        onIncrement={(it) => updateQuantity(it.id, it.quantity + 1)}
                        onDecrement={(it) => updateQuantity(it.id, it.quantity - 1)}
                        onRemove={removeItem}
                      />
                    ))}
                  </div>
                )
              ) : (
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
                      setAppliedCoupon(coupon);
                      setDiscountAmount(discount);
                    }}
                    onRemoveCoupon={() => {
                      setAppliedCoupon(null);
                      setDiscountAmount(0);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            {!orderPlaced && items.length > 0 && (
              <div className="border-t border-border p-4 space-y-3">
                <CartSummary
                  subtotal={total}
                  discount={discountAmount}
                  shippingCost={shippingCost}
                  total={mode === "checkout" ? finalTotal : subtotalAfterDiscount}
                  showShipping={mode === "checkout"}
                  hasZone={!!selectedZone}
                />

                {mode === "cart" ? (
                  <Button onClick={() => setMode("checkout")} className="w-full btn-gold">
                    চেকআউট করুন <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button onClick={handlePlaceOrder} disabled={processing} className="w-full btn-gold">
                      {processing ? "প্রসেসিং..." : "অর্ডার কনফার্ম করুন"}
                    </Button>
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
