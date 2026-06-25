/**
 * @file PaymentSection.tsx
 * @description Reusable payment-method selector used inside the compact
 * checkout sidebar / mini-checkout flow. Renders a radio group of available
 * payment methods and conditionally shows extra fields depending on the
 * selected method:
 *
 * - **bKash / Nagad** – shows the merchant number, a transaction-ID field,
 *   and a "payment phone" field.
 * - **Advance + COD** – shows a sub-radio for bKash vs Nagad, an advance
 *   amount field, a transaction-ID field, and a payment-phone field.
 * - **COD** – no extra fields required.
 *
 * This is a *controlled* component; all state lives in the parent.
 */

import { CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// ---------------------------------------------------------------------------
// Types (re-exported so callers can import from this module)
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all supported payment method identifiers.
 *
 * | Value         | Description                                             |
 * |---------------|---------------------------------------------------------|
 * | `"bkash"`     | Full payment via bKash mobile banking                   |
 * | `"nagad"`     | Full payment via Nagad mobile banking                   |
 * | `"advance_cod"` | Partial advance (bKash/Nagad) + remainder on delivery |
 * | `"cod"`       | Full cash payment collected on delivery                 |
 */
export type PaymentMethodId = "bkash" | "nagad" | "advance_cod" | "cod";

/**
 * Shape of a single entry in the payment-methods list.
 */
export interface PaymentMethod {
  /** Unique identifier – used as the radio value */
  id: PaymentMethodId;

  /** Display name rendered in the radio label, e.g. "bKash" */
  name: string;

  /** Emoji or image URL used as the visual icon next to the label */
  icon: string;

  /**
   * Merchant phone number to which the customer should send money.
   * Present only for methods that require a manual transfer (bKash, Nagad).
   */
  number?: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link PaymentSection}.
 */
interface PaymentSectionProps {
  /** Full list of available payment methods to render as radio options */
  methods: PaymentMethod[];

  /** The currently selected payment method ID */
  selectedPayment: PaymentMethodId;

  /**
   * Called with the new method ID whenever the user selects a different radio.
   * @param id - The newly selected {@link PaymentMethodId}.
   */
  onSelectPayment: (id: PaymentMethodId) => void;

  /**
   * The transaction reference the customer received after sending payment
   * (bKash / Nagad / advance_cod flows only).
   */
  transactionId: string;

  /**
   * Setter for `transactionId`.
   * @param v - New transaction ID string.
   */
  onTransactionIdChange: (v: string) => void;

  /**
   * The phone number the customer used to send the payment
   * (bKash / Nagad / advance_cod flows only).
   * Bengali UI label: "পেমেন্ট করা নম্বর"
   */
  paymentPhone: string;

  /**
   * Setter for `paymentPhone`.
   * @param v - New phone number string.
   */
  onPaymentPhoneChange: (v: string) => void;

  /**
   * Which mobile wallet the customer will use for the advance portion when
   * the `advance_cod` method is selected.
   */
  advancePaymentMethod: "bkash" | "nagad";

  /**
   * Setter for `advancePaymentMethod`.
   * @param v - `"bkash"` or `"nagad"`.
   */
  onAdvancePaymentMethodChange: (v: "bkash" | "nagad") => void;

  /**
   * The advance amount (in ৳) entered by the customer for `advance_cod`.
   * Stored as a string to preserve raw input; caller converts to number.
   */
  advanceAmount: string;

  /**
   * Setter for `advanceAmount`.
   * @param v - New advance amount string.
   */
  onAdvanceAmountChange: (v: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * `PaymentSection` – payment-method picker with conditional detail fields.
 *
 * Renders a labelled radio group (পেমেন্ট / Payment) and, based on the
 * selected method, surfaces the appropriate supplementary inputs:
 *
 * - Mobile wallets (bKash / Nagad): merchant number hint, transaction ID,
 *   and payer phone number.
 * - Advance + COD: nested wallet sub-selector, advance amount, transaction
 *   ID, and payer phone number.
 * - COD: no extra fields.
 *
 * All inputs are deliberately compact (`h-8 text-xs`) to fit within the
 * sidebar checkout layout without causing overflow.
 *
 * @example
 * ```tsx
 * <PaymentSection
 *   methods={paymentMethods}
 *   selectedPayment={selectedPayment}
 *   onSelectPayment={setSelectedPayment}
 *   transactionId={txId}
 *   onTransactionIdChange={setTxId}
 *   paymentPhone={phone}
 *   onPaymentPhoneChange={setPhone}
 *   advancePaymentMethod={advMethod}
 *   onAdvancePaymentMethodChange={setAdvMethod}
 *   advanceAmount={advAmount}
 *   onAdvanceAmountChange={setAdvAmount}
 * />
 * ```
 *
 * @param props - {@link PaymentSectionProps}
 */
const PaymentSection = ({
  methods,
  selectedPayment,
  onSelectPayment,
  transactionId,
  onTransactionIdChange,
  paymentPhone,
  onPaymentPhoneChange,
  advancePaymentMethod,
  onAdvancePaymentMethodChange,
  advanceAmount,
  onAdvanceAmountChange,
}: PaymentSectionProps) => {
  // ---------------------------------------------------------------------------
  // Derived flags – centralise conditional logic so JSX stays readable
  // ---------------------------------------------------------------------------

  /**
   * `true` when the user has selected a full mobile-wallet payment (bKash or
   * Nagad). Shows the merchant number hint + TxID + phone inputs.
   */
  const isMobileWallet =
    selectedPayment === "bkash" || selectedPayment === "nagad";

  /**
   * `true` when the user has selected the Advance + COD hybrid method.
   * Shows the advance-amount field in addition to TxID + phone inputs.
   */
  const isAdvance = selectedPayment === "advance_cod";

  /**
   * The full PaymentMethod object for the currently active selection.
   * Used to display the merchant's number in the detail panel.
   */
  const activeMethod = methods.find((m) => m.id === selectedPayment);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-3">
      {/*
       * Section heading with a credit-card icon.
       * Bengali label: "পেমেন্ট" (Payment)
       */}
      <h3 className="font-medium text-foreground flex items-center gap-2">
        <CreditCard className="w-4 h-4" /> পেমেন্ট
      </h3>

      {/* -----------------------------------------------------------------
        * Payment method radio group
        * Each option is wrapped in a hover-tinted border card for easy
        * tap/click targeting on mobile devices.
        * ----------------------------------------------------------------- */}
      <RadioGroup
        value={selectedPayment}
        onValueChange={(v) => onSelectPayment(v as PaymentMethodId)}
        className="space-y-2"
      >
        {methods.map((m) => (
          <div
            key={m.id}
            className="flex items-center space-x-2 p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <RadioGroupItem value={m.id} id={`pay-${m.id}`} />
            <Label
              htmlFor={`pay-${m.id}`}
              className="text-sm cursor-pointer flex-1"
            >
              {m.icon} {m.name}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {/* -----------------------------------------------------------------
        * Mobile wallet detail panel (bKash OR Nagad full-payment)
        * Shows the merchant number, transaction-ID input, and payer-phone
        * input inside a muted rounded card.
        * ----------------------------------------------------------------- */}
      {isMobileWallet && activeMethod && (
        <div className="p-3 bg-muted rounded-lg space-y-2">
          {/*
           * Merchant number hint so the customer knows where to send money.
           * Bengali: "bKash/Nagad নম্বর: 01XXXXXXXXX"
           */}
          <p className="text-xs text-muted-foreground">
            {activeMethod.name} নম্বর: <strong>{activeMethod.number}</strong>
          </p>

          {/* Transaction ID – the reference code from the wallet app */}
          <Input
            value={transactionId}
            onChange={(e) => onTransactionIdChange(e.target.value)}
            placeholder="Transaction ID"
            className="h-8 text-xs"
          />

          {/*
           * Phone number the customer sent money from.
           * Bengali placeholder: "পেমেন্ট করা নম্বর" = "Number used to pay"
           */}
          <Input
            value={paymentPhone}
            onChange={(e) => onPaymentPhoneChange(e.target.value)}
            placeholder="পেমেন্ট করা নম্বর"
            className="h-8 text-xs"
          />
        </div>
      )}

      {/* -----------------------------------------------------------------
        * Advance + COD detail panel
        * Allows the customer to pick bKash or Nagad for the advance
        * portion, enter the advance amount (৳), TxID, and payer phone.
        * ----------------------------------------------------------------- */}
      {isAdvance && (
        <div className="p-3 bg-muted rounded-lg space-y-2">
          {/* Sub-radio: which wallet to use for the advance transfer */}
          <RadioGroup
            value={advancePaymentMethod}
            onValueChange={(v) =>
              onAdvancePaymentMethodChange(v as "bkash" | "nagad")
            }
            className="flex gap-3"
          >
            <div className="flex items-center gap-1">
              <RadioGroupItem value="bkash" id="adv-bkash" />
              <Label htmlFor="adv-bkash" className="text-xs">
                bKash
              </Label>
            </div>
            <div className="flex items-center gap-1">
              <RadioGroupItem value="nagad" id="adv-nagad" />
              <Label htmlFor="adv-nagad" className="text-xs">
                Nagad
              </Label>
            </div>
          </RadioGroup>

          {/*
           * Advance amount field.
           * Bengali placeholder: "অগ্রিম পরিমাণ ৳" = "Advance amount ৳"
           * type="number" prevents non-numeric keyboard input.
           */}
          <Input
            value={advanceAmount}
            onChange={(e) => onAdvanceAmountChange(e.target.value)}
            placeholder="অগ্রিম পরিমাণ ৳"
            className="h-8 text-xs"
            type="number"
          />

          {/* Transaction reference from the wallet app */}
          <Input
            value={transactionId}
            onChange={(e) => onTransactionIdChange(e.target.value)}
            placeholder="Transaction ID"
            className="h-8 text-xs"
          />

          {/*
           * Payer phone – must match the sender's wallet number for
           * verification purposes.
           * Bengali placeholder: "পেমেন্ট করা নম্বর" = "Number used to pay"
           */}
          <Input
            value={paymentPhone}
            onChange={(e) => onPaymentPhoneChange(e.target.value)}
            placeholder="পেমেন্ট করা নম্বর"
            className="h-8 text-xs"
          />
        </div>
      )}
    </div>
  );
};

export default PaymentSection;
