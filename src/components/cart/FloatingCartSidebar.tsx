/**
 * @file FloatingCartSidebar.tsx
 * @module components/cart
 *
 * @description
 * Slide-in cart / mini-checkout drawer. Uses the *simplified* checkout flow
 * (SimpleCheckoutForm) to match the main /checkout page:
 *   - Only name, mobile, and address are required
 *   - Flat ৳150 delivery charge (zone-selector shows only when city matches)
 *   - COD + Advance+COD payment methods
 *   - Auto WhatsApp receipt share after successful order
 *   - AlertDialog confirmation + submit-guard prevents double submits
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag, ArrowRight, CheckCircle2, MessageCircle, Loader2 } from "lucide-react";

import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import CouponInput from "@/components/checkout/CouponInput";
import SimpleCheckoutForm from "@/components/checkout/SimpleCheckoutForm";
import CartSummary from "@/components/checkout/CartSummary";
import CartLineItem from "@/components/cart/CartLineItem";
import EmptyCart from "@/components/cart/EmptyCart";
import OrderSuccess from "@/components/cart/OrderSuccess";

import { trackPurchase } from "@/components/seo/AnalyticsTracker";
import { placeOrder } from "@/lib/order-placement";
import { getFriendlyError } from "@/lib/error/getFriendlyError";
import { useDeliveryZones } from "@/hooks/checkout/useDeliveryZones";
import {
  emptyShippingInfo,
  type PaymentMethodId,
} from "@/lib/checkout/types";
import {
  validateCheckoutFields,
  type CheckoutFieldErrors,
} from "@/lib/checkout/validation";
import { createSubmitGuard } from "@/lib/checkout/submitGuard";
import {
  shareOrderToWhatsApp,
  type OrderReceipt,
} from "@/lib/checkout/whatsappShare";

/** Fixed flat delivery charge (Bangladesh-wide) when no zone is picked. */
const FLAT_SHIPPING = 150;

interface FloatingCartSidebarProps {
  open: boolean;
  onClose: () => void;
}

