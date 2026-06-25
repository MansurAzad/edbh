import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface AddOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: {
    guest_name: string;
    shipping_phone: string;
    shipping_address: string;
    shipping_city: string;
    total: number;
    payment_method: string;
    notes: string | null;
  }) => Promise<boolean>;
}

const empty = {
  guest_name: "",
  shipping_phone: "",
  shipping_address: "",
  shipping_city: "",
  total: "",
  payment_method: "cod",
  notes: "",
};

/** Manual order creation dialog for admins entering phone/walk-in orders. */
const AddOrderDialog = ({ open, onOpenChange, onCreate }: AddOrderDialogProps) => {
  const [form, setForm] = useState(empty);
  const { toast } = useToast();

  const update = <K extends keyof typeof empty>(key: K, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = async () => {
    if (!form.guest_name || !form.shipping_phone || !form.shipping_address || !form.total) {
      toast({ title: "ত্রুটি", description: "নাম, ফোন, ঠিকানা ও মোট টাকা আবশ্যক", variant: "destructive" });
      return;
    }
    const total = parseFloat(form.total);
    if (isNaN(total) || total <= 0) {
      toast({ title: "ত্রুটি", description: "সঠিক মোট টাকা দিন", variant: "destructive" });
      return;
    }
    const ok = await onCreate({
      guest_name: form.guest_name,
      shipping_phone: form.shipping_phone,
      shipping_address: form.shipping_address,
      shipping_city: form.shipping_city,
      total,
      payment_method: form.payment_method,
      notes: form.notes || null,
    });
    if (ok) {
      setForm(empty);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>নতুন অর্ডার তৈরি করুন</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="কাস্টমার নাম *">
            <Input value={form.guest_name} onChange={(e) => update("guest_name", e.target.value)} placeholder="নাম লিখুন" className="mt-1" />
          </Field>
          <Field label="মোবাইল নম্বর *">
            <Input value={form.shipping_phone} onChange={(e) => update("shipping_phone", e.target.value)} placeholder="01XXXXXXXXX" className="mt-1" />
          </Field>
          <Field label="ঠিকানা *">
            <Input value={form.shipping_address} onChange={(e) => update("shipping_address", e.target.value)} placeholder="পূর্ণ ঠিকানা" className="mt-1" />
          </Field>
          <Field label="শহর (ঐচ্ছিক)">
            <Input value={form.shipping_city} onChange={(e) => update("shipping_city", e.target.value)} placeholder="শহর" className="mt-1" />
          </Field>
          <Field label="মোট টাকা (৳) *">
            <Input type="number" value={form.total} onChange={(e) => update("total", e.target.value)} placeholder="0" className="mt-1" />
          </Field>
          <Field label="পেমেন্ট মেথড">
            <Select value={form.payment_method} onValueChange={(v) => update("payment_method", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cod">Cash on Delivery</SelectItem>
                <SelectItem value="bkash">bKash</SelectItem>
                <SelectItem value="nagad">Nagad</SelectItem>
                <SelectItem value="rocket">Rocket</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="নোট (ঐচ্ছিক)">
            <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="অতিরিক্ত নোট..." className="mt-1" rows={2} />
          </Field>
          <Button onClick={handleSubmit} className="w-full">
            <Plus className="w-4 h-4 mr-2" /> অর্ডার তৈরি করুন
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-sm font-medium">{label}</label>
    {children}
  </div>
);

export default AddOrderDialog;
