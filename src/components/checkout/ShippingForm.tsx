import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ShippingInfo {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  district: string;
}

export interface DeliveryZone {
  id: string;
  zone_name: string;
  city: string;
  shipping_charge: number;
  estimated_days: number | null;
  areas: string[] | null;
}

interface ShippingFormProps {
  shippingInfo: ShippingInfo;
  onShippingChange: (updater: (prev: ShippingInfo) => ShippingInfo) => void;
  deliveryZones: DeliveryZone[];
  selectedZone: DeliveryZone | null;
  onZoneSelect: (zone: DeliveryZone | null) => void;
  onCityChange: (city: string) => void;
  isGuest: boolean;
  deliveryNotes: string;
  onDeliveryNotesChange: (notes: string) => void;
}

/** Shipping fields + delivery-zone picker + optional email + notes. */
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
    <h3 className="font-medium text-foreground flex items-center gap-2">
      <MapPin className="w-4 h-4" /> ডেলিভারি তথ্য
    </h3>

    <div>
      <Label className="text-xs">নাম *</Label>
      <Input
        value={shippingInfo.fullName}
        onChange={(e) => onShippingChange((p) => ({ ...p, fullName: e.target.value }))}
        placeholder="আপনার নাম"
        className="h-9 text-sm"
      />
    </div>
    <div>
      <Label className="text-xs">মোবাইল নম্বর *</Label>
      <Input
        value={shippingInfo.phone}
        onChange={(e) => onShippingChange((p) => ({ ...p, phone: e.target.value }))}
        placeholder="01XXXXXXXXX"
        className="h-9 text-sm"
      />
    </div>
    <div>
      <Label className="text-xs">ঠিকানা *</Label>
      <Input
        value={shippingInfo.address}
        onChange={(e) => onShippingChange((p) => ({ ...p, address: e.target.value }))}
        placeholder="সম্পূর্ণ ঠিকানা"
        className="h-9 text-sm"
      />
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label className="text-xs">শহর</Label>
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
          onChange={(e) => onShippingChange((p) => ({ ...p, district: e.target.value }))}
          placeholder="জেলা"
          className="h-9 text-sm"
        />
      </div>
    </div>

    {deliveryZones.length > 0 && (
      <div>
        <Label className="text-xs">ডেলিভারি জোন *</Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={selectedZone?.id || ""}
          onChange={(e) => {
            const zone = deliveryZones.find((z) => z.id === e.target.value) || null;
            onZoneSelect(zone);
            if (zone) onShippingChange((prev) => ({ ...prev, city: zone.city }));
          }}
        >
          <option value="">ডেলিভারি জোন নির্বাচন করুন</option>
          {deliveryZones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.zone_name} — ৳{Number(zone.shipping_charge).toLocaleString()}
            </option>
          ))}
        </select>
      </div>
    )}

    {isGuest && (
      <div>
        <Label className="text-xs">ইমেইল (ঐচ্ছিক)</Label>
        <Input
          value={shippingInfo.email}
          onChange={(e) => onShippingChange((p) => ({ ...p, email: e.target.value }))}
          placeholder="email@example.com"
          className="h-9 text-sm"
        />
      </div>
    )}

    <div>
      <Label className="text-xs">ডেলিভারি নোট</Label>
      <Input
        value={deliveryNotes}
        onChange={(e) => onDeliveryNotesChange(e.target.value)}
        placeholder="বিশেষ নির্দেশনা..."
        className="h-9 text-sm"
      />
    </div>

    {selectedZone && (
      <div className="p-2 rounded-lg bg-muted text-xs text-muted-foreground">
        📦 {selectedZone.zone_name} • {selectedZone.city} • ৳{selectedZone.shipping_charge}
        {selectedZone.estimated_days && ` (${selectedZone.estimated_days} দিন)`}
      </div>
    )}
  </div>
);

export default ShippingForm;
