// =============================================================================
// AddOrderDialog.tsx
// Admin-only dialog for manually creating an order (phone / walk-in orders).
// Does NOT require a logged-in user — always creates a guest order.
// =============================================================================

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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link AddOrderDialog}.
 */
interface AddOrderDialogProps {
  /** Whether the dialog is currently visible. */
  open: boolean;
  /** Called when the dialog requests to open or close itself. */
  onOpenChange: (open: boolean) => void;
  /**
   * Async callback that persists the new order.
   * Returns `true` on success so the dialog can close itself.
   */
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

// ---------------------------------------------------------------------------
// Blank-form sentinel — used to reset state after a successful submission.
// ---------------------------------------------------------------------------

/** Initial / reset state for the controlled form. */
const empty = {
  guest_name: "",
  shipping_phone: "",
  shipping_address: "",
  shipping_city: "",
  total: "",
  payment_method: "cod", // default to Cash on Delivery
  notes: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * **AddOrderDialog** — Manual order creation panel for admins.
 *
 * Used when a customer calls or visits in-person and the admin needs to record
 * the order without going through the storefront checkout flow.
 *
 * ### Validation rules
 * - `guest_name`, `shipping_phone`, `shipping_address`, and `total` are required.
 * - `total` must be a positive number.
 *
 * ### Bengali UI strings
 * - "ত্রুটি" = Error
 * - "নাম, ফোন, ঠিকানা ও মোট টাকা আবশ্যক" = Name, phone, address & total are required
 * - "সঠিক মোট টাকা দিন" = Please enter a valid total amount
 * - "নতুন অর্ডার তৈরি করুন" = Create New Order
 */
const AddOrderDialog = ({ open, onOpenChange, onCreate }: AddOrderDialogProps) => {
  // Controlled form state — every field maps directly to a DB column.
  const [form, setForm] = useState(empty);
  const { toast } = useToast();

  /**
   * Generic field updater — avoids boilerplate setState for each field.
   * @param key  - One of the form field keys.
   * @param value - New string value (numbers are kept as strings until submit).
   */
  const update = <K extends keyof typeof empty>(key: K, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  /**
   * Validates the form and, if valid, calls {@link onCreate}.
   * Resets the form and closes the dialog on success.
   */
  const handleSubmit = async () => {
    // Guard: required fields must be non-empty.
    if (!form.guest_name || !form.shipping_phone || !form.shipping_address || !form.total) {
      toast({ title: "ত্রুটি", description: "নাম, ফোন, ঠিকানা ও মোট টাকা আবশ্যক", variant: "destructive" });
      return;
    }

    // Guard: total must be a positive finite number.
    const total = parseFloat(form.total);
    if (isNaN(total) || total <= 0) {
      toast({ title: "ত্রুটি", description: "সঠিক মোট টাকা দিন", variant: "destructive" });
      return;
    }

    // Delegate persistence to the parent; close on success.
    const ok = await onCreate({
      guest_name: form.guest_name,
      shipping_phone: form.shipping_phone,
      shipping_address: form.shipping_address,
      shipping_city: form.shipping_city,
      total,
      payment_method: form.payment_method,
      notes: form.notes || null, // empty string → null in DB
    });

    if (ok) {
      setForm(empty);      // wipe the form for the next use
      onOpenChange(false); // close the dialog
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          {/* "নতুন অর্ডার তৈরি করুন" = Create New Order */}
          <DialogTitle>নতুন অর্ডার তৈরি করুন</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer name — required */}
          {/* "কাস্টমার নাম *" = Customer Name * */}
          <Field label="কাস্টমার নাম *">
            <Input
              value={form.guest_name}
              onChange={(e) => update("guest_name", e.target.value)}
              placeholder="নাম লিখুন" // "Enter name"
              className="mt-1"
            />
          </Field>

          {/* Mobile number — required; used for WhatsApp/SMS notifications */}
          {/* "মোবাইল নম্বর *" = Mobile Number * */}
          <Field label="মোবাইল নম্বর *">
            <Input
              value={form.shipping_phone}
              onChange={(e) => update("shipping_phone", e.target.value)}
              placeholder="01XXXXXXXXX"
              className="mt-1"
            />
          </Field>

          {/* Full delivery address — required */}
          {/* "ঠিকানা *" = Address * */}
          <Field label="ঠিকানা *">
            <Input
              value={form.shipping_address}
              onChange={(e) => update("shipping_address", e.target.value)}
              placeholder="পূর্ণ ঠিকানা" // "Full address"
              className="mt-1"
            />
          </Field>

          {/* City — optional; defaults to "N/A" in the DB layer if blank */}
          {/* "শহর (ঐচ্ছিক)" = City (Optional) */}
          <Field label="শহর (ঐচ্ছিক)">
            <Input
              value={form.shipping_city}
              onChange={(e) => update("shipping_city", e.target.value)}
              placeholder="শহর" // "City"
              className="mt-1"
            />
          </Field>

          {/* Order total in BDT — required, must be positive */}
          {/* "মোট টাকা (৳) *" = Total Amount (৳) * */}
          <Field label="মোট টাকা (৳) *">
            <Input
              type="number"
              value={form.total}
              onChange={(e) => update("total", e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </Field>

          {/* Payment method — defaults to COD; maps to `payment_method` DB column */}
          {/* "পেমেন্ট মেথড" = Payment Method */}
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

          {/* Optional free-text note saved to `orders.notes` */}
          {/* "নোট (ঐচ্ছিক)" = Note (Optional) */}
          <Field label="নোট (ঐচ্ছিক)">
            <Textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="অতিরিক্ত নোট..." // "Additional notes..."
              className="mt-1"
              rows={2}
            />
          </Field>

          {/* Submit button — "অর্ডার তৈরি করুন" = Create Order */}
          <Button onClick={handleSubmit} className="w-full">
            <Plus className="w-4 h-4 mr-2" /> অর্ডার তৈরি করুন
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Internal helper component
// ---------------------------------------------------------------------------

/**
 * Lightweight labeled wrapper so form rows stay consistent without repeating
 * className boilerplate.
 *
 * @param label    - Text shown above the child input.
 * @param children - The actual input / select / textarea element.
 */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-sm font-medium">{label}</label>
    {children}
  </div>
);

export default AddOrderDialog;
