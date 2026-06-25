// =============================================================================
// OrdersToolbar.tsx
// Search + status-filter bar rendered above the orders table.
// Both controls are fully controlled — state lives in the parent page.
// =============================================================================

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORDER_STATUS_OPTIONS } from "@/lib/admin/orderHelpers";

/**
 * Props accepted by {@link OrdersToolbar}.
 */
interface OrdersToolbarProps {
  /** Current value of the free-text search input. */
  searchQuery: string;
  /** Called on every keystroke to update the search query in the parent. */
  onSearchChange: (v: string) => void;
  /**
   * Currently active status filter. `"all"` means no status filter is applied;
   * any other value is matched against `orders.status`.
   */
  statusFilter: string;
  /** Called when the user picks a different status from the dropdown. */
  onStatusFilterChange: (v: string) => void;
}

/**
 * **OrdersToolbar** — Search input + status filter for the orders list.
 *
 * The search input matches against order ID, phone number, city, and customer
 * name (filtering logic lives in the parent page / hook, not here).
 *
 * The status `<Select>` shows "All Status" as the first option (value `"all"`)
 * followed by each entry in `ORDER_STATUS_OPTIONS`.
 */
const OrdersToolbar = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: OrdersToolbarProps) => (
  <div className="flex items-center gap-4">
    {/* ----------------------------------------------------------------
        Free-text search — icon is absolutely positioned inside the input.
    ---------------------------------------------------------------- */}
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        placeholder="Search by ID, phone, city, name..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="pl-10"
      />
    </div>

    {/* ----------------------------------------------------------------
        Status filter dropdown — "all" sentinel means "no filter".
    ---------------------------------------------------------------- */}
    <Select value={statusFilter} onValueChange={onStatusFilterChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Filter by status" />
      </SelectTrigger>
      <SelectContent>
        {/* "All Status" resets the filter */}
        <SelectItem value="all">All Status</SelectItem>
        {ORDER_STATUS_OPTIONS.map((status) => (
          <SelectItem key={status} value={status}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export default OrdersToolbar;
