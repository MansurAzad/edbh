/**
 * @fileoverview Compact shipping address form used inside the cart/checkout drawer.
 *
 * Renders all address fields, an optional delivery-zone picker (when zones are
 * available), a guest-only email field, and a free-text delivery notes input.
 *
 * কার্ট/চেকআউট ড্রয়ারে ব্যবহৃত শিপিং ঠিকানার ফর্ম।
 * ঠিকানার ফিল্ড, ডেলিভারি জোন পিকার, গেস্টের ইমেইল এবং ডেলিভারি নোট রেন্ডার করে।
 *
 * @module components/checkout/ShippingForm
 */

import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Local type definitions (also re-exported for consumers)
// ---------------------------------------------------------------------------

/**
 * Minimum shipping-address data collected from the customer.
 *
 * গ্রাহকের কাছ থেকে সংগ্রহ করা শিপিং ঠিকানার তথ্য।
 * `fullName`, `phone`, and `address` are required for order placement.
 */
export interface ShippingInfo {
  /** Recipient's full name. প্রাপকের পুরো নাম। */
  fullName: string;
  /** Primary contact phone number (01XXXXXXXXX). মোবাইল নম্বর। */
  phone: string;
  /** Optional email — collected for guests to receive order confirmation. ঐচ্ছিক ইমেইল। */
  email: string;
  /** Full street address. সম্পূর্ণ ঠিকানা। */
  address: string;
  /** City — drives delivery zone auto-selection. শহর — ডেলিভারি জোন অটো-সিলেকশনে ব্যবহৃত। */
  city: string;
  /** Administrative district. জেলা। */
  district: string;
}

/**
 * A single delivery zone record from Supabase `delivery_zones`.
 * ডেলিভারি জোনের ডেটা স্ট্রাকচার।
 */
export interface DeliveryZone {
  /** Supabase UUID. ডেটাবেস আইডি। */
  id: string;
  /** Display name shown in the dropdown. ড্রপডাউনে দেখানো নাম। */
  zone_name: string;
  /** Canonical city name for auto-matching. অটো-মিলের জন্য শহরের নাম। */
  city: string;
  /** Shipping charge in BDT. শিপিং চার্জ (টাকায়)। */
  shipping_charge: number;
  /** Estimated delivery days; null if unspecified. প্রাক্কলিত ডেলিভারি দিন। */
  estimated_days: number | null;
  /** Sub-areas within the zone. জোনের এলাকার তালিকা। */
  areas: string[] | null;
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link ShippingForm}.
 * ShippingForm কম্পোনেন্টের props।
 */
