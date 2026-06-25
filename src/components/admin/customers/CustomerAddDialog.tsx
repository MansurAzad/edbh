import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { CustomerAddForm } from "@/lib/admin/customerHelpers";

interface Props {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onAdd: (data: CustomerAddForm) => void;
}

export default function CustomerAddDialog({ open, pending, onClose, onAdd }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<CustomerAddForm>({ full_name: "", phone: "", address: "", city: "" });

  useEffect(() => { if (!open) setForm({ full_name: "", phone: "", address: "", city: "" }); }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />নতুন কাস্টমার যোগ করুন
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>নাম *</Label><Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="কাস্টমারের নাম" /></div>
          <div><Label>ফোন *</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="01XXXXXXXXX" /></div>
          <div><Label>ঠিকানা (ঐচ্ছিক)</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="ঠিকানা" /></div>
          <div><Label>শহর (ঐচ্ছিক)</Label><Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="শহর" /></div>
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
              onAdd(form);
            }}
          >
            {pending ? "যোগ হচ্ছে..." : "যোগ করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
