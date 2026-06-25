// =============================================================================
// TrackingForm.tsx
// Compact form for editing shipment tracking details on an existing order.
// Pre-populated from the order prop; changes are local until "Save" is clicked.
// =============================================================================

import { useState } from "react";
import { Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AdminOrder } from "@/lib/admin/orderHelpers";

/**
 * Shape of the tracking payload sent to the parent on save.
 */
interface TrackingPayload {
  tracking_number: string | null;
  courier_name: string | null;
  estimated_delivery: string | null;
}

/**
 * Props accepted by {@link TrackingForm}.
 */
interface TrackingFormProps {
  /** The order whose tracking fields are being edited. */
  order: AdminOrder;
  /**
   * Async callback invoked when the admin clicks "Save".
   * Receives `null` for any field left blank (empty string → null).
   */
  onSave: (tracking: TrackingPayload) => Promise<unknown> | void;
}

/**
 * **TrackingForm** — Inline courier / tracking number / ETA editor.
 *
 * Renders three fields in a 2-column grid:
 * - Courier name (e.g. "Pathao", "Steadfast")   — "কুরিয়ার নাম"
 * - Tracking number (e.g. "TRK-12345")           — "ট্র্যাকিং নম্বর"
 * - Estimated delivery date (date input)          — "আনুমানিক ডেলিভারি"
 *
 * Empty strings are converted to `null` before calling `onSave` so that the
 * DB columns are set to NULL rather than `""`.
 *
 * ### Bengali UI labels
 * - "কুরিয়ার নাম"       = Courier Name
 * - "ট্র্যাকিং নম্বর"   = Tracking Number
 * - "আনুমানিক ডেলিভারি" = Estimated Delivery
 * - "সেভ করুন"          = Save
 */
const TrackingForm = ({ order, onSave }: TrackingFormProps) => {
  // Local state pre-populated from the order; slice(0,10) strips the time
  // portion from ISO timestamps so the <input type="date"> renders correctly.
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number || "");
  const [courierName, setCourierName] = useState(order.courier_name || "");
  const [estimatedDelivery, setEstimatedDelivery] = useState(
    order.estimated_delivery?.slice(0, 10) || ""
  );

  /** Convert empty strings to null and delegate to the parent callback. */
  const handleSave = () =>
    onSave({
      tracking_number: trackingNumber || null,
      courier_name: courierName || null,
      estimated_delivery: estimatedDelivery || null,
    });

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Courier name — "কুরিয়ার নাম" = Courier Name */}
      <div>
        <label className="text-xs text-muted-foreground">কুরিয়ার নাম</label>
        <Input
          value={courierName}
          onChange={(e) => setCourierName(e.target.value)}
          placeholder="Pathao, Steadfast..."
          className="mt-1"
        />
      </div>

      {/* Tracking number — "ট্র্যাকিং নম্বর" = Tracking Number */}
      <div>
        <label className="text-xs text-muted-foreground">ট্র্যাকিং নম্বর</label>
        <Input
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="TRK-XXXXX"
          className="mt-1"
        />
      </div>

      {/* Estimated delivery date — "আনুমানিক ডেলিভারি" = Estimated Delivery */}
      <div>
        <label className="text-xs text-muted-foreground">আনুমানিক ডেলিভারি</label>
        <Input
          type="date"
          value={estimatedDelivery}
          onChange={(e) => setEstimatedDelivery(e.target.value)}
          className="mt-1"
        />
      </div>

      {/* Save button — "সেভ করুন" = Save */}
      <div className="flex items-end">
        <Button size="sm" onClick={handleSave} className="w-full">
          <Truck className="w-4 h-4 mr-2" /> সেভ করুন
        </Button>
      </div>
    </div>
  );
};

export default TrackingForm;