interface ShippingFormProps {
  /** Current value of all shipping address fields. শিপিং ঠিকানার বর্তমান মান। */
  shippingInfo: ShippingInfo;
  /**
   * Functional updater — receives the previous state and returns the next state.
   * পূর্ববর্তী state নিয়ে নতুন state রিটার্ন করার ফাংশন।
   */
  onShippingChange: (updater: (prev: ShippingInfo) => ShippingInfo) => void;
  /** All available delivery zones fetched from the backend. সমস্ত ডেলিভারি জোন। */
  deliveryZones: DeliveryZone[];
  /** The currently selected delivery zone (null = none selected). বর্তমান জোন। */
  selectedZone: DeliveryZone | null;
  /** Called when the user picks a zone from the dropdown. জোন সিলেক্ট হলে কল হয়। */
  onZoneSelect: (zone: DeliveryZone | null) => void;
  /**
   * Called when the city field changes — separated from onShippingChange so
   * the parent can trigger delivery-zone auto-matching.
   * শহর পরিবর্তন হলে কল হয় — ডেলিভারি জোন অটো-মিলের জন্য আলাদা রাখা হয়েছে।
   */
  onCityChange: (city: string) => void;
  /**
   * When true, an optional email field is rendered for order confirmation.
   * true হলে গেস্টের জন্য ইমেইল ফিল্ড দেখানো হয়।
   */
  isGuest: boolean;
  /** Current delivery notes text. ডেলিভারি নোটের বর্তমান মান। */
  deliveryNotes: string;
  /** Called on every keystroke in the delivery notes field. নোট পরিবর্তনে কল হয়। */
  onDeliveryNotesChange: (notes: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Presentational form component that collects shipping address details.
 *
 * শিপিং ঠিকানার তথ্য সংগ্রহের জন্য presentational ফর্ম কম্পোনেন্ট।
 * সমস্ত state parent-এ থাকে; এই কম্পোনেন্ট শুধু render ও callback করে।
 *
 * ### Field list / ফিল্ডের তালিকা
 * - নাম (required) / Full name
 * - মোবাইল (required) / Phone
 * - ঠিকানা (required) / Address
 * - শহর + জেলা / City + District (grid row)
 * - ডেলিভারি জোন পিকার (shown only when zones exist)
 * - ইমেইল (guests only / শুধুমাত্র গেস্টদের জন্য)
 * - ডেলিভারি নোট
 *
 * @param {ShippingFormProps} props
 * @returns {JSX.Element}
 *
 * @example
 * <ShippingForm
 *   shippingInfo={shippingInfo}
 *   onShippingChange={setShippingInfo}
 *   deliveryZones={deliveryZones}
 *   selectedZone={selectedZone}
 *   onZoneSelect={selectZone}
 *   onCityChange={handleCityChange}
 *   isGuest={!user}
 *   deliveryNotes={notes}
 *   onDeliveryNotesChange={setNotes}
 * />
 */
const ShippingForm = ({
  shippingInfo,
  onShippingChange,
  deliveryZones,
  selectedZone,
  onZoneSelect,
  onCityChange,
  isGuest,
  deliveryNotes,
  onDeliveryNotesChange,
}: ShippingFormProps) => (
  <div className="space-y-3">
    {/* Section header with map-pin icon / সেকশন হেডার */}
    <h3 className="font-medium text-foreground flex items-center gap-2">
      <MapPin className="w-4 h-4" /> ডেলিভারি তথ্য
    </h3>

    {/* ── Full Name / নাম ── */}
    <div>
      <Label className="text-xs">নাম *</Label>
      <Input
        value={shippingInfo.fullName}
        onChange={(e) =>
          onShippingChange((p) => ({ ...p, fullName: e.target.value }))
        }
        placeholder="আপনার নাম"
        className="h-9 text-sm"
      />
    </div>

    {/* ── Phone / মোবাইল ── */}
    <div>
      <Label className="text-xs">মোবাইল নম্বর *</Label>
      <Input
        value={shippingInfo.phone}
        onChange={(e) =>
          onShippingChange((p) => ({ ...p, phone: e.target.value }))
        }
        placeholder="01XXXXXXXXX"
        className="h-9 text-sm"
      />
    </div>

    {/* ── Address / ঠিকানা ── */}
    <div>
      <Label className="text-xs">ঠিকানা *</Label>
      <Input
        value={shippingInfo.address}
        onChange={(e) =>
          onShippingChange((p) => ({ ...p, address: e.target.value }))
        }
        placeholder="সম্পূর্ণ ঠিকানা"
        className="h-9 text-sm"
      />
    </div>

    {/* ── City + District (side-by-side grid) / শহর + জেলা ── */}
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label className="text-xs">শহর</Label>
        {/*
         * City changes are routed through `onCityChange` (not onShippingChange)
         * so the parent hook can trigger delivery-zone auto-matching.
         * শহর পরিবর্তনে `onCityChange` ব্যবহার করা হয় কারণ
         * এটি ডেলিভারি জোন অটো-মিল ট্রিগার করে।
         */}
        <Input
          value={shippingInfo.city}
          onChange={(e) => onCityChange(e.target.value)}
          placeholder="শহর"
          className="h-9 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs">জেলা</Label>
        <Input
          value={shippingInfo.district}
          onChange={(e) =>
            onShippingChange((p) => ({ ...p, district: e.target.value }))
          }
          placeholder="জেলা"
          className="h-9 text-sm"
        />
      </div>
    </div>

    {/*
     * ── Delivery Zone Picker / ডেলিভারি জোন পিকার ──
     * Only rendered when zones have been loaded from the backend.
     * জোন লোড হলেই দেখানো হয়।
     * On selection: updates selectedZone via onZoneSelect AND syncs city
     * back into shippingInfo so both pieces of state stay in agreement.
     * সিলেক্ট হলে জোন আপডেট হয় এবং শহরও shippingInfo-তে সিঙ্ক হয়।
     */}
    {deliveryZones.length > 0 && (
      <div>
        <Label className="text-xs">ডেলিভারি জোন *</Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={selectedZone?.id || ""}
          onChange={(e) => {
            // Find the full zone object by id; null when the placeholder is chosen.
            // id দিয়ে পুরো জোন অবজেক্ট খোঁজা হচ্ছে।
            const zone =
              deliveryZones.find((z) => z.id === e.target.value) || null;
            onZoneSelect(zone);
            // Keep the city field in sync with the selected zone's city.
            // জোনের শহর shippingInfo-তে সিঙ্ক করা হচ্ছে।
            if (zone)
              onShippingChange((prev) => ({ ...prev, city: zone.city }));
          }}
        >
          <option value="">ডেলিভারি জোন নির্বাচন করুন</option>
          {deliveryZones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {/* Format: "Zone Name — ৳charge" */}
              {zone.zone_name} — ৳{Number(zone.shipping_charge).toLocaleString()}
            </option>
          ))}
        </select>
      </div>
    )}

    {/*
     * ── Email (guest users only) / ইমেইল (শুধুমাত্র গেস্টের জন্য) ──
     * Logged-in users already have an email on file; only guests need to
     * provide one for order confirmation messages.
     * লগইন করা ব্যবহারকারীর ইমেইল ইতিমধ্যে আছে; গেস্টদের জন্যই দেখানো হয়।
     */}
    {isGuest && (
      <div>
        <Label className="text-xs">ইমেইল (ঐচ্ছিক)</Label>
        <Input
          value={shippingInfo.email}
          onChange={(e) =>
            onShippingChange((p) => ({ ...p, email: e.target.value }))
          }
          placeholder="email@example.com"
          className="h-9 text-sm"
        />
      </div>
    )}

    {/* ── Delivery Notes / ডেলিভারি নোট ── */}
    <div>
      <Label className="text-xs">ডেলিভারি নোট</Label>
      <Input
        value={deliveryNotes}
        onChange={(e) => onDeliveryNotesChange(e.target.value)}
        placeholder="বিশেষ নির্দেশনা..."
        className="h-9 text-sm"
      />
    </div>

    {/*
     * ── Selected zone summary badge / নির্বাচিত জোনের সারসংক্ষেপ ──
     * Shown below the notes field once a zone is selected.
     * জোন সিলেক্ট হলে নিচে সারসংক্ষেপ দেখানো হয়।
     */}
    {selectedZone && (
      <div className="p-2 rounded-lg bg-muted text-xs text-muted-foreground">
        📦 {selectedZone.zone_name} • {selectedZone.city} •{" "}
        ৳{selectedZone.shipping_charge}
        {/* Append estimated days only when the value is defined */}
        {/* প্রাক্কলিত দিন থাকলেই দেখানো হয় */}
        {selectedZone.estimated_days &&
          ` (${selectedZone.estimated_days} দিন)`}
      </div>
    )}
  </div>
);

export default ShippingForm;
