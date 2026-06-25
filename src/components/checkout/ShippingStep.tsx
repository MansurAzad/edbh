/**
 * @file ShippingStep.tsx
 * @description Component for collecting customer shipping information, delivery zones, and special instructions.
 * This is the first step of the checkout process.
 * 
 * গ্রাহকের শিপিং তথ্য, ডেলিভারি জোন এবং বিশেষ নির্দেশনা সংগ্রহের জন্য এই কম্পোনেন্টটি ব্যবহৃত হয়।
 * এটি চেকআউট প্রক্রিয়ার প্রথম ধাপ।
 */

import { motion } from "framer-motion";
import { Truck } from "lucide-react";
import type { CheckoutShippingInfo, DeliveryZone } from "@/lib/checkout/types";

/**
 * Props for the ShippingStep component
 */
interface Props {
  /** Customer shipping details (name, phone, address, etc.) */
  shippingInfo: CheckoutShippingInfo;
  /** Function to update shipping information state */
  setShippingInfo: (info: CheckoutShippingInfo) => void;
  /** List of available delivery zones with rates and estimated times */
  deliveryZones: DeliveryZone[];
  /** Currently selected delivery zone object */
  selectedZone: DeliveryZone | null;
  /** Callback triggered when a user selects a delivery zone */
  onSelectZone: (zone: DeliveryZone | null) => void;
  /** User-provided special delivery instructions or notes */
  deliveryNotes: string;
  /** Function to update the delivery notes state */
  setDeliveryNotes: (v: string) => void;
  /** Callback to proceed to the next checkout step (Payment) */
  onContinue: () => void;
}

/**
 * ShippingStep Component
 * 
 * Handles the collection of shipping data. Integrates with motion for smooth entry transitions.
 * শিপিং ডাটা সংগ্রহের কাজ পরিচালনা করে। মসৃণ ট্রানজিশনের জন্য মোশন ফ্রেমওয়ার্ক ব্যবহার করে।
 */
export default function ShippingStep({
  shippingInfo,
  setShippingInfo,
  deliveryZones,
  selectedZone,
  onSelectZone,
  deliveryNotes,
  setDeliveryNotes,
  onContinue,
}: Props) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }} 
      animate={{ opacity: 1, x: 0 }} 
      className="card-luxury"
    >
      <div className="flex items-center gap-3 mb-6">
        <Truck className="w-6 h-6 text-primary" />
        <h2 className="font-display text-xl font-semibold">Shipping Information</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Full Name - Required Field (*) */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Full Name *</label>
          <input 
            type="text" 
            className="input-luxury" 
            placeholder="Your full name"
            value={shippingInfo.fullName}
            onChange={(e) => setShippingInfo({ ...shippingInfo, fullName: e.target.value })} 
          />
        </div>

        {/* Phone Number - Required Field (*) */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Phone Number *</label>
          <input 
            type="tel" 
            className="input-luxury" 
            placeholder="+880 1XXX-XXXXXX"
            value={shippingInfo.phone}
            onChange={(e) => setShippingInfo({ ...shippingInfo, phone: e.target.value })} 
          />
        </div>

        {/* Email Address - Optional field / ঐচ্ছিক ক্ষেত্র */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-2">
            Email Address (ঐচ্ছিক)
          </label>
          <input 
            type="email" 
            className="input-luxury" 
            placeholder="your@email.com"
            value={shippingInfo.email}
            onChange={(e) => setShippingInfo({ ...shippingInfo, email: e.target.value })} 
          />
        </div>

        {/* Detailed Address - Required Field (*) */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-2">Address *</label>
          <input 
            type="text" 
            className="input-luxury" 
            placeholder="House/Road/Area"
            value={shippingInfo.address}
            onChange={(e) => setShippingInfo({ ...shippingInfo, address: e.target.value })} 
          />
        </div>

        {/* Delivery Zone Selection - Essential for calculating shipping cost */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Delivery Zone *</label>
          <select
            className="input-luxury w-full"
            value={selectedZone?.id || ""}
            onChange={(e) => {
              // Find the selected zone object by ID from the list
              const zone = deliveryZones.find((item) => item.id === e.target.value) || null;
              onSelectZone(zone);
              // Update city in shipping info based on selected zone
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
          {/* Branching Logic: Show specific areas/city if a zone is selected */}
          {selectedZone && (
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedZone.city}
              {selectedZone.areas?.length ? ` • ${selectedZone.areas.join(", ")}` : ""}
            </p>
          )}
        </div>

        {/* District - Optional field / ঐচ্ছিক ক্ষেত্র */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">District (ঐচ্ছিক)</label>
          <input 
            type="text" 
            className="input-luxury" 
            placeholder="Dhaka"
            value={shippingInfo.district}
            onChange={(e) => setShippingInfo({ ...shippingInfo, district: e.target.value })} 
          />
        </div>

        {/* Delivery Notes / Special Instructions - Optional Bengali labels
            ডেলিভারি নোট / স্পেশাল ইনস্ট্রাকশন (ঐচ্ছিক) */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-2">
            ডেলিভারি নোট / স্পেশাল ইনস্ট্রাকশন (ঐচ্ছিক)
          </label>
          <textarea
            className="input-luxury w-full min-h-[80px]"
            // Placeholder in Bengali providing examples for better UX
            placeholder="যেমন: বিল্ডিং এর গেটে দিবেন, ফ্লোর ৩, বেল বাজাবেন..."
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      {/* Button to proceed - Final validation logic usually resides in the parent's onContinue handler */}
      <button onClick={onContinue} className="btn-gold w-full mt-6">
        Continue to Payment
      </button>
    </motion.div>
  );
}
