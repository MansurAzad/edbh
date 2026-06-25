import { useState } from "react";
import { Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AdminOrder } from "@/lib/admin/orderHelpers";

interface TrackingFormProps {
  order: AdminOrder;
  onSave: (tracking: {
    tracking_number: string | null;
    courier_name: string | null;
    estimated_delivery: string | null;
  }) => Promise<boolean> | void;
}

/** Inline form to edit courier/tracking number/ETA on an order. */
const TrackingForm = ({ order, onSave }: TrackingFormProps) => {
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number || "");
  const [courierName, setCourierName] = useState(order.courier_name || "");
  const [estimatedDelivery, setEstimatedDelivery] = useState(
    order.estimated_delivery?.slice(0, 10) || ""
  );

  const handleSave = () =>
    onSave({
      tracking_number: trackingNumber || null,
      courier_name: courierName || null,
      estimated_delivery: estimatedDelivery || null,
    });

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-muted-foreground">কুরিয়ার নাম</label>
        <Input
          value={courierName}
          onChange={(e) => setCourierName(e.target.value)}
          placeholder="Pathao, Steadfast..."
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">ট্র্যাকিং নম্বর</label>
        <Input
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="TRK-XXXXX"
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">আনুমানিক ডেলিভারি</label>
        <Input
          type="date"
          value={estimatedDelivery}
          onChange={(e) => setEstimatedDelivery(e.target.value)}
          className="mt-1"
        />
      </div>
      <div className="flex items-end">
        <Button size="sm" onClick={handleSave} className="w-full">
          <Truck className="w-4 h-4 mr-2" /> সেভ করুন
        </Button>
      </div>
    </div>
  );
};

export default TrackingForm;
