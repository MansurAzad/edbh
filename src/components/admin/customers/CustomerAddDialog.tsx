/**
 * @file CustomerAddDialog.tsx
 * @description Modal dialog for manually adding a new guest customer record
 * from the admin Customers page.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Purpose
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a controlled form with four fields — full name, phone, address, and
 * city — and delegates the actual Supabase INSERT to the parent via the
 * `onAdd` callback.  This component is purely presentational: it manages only
 * local form state and client-side validation; it does NOT call Supabase
 * directly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Data flow
 * ─────────────────────────────────────────────────────────────────────────────
 *  Parent (admin customers page)
 *    ↓  open, pending, onClose, onAdd
 *  CustomerAddDialog  (this component)
 *    ↓  onAdd(form)  — fires on "যোগ করুন" click after validation passes
 *  Parent mutation (useAdminCustomers → addMutation)
 *    ↓  Supabase INSERT into guest_customers or orders table
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Validation (client-side only)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Required fields: `full_name` and `phone`.
 *  If either is empty the component fires a destructive toast and does NOT
 *  call `onAdd`.  Server-side validation is the parent mutation's concern.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Bengali UI notes  (বাংলা UI নোট)
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Title:    "নতুন কাস্টমার যোগ করুন"  (Add new customer)
 *  • নাম *    – required full name field
 *  • ফোন *    – required phone number (01XXXXXXXXX format)
 *  • ঠিকানা  – optional street address
 *  • শহর     – optional city / district
 *  • "যোগ করুন"  – submit button
 *  • "বাতিল"     – cancel button
 *  • "যোগ হচ্ছে…" – pending state label while mutation is in-flight
 *  • Toast:  "নাম ও ফোন আবশ্যক" — shown when required fields are empty
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * State reset
 * ─────────────────────────────────────────────────────────────────────────────
 *  The `useEffect` watching `open` resets the form to blank values whenever
 *  the dialog closes, preventing stale input from appearing on the next open.
 */

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { CustomerAddForm } from "@/lib/admin/customerHelpers";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for {@link CustomerAddDialog}.
 *
 * বাংলা: এই কম্পোনেন্টের প্রপসের বিবরণ।
 */
interface Props {
  /** Whether the dialog is currently open / visible. */
  open: boolean;

  /**
   * True while the parent's `addMutation` is in-flight (Supabase INSERT
   * pending).  Disables the submit button to prevent double-submission.
   *
   * বাংলা: Supabase INSERT চলাকালীন true; বাটন disable হয়।
   */
  pending: boolean;

  /**
   * Called when the user dismisses the dialog (Cancel button or backdrop
   * click).  Parent should set its `open` state to `false`.
   */
  onClose: () => void;

  /**
   * Called with the validated {@link CustomerAddForm} payload when the user
   * clicks "যোগ করুন" and both required fields pass validation.
   *
   * The parent is responsible for the actual Supabase INSERT.
   *
   * @param data – validated form payload (full_name, phone, address, city)
   *
   * বাংলা: ফর্ম ভ্যালিডেশন পাস হলে parent-এ ডেটা পাঠায়।
   */
  onAdd: (data: CustomerAddForm) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `CustomerAddDialog` – modal form for creating a new guest customer.
 *
 * @param props – see {@link Props}
 *
 * বাংলা: নতুন কাস্টমার যোগ করার ডায়ালগ।
 * ফর্মে নাম ও ফোন বাধ্যতামূলক; ঠিকানা ও শহর ঐচ্ছিক।
 */
export default function CustomerAddDialog({
  open,
  pending,
  onClose,
  onAdd,
}: Props) {
  const { toast } = useToast();

  /**
   * Local controlled form state.
   * Type: {@link CustomerAddForm} = `{ full_name, phone, address, city }`.
   * Reset to blank values whenever `open` transitions to `false`.
   *
   * বাংলা: লোকাল ফর্ম স্টেট; ডায়ালগ বন্ধ হলে রিসেট হয়।
   */
  const [form, setForm] = useState<CustomerAddForm>({
    full_name: "",
    phone:     "",
    address:   "",
    city:      "",
  });

  /**
   * Reset form whenever the dialog closes.
   * Prevents stale values from appearing the next time the dialog opens.
   *
   * বাংলা: ডায়ালগ বন্ধ হলে ফর্ম ক্লিয়ার হয়।
   */
  useEffect(() => {
    if (!open) setForm({ full_name: "", phone: "", address: "", city: "" });
  }, [open]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {/* ── Header ── */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {/* Plus icon provides visual affordance for the "add" action */}
            <Plus className="w-5 h-5 text-primary" />
            {/* বাংলা: "নতুন কাস্টমার যোগ করুন" = Add new customer */}
            নতুন কাস্টমার যোগ করুন
          </DialogTitle>
        </DialogHeader>

        {/* ── Form fields ── */}
        <div className="space-y-3">
          {/* নাম (Name) — required */}
          <div>
            {/* বাংলা লেবেল: নাম * = Name (required) */}
            <Label>নাম *</Label>
            <Input
              value={form.full_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, full_name: e.target.value }))
              }
              placeholder="কাস্টমারের নাম" // "Customer's name"
            />
          </div>

          {/* ফোন (Phone) — required; expected format: 01XXXXXXXXX */}
          <div>
            {/* বাংলা লেবেল: ফোন * = Phone (required) */}
            <Label>ফোন *</Label>
            <Input
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              placeholder="01XXXXXXXXX"
            />
          </div>

          {/* ঠিকানা (Address) — optional */}
          <div>
            {/* বাংলা লেবেল: ঠিকানা (ঐচ্ছিক) = Address (optional) */}
            <Label>ঠিকানা (ঐচ্ছিক)</Label>
            <Input
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
              placeholder="ঠিকানা" // "Address"
            />
          </div>

          {/* শহর (City) — optional */}
          <div>
            {/* বাংলা লেবেল: শহর (ঐচ্ছিক) = City (optional) */}
            <Label>শহর (ঐচ্ছিক)</Label>
            <Input
              value={form.city}
              onChange={(e) =>
                setForm((f) => ({ ...f, city: e.target.value }))
              }
              placeholder="শহর" // "City"
            />
          </div>
        </div>

        {/* ── Footer actions ── */}
        <DialogFooter>
          {/* বাতিল = Cancel */}
          <Button variant="outline" onClick={onClose}>
            বাতিল
          </Button>

          {/*
           * Submit button:
           *  - disabled while `pending` (mutation in-flight)
           *  - validates required fields before calling `onAdd`
           *  - shows "যোগ হচ্ছে…" (Adding…) while pending
           *
           * বাংলা: "যোগ করুন" = Add | "যোগ হচ্ছে..." = Adding...
           */}
          <Button
            disabled={pending}
            onClick={() => {
              // ── Client-side validation ─────────────────────────────────────
              // Both full_name and phone are required; show a destructive toast
              // and abort if either is missing.
              // বাংলা: নাম ও ফোন না থাকলে error toast দেখায়।
              if (!form.full_name || !form.phone) {
                toast({
                  title:   "নাম ও ফোন আবশ্যক", // "Name and phone are required"
                  variant: "destructive",
                });
                return;
              }
              // Delegate Supabase INSERT to the parent mutation.
              onAdd(form);
            }}
          >
            {/* বাংলা: মিউটেশন চলাকালীন "যোগ হচ্ছে..." দেখায় */}
            {pending ? "যোগ হচ্ছে..." : "যোগ করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
