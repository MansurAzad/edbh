import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { paymentMethods, type CheckoutShippingInfo, type PaymentMethodId } from "@/lib/checkout/types";

interface Props {
  shippingInfo: CheckoutShippingInfo;
  deliveryNotes: string;
  selectedPayment: PaymentMethodId;
  transactionId: string;
  paymentPhone: string;
  advanceAmount: string;
  finalTotal: number;
  processing: boolean;
  onBack: () => void;
  onPlaceOrder: () => void;
}

export default function ReviewStep({
  shippingInfo, deliveryNotes, selectedPayment, transactionId, paymentPhone,
  advanceAmount, finalTotal, processing, onBack, onPlaceOrder,
}: Props) {
  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="card-luxury">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-primary" />
        <h2 className="font-display text-xl font-semibold">Review & Confirm</h2>
      </div>

      <div className="space-y-4 mb-6">
        <div className="p-4 bg-muted rounded-xl">
          <h4 className="font-medium text-foreground mb-2">Shipping Address</h4>
          <p className="text-muted-foreground text-sm">
            {shippingInfo.fullName}<br />
            {shippingInfo.address}<br />
            {shippingInfo.city}, {shippingInfo.district}<br />
            📞 {shippingInfo.phone}
            {shippingInfo.email && <><br />📧 {shippingInfo.email}</>}
            {deliveryNotes && <><br /><br />📝 <strong>ডেলিভারি নোট:</strong> {deliveryNotes}</>}
          </p>
        </div>
        <div className="p-4 bg-muted rounded-xl">
          <h4 className="font-medium text-foreground mb-2">Payment</h4>
          <p className="text-muted-foreground text-sm">
            {paymentMethods.find((m) => m.id === selectedPayment)?.name}
            {transactionId && <><br />TxID: <span className="font-mono">{transactionId}</span></>}
            {paymentPhone && <><br />Phone: {paymentPhone}</>}
            {selectedPayment === "advance_cod" && advanceAmount && (
              <>
                <br />Advance: ৳{Number(advanceAmount).toLocaleString()}
                <br />Due on delivery: ৳{(finalTotal - Number(advanceAmount)).toLocaleString()}
              </>
            )}
            {selectedPayment === "cod" && <><br />💵 Full Cash on Delivery</>}
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <button onClick={onBack} className="btn-outline-gold flex-1">Back</button>
        <button onClick={onPlaceOrder} className="btn-gold flex-1 disabled:opacity-50" disabled={processing}>
          {processing ? "Processing..." : "Place Order"}
        </button>
      </div>
    </motion.div>
  );
}
