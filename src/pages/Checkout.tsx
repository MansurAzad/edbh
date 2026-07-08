import { useEffect, useRef, useState } from "react";
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
import { placeOrder } from "@/lib/order-placement";
import { downloadInvoice } from "@/lib/checkout/invoice";
import {
  emptyShippingInfo,
  type AppliedCoupon,
  type PaymentMethodId,
} from "@/lib/checkout/types";
import CheckoutAuthChoice from "@/components/checkout/CheckoutAuthChoice";
import CheckoutSuccess from "@/components/checkout/CheckoutSuccess";
import SimpleCheckoutForm from "@/components/checkout/SimpleCheckoutForm";
import CheckoutOrderSummary from "@/components/checkout/CheckoutOrderSummary";
import { shareOrderToWhatsApp } from "@/lib/checkout/whatsappShare";

/** Fixed flat delivery charge (Bangladesh-wide). */
const FLAT_SHIPPING = 150;

const Checkout = () => {
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

  // Snapshot of last-placed order used for the "Share on WhatsApp" button on
  // the success screen (cart is cleared by then, so we need a snapshot).
  const lastReceiptRef = useRef<Parameters<typeof shareOrderToWhatsApp>[0] | null>(null);

  useEffect(() => {
    const attr = consumeHotSaleAttribution();
    if (attr) trackHotSale("hot_sale_checkout", { variant: attr.variant, product_id: attr.productId, value: total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shippingCost = items.length > 0 ? FLAT_SHIPPING : 0;
  const finalTotal = Math.max(0, total - discountAmount) + shippingCost;

  const validateShippingInfo = () => {
    if (!shippingInfo.fullName.trim() || !shippingInfo.phone.trim() || !shippingInfo.address.trim()) {
      toast({
        title: "তথ্য অসম্পূর্ণ",
        description: "নাম, মোবাইল নম্বর এবং পুরো ঠিকানা অবশ্যই পূরণ করুন",
        variant: "destructive",
      });
      return false;
    }
    // Rudimentary BD mobile check
    const digits = shippingInfo.phone.replace(/\D/g, "");
    if (digits.length < 11) {
      toast({ title: "মোবাইল নম্বর ভুল", description: "সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন", variant: "destructive" });
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

  const handleShareWhatsApp = () => {
    if (lastReceiptRef.current) shareOrderToWhatsApp(lastReceiptRef.current);
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
      const advNum = selectedPayment === "advance_cod" ? Number(advanceAmount) || 0 : null;

      // Snapshot cart before it gets cleared
      const itemsSnapshot = [...items];

      const { orderId: generatedOrderId, finalTotal: confirmedTotal } = await placeOrder({
        items,
        shippingInfo,
        selectedZoneId: null, // hidden – edge function applies flat ৳150
        deliveryNotes,
        selectedPayment,
        transactionId,
        paymentPhone,
        advancePaymentMethod,
        advanceAmount: advNum,
        appliedCoupon: appliedCoupon ? { id: appliedCoupon.id, code: appliedCoupon.code } : null,
      });

      const receipt = {
        orderId: generatedOrderId,
        items: itemsSnapshot,
        shippingInfo,
        subtotal: total,
        discountAmount,
        shippingCost,
        finalTotal: confirmedTotal,
        selectedPayment,
        advanceAmount: advNum ?? undefined,
        transactionId,
        paymentPhone,
        deliveryNotes,
      };
      lastReceiptRef.current = receipt;

      await clearCart();
      setOrderId(generatedOrderId);
      setOrderPlaced(true);

      // Auto-open WhatsApp with receipt
      shareOrderToWhatsApp(receipt);

      trackPurchase(
        generatedOrderId,
        confirmedTotal,
        itemsSnapshot.map((item) => ({
          id: item.product_id,
          name: item.product.name,
          price: item.product.sale_price || item.product.price,
          quantity: item.quantity,
        })),
      );

      toast({ title: "অর্ডার সফল!", description: "ধন্যবাদ! হোয়াটসঅ্যাপে রিসিট শেয়ার করা হয়েছে।" });
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
    return (
      <CheckoutSuccess
        orderId={orderId}
        isLoggedIn={!!user}
        onDownloadInvoice={handleDownloadInvoice}
        onShareWhatsApp={handleShareWhatsApp}
      />
    );
  }

  if (!user && !isGuest) {
    return <CheckoutAuthChoice onGuest={() => setIsGuest(true)} />;
  }

  // Synthetic zone for the summary component so it shows "৳150" instead of "Select city"
  const flatZone = {
    id: "flat",
    zone_name: "ফিক্সড",
    city: "Bangladesh",
    shipping_charge: FLAT_SHIPPING,
    estimated_days: null,
    areas: null,
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="চেকআউট" noIndex />
      <Header />
      <main className="pt-24 pb-20">
        <div className="container mx-auto px-4">
          <Link to="/cart" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Cart
          </Link>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-4xl font-bold mb-2"
          >
            <span className="text-foreground">দ্রুত </span>
            <span className="text-gradient-gold">চেকআউট</span>
          </motion.h1>
          <p className="text-muted-foreground mb-8">মাত্র ৩টি তথ্য দিন — অর্ডার কনফার্ম হয়ে যাবে।</p>

          {isGuest && !user && (
            <p className="text-muted-foreground mb-6 text-sm">
              গেস্ট হিসেবে অর্ডার করছেন •{" "}
              <Link to="/auth?redirect=/checkout" className="text-primary hover:underline">
                সাইন-ইন করুন
              </Link>
            </p>
          )}

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <SimpleCheckoutForm
                shippingInfo={shippingInfo}
                setShippingInfo={setShippingInfo}
                deliveryNotes={deliveryNotes}
                setDeliveryNotes={setDeliveryNotes}
                selectedPayment={selectedPayment}
                setSelectedPayment={setSelectedPayment}
                advanceAmount={advanceAmount}
                setAdvanceAmount={setAdvanceAmount}
                advancePaymentMethod={advancePaymentMethod}
                setAdvancePaymentMethod={setAdvancePaymentMethod}
                transactionId={transactionId}
                setTransactionId={setTransactionId}
                paymentPhone={paymentPhone}
                setPaymentPhone={setPaymentPhone}
                finalTotal={finalTotal}
                processing={processing}
                onPlaceOrder={handlePlaceOrder}
              />
            </div>

            <div>
              <CheckoutOrderSummary
                items={items}
                total={total}
                discountAmount={discountAmount}
                appliedCoupon={appliedCoupon}
                selectedZone={flatZone}
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
