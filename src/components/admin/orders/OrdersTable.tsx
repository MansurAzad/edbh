import { Eye, Printer, Trash2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import OrderStatusBadge from "./OrderStatusBadge";
import type { AdminOrder } from "@/lib/admin/orderHelpers";

interface OrdersTableProps {
  orders: AdminOrder[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onUpdateStatus: (orderId: string, status: string) => void;
  onView: (order: AdminOrder) => void;
  onPrint: (order: AdminOrder) => void;
  onDelete: (orderId: string) => void;
}

/** Tabular list of orders with selection checkboxes and per-row actions. */
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
  const allSelected = selectedIds.size === orders.length && orders.length > 0;

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} />
            </TableHead>
            <TableHead>Order ID</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8">Loading...</TableCell>
            </TableRow>
          ) : orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No orders found
              </TableCell>
            </TableRow>
          ) : (
            orders.map((order) => (
              <TableRow key={order.id} className={selectedIds.has(order.id) ? "bg-muted/50" : ""}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(order.id)}
                    onCheckedChange={() => onToggleSelect(order.id)}
                  />
                </TableCell>
                <TableCell className="font-mono text-sm">#{order.id.slice(0, 8)}</TableCell>
                <TableCell>{new Date(order.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{order.guest_name || order.shipping_city}</p>
                    <p className="text-sm text-muted-foreground">{order.shipping_phone}</p>
                  </div>
                </TableCell>
                <TableCell className="font-semibold">৳{Number(order.total).toLocaleString()}</TableCell>
                <TableCell>
                  <OrderStatusBadge
                    status={order.status}
                    onChange={(s) => onUpdateStatus(order.id, s)}
                  />
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => onView(order)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onPrint(order)} title="Print Label">
                    <Printer className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(order.id)} title="Delete">
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
