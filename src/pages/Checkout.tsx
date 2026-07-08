import { useEffect, useState } from "react";
import { consumeHotSaleAttribution, trackHotSale } from "@/lib/hotSaleTracking";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/seo/SEOHead";
import { trackPurchase } from "@/components/seo/AnalyticsTracker";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { useDeliveryZones } from "@/hooks/checkout/useDeliveryZones";
import { useCheckoutTracking } from "@/hooks/checkout/useCheckoutTracking";
import { placeOrder } from "@/lib/order-placement";
import { downloadInvoice } from "@/lib/checkout/invoice";
import {
  emptyShippingInfo,
  type AppliedCoupon,
  type PaymentMethodId,
} from "@/lib/checkout/types";
import CheckoutAuthChoice from "@/components/checkout/CheckoutAuthChoice";
import CheckoutSuccess from "@/components/checkout/CheckoutSuccess";
import CheckoutSteps from "@/components/checkout/CheckoutSteps";
import ShippingStep from "@/components/checkout/ShippingStep";
import PaymentStep from "@/components/checkout/PaymentStep";
import ReviewStep from "@/components/checkout/ReviewStep";
import CheckoutOrderSummary from "@/components/checkout/CheckoutOrderSummary";

const Checkout = () => {
  const [step, setStep] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethodId>("cod");
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);

  const [transactionId, setTransactionId] = useState("");
  const [paymentPhone, setPaymentPhone] = useState("");
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState<"bkash" | "nagad">("bkash");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [shippingInfo, setShippingInfo] = useState(emptyShippingInfo);

  const { user, loading: authLoading } = useAuth();
  const { items, total, clearCart } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { deliveryZones, selectedZone, selectZone } = useDeliveryZones(shippingInfo.city);
  useCheckoutTracking(items, total);

  // Hot Sale checkout attribution — fire once per checkout entry when the visitor
  // arrived from a Hot Sale click within this session.
  useEffect(() => {
    const attr = consumeHotSaleAttribution();
    if (attr) trackHotSale("hot_sale_checkout", { variant: attr.variant, product_id: attr.productId, value: total });
    // total captured at mount is fine — we only want a single attribution event
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shippingCost = selectedZone?.shipping_charge ?? 0;
  const finalTotal = total - discountAmount + (total > 0 ? shippingCost : 0);

  const validateShippingInfo = () => {
    if (!shippingInfo.fullName || !shippingInfo.phone || !shippingInfo.address) {
      toast({
        title: "তথ্য অসম্পূর্ণ",
        description: "নাম, মোবাইল নম্বর এবং ঠিকানা অবশ্যই পূরণ করুন",
        variant: "destructive",
      });
      return false;
    }
    if (deliveryZones.length > 0 && !selectedZone) {
      toast({
        title: "ডেলিভারি জোন নির্বাচন করুন",
        description: "অর্ডার সম্পন্ন করার আগে একটি ডেলিভারি জোন নির্বাচন করুন",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleDownloadInvoice = async () => {
    if (!orderId) return;
    try {
      await downloadInvoice(orderId);
    } catch (e) {
      console.error("Error generating invoice:", e);
      toast({ title: "Error", description: "Failed to generate invoice", variant: "destructive" });
    }
  };

  const handlePlaceOrder = async () => {
    if (!validateShippingInfo()) return;
    if (authLoading) {
      toast({ title: "একটু অপেক্ষা করুন", description: "সেশন যাচাই হচ্ছে, আবার চেষ্টা করুন", variant: "destructive" });
      return;
    }
    if (!user && !isGuest) {
      toast({ title: "Please sign in or continue as guest", description: "Choose an option to proceed", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Cart is empty", description: "Add items to your cart before checkout", variant: "destructive" });
      navigate("/shop");
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
        })),
      );

      toast({ title: "Order placed!", description: "Thank you for your order. Check your email for confirmation." });
    } catch (error: any) {
      console.error("Error placing order:", error);
      const msg = error?.message || error?.details || "";
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

  if (orderPlaced) {
    return <CheckoutSuccess orderId={orderId} isLoggedIn={!!user} onDownloadInvoice={handleDownloadInvoice} />;
  }

  if (!user && step === 1 && !isGuest) {
    return <CheckoutAuthChoice onGuest={() => setIsGuest(true)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="চেকআউট" noIndex />
      <Header />
      <main className="pt-24 pb-20">
        <div className="container mx-auto px-4">
          <Link to="/cart" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-8">
            <ArrowLeft className="w-4 h-4" />
            Back to Cart
          </Link>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-4xl font-bold mb-2"
          >
            <span className="text-foreground">Secure </span>
            <span className="text-gradient-gold">Checkout</span>
          </motion.h1>

          {isGuest && !user && (
            <p className="text-muted-foreground mb-8">
              Checking out as guest •{" "}
              <Link to="/auth?redirect=/checkout" className="text-primary hover:underline">Sign in instead</Link>
            </p>
          )}

          <CheckoutSteps step={step} />

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              {step === 1 && (
                <ShippingStep
                  shippingInfo={shippingInfo}
                  setShippingInfo={setShippingInfo}
                  deliveryZones={deliveryZones}
                  selectedZone={selectedZone}
                  onSelectZone={selectZone}
                  deliveryNotes={deliveryNotes}
                  setDeliveryNotes={setDeliveryNotes}
                  onContinue={() => validateShippingInfo() && setStep(2)}
                />
              )}
              {step === 2 && (
                <PaymentStep
                  selectedPayment={selectedPayment}
                  setSelectedPayment={setSelectedPayment}
                  finalTotal={finalTotal}
                  transactionId={transactionId}
                  setTransactionId={setTransactionId}
                  paymentPhone={paymentPhone}
                  setPaymentPhone={setPaymentPhone}
                  advancePaymentMethod={advancePaymentMethod}
                  setAdvancePaymentMethod={setAdvancePaymentMethod}
                  advanceAmount={advanceAmount}
                  setAdvanceAmount={setAdvanceAmount}
                  onBack={() => setStep(1)}
                  onContinue={() => setStep(3)}
                />
              )}
              {step === 3 && (
                <ReviewStep
                  shippingInfo={shippingInfo}
                  deliveryNotes={deliveryNotes}
                  selectedPayment={selectedPayment}
                  transactionId={transactionId}
                  paymentPhone={paymentPhone}
                  advanceAmount={advanceAmount}
                  finalTotal={finalTotal}
                  processing={processing}
                  onBack={() => setStep(2)}
                  onPlaceOrder={handlePlaceOrder}
                />
              )}
            </div>

            <div>
              <CheckoutOrderSummary
                items={items}
                total={total}
                discountAmount={discountAmount}
                appliedCoupon={appliedCoupon}
                selectedZone={selectedZone}
                shippingCost={shippingCost}
                finalTotal={finalTotal}
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
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Checkout;
