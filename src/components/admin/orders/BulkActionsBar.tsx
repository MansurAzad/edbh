import { CheckSquare, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ORDER_STATUS_OPTIONS } from "@/lib/admin/orderHelpers";

interface BulkActionsBarProps {
  count: number;
  onBulkUpdateStatus: (status: string) => void;
  onClear: () => void;
}

/** Selection summary + bulk-status dropdown. Renders nothing when count is 0. */
const BulkActionsBar = ({ count, onBulkUpdateStatus, onClear }: BulkActionsBarProps) => {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
      <CheckSquare className="w-4 h-4 text-primary" />
      <span className="text-sm font-medium">{count} orders selected</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            Bulk Update Status <ChevronDown className="w-3 h-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {ORDER_STATUS_OPTIONS.map((s) => (
            <DropdownMenuItem key={s} onClick={() => onBulkUpdateStatus(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
    </div>
  );
};

export default BulkActionsBar;
