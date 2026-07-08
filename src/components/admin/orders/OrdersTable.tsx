// =============================================================================
// OrdersTable.tsx
// Data table that lists orders for the admin panel.
//
// Features:
//   • Header checkbox for select-all / deselect-all.
//   • Per-row checkbox for multi-select (used by BulkActionsBar).
//   • Inline status badge with dropdown (OrderStatusBadge).
//   • Per-row action buttons: view detail, print shipping label, delete.
//   • Loading skeleton row and empty-state row.
// =============================================================================

import { Eye, Printer, Trash2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import OrderStatusBadge from "./OrderStatusBadge";
import OrderRowThumbnail from "./OrderRowThumbnail";
import type { AdminOrder } from "@/lib/admin/orderHelpers";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link OrdersTable}.
 */
interface OrdersTableProps {
  /** Full list of orders after server-side filtering. */
  orders: AdminOrder[];
  /** When `true`, shows a single "Loading…" row instead of data. */
  loading: boolean;
  /** Set of order IDs that are currently checked. */
  selectedIds: Set<string>;
  /**
   * Toggle the selection state of a single row by its order ID.
   * Called when the per-row checkbox changes.
   */
  onToggleSelect: (id: string) => void;
  /**
   * Toggle select-all / deselect-all.
   * Called when the header checkbox changes.
   */
  onToggleSelectAll: () => void;
  /**
   * Persist a status change for a single order.
   * Delegated to the OrderStatusBadge dropdown.
   */
  onUpdateStatus: (orderId: string, status: string) => void;
  /** Open the OrderDetailDialog for the given order. */
  onView: (order: AdminOrder) => void;
  /** Trigger the browser print dialog for a shipping label. */
  onPrint: (order: AdminOrder) => void;
  /** Permanently delete an order (after confirmation in the parent). */
  onDelete: (orderId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * **OrdersTable** — Paginated, selectable data table for admin orders.
 *
 * The component is purely presentational — all data fetching and mutation
 * logic lives in {@link useAdminOrders}. The parent page wires the callbacks.
 *
 * ### Select-all logic
 * `allSelected` is true only when every visible order is in `selectedIds`
 * AND there is at least one order (prevents a "checked" state on an empty list).
 */
const OrdersTable = ({
  orders,
  loading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onUpdateStatus,
  onView,
  onPrint,
  onDelete,
}: OrdersTableProps) => {
  // True only when all rows in the current view are selected.
  const allSelected = selectedIds.size === orders.length && orders.length > 0;

  return (
    <div className="border rounded-lg">
      <Table>
        {/* ----------------------------------------------------------------
            Header row
            The first column is a select-all checkbox; toggling it calls
            onToggleSelectAll which the parent implements as either "add all
            visible IDs" or "clear the set".
        ---------------------------------------------------------------- */}
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} />
            </TableHead>
            <TableHead className="w-14">Item</TableHead>
            <TableHead>Order ID</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {/* ---- Loading state ---- */}
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8">Loading...</TableCell>
            </TableRow>

          /* ---- Empty state ---- */
          ) : orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No orders found
              </TableCell>
            </TableRow>

          /* ---- Data rows ---- */
          ) : (
            orders.map((order) => (
              <TableRow
                key={order.id}
                // Highlight selected rows with a subtle muted background.
                className={selectedIds.has(order.id) ? "bg-muted/50" : ""}
              >
                {/* Per-row selection checkbox */}
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(order.id)}
                    onCheckedChange={() => onToggleSelect(order.id)}
                  />
                </TableCell>

                {/* Short order reference — first 8 chars of the UUID */}
                <TableCell className="font-mono text-sm">#{order.id.slice(0, 8)}</TableCell>

                {/* Order creation date in locale format */}
                <TableCell>{new Date(order.created_at).toLocaleDateString()}</TableCell>

                {/* Customer info block: name (or fallback to city) + phone */}
                <TableCell>
                  <div>
                    <p className="font-medium">{order.guest_name || order.shipping_city}</p>
                    <p className="text-sm text-muted-foreground">{order.shipping_phone}</p>
                  </div>
                </TableCell>

                {/* Order total in BDT */}
                <TableCell className="font-semibold">
                  ৳{Number(order.total).toLocaleString()}
                </TableCell>

                {/* Inline status badge + dropdown for quick status change */}
                <TableCell>
                  <OrderStatusBadge
                    status={order.status}
                    onChange={(s) => onUpdateStatus(order.id, s)}
                  />
                </TableCell>

                {/* Row action buttons: view, print label, delete */}
                <TableCell className="text-right space-x-1">
                  {/* Open detail dialog */}
                  <Button variant="ghost" size="icon" onClick={() => onView(order)}>
                    <Eye className="w-4 h-4" />
                  </Button>

                  {/* Print shipping label in a new browser window */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onPrint(order)}
                    title="Print Label"
                  >
                    <Printer className="w-4 h-4" />
                  </Button>

                  {/* Delete order (cascades to order_items in the hook) */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(order.id)}
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default OrdersTable;
