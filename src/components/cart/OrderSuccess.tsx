import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface OrderSuccessProps {
  orderId: string | null;
  onAfterAction: () => void;
}

/** Post-checkout confirmation screen. */
const OrderSuccess = ({ orderId, onAfterAction }: OrderSuccessProps) => {
  const navigate = useNavigate();
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
        <ShoppingBag className="w-8 h-8 text-green-600" />
      </div>
      <h3 className="font-display text-xl font-bold mb-2">ধন্যবাদ! 🎉</h3>
      <p className="text-muted-foreground text-sm mb-1">
        আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে।
      </p>
      {orderId && (
        <p className="text-xs text-muted-foreground font-mono mb-4">
          Order ID: {orderId.slice(0, 8).toUpperCase()}
        </p>
      )}
      <div className="space-y-2">
        <Button onClick={() => { onAfterAction(); navigate("/order-tracking"); }} className="w-full">
          অর্ডার ট্র্যাক করুন
        </Button>
        <Button variant="outline" onClick={() => { onAfterAction(); navigate("/shop"); }} className="w-full">
          আরো শপিং করুন
        </Button>
      </div>
    </div>
  );
};

export default OrderSuccess;
