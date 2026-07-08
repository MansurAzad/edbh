/**
 * @file SimpleCheckoutForm.tsx
 * @description Single-page simplified checkout form: name, phone, full address
 * (required, with inline error messages), optional city + conditional delivery
 * zone selector (only shown when the typed city matches a configured zone),
 * and payment picker (COD / Advance+COD).
 * Fixed ৳150 delivery charge is applied by the parent when no zone is picked.
 */

import { motion } from "framer-motion";
import { Truck, Wallet, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

import type {
  CheckoutShippingInfo,
  DeliveryZone,
  PaymentMethodId,
} from "@/lib/checkout/types";

export interface FieldErrors {
  fullName?: string;
  phone?: string;
  address?: string;
}

interface Props {
  shippingInfo: CheckoutShippingInfo;
  setShippingInfo: (info: CheckoutShippingInfo) => void;
  errors: FieldErrors;
  deliveryNotes: string;
  setDeliveryNotes: (v: string) => void;
  /** All delivery zones (from useDeliveryZones). Only shown conditionally. */
  deliveryZones: DeliveryZone[];
  selectedZone: DeliveryZone | null;
  onSelectZone: (zone: DeliveryZone | null) => void;
  /** Whether the zone selector should be visible (city has matches). */
  showZoneSelector: boolean;
  selectedPayment: PaymentMethodId;
  setSelectedPayment: (id: PaymentMethodId) => void;
  advanceAmount: string;
  setAdvanceAmount: (v: string) => void;
  advancePaymentMethod: "bkash" | "nagad";
  setAdvancePaymentMethod: (v: "bkash" | "nagad") => void;
  transactionId: string;
  setTransactionId: (v: string) => void;
  paymentPhone: string;
  setPaymentPhone: (v: string) => void;
  finalTotal: number;
  processing: boolean;
  onConfirmOrder: () => void;
}

const errorClass = "border-destructive focus:border-destructive";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      {msg}
    </p>
  );
}

