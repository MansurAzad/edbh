import { useMemo, useState } from "react";
import { Download, Plus, Search, ShieldBan, UserCheck, Users, UserX } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAdminCustomers } from "@/hooks/admin/useAdminCustomers";
import { exportCustomersCSV, type UnifiedCustomer } from "@/lib/admin/customerHelpers";
import CustomersStatCards from "@/components/admin/customers/CustomersStatCards";
import CustomersTable from "@/components/admin/customers/CustomersTable";
import CustomerBlockDialog from "@/components/admin/customers/CustomerBlockDialog";
import CustomerEditDialog from "@/components/admin/customers/CustomerEditDialog";
import CustomerAddDialog from "@/components/admin/customers/CustomerAddDialog";

const Customers = () => {
  const { toast } = useToast();
  const {
    profiles, allCustomers, blockedUsers, blockedSet, loading,
    blockMutation, unblockMutation, editMutation, deleteMutation, addMutation,
  } = useAdminCustomers();

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [blockDialog, setBlockDialog] = useState<{ open: boolean; userId: string; name: string }>({ open: false, userId: "", name: "" });
  const [editCustomer, setEditCustomer] = useState<UnifiedCustomer | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; customer: UnifiedCustomer | null }>({ open: false, customer: null });
  const [addDialog, setAddDialog] = useState(false);

  const registeredCount = profiles.length;
  const guestCount = allCustomers.filter((c) => c.type === "guest").length;

  const filteredCustomers = useMemo(() => {
    let list = allCustomers;
    if (activeTab === "registered") list = list.filter((c) => c.type === "registered");
    else if (activeTab === "guest") list = list.filter((c) => c.type === "guest");
    else if (activeTab === "blocked") list = list.filter((c) => blockedSet.has(c.user_id));

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) =>
        c.full_name?.toLowerCase().includes(q) ||
        c.phone?.includes(searchQuery) ||
        c.city?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allCustomers, activeTab, searchQuery, blockedSet]);

  const handleExport = () => {
    const { ok, count } = exportCustomersCSV(filteredCustomers, blockedSet);
    if (!ok) toast({ title: "কোনো ডেটা নেই", variant: "destructive" });
    else toast({ title: `✅ ${count}টি কাস্টমার এক্সপোর্ট হয়েছে` });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Customers</h1>
            <p className="text-muted-foreground">সব রেজিস্টার্ড ও গেস্ট কাস্টমার দেখুন</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => setAddDialog(true)}>
              <Plus className="w-4 h-4" />ম্যানুয়াল যোগ
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={handleExport}>
              <Download className="w-4 h-4" />CSV এক্সপোর্ট
            </Button>
          </div>
        </div>

        <CustomersStatCards total={allCustomers.length} registered={registeredCount} guest={guestCount} blocked={blockedUsers.length} />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="all" className="gap-1.5"><Users className="w-3.5 h-3.5" />সব ({allCustomers.length})</TabsTrigger>
            <TabsTrigger value="registered" className="gap-1.5"><UserCheck className="w-3.5 h-3.5" />রেজিস্টার্ড ({registeredCount})</TabsTrigger>
            <TabsTrigger value="guest" className="gap-1.5"><UserX className="w-3.5 h-3.5" />গেস্ট ({guestCount})</TabsTrigger>
            <TabsTrigger value="blocked" className="gap-1.5"><ShieldBan className="w-3.5 h-3.5" />ব্লকড ({blockedUsers.length})</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-4 mt-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="নাম, ফোন, শহর, ইমেইল দিয়ে খুঁজুন..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
          </div>

          {["all", "registered", "guest", "blocked"].map((tabValue) => (
            <TabsContent key={tabValue} value={tabValue} className="mt-4">
              <CustomersTable
                loading={loading}
                customers={filteredCustomers}
                blockedSet={blockedSet}
                onEdit={setEditCustomer}
                onDelete={(c) => setDeleteDialog({ open: true, customer: c })}
                onBlock={(userId, name) => setBlockDialog({ open: true, userId, name })}
                onUnblock={(userId) => unblockMutation.mutate(userId)}
                unblockPending={unblockMutation.isPending}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <CustomerBlockDialog
        open={blockDialog.open}
        name={blockDialog.name}
        userId={blockDialog.userId}
        pending={blockMutation.isPending}
        onClose={() => setBlockDialog({ open: false, userId: "", name: "" })}
        onConfirm={(args) => blockMutation.mutate(args, {
          onSuccess: () => setBlockDialog({ open: false, userId: "", name: "" }),
        })}
      />

      <CustomerEditDialog
        customer={editCustomer}
        pending={editMutation.isPending}
        onClose={() => setEditCustomer(null)}
        onSave={(args) => editMutation.mutate(args, { onSuccess: () => setEditCustomer(null) })}
      />

      <AlertDialog open={deleteDialog.open} onOpenChange={(o) => !o && setDeleteDialog({ open: false, customer: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>কাস্টমার ডিলিট করুন</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteDialog.customer?.full_name || "এই কাস্টমার"}</strong> কে ডিলিট করতে চাইছেন? এটি আর ফেরত আনা যাবে না।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteDialog.customer) {
                  deleteMutation.mutate(
                    { id: deleteDialog.customer.id, type: deleteDialog.customer.type },
                    { onSuccess: () => setDeleteDialog({ open: false, customer: null }) },
                  );
                }
              }}
            >
              {deleteMutation.isPending ? "ডিলিট হচ্ছে..." : "ডিলিট করুন"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomerAddDialog
        open={addDialog}
        pending={addMutation.isPending}
        onClose={() => setAddDialog(false)}
        onAdd={(data) => addMutation.mutate(data, { onSuccess: () => setAddDialog(false) })}
      />
    </AdminLayout>
  );
};

export default Customers;
