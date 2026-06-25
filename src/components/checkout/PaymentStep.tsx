import { motion } from "framer-motion";
import { CheckCircle, CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { paymentMethods, type PaymentMethodId } from "@/lib/checkout/types";

interface Props {
  selectedPayment: PaymentMethodId;
  setSelectedPayment: (id: PaymentMethodId) => void;
  finalTotal: number;
  transactionId: string;
  setTransactionId: (v: string) => void;
  paymentPhone: string;
  setPaymentPhone: (v: string) => void;
  advancePaymentMethod: "bkash" | "nagad";
  setAdvancePaymentMethod: (v: "bkash" | "nagad") => void;
  advanceAmount: string;
  setAdvanceAmount: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

export default function PaymentStep({
  selectedPayment, setSelectedPayment, finalTotal,
  transactionId, setTransactionId, paymentPhone, setPaymentPhone,
  advancePaymentMethod, setAdvancePaymentMethod, advanceAmount, setAdvanceAmount,
  onBack, onContinue,
}: Props) {
  const { toast } = useToast();
  const validateAndContinue = () => {
    const isMobile = selectedPayment === "bkash" || selectedPayment === "nagad";
    const isAdvCod = selectedPayment === "advance_cod";
    if (isMobile && (!transactionId || !paymentPhone)) {
      toast({ title: "Missing info", description: "Please enter Transaction ID and phone number", variant: "destructive" });
      return;
    }
    if (isAdvCod && (!transactionId || !paymentPhone || !advanceAmount || Number(advanceAmount) <= 0)) {
      toast({ title: "Missing info", description: "Please enter advance amount, Transaction ID, and phone number", variant: "destructive" });
      return;
    }
    onContinue();
  };

  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="card-luxury">
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="w-6 h-6 text-primary" />
        <h2 className="font-display text-xl font-semibold">Payment Method</h2>
      </div>
      <div className="space-y-3">
        {paymentMethods.map((method) => (
          <button
            key={method.id}
            onClick={() => {
              setSelectedPayment(method.id);
              setTransactionId("");
              setPaymentPhone("");
            }}
            className={`w-full p-4 rounded-xl border-2 flex items-center gap-4 transition-all text-left ${
              selectedPayment === method.id
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50"
            }`}
          >
            <span className="text-2xl">{method.icon}</span>
            <div className="flex-1">
              <span className="font-medium text-foreground block">{method.name}</span>
              <span className="text-xs text-muted-foreground">{method.description}</span>
            </div>
            {selectedPayment === method.id && <CheckCircle className="w-5 h-5 text-primary" />}
          </button>
        ))}
      </div>

      {(selectedPayment === "bkash" || selectedPayment === "nagad") && (
        <div className="mt-6 p-4 bg-muted rounded-xl space-y-4">
          <div className="p-3 bg-primary/10 rounded-lg text-sm">
            <p className="font-semibold text-foreground mb-1">
              📲 {selectedPayment === "bkash" ? "bKash" : "Nagad"} Payment Instructions:
            </p>
            <ol className="list-decimal list-inside text-muted-foreground space-y-1">
              <li>Open the {selectedPayment === "bkash" ? "bKash" : "Nagad"} app</li>
              <li>Select "Send Money"</li>
              <li>Number: <span className="font-mono font-bold text-foreground">{paymentMethods.find((m) => m.id === selectedPayment)?.number}</span></li>
              <li>Send total ৳{finalTotal.toLocaleString()}</li>
              <li>Enter the Transaction ID below</li>
            </ol>
          </div>
          <div>
            <Label className="text-sm mb-1 block">Your {selectedPayment === "bkash" ? "bKash" : "Nagad"} Number *</Label>
            <Input placeholder="01XXXXXXXXX" value={paymentPhone} onChange={(e) => setPaymentPhone(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm mb-1 block">Transaction ID *</Label>
            <Input placeholder="e.g. TXN8A4K2M9" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
          </div>
        </div>
      )}

      {selectedPayment === "advance_cod" && (
        <div className="mt-6 p-4 bg-muted rounded-xl space-y-4">
          <p className="text-sm text-muted-foreground">Send a partial advance payment; pay the rest on delivery.</p>
          <div>
            <Label className="text-sm mb-1 block">Advance Payment Method</Label>
            <RadioGroup value={advancePaymentMethod} onValueChange={(v) => setAdvancePaymentMethod(v as "bkash" | "nagad")} className="flex gap-4 mt-1">
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
          <div className="p-3 bg-primary/10 rounded-lg text-sm">
            <p className="text-muted-foreground">
              নম্বর: <span className="font-mono font-bold text-foreground">{paymentMethods.find((m) => m.id === advancePaymentMethod)?.number || "01XXXXXXXXX"}</span>
            </p>
          </div>
          <div>
            <Label className="text-sm mb-1 block">Advance Amount (৳) *</Label>
            <Input
              type="number"
              placeholder={`Minimum ৳${Math.ceil(finalTotal * 0.2)}`}
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
            />
            {advanceAmount && Number(advanceAmount) > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Due on delivery: ৳{(finalTotal - Number(advanceAmount)).toLocaleString()}
              </p>
            )}
          </div>
          <div>
            <Label className="text-sm mb-1 block">Your Phone Number *</Label>
            <Input placeholder="01XXXXXXXXX" value={paymentPhone} onChange={(e) => setPaymentPhone(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm mb-1 block">Transaction ID *</Label>
            <Input placeholder="e.g. TXN8A4K2M9" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
          </div>
        </div>
      )}

      {selectedPayment === "cod" && (
        <div className="mt-6 p-4 bg-muted rounded-xl">
          <p className="text-sm text-muted-foreground">
            💵 Pay the full amount of ৳{finalTotal.toLocaleString()} on delivery. Please keep cash ready.
          </p>
        </div>
      )}

      <div className="flex gap-4 mt-6">
        <button onClick={onBack} className="btn-outline-gold flex-1">Back</button>
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
