import { motion } from "framer-motion";
import { Truck } from "lucide-react";
import type { CheckoutShippingInfo, DeliveryZone } from "@/lib/checkout/types";

interface Props {
  shippingInfo: CheckoutShippingInfo;
  setShippingInfo: (info: CheckoutShippingInfo) => void;
  deliveryZones: DeliveryZone[];
  selectedZone: DeliveryZone | null;
  onSelectZone: (zone: DeliveryZone | null) => void;
  deliveryNotes: string;
  setDeliveryNotes: (v: string) => void;
  onContinue: () => void;
}

export default function ShippingStep({
  shippingInfo, setShippingInfo, deliveryZones, selectedZone, onSelectZone, deliveryNotes, setDeliveryNotes, onContinue,
}: Props) {
  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="card-luxury">
      <div className="flex items-center gap-3 mb-6">
        <Truck className="w-6 h-6 text-primary" />
        <h2 className="font-display text-xl font-semibold">Shipping Information</h2>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Full Name *</label>
          <input type="text" className="input-luxury" placeholder="Your full name"
            value={shippingInfo.fullName}
            onChange={(e) => setShippingInfo({ ...shippingInfo, fullName: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Phone Number *</label>
          <input type="tel" className="input-luxury" placeholder="+880 1XXX-XXXXXX"
            value={shippingInfo.phone}
            onChange={(e) => setShippingInfo({ ...shippingInfo, phone: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-2">Email Address (ঐচ্ছিক)</label>
          <input type="email" className="input-luxury" placeholder="your@email.com"
            value={shippingInfo.email}
            onChange={(e) => setShippingInfo({ ...shippingInfo, email: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-2">Address *</label>
          <input type="text" className="input-luxury" placeholder="House/Road/Area"
            value={shippingInfo.address}
            onChange={(e) => setShippingInfo({ ...shippingInfo, address: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Delivery Zone *</label>
          <select
            className="input-luxury w-full"
            value={selectedZone?.id || ""}
            onChange={(e) => {
              const zone = deliveryZones.find((item) => item.id === e.target.value) || null;
              onSelectZone(zone);
              setShippingInfo({ ...shippingInfo, city: zone?.city || "" });
            }}
          >
            <option value="">Select delivery zone</option>
            {deliveryZones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.zone_name} — ৳{zone.shipping_charge} ({zone.estimated_days || 3} days)
              </option>
            ))}
          </select>
          {selectedZone && (
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedZone.city}{selectedZone.areas?.length ? ` • ${selectedZone.areas.join(", ")}` : ""}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">District (ঐচ্ছিক)</label>
          <input type="text" className="input-luxury" placeholder="Dhaka"
            value={shippingInfo.district}
            onChange={(e) => setShippingInfo({ ...shippingInfo, district: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-2">
            ডেলিভারি নোট / স্পেশাল ইনস্ট্রাকশন (ঐচ্ছিক)
          </label>
          <textarea
            className="input-luxury w-full min-h-[80px]"
            placeholder="যেমন: বিল্ডিং এর গেটে দিবেন, ফ্লোর ৩, বেল বাজাবেন..."
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>
      <button onClick={onContinue} className="btn-gold w-full mt-6">
        Continue to Payment
      </button>
    </motion.div>
  );
}
