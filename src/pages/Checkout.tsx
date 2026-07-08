import { useEffect, useMemo, useRef, useState } from "react";
import { consumeHotSaleAttribution, trackHotSale } from "@/lib/hotSaleTracking";
import { ArrowLeft, MessageCircle, XCircle, CheckCircle2 } from "lucide-react";
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
import {
  shareOrderToWhatsApp,
  type OrderReceipt,
  type WhatsAppShareStatus,
  type ShareResult,
} from "@/lib/checkout/whatsappShare";
import {
  validateCheckoutFields,
  type CheckoutFieldErrors,
} from "@/lib/checkout/validation";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Fixed flat delivery charge (Bangladesh-wide) when no zone is picked. */
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

  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [waStatus, setWaStatus] = useState<WhatsAppShareStatus | null>(null);
  const [waError, setWaError] = useState<string | null>(null);
  const [waEvents, setWaEvents] = useState<ShareResult[]>([]);

  const { user, loading: authLoading } = useAuth();
  const { items, total, clearCart } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Double-submit guard — synchronously blocks concurrent order attempts even
  // before React re-renders with `processing = true`.
  const submitLockRef = useRef(false);

  // Snapshot for the "Retry WhatsApp share" button on the success page.
  const lastReceiptRef = useRef<OrderReceipt | null>(null);

  // Delivery zones (optional, shown conditionally when city matches).
  const { deliveryZones, selectedZone, selectZone } = useDeliveryZones(shippingInfo.city);
  const showZoneSelector = useMemo(() => {
    const c = shippingInfo.city.trim().toLowerCase();
    if (!c || deliveryZones.length === 0) return false;
    return deliveryZones.some(
      (z) =>
        z.city.toLowerCase().includes(c) ||
        z.zone_name.toLowerCase().includes(c) ||
        z.areas?.some((a) => a.toLowerCase().includes(c)),
    );
  }, [shippingInfo.city, deliveryZones]);

  useEffect(() => {
    const attr = consumeHotSaleAttribution();
    if (attr) trackHotSale("hot_sale_checkout", { variant: attr.variant, product_id: attr.productId, value: total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shippingCost = items.length > 0
    ? (showZoneSelector && selectedZone ? Number(selectedZone.shipping_charge) : FLAT_SHIPPING)
    : 0;
  const finalTotal = Math.max(0, total - discountAmount) + shippingCost;

  const validate = (): boolean => {
    const errs = validateCheckoutFields(shippingInfo);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast({
        title: "কিছু তথ্য অসম্পূর্ণ",
        description: "লাল হাইলাইট করা ফিল্ডগুলো ঠিক করে আবার চেষ্টা করুন।",
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

  const handleShareWhatsApp = async () => {
    if (!lastReceiptRef.current) return;
    const res = await shareOrderToWhatsApp(lastReceiptRef.current, { isRetry: true });
    setWaStatus(res.status);
    setWaError(res.error ?? null);
    if (res.status === "blocked") {
      toast({
        title: "WhatsApp popup ব্লক হয়েছে",
        description: "নিচের লিংকে ক্লিক করে ম্যানুয়ালি খুলুন।",
        variant: "destructive",
      });
      window.open(res.url, "_blank", "noopener,noreferrer");
    }
  };

  const handleConfirmClick = () => {
    if (submitLockRef.current || processing) return;
    if (!validate()) return;
    if (items.length === 0) {
      toast({ title: "Cart is empty", description: "Add items to your cart before checkout", variant: "destructive" });
      navigate("/shop");
      return;
    }
    setShowConfirmDialog(true);
  };

  const handlePlaceOrder = async () => {
    // Synchronous re-entrancy guard — blocks double clicks even before
    // React re-renders with processing=true.
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setShowConfirmDialog(false);

    if (authLoading) {
      submitLockRef.current = false;
      toast({ title: "একটু অপেক্ষা করুন", description: "সেশন যাচাই হচ্ছে, আবার চেষ্টা করুন", variant: "destructive" });
      return;
    }
    if (!user && !isGuest) {
      submitLockRef.current = false;
      toast({ title: "Please sign in or continue as guest", description: "Choose an option to proceed", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      const advNum = selectedPayment === "advance_cod" ? Number(advanceAmount) || 0 : null;
      const itemsSnapshot = [...items];

      const { orderId: generatedOrderId, finalTotal: confirmedTotal } = await placeOrder({
        items,
        shippingInfo,
        selectedZoneId: showZoneSelector && selectedZone ? selectedZone.id : null,
        deliveryNotes,
        selectedPayment,
        transactionId,
        paymentPhone,
        advancePaymentMethod,
        advanceAmount: advNum,
        appliedCoupon: appliedCoupon ? { id: appliedCoupon.id, code: appliedCoupon.code } : null,
      });

      const receipt: OrderReceipt = {
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

      // Auto-share to WhatsApp and record status.
      const shareRes = await shareOrderToWhatsApp(receipt);
      setWaStatus(shareRes.status);
      setWaError(shareRes.error ?? null);

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

      toast({ title: "অর্ডার সফল!", description: "ধন্যবাদ! আপনার অর্ডার গ্রহণ করা হয়েছে।" });
    } catch (error: unknown) {
      console.error("Error placing order:", error);
      const err = error as { message?: string; details?: string };
      const msg = err?.message || err?.details || "";
      const isRateLimit = msg.includes("১০ মিনিট") || msg.includes("২৪ ঘণ্টা") || msg.includes("সর্বোচ্চ");
      toast({
        title: isRateLimit ? "অপেক্ষা করুন" : "অর্ডার দিতে সমস্যা",
        description: isRateLimit ? msg : "অর্ডার দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      submitLockRef.current = false;
    }
  };

  if (orderPlaced) {
    return (
      <CheckoutSuccess
        orderId={orderId}
        isLoggedIn={!!user}
        onDownloadInvoice={handleDownloadInvoice}
        onShareWhatsApp={handleShareWhatsApp}
        whatsappStatus={waStatus}
        whatsappError={waError}
      />
    );
  }

  if (!user && !isGuest) {
    return <CheckoutAuthChoice onGuest={() => setIsGuest(true)} />;
  }

  // Synthetic zone for the summary so it always shows a shipping value.
  const summaryZone = selectedZone && showZoneSelector
    ? selectedZone
    : {
        id: "flat",
        zone_name: "ফিক্সড (৳১৫০)",
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
              <Link to="/auth?redirect=/checkout" className="text-primary hover:underline">সাইন-ইন করুন</Link>
            </p>
          )}

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <SimpleCheckoutForm
                shippingInfo={shippingInfo}
                setShippingInfo={(v) => {
                  setShippingInfo(v);
                  // Live-clear errors as the user types.
                  setFieldErrors((prev) => ({
                    ...prev,
                    fullName: v.fullName.trim() ? undefined : prev.fullName,
                    phone: v.phone.trim() ? undefined : prev.phone,
                    address: v.address.trim() ? undefined : prev.address,
                  }));
                }}
                errors={fieldErrors}
                deliveryNotes={deliveryNotes}
                setDeliveryNotes={setDeliveryNotes}
                deliveryZones={deliveryZones}
                selectedZone={selectedZone}
                onSelectZone={selectZone}
                showZoneSelector={showZoneSelector}
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
                onConfirmOrder={handleConfirmClick}
              />
            </div>

            <div>
              <CheckoutOrderSummary
                items={items}
                total={total}
                discountAmount={discountAmount}
                appliedCoupon={appliedCoupon}
                selectedZone={summaryZone}
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

      {/* Final confirmation dialog — prevents accidental orders and provides
          a clear last-mile review of the customer's details. */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              অর্ডার কনফার্ম করবেন?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>নিচের তথ্য যাচাই করে "হ্যাঁ, কনফার্ম করুন" চাপুন।</div>
                <div className="mt-3 p-3 rounded-lg bg-muted space-y-1">
                  <div><strong>নাম:</strong> {shippingInfo.fullName}</div>
                  <div><strong>মোবাইল:</strong> {shippingInfo.phone}</div>
                  <div><strong>ঠিকানা:</strong> {shippingInfo.address}</div>
                  <div><strong>পেমেন্ট:</strong> {selectedPayment === "cod" ? "ক্যাশ অন ডেলিভারি" : "অ্যাডভান্স + COD"}</div>
                  <div className="pt-2 border-t border-border/50 flex justify-between font-semibold">
                    <span>মোট:</span>
                    <span className="text-primary">৳{finalTotal.toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground pt-1 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5" />
                  অর্ডারের পরে হোয়াটসঅ্যাপে রিসিট শেয়ার হবে।
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePlaceOrder}
              disabled={processing}
              className="btn-gold"
            >
              {processing ? "প্রসেসিং..." : "হ্যাঁ, কনফার্ম করুন"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Checkout;
