import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Plus } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

import OrdersToolbar from "@/components/admin/orders/OrdersToolbar";
import BulkActionsBar from "@/components/admin/orders/BulkActionsBar";
import OrdersTable from "@/components/admin/orders/OrdersTable";
import OrderDetailDialog from "@/components/admin/orders/OrderDetailDialog";
import AddOrderDialog from "@/components/admin/orders/AddOrderDialog";

import { useAdminOrders } from "@/hooks/admin/useAdminOrders";
import {
  type AdminOrder,
  printShippingLabel,
  exportOrdersCSV,
} from "@/lib/admin/orderHelpers";

const Orders = () => {
  const { toast } = useToast();
  const {
    orders, loading,
    updateStatus, bulkUpdateStatus, verifyPayment, collectCOD,
    deleteOrder, createOrder, updateTracking,
  } = useAdminOrders();

  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  useEffect(() => {
    const s = searchParams.get("status");
    if (s) setStatusFilter(s);
  }, [searchParams]);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return orders.filter((order) => {
      const matchesSearch =
        order.id.toLowerCase().includes(q) ||
        order.shipping_phone.includes(searchQuery) ||
        order.shipping_city.toLowerCase().includes(q) ||
        (order.guest_name || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === filteredOrders.length
        ? new Set()
        : new Set(filteredOrders.map((o) => o.id))
    );
  }, [filteredOrders]);

  const handleBulkUpdate = async (newStatus: string) => {
    const ok = await bulkUpdateStatus(Array.from(selectedIds), newStatus);
    if (ok) setSelectedIds(new Set());
  };

  const handleExport = () => {
    if (filteredOrders.length === 0) {
      toast({ title: "কোনো অর্ডার নেই", variant: "destructive" });
      return;
    }
    exportOrdersCSV(filteredOrders);
    toast({ title: `✅ ${filteredOrders.length}টি অর্ডার এক্সপোর্ট হয়েছে` });
  };

  const handleDelete = async () => {
    if (!deleteOrderId) return;
    await deleteOrder(deleteOrderId);
    setDeleteOrderId(null);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Orders</h1>
            <p className="text-muted-foreground">
              Manage and track customer orders ({filteredOrders.length})
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" /> CSV এক্সপোর্ট
            </Button>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" /> নতুন অর্ডার
            </Button>
          </div>
        </div>

        <OrdersToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />

        <BulkActionsBar
          count={selectedIds.size}
          onBulkUpdateStatus={handleBulkUpdate}
          onClear={() => setSelectedIds(new Set())}
        />

        <OrdersTable
          orders={filteredOrders}
          loading={loading}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onUpdateStatus={updateStatus}
          onView={setSelectedOrder}
          onPrint={printShippingLabel}
          onDelete={setDeleteOrderId}
        />
      </div>

      <OrderDetailDialog
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onVerifyPayment={verifyPayment}
        onCollectCOD={collectCOD}
        onUpdateTracking={updateTracking}
      />

      <AddOrderDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onCreate={createOrder}
      />

      <AlertDialog open={!!deleteOrderId} onOpenChange={() => setDeleteOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>অর্ডার ডিলিট করবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              এই অর্ডার এবং এর সকল আইটেম স্থায়ীভাবে মুছে যাবে। এটি আর ফেরত আনা যাবে না।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              ডিলিট করুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default Orders;
