// =============================================================================
// OrderStatusBadge.tsx
// Inline, clickable status pill for an order row.
//
// The badge displays the current status with a Tailwind colour class returned
// by `getStatusColor()` and wraps a dropdown that lets the admin change the
// status without opening the full detail dialog.
// =============================================================================

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ORDER_STATUS_OPTIONS, getStatusColor } from "@/lib/admin/orderHelpers";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link OrderStatusBadge}.
 */
interface OrderStatusBadgeProps {
  /** The order's current status string (e.g. `"pending"`, `"shipped"`). */
  status: string;
  /**
   * Called with the newly selected status when the admin picks an option from
   * the dropdown. The parent is responsible for persisting the change.
   */
  onChange: (newStatus: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * **OrderStatusBadge** — Coloured status pill with an inline status-change dropdown.
 *
 * Intended to be rendered inside a table cell. The pill colour is driven by
 * `getStatusColor(status)` which returns Tailwind utility classes.
 *
 * The current status option is disabled in the dropdown to prevent redundant
 * no-op mutations.
 *
 * ### Example
 * ```tsx
 * <OrderStatusBadge
 *   status={order.status}
 *   onChange={(s) => updateStatus(order.id, s)}
 * />
 * ```
 */
const OrderStatusBadge = ({ status, onChange }: OrderStatusBadgeProps) => (
  <DropdownMenu>
    {/* The trigger is a styled <button> rather than a shadcn Button to keep
        the pill shape without button reset styles overriding the colours. */}
    <DropdownMenuTrigger asChild>
      <button
        className={`text-xs px-3 py-1 rounded-full flex items-center gap-1 ${getStatusColor(status)}`}
      >
        {status}
        {/* Small chevron to signal interactivity */}
        <ChevronDown className="w-3 h-3" />
      </button>
    </DropdownMenuTrigger>

    <DropdownMenuContent>
      {ORDER_STATUS_OPTIONS.map((s) => (
        // Disable the currently active status to prevent no-op DB writes.
        <DropdownMenuItem key={s} onClick={() => onChange(s)} disabled={status === s}>
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

export default OrderStatusBadge;
