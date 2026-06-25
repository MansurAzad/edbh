import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ORDER_STATUS_OPTIONS, getStatusColor } from "@/lib/admin/orderHelpers";

interface OrderStatusBadgeProps {
  status: string;
  onChange: (newStatus: string) => void;
}

/** Colored status pill with an inline dropdown for changing the status. */
const OrderStatusBadge = ({ status, onChange }: OrderStatusBadgeProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className={`text-xs px-3 py-1 rounded-full flex items-center gap-1 ${getStatusColor(status)}`}>
        {status}
        <ChevronDown className="w-3 h-3" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      {ORDER_STATUS_OPTIONS.map((s) => (
        <DropdownMenuItem key={s} onClick={() => onChange(s)} disabled={status === s}>
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

export default OrderStatusBadge;
