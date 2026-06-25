// =============================================================================
// BulkActionsBar.tsx
// Contextual action bar that appears when one or more orders are selected in
// the orders table. Provides a dropdown for bulk status transitions and a
// "Clear" button to deselect everything.
// =============================================================================

import { CheckSquare, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ORDER_STATUS_OPTIONS } from "@/lib/admin/orderHelpers";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link BulkActionsBar}.
 */
interface BulkActionsBarProps {
  /** Number of currently selected orders. Renders `null` when this is 0. */
  count: number;
  /**
   * Called with the target status string when the user picks a status from
   * the bulk-update dropdown (e.g. `"shipped"`, `"cancelled"`).
   */
  onBulkUpdateStatus: (status: string) => void;
  /** Clears the current selection — passed down from the parent page. */
  onClear: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * **BulkActionsBar** — Selection summary + bulk-status dropdown.
 *
 * This component intentionally renders `null` when no rows are selected so
 * it doesn't occupy space in the normal layout. The parent simply mounts it
 * unconditionally and relies on this guard for visibility.
 *
 * ### Usage
 * ```tsx
 * <BulkActionsBar
 *   count={selectedIds.size}
 *   onBulkUpdateStatus={handleBulkUpdate}
 *   onClear={() => setSelectedIds(new Set())}
 * />
 * ```
 */
const BulkActionsBar = ({ count, onBulkUpdateStatus, onClear }: BulkActionsBarProps) => {
  // Early-exit: nothing is selected, so nothing should be rendered.
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
      {/* Selection indicator icon */}
      <CheckSquare className="w-4 h-4 text-primary" />

      {/* Human-readable count label */}
      <span className="text-sm font-medium">{count} orders selected</span>

      {/* ----------------------------------------------------------------
          Bulk-status dropdown — iterates over every status defined in
          ORDER_STATUS_OPTIONS (pending, processing, shipped, delivered,
          cancelled) so adding a new status there automatically appears here.
      ---------------------------------------------------------------- */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            Bulk Update Status <ChevronDown className="w-3 h-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {ORDER_STATUS_OPTIONS.map((s) => (
            // Capitalise the first letter for display; the raw value is sent
            // to the handler and written directly to the DB.
            <DropdownMenuItem key={s} onClick={() => onBulkUpdateStatus(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Deselect-all shortcut */}
      <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
    </div>
  );
};

export default BulkActionsBar;
