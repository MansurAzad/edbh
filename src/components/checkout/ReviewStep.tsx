/**
 * @file ReviewStep.tsx
 * @description Step 3 (final) of the checkout wizard. Displays a read-only
 * summary of the shipping address, delivery notes, and payment details so the
 * customer can confirm everything before submitting the order. The "Place
 * Order" button is disabled while the order is being processed to prevent
 * double-submission.
 */

import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import {
  paymentMethods,
  type CheckoutShippingInfo,
  type PaymentMethodId,
} from "@/lib/checkout/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link ReviewStep}.
 */
interface Props {
  /** Shipping address fields collected in Step 1 */
  shippingInfo: CheckoutShippingInfo;

  /**
   * Optional free-text delivery instructions entered by the customer.
   * Bengali label: "ডেলিভারি নোট"
   * Rendered only when non-empty.
   */
  deliveryNotes: string;

  /** The payment method chosen in Step 2 */
  selectedPayment: PaymentMethodId;

  /**
   * Mobile-wallet transaction reference entered in Step 2.
   * Empty string for COD orders.
   */
  transactionId: string;

  /**
   * The phone number from which the mobile-wallet payment was sent.
   * Empty string for COD orders.
   */
  paymentPhone: string;

  /**
   * The advance amount (৳) entered for `advance_cod` orders.
   * Empty string for all other payment methods.
   */
  advanceAmount: string;

  /** Grand total in ৳ (after discounts + shipping) – used to compute the
   * COD remainder for `advance_cod` orders. */
  finalTotal: number;

  /**
   * `true` while the parent is awaiting the Supabase order-creation call.
   * Disables the "Place Order" button and shows "Processing..." label.
   */
  processing: boolean;

  /** Navigates back to Step 2 (Payment) */
  onBack: () => void;

  /**
   * Submits the order.  Only called when the button is not in a `processing`
   * state; the parent handles the actual Supabase write.
   */
  onPlaceOrder: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * `ReviewStep` – checkout wizard step 3: review & confirm.
 *
 * Animates in from the left (consistent with the other wizard steps).
 * Renders two muted summary cards:
 *  1. **Shipping Address** – name, address, city/district, phone, optional
 *     email, and optional delivery notes.
 *  2. **Payment** – method name, TxID, payer phone, advance amount / COD
 *     remainder (for `advance_cod`), or a cash-on-delivery notice.
 *
 * @example
 * ```tsx
 * <ReviewStep
 *   shippingInfo={shippingInfo}
 *   deliveryNotes={deliveryNotes}
 *   selectedPayment={selectedPayment}
 *   transactionId={txId}
 *   paymentPhone={paymentPhone}
 *   advanceAmount={advanceAmount}
 *   finalTotal={finalTotal}
 *   processing={isProcessing}
 *   onBack={() => setStep(2)}
 *   onPlaceOrder={handlePlaceOrder}
 * />
 * ```
 *
 * @param props - {@link Props}
 */
export default function ReviewStep({
  shippingInfo,
  deliveryNotes,
  selectedPayment,
  transactionId,
  paymentPhone,
  advanceAmount,
  finalTotal,
  processing,
  onBack,
  onPlaceOrder,
}: Props) {
  return (
    /* Slide-in from left – matches the animation used by other wizard steps */
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="card-luxury"
    >
      {/* Step header */}
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-primary" />
        <h2 className="font-display text-xl font-semibold">
          Review &amp; Confirm
        </h2>
      </div>

      <div className="space-y-4 mb-6">
        {/* ---------------------------------------------------------------
          * Shipping address summary card
          * Displays every populated field; email and delivery notes are
          * conditionally rendered only when present.
          * --------------------------------------------------------------- */}
        <div className="p-4 bg-muted rounded-xl">
          <h4 className="font-medium text-foreground mb-2">
            Shipping Address
          </h4>
          <p className="text-muted-foreground text-sm">
            {shippingInfo.fullName}
            <br />
            {shippingInfo.address}
            <br />
            {shippingInfo.city}, {shippingInfo.district}
            <br />
            📞 {shippingInfo.phone}
            {/* Email – shown only when provided (guests may omit it) */}
            {shippingInfo.email && (
              <>
                <br />📧 {shippingInfo.email}
              </>
            )}
            {/*
             * Delivery notes – shown only when non-empty.
             * Bengali label: "ডেলিভারি নোট" = "Delivery Note"
             */}
            {deliveryNotes && (
              <>
                <br />
                <br />
                📝 <strong>ডেলিভারি নোট:</strong> {deliveryNotes}
              </>
            )}
          </p>
        </div>

        {/* ---------------------------------------------------------------
          * Payment summary card
          * Shows method name + conditional transaction / advance details.
          * --------------------------------------------------------------- */}
        <div className="p-4 bg-muted rounded-xl">
          <h4 className="font-medium text-foreground mb-2">Payment</h4>
          <p className="text-muted-foreground text-sm">
            {/* Human-readable method name looked up from the config array */}
            {paymentMethods.find((m) => m.id === selectedPayment)?.name}

            {/* Transaction reference – present for mobile-wallet payments */}
            {transactionId && (
              <>
                <br />
                TxID: <span className="font-mono">{transactionId}</span>
              </>
            )}

            {/* Payer phone – present for mobile-wallet payments */}
            {paymentPhone && (
              <>
                <br />
                Phone: {paymentPhone}
              </>
            )}

            {/* Advance + COD breakdown: advance paid + remainder on delivery */}
            {selectedPayment === "advance_cod" && advanceAmount && (
              <>
                <br />
                Advance: ৳{Number(advanceAmount).toLocaleString()}
                <br />
                Due on delivery: ৳
                {(finalTotal - Number(advanceAmount)).toLocaleString()}
              </>
            )}

            {/* COD notice */}
            {selectedPayment === "cod" && (
              <>
                <br />
                💵 Full Cash on Delivery
              </>
            )}
          </p>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-4">
        {/* Back to Step 2 */}
        <button onClick={onBack} className="btn-outline-gold flex-1">
          Back
        </button>

        {/*
         * Place Order – disabled while processing to prevent double-submit.
         * Label switches to "Processing..." during the async order creation.
         */}
        <button
          onClick={onPlaceOrder}
          className="btn-gold flex-1 disabled:opacity-50"
          disabled={processing}
        >
          {processing ? "Processing..." : "Place Order"}
        </button>
      </div>
    </motion.div>
  );
}