export default function SimpleCheckoutForm({
  shippingInfo, setShippingInfo, errors,
  deliveryNotes, setDeliveryNotes,
  deliveryZones, selectedZone, onSelectZone, showZoneSelector,
  selectedPayment, setSelectedPayment,
  advanceAmount, setAdvanceAmount,
  advancePaymentMethod, setAdvancePaymentMethod,
  transactionId, setTransactionId,
  paymentPhone, setPaymentPhone,
  finalTotal, processing, onConfirmOrder,
}: Props) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Shipping */}
      <div className="card-luxury">
        <div className="flex items-center gap-3 mb-6">
          <Truck className="w-6 h-6 text-primary" />
          <h2 className="font-display text-xl font-semibold">শিপিং তথ্য</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              নাম <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              className={`input-luxury w-full ${errors.fullName ? errorClass : ""}`}
              placeholder="আপনার পুরো নাম"
              value={shippingInfo.fullName}
              onChange={(e) => setShippingInfo({ ...shippingInfo, fullName: e.target.value })}
              aria-invalid={!!errors.fullName}
            />
            <FieldError msg={errors.fullName} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              মোবাইল নম্বর <span className="text-destructive">*</span>
            </label>
            <input
              type="tel"
              inputMode="tel"
              className={`input-luxury w-full ${errors.phone ? errorClass : ""}`}
              placeholder="01XXXXXXXXX"
              value={shippingInfo.phone}
              onChange={(e) => setShippingInfo({ ...shippingInfo, phone: e.target.value })}
              aria-invalid={!!errors.phone}
            />
            <FieldError msg={errors.phone} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              পুরো ঠিকানা <span className="text-destructive">*</span>
            </label>
            <textarea
              className={`input-luxury w-full min-h-[90px] ${errors.address ? errorClass : ""}`}
              placeholder="বাড়ি/রোড/এলাকা/থানা/জেলা — এক লাইনে পুরো ঠিকানা লিখুন"
              value={shippingInfo.address}
              onChange={(e) => setShippingInfo({ ...shippingInfo, address: e.target.value })}
              rows={3}
              aria-invalid={!!errors.address}
            />
            <FieldError msg={errors.address} />
          </div>

          {/* City + delivery zone selector intentionally hidden from customer:
              flat ৳150 shipping applies everywhere; keeping the props keeps
              backward compatibility with tests and the parent state. */}


          <div>
            <label className="block text-sm font-medium mb-2">ডেলিভারি নোট (ঐচ্ছিক)</label>
            <textarea
              className="input-luxury w-full min-h-[60px]"
              placeholder="যেমন: বেল বাজাবেন, গেট থেকে কল দিবেন..."
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              rows={2}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            📦 ডেলিভারি চার্জ সম্পূর্ণ বাংলাদেশে <strong>৳১৫০</strong> ফিক্সড
            {selectedZone ? ` — বর্তমান জোন: ${selectedZone.zone_name} (৳${selectedZone.shipping_charge})` : "।"}
          </p>
        </div>
      </div>

      {/* Payment */}
      <div className="card-luxury">
        <div className="flex items-center gap-3 mb-6">
          <Wallet className="w-6 h-6 text-primary" />
          <h2 className="font-display text-xl font-semibold">পেমেন্ট পদ্ধতি</h2>
        </div>

        <div className="grid gap-3">
          <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
            selectedPayment === "cod" ? "border-primary bg-primary/5" : "border-border"
          }`}>
            <input type="radio" name="pay" className="mt-1"
              checked={selectedPayment === "cod"} onChange={() => setSelectedPayment("cod")} />
            <div>
              <div className="font-medium">💵 ক্যাশ অন ডেলিভারি (COD)</div>
              <div className="text-sm text-muted-foreground">সম্পূর্ণ টাকা ডেলিভারিতে পরিশোধ।</div>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
            selectedPayment === "advance_cod" ? "border-primary bg-primary/5" : "border-border"
          }`}>
            <input type="radio" name="pay" className="mt-1"
              checked={selectedPayment === "advance_cod"} onChange={() => setSelectedPayment("advance_cod")} />
            <div className="flex-1">
              <div className="font-medium">💰 অ্যাডভান্স + COD</div>
              <div className="text-sm text-muted-foreground">অ্যাডভান্সে ডেলিভারি চার্জ ৳১৫০ পাঠান, বাকিটা ডেলিভারিতে।</div>

              {selectedPayment === "advance_cod" && (
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAdvancePaymentMethod("bkash")}
                      className={`flex-1 py-2 rounded-lg border ${advancePaymentMethod === "bkash" ? "border-primary bg-primary/10" : "border-border"}`}>bKash</button>
                    <button type="button" onClick={() => setAdvancePaymentMethod("nagad")}
                      className={`flex-1 py-2 rounded-lg border ${advancePaymentMethod === "nagad" ? "border-primary bg-primary/10" : "border-border"}`}>Nagad</button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    টাকা পাঠান: <span className="font-mono font-medium">01845853634</span> ({advancePaymentMethod === "bkash" ? "bKash" : "Nagad"})
                  </div>
                  <input type="text" className="input-luxury w-full" placeholder="Transaction ID"
                    value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
                  <input type="tel" className="input-luxury w-full" placeholder="যে নম্বর থেকে পাঠিয়েছেন"
                    value={paymentPhone} onChange={(e) => setPaymentPhone(e.target.value)} />
                  <input type="number" className="input-luxury w-full" placeholder="অ্যাডভান্সের পরিমাণ (৳)"
                    value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} />
                </div>
              )}
            </div>
          </label>
        </div>
      </div>

      {/* Confirm */}
      <div className="card-luxury">
        <div className="flex items-center gap-3 mb-4 text-sm text-muted-foreground">
          <ShieldCheck className="w-5 h-5 text-primary" />
          অর্ডার কনফার্ম করার আগে আপনার তথ্য একবার রিভিউ করা হবে।
        </div>
        <button
          type="button"
          onClick={onConfirmOrder}
          disabled={processing}
          className="btn-gold w-full text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? "প্রসেসিং..." : `অর্ডার কনফার্ম করুন — ৳${finalTotal.toLocaleString()}`}
        </button>
      </div>
    </motion.div>
  );
}