const FloatingCartSidebar = ({ open, onClose }: FloatingCartSidebarProps) => {
  const { items, total, itemCount, updateQuantity, removeItem, clearCart } = useCart();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<"cart" | "checkout">("cart");
  const [processing, setProcessing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<
    "idle" | "sharing" | "opened" | "blocked" | "failed"
  >("idle");
  const [shareError, setShareError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<OrderReceipt | null>(null);
  const [reshareLoading, setReshareLoading] = useState(false);


  // Simplified checkout state
  const [shippingInfo, setShippingInfo] = useState(emptyShippingInfo);
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethodId>("cod");
  const [transactionId, setTransactionId] = useState("");
  const [paymentPhone, setPaymentPhone] = useState("");
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState<"bkash" | "nagad">("bkash");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [discountAmount, setDiscountAmount] = useState(0);

  // Delivery zones (optional — only shown if the typed city matches).
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

  // Totals
  const shippingCost = items.length > 0
    ? (showZoneSelector && selectedZone ? Number(selectedZone.shipping_charge) : FLAT_SHIPPING)
    : 0;
  const subtotalAfterDiscount = Math.max(0, total - discountAmount);
  const finalTotal = subtotalAfterDiscount + shippingCost;

  // Re-entrancy guard
  const submitGuardRef = useRef(createSubmitGuard());

  // Pre-fill from user profile (only into empty fields).
  useEffect(() => {
    if (!user || mode !== "checkout") return;
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setShippingInfo((prev) => ({
          ...prev,
          fullName: prev.fullName || data.full_name || "",
          phone: prev.phone || data.phone || "",
          address: prev.address || data.address || "",
          city: prev.city || data.city || "",
        }));
      });
  }, [user, mode]);

  const handleConfirmClick = () => {
    if (submitGuardRef.current.isLocked() || processing) return;
    const errs = validateCheckoutFields(shippingInfo);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast({
        title: "কিছু তথ্য অসম্পূর্ণ",
        description: "লাল হাইলাইট করা ফিল্ডগুলো ঠিক করে আবার চেষ্টা করুন।",
        variant: "destructive",
      });
      return;
    }
    if (items.length === 0) {
      toast({ title: "কার্ট খালি", description: "কার্টে পণ্য যোগ করুন।", variant: "destructive" });
      return;
    }
    if (selectedPayment === "advance_cod" &&
        (!advanceAmount || Number(advanceAmount) <= 0 || !transactionId.trim() || !paymentPhone.trim())) {
      toast({
        title: "পেমেন্ট তথ্য অসম্পূর্ণ",
        description: "অগ্রিম পরিমাণ, Transaction ID এবং পেমেন্ট নম্বর দিন।",
        variant: "destructive",
      });
      return;
    }
    setShowConfirmDialog(true);
  };

  const handlePlaceOrder = async () => {
    if (!submitGuardRef.current.tryAcquire()) return;
    setShowConfirmDialog(false);

    if (authLoading) {
      submitGuardRef.current.release();
      toast({ title: "একটু অপেক্ষা করুন", description: "সেশন যাচাই হচ্ছে, আবার চেষ্টা করুন", variant: "destructive" });
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

      await clearCart();
      setOrderId(generatedOrderId);
      setLastReceipt(receipt);
      setOrderPlaced(true);

      // Auto-share to WhatsApp — track visible status for the success screen
      setShareStatus("sharing");
      setShareError(null);
      const shareRes = await shareOrderToWhatsApp(receipt);
      setShareStatus(
        shareRes.status === "opened" || shareRes.status === "retried" || shareRes.status === "queued"
          ? "opened"
          : shareRes.status,
      );
      setShareError(shareRes.error ?? null);
      if (shareRes.status === "blocked") {
        toast({
          title: "WhatsApp popup ব্লক হয়েছে",
          description: shareRes.error ?? 'নিচে "আবার শেয়ার করুন" বাটনে ক্লিক করুন।',
        });
      } else if (shareRes.status === "failed") {
        toast({
          title: "WhatsApp শেয়ার ব্যর্থ",
          description: shareRes.error ?? "আবার চেষ্টা করুন।",
          variant: "destructive",
        });
      } else {
        toast({ title: "WhatsApp রিসিট শেয়ার হয়েছে ✅" });
      }


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

      toast({ title: "অর্ডার সফল! ✅", description: "আপনার অর্ডারটি সফলভাবে সম্পন্ন হয়েছে।" });
    } catch (err) {
      console.error("Order error:", err);
      const msg = getFriendlyError(err, "অর্ডার দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
      const isRateLimit = msg.includes("১০ মিনিট") || msg.includes("২৪ ঘণ্টা") || msg.includes("সর্বোচ্চ");
      toast({
        title: isRateLimit ? "অপেক্ষা করুন" : "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      submitGuardRef.current.release();
    }
  };

  const handleReshare = async () => {
    if (!lastReceipt || reshareLoading) return;
    setReshareLoading(true);
    setShareStatus("sharing");
    setShareError(null);
    try {
      const res = await shareOrderToWhatsApp(lastReceipt, { isRetry: true });
      const ok = res.status === "opened" || res.status === "retried" || res.status === "queued";
      setShareStatus(ok ? "opened" : (res.status as "blocked" | "failed"));
      setShareError(res.error ?? null);
      toast({
        title: res.status === "blocked" ? "আবার popup ব্লক হয়েছে" :
               res.status === "failed"  ? "শেয়ার ব্যর্থ" : "WhatsApp খোলা হয়েছে ✅",
        description: res.error ?? undefined,
        variant: ok ? "default" : "destructive",
      });
    } finally {
      setReshareLoading(false);
    }
  };


  const resetCheckout = () => {
    setMode("cart");
    setOrderPlaced(false);
    setOrderId(null);
    setShareStatus("idle");
    setLastReceipt(null);
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

            <div className="flex-1 overflow-y-auto p-4">
              {orderPlaced ? (
                <div className="space-y-4">
                  <OrderSuccess orderId={orderId} onAfterAction={resetCheckout} />
                  <div
                    data-testid="wa-share-status"
                    data-status={shareStatus}
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className={`rounded-xl border p-3 text-sm ${
                      shareStatus === "opened"
                        ? "border-green-500/40 bg-green-500/5 text-green-700 dark:text-green-400"
                        : shareStatus === "sharing"
                        ? "border-border bg-muted/50 text-muted-foreground"
                        : shareStatus === "blocked" || shareStatus === "failed"
                        ? "border-destructive/40 bg-destructive/5 text-destructive"
                        : "hidden"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      {shareStatus === "sharing" ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                      ) : (
                        <MessageCircle className="w-4 h-4" />
                      )}
                      {shareStatus === "sharing" && "WhatsApp রিসিট শেয়ার হচ্ছে..."}
                      {shareStatus === "opened" && "WhatsApp রিসিট শেয়ার হয়েছে ✅"}
                      {shareStatus === "blocked" && "WhatsApp popup ব্লক হয়েছে"}
                      {shareStatus === "failed" && "WhatsApp শেয়ার ব্যর্থ হয়েছে"}
                    </div>
                    {(shareStatus === "blocked" || shareStatus === "failed") && shareError && (
                      <p
                        data-testid="wa-share-error"
                        className="mt-1 text-xs text-destructive/90 break-words"
                      >
                        কারণ: {shareError}
                      </p>
                    )}
                    {(shareStatus === "blocked" || shareStatus === "failed") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2 w-full"
                        onClick={handleReshare}
                        disabled={reshareLoading}
                        data-testid="wa-reshare"
                        aria-busy={reshareLoading}
                      >
                        {reshareLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden />}

                        {reshareLoading ? "চেষ্টা করা হচ্ছে..." : "আবার WhatsApp-এ শেয়ার করুন"}
                      </Button>
                    )}
                  </div>
                </div>
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
                  <SimpleCheckoutForm
                    shippingInfo={shippingInfo}
                    setShippingInfo={(v) => {
                      setShippingInfo(v);
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

            {!orderPlaced && items.length > 0 && (
              <div className="border-t border-border p-4 space-y-3">
                <CartSummary
                  subtotal={total}
                  discount={discountAmount}
                  shippingCost={shippingCost}
                  total={mode === "checkout" ? finalTotal : subtotalAfterDiscount}
                  showShipping={mode === "checkout"}
                  hasZone={mode === "checkout"}
                />

                {mode === "cart" ? (
                  <Button onClick={() => setMode("checkout")} className="w-full btn-gold">
                    চেকআউট করুন <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setMode("cart")} className="w-full text-sm">
                    ← কার্টে ফিরে যান
                  </Button>
                )}
              </div>
            )}
          </motion.div>

          {/* Confirmation dialog — final review + double-submit block */}
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
        </>
      )}
    </AnimatePresence>
  );
};

export default FloatingCartSidebar;
