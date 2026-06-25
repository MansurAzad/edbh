/**
 * @file PaymentStep.tsx
 * @description Step 2 of the main checkout wizard – the full-page Payment
 * Method screen. Presents all available payment options as large tap-target
 * cards, shows contextual instruction panels for each method, validates that
 * required supplementary fields (TxID, phone, advance amount) are filled
 * before allowing the user to proceed to Step 3 (Review).
 *
 * ### Supported payment methods
 * | ID             | Behaviour                                                  |
 * |----------------|------------------------------------------------------------|
 * | `bkash`        | Full payment; shows bKash instructions + TxID + phone      |
 * | `nagad`        | Full payment; shows Nagad instructions + TxID + phone      |
 * | `advance_cod`  | Partial advance via bKash/Nagad + rest collected on delivery|
 * | `cod`          | Full cash on delivery; no extra fields                     |
 */

import { motion } from "framer-motion";
import { CheckCircle, CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { paymentMethods, type PaymentMethodId } from "@/lib/checkout/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link PaymentStep}.
 */
interface Props {
  /** Currently selected payment method identifier */
  selectedPayment: PaymentMethodId;

  /**
   * Setter for `selectedPayment`. Also triggers a reset of `transactionId`
   * and `paymentPhone` so stale data from a previous method is cleared.
   */
  setSelectedPayment: (id: PaymentMethodId) => void;

  /**
   * The grand total in ৳ that the customer must pay (after discounts +
   * shipping). Displayed inside the bKash/Nagad instructions panel.
   */
  finalTotal: number;

  /**
   * The transaction reference code the customer receives from their wallet
   * app after sending payment (bKash / Nagad / advance_cod flows only).
   */
  transactionId: string;

  /** Setter for `transactionId` */
  setTransactionId: (v: string) => void;

  /**
   * The mobile number the customer used to send the payment.
   * Used for order verification by the operations team.
   */
  paymentPhone: string;

  /** Setter for `paymentPhone` */
  setPaymentPhone: (v: string) => void;

  /**
   * Which mobile wallet the customer chose for the advance portion when
   * `advance_cod` is selected – `"bkash"` or `"nagad"`.
   */
  advancePaymentMethod: "bkash" | "nagad";

  /** Setter for `advancePaymentMethod` */
  setAdvancePaymentMethod: (v: "bkash" | "nagad") => void;

  /**
   * Advance amount (in ৳) entered by the customer for the `advance_cod`
   * method. Stored as string to preserve raw input; converted to `Number`
   * before arithmetic.
   */
  advanceAmount: string;

  /** Setter for `advanceAmount` */
  setAdvanceAmount: (v: string) => void;

  /** Navigates back to Step 1 (Shipping) */
  onBack: () => void;

  /**
   * Navigates forward to Step 3 (Review) after passing validation.
   * Only called internally from {@link validateAndContinue}.
   */
  onContinue: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * `PaymentStep` – checkout wizard step 2.
 *
 * Animates in from the left on mount. The "Review Order" button is disabled
 * until a payment method is selected; for methods that require supplementary
 * data the button is gated behind `validateAndContinue` which shows inline
 * toast errors if fields are missing.
 *
 * @example
 * ```tsx
 * <PaymentStep
 *   selectedPayment={selectedPayment}
 *   setSelectedPayment={setSelectedPayment}
 *   finalTotal={finalTotal}
 *   transactionId={txId}
 *   setTransactionId={setTxId}
 *   paymentPhone={phone}
 *   setPaymentPhone={setPhone}
 *   advancePaymentMethod={advMethod}
 *   setAdvancePaymentMethod={setAdvMethod}
 *   advanceAmount={advAmount}
 *   setAdvanceAmount={setAdvAmount}
 *   onBack={() => setStep(1)}
 *   onContinue={() => setStep(3)}
 * />
 * ```
 *
 * @param props - {@link Props}
 */
export default function PaymentStep({
  selectedPayment,
  setSelectedPayment,
  finalTotal,
  transactionId,
  setTransactionId,
  paymentPhone,
  setPaymentPhone,
  advancePaymentMethod,
  setAdvancePaymentMethod,
  advanceAmount,
  setAdvanceAmount,
  onBack,
  onContinue,
}: Props) {
  const { toast } = useToast();

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  /**
   * Validates all required supplementary fields for the current payment
   * method before allowing the user to proceed to the Review step.
   *
   * Validation rules:
   * - **bKash / Nagad**: `transactionId` and `paymentPhone` must be non-empty.
   * - **advance_cod**: additionally requires a positive `advanceAmount`.
   * - **cod**: no extra validation needed.
   *
   * Surfaces a toast with a descriptive message on failure.
   * Calls `onContinue()` on success.
   */
  const validateAndContinue = () => {
    const isMobile =
      selectedPayment === "bkash" || selectedPayment === "nagad";
    const isAdvCod = selectedPayment === "advance_cod";

    // Mobile wallet: TxID + phone required
    if (isMobile && (!transactionId || !paymentPhone)) {
      toast({
        title: "Missing info",
        description: "Please enter Transaction ID and phone number",
        variant: "destructive",
      });
      return;
    }

    // Advance + COD: amount > 0 AND TxID + phone required
    if (
      isAdvCod &&
      (!transactionId ||
        !paymentPhone ||
        !advanceAmount ||
        Number(advanceAmount) <= 0)
    ) {
      toast({
        title: "Missing info",
        description:
          "Please enter advance amount, Transaction ID, and phone number",
        variant: "destructive",
      });
      return;
    }

    // All good – proceed to Review step
    onContinue();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    /*
     * Slide-in animation from the left – consistent with ShippingStep and
     * ReviewStep so the wizard feels like a coherent flow.
     */
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="card-luxury"
    >
      {/* Step header */}
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="w-6 h-6 text-primary" />
        <h2 className="font-display text-xl font-semibold">Payment Method</h2>
      </div>

      {/* -----------------------------------------------------------------
        * Payment method cards
        * Each method is a full-width button that highlights with a primary
        * border + tinted background when active, and shows a CheckCircle.
        * Selecting a new method resets TxID + phone so stale data is cleared.
        * ----------------------------------------------------------------- */}
      <div className="space-y-3">
        {paymentMethods.map((method) => (
          <button
            key={method.id}
            onClick={() => {
              setSelectedPayment(method.id);
              setTransactionId(""); // clear stale transaction data
              setPaymentPhone("");  // clear stale phone data
            }}
            className={`w-full p-4 rounded-xl border-2 flex items-center gap-4 transition-all text-left ${
              selectedPayment === method.id
                ? "border-primary bg-primary/10"          // active state
                : "border-border hover:border-primary/50"  // inactive hover
            }`}
          >
            {/* Method emoji icon */}
            <span className="text-2xl">{method.icon}</span>

            {/* Name + description */}
            <div className="flex-1">
              <span className="font-medium text-foreground block">
                {method.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {method.description}
              </span>
            </div>

            {/* Checkmark shown only for the selected method */}
            {selectedPayment === method.id && (
              <CheckCircle className="w-5 h-5 text-primary" />
            )}
          </button>
        ))}
      </div>

      {/* -----------------------------------------------------------------
        * bKash / Nagad supplementary panel
        * Shown when a full mobile-wallet payment is selected.
        * Includes:
        *  - Step-by-step instructions
        *  - Merchant number (from paymentMethods config)
        *  - Payer phone number field
        *  - Transaction ID field
        * ----------------------------------------------------------------- */}
      {(selectedPayment === "bkash" || selectedPayment === "nagad") && (
        <div className="mt-6 p-4 bg-muted rounded-xl space-y-4">
          {/* Instruction card */}
          <div className="p-3 bg-primary/10 rounded-lg text-sm">
            <p className="font-semibold text-foreground mb-1">
              📲{" "}
              {selectedPayment === "bkash" ? "bKash" : "Nagad"} Payment
              Instructions:
            </p>
            <ol className="list-decimal list-inside text-muted-foreground space-y-1">
              <li>
                Open the{" "}
                {selectedPayment === "bkash" ? "bKash" : "Nagad"} app
              </li>
              <li>Select "Send Money"</li>
              <li>
                Number:{" "}
                <span className="font-mono font-bold text-foreground">
                  {
                    paymentMethods.find((m) => m.id === selectedPayment)
                      ?.number
                  }
                </span>
              </li>
              {/* Total amount the customer must send */}
              <li>Send total ৳{finalTotal.toLocaleString()}</li>
              <li>Enter the Transaction ID below</li>
            </ol>
          </div>

          {/* Payer phone number – must match the sending wallet number */}
          <div>
            <Label className="text-sm mb-1 block">
              Your {selectedPayment === "bkash" ? "bKash" : "Nagad"} Number *
            </Label>
            <Input
              placeholder="01XXXXXXXXX"
              value={paymentPhone}
              onChange={(e) => setPaymentPhone(e.target.value)}
            />
          </div>

          {/* Transaction ID returned by the wallet after payment */}
          <div>
            <Label className="text-sm mb-1 block">Transaction ID *</Label>
            <Input
              placeholder="e.g. TXN8A4K2M9"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* -----------------------------------------------------------------
        * Advance + COD supplementary panel
        * Allows partial pre-payment via bKash or Nagad with the remainder
        * collected on delivery. Suggests a minimum advance of 20 % of total.
        * ----------------------------------------------------------------- */}
      {selectedPayment === "advance_cod" && (
        <div className="mt-6 p-4 bg-muted rounded-xl space-y-4">
          <p className="text-sm text-muted-foreground">
            Send a partial advance payment; pay the rest on delivery.
          </p>

          {/* Sub-radio: choose bKash or Nagad for the advance transfer */}
          <div>
            <Label className="text-sm mb-1 block">
              Advance Payment Method
            </Label>
            <RadioGroup
              value={advancePaymentMethod}
              onValueChange={(v) =>
                setAdvancePaymentMethod(v as "bkash" | "nagad")
              }
              className="flex gap-4 mt-1"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="bkash" id="adv-bkash" />
                <Label htmlFor="adv-bkash">bKash</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="nagad" id="adv-nagad" />
                <Label htmlFor="adv-nagad">Nagad</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Merchant number hint for the selected advance wallet */}
          <div className="p-3 bg-primary/10 rounded-lg text-sm">
            <p className="text-muted-foreground">
              {/* Bengali: "নম্বর" = "Number" */}
              নম্বর:{" "}
              <span className="font-mono font-bold text-foreground">
                {paymentMethods.find((m) => m.id === advancePaymentMethod)
                  ?.number || "01XXXXXXXXX"}
              </span>
            </p>
          </div>

          {/* Advance amount – placeholder hints at a 20 % minimum */}
          <div>
            <Label className="text-sm mb-1 block">Advance Amount (৳) *</Label>
            <Input
              type="number"
              placeholder={`Minimum ৳${Math.ceil(finalTotal * 0.2)}`}
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
            />
            {/* Live preview: shows how much will be due on delivery */}
            {advanceAmount && Number(advanceAmount) > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Due on delivery: ৳
                {(finalTotal - Number(advanceAmount)).toLocaleString()}
              </p>
            )}
          </div>

          {/* Payer phone number */}
          <div>
            <Label className="text-sm mb-1 block">Your Phone Number *</Label>
            <Input
              placeholder="01XXXXXXXXX"
              value={paymentPhone}
              onChange={(e) => setPaymentPhone(e.target.value)}
            />
          </div>

          {/* Transaction ID from the wallet */}
          <div>
            <Label className="text-sm mb-1 block">Transaction ID *</Label>
            <Input
              placeholder="e.g. TXN8A4K2M9"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* -----------------------------------------------------------------
        * Cash on Delivery informational banner
        * No extra fields required – just a reminder to keep cash ready.
        * ----------------------------------------------------------------- */}
      {selectedPayment === "cod" && (
        <div className="mt-6 p-4 bg-muted rounded-xl">
          <p className="text-sm text-muted-foreground">
            💵 Pay the full amount of ৳{finalTotal.toLocaleString()} on
            delivery. Please keep cash ready.
          </p>
        </div>
      )}

      {/* -----------------------------------------------------------------
        * Navigation buttons
        * "Back" returns to Step 1; "Review Order" runs validation first.
        * The forward button is disabled when no payment method is selected.
        * ----------------------------------------------------------------- */}
      <div className="flex gap-4 mt-6">
        <button onClick={onBack} className="btn-outline-gold flex-1">
          Back
        </button>
        <button
          onClick={validateAndContinue}
          disabled={!selectedPayment}
          className="btn-gold flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Review Order
        </button>
      </div>
    </motion.div>
  );
}
