import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Empty cart state. */
const EmptyCart = ({ onClose }: { onClose: () => void }) => (
  <div className="text-center py-12">
    <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
    <p className="text-muted-foreground text-sm">আপনার কার্ট খালি</p>
    <Button variant="outline" onClick={onClose} className="mt-4">শপিং করুন</Button>
  </div>
);

export default EmptyCart;
