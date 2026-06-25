import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { CustomerEditForm, UnifiedCustomer } from "@/lib/admin/customerHelpers";

interface Props {
  customer: UnifiedCustomer | null;
  pending: boolean;
  onClose: () => void;
  onSave: (args: { id: string; type: "registered" | "guest"; data: CustomerEditForm }) => void;
}

export default function CustomerEditDialog({ customer, pending, onClose, onSave }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<CustomerEditForm>({ full_name: "", phone: "", address: "", city: "", email: "" });

  useEffect(() => {
    if (customer) {
      setForm({
        full_name: customer.full_name || "",
        phone: customer.phone || "",
        address: customer.address || "",
        city: customer.city || "",
        email: customer.email || "",
      });
    }
  }, [customer]);

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />কাস্টমার এডিট
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>নাম *</Label><Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} /></div>
          <div><Label>ফোন *</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div><Label>ঠিকানা</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
          <div><Label>শহর</Label><Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></div>
          {customer?.type === "guest" && (
            <div><Label>ইমেইল</Label><Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>বাতিল</Button>
          <Button
            disabled={pending}
            onClick={() => {
              if (!form.full_name || !form.phone) {
                toast({ title: "নাম ও ফোন আবশ্যক", variant: "destructive" });
                return;
              }
              if (customer) onSave({ id: customer.id, type: customer.type, data: form });
            }}
          >
            {pending ? "সেভ হচ্ছে..." : "সেভ করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
