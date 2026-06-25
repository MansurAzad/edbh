import { CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type PaymentMethodId = "bkash" | "nagad" | "advance_cod" | "cod";

export interface PaymentMethod {
  id: PaymentMethodId;
  name: string;
  icon: string;
  number?: string;
}

interface PaymentSectionProps {
  methods: PaymentMethod[];
  selectedPayment: PaymentMethodId;
  onSelectPayment: (id: PaymentMethodId) => void;
  transactionId: string;
  onTransactionIdChange: (v: string) => void;
  paymentPhone: string;
  onPaymentPhoneChange: (v: string) => void;
  advancePaymentMethod: "bkash" | "nagad";
  onAdvancePaymentMethodChange: (v: "bkash" | "nagad") => void;
  advanceAmount: string;
  onAdvanceAmountChange: (v: string) => void;
}

/** Payment method picker with conditional bKash/Nagad and Advance+COD fields. */
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
  const isMobileWallet = selectedPayment === "bkash" || selectedPayment === "nagad";
  const isAdvance = selectedPayment === "advance_cod";
  const activeMethod = methods.find((m) => m.id === selectedPayment);

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-foreground flex items-center gap-2">
        <CreditCard className="w-4 h-4" /> পেমেন্ট
      </h3>
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
            <Label htmlFor={`pay-${m.id}`} className="text-sm cursor-pointer flex-1">
              {m.icon} {m.name}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {isMobileWallet && activeMethod && (
        <div className="p-3 bg-muted rounded-lg space-y-2">
          <p className="text-xs text-muted-foreground">
            {activeMethod.name} নম্বর: <strong>{activeMethod.number}</strong>
          </p>
          <Input
            value={transactionId}
            onChange={(e) => onTransactionIdChange(e.target.value)}
            placeholder="Transaction ID"
            className="h-8 text-xs"
          />
          <Input
            value={paymentPhone}
            onChange={(e) => onPaymentPhoneChange(e.target.value)}
            placeholder="পেমেন্ট করা নম্বর"
            className="h-8 text-xs"
          />
        </div>
      )}

      {isAdvance && (
        <div className="p-3 bg-muted rounded-lg space-y-2">
          <RadioGroup
            value={advancePaymentMethod}
            onValueChange={(v) => onAdvancePaymentMethodChange(v as "bkash" | "nagad")}
            className="flex gap-3"
          >
            <div className="flex items-center gap-1">
              <RadioGroupItem value="bkash" id="adv-bkash" />
              <Label htmlFor="adv-bkash" className="text-xs">bKash</Label>
            </div>
            <div className="flex items-center gap-1">
              <RadioGroupItem value="nagad" id="adv-nagad" />
              <Label htmlFor="adv-nagad" className="text-xs">Nagad</Label>
            </div>
          </RadioGroup>
          <Input
            value={advanceAmount}
            onChange={(e) => onAdvanceAmountChange(e.target.value)}
            placeholder="অগ্রিম পরিমাণ ৳"
            className="h-8 text-xs"
            type="number"
          />
          <Input
            value={transactionId}
            onChange={(e) => onTransactionIdChange(e.target.value)}
            placeholder="Transaction ID"
            className="h-8 text-xs"
          />
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
