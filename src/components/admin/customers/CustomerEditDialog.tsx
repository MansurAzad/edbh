/**
 * @file CustomerEditDialog.tsx
 * @description Modal dialog for editing an existing customer's profile fields.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Purpose & Data Flow
 * ─────────────────────────────────────────────────────────────────────────────
 * Purely presentational — pre-populates form fields from the selected
 * `UnifiedCustomer` row and delegates the Supabase UPDATE to the parent via
 * `onSave`.
 *
 * Parent mutation (useAdminCustomers → editMutation):
 *   For "registered" customers:
 *     UPDATE profiles SET full_name, phone, address, city
 *     WHERE id = <id>
 *     RLS: admin JWT required.
 *
 *   For "guest" customers:
 *     UPDATE orders SET shipping_name, shipping_phone, shipping_address,
 *       shipping_city, guest_email
 *     WHERE id = <guestOrderId>
 *     RLS: admin JWT required.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Conditional field
 * ─────────────────────────────────────────────────────────────────────────────
 * The email field is shown only for guest customers (`customer.type === "guest"`)
 * because registered users' emails live in Supabase Auth and cannot be changed
 * via a profiles UPDATE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Bengali UI notes  (বাংলা UI নোট)
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Title:   "কাস্টমার এডিট"  — Edit customer
 *  • নাম *    — required full name
 *  • ফোন *    — required phone
 *  • ঠিকানা  — optional address
 *  • শহর     — optional city
 *  • ইমেইল   — shown only for guest customers
 *  • "সেভ করুন"  — save button
 *  • "সেভ হচ্ছে…" — pending state
 *  • "বাতিল"      — cancel button
 *  • Toast: "নাম ও ফোন আবশ্যক" — required field validation error
 */

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
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
import type { CustomerEditForm, UnifiedCustomer } from "@/lib/admin/customerHelpers";

/**
 * Props for {@link CustomerEditDialog}.
 *
 * বাংলা: এডিট ডায়ালগের প্রপসের বিবরণ।
 */
interface Props {
  /**
   * The customer being edited, or `null` when no customer is selected.
   * When `null`, the dialog is closed (`open={!!customer}`).
   * When set, pre-populates all form fields via `useEffect`.
   *
   * বাংলা: নির্বাচিত কাস্টমার; null হলে ডায়ালগ বন্ধ থাকে।
   */
  customer: UnifiedCustomer | null;

  /**
   * True while the parent's `editMutation` is in-flight.
   * Disables the "সেভ করুন" button to prevent double-submission.
   *
   * বাংলা: mutation চলাকালীন true; বাটন disable হয়।
   */
  pending: boolean;

  /** Called when the user dismisses the dialog. Parent should set customer to null. */
  onClose: () => void;

  /**
   * Called with the validated payload when the admin clicks "সেভ করুন".
   *
   * The parent mutation dispatches the correct Supabase UPDATE based on
   * `type`:
   *  - "registered" → UPDATE profiles WHERE id = <id>
   *  - "guest"      → UPDATE orders WHERE id = <id>
   *
   * @param args.id   – customer's id (UUID or synthetic guest id)
   * @param args.type – "registered" | "guest" — determines which table to update
   * @param args.data – validated {@link CustomerEditForm} payload
   *
   * বাংলা: ফর্ম ভ্যালিডেশন পাস হলে parent mutation-এ পাঠায়।
   */
  onSave: (args: {
    id: string;
    type: "registered" | "guest";
    data: CustomerEditForm;
  }) => void;
}

/**
 * `CustomerEditDialog` – modal for editing an existing customer's profile.
 *
 * The dialog is open when `customer` is non-null and closed when it is null.
 * Form fields are pre-populated from the selected customer on mount/change.
 *
 * @param props – see {@link Props}
 *
 * বাংলা: বিদ্যমান কাস্টমারের তথ্য এডিট করার ডায়ালগ।
 */
export default function CustomerEditDialog({
  customer,
  pending,
  onClose,
  onSave,
}: Props) {
  const { toast } = useToast();

  /**
   * Local controlled form state.
   * Pre-populated from `customer` via `useEffect` below.
   *
   * বাংলা: লোকাল ফর্ম স্টেট; কাস্টমার সিলেক্ট হলে ডেটা দিয়ে পূরণ হয়।
   */
  const [form, setForm] = useState<CustomerEditForm>({
    full_name: "",
    phone:     "",
    address:   "",
    city:      "",
    email:     "",
  });

  /**
   * Pre-populate form fields whenever a new customer is selected.
   * Uses nullish coalescing (`|| ""`) so all inputs stay in controlled mode
   * even when database values are null.
   *
   * বাংলা: customer পরিবর্তন হলে ফর্ম ফিল্ড আপডেট হয়।
   */
  useEffect(() => {
    if (customer) {
      setForm({
        full_name: customer.full_name || "",
        phone:     customer.phone     || "",
        address:   customer.address   || "",
        city:      customer.city      || "",
        email:     customer.email     || "",
      });
    }
  }, [customer]);

  return (
    /* Dialog is open when customer is non-null */
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {/* ── Header ── */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />
            {/* বাংলা: "কাস্টমার এডিট" = Edit Customer */}
            কাস্টমার এডিট
          </DialogTitle>
        </DialogHeader>

        {/* ── Form fields ── */}
        <div className="space-y-3">
          {/* নাম (Name) — required */}
          <div>
            <Label>নাম *</Label>
            <Input
              value={form.full_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, full_name: e.target.value }))
              }
            />
          </div>

          {/* ফোন (Phone) — required */}
          <div>
            <Label>ফোন *</Label>
            <Input
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
          </div>

          {/* ঠিকানা (Address) — optional */}
          <div>
            <Label>ঠিকানা</Label>
            <Input
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
            />
          </div>

          {/* শহর (City) — optional */}
          <div>
            <Label>শহর</Label>
            <Input
              value={form.city}
              onChange={(e) =>
                setForm((f) => ({ ...f, city: e.target.value }))
              }
            />
          </div>

          {/*
           * Email — shown ONLY for guest customers.
           * Registered users' emails are managed by Supabase Auth and
           * cannot be changed via a profiles UPDATE.
           *
           * বাংলা: শুধু গেস্ট কাস্টমারের জন্য ইমেইল ফিল্ড দেখানো হয়।
           */}
          {customer?.type === "guest" && (
            <div>
              <Label>ইমেইল</Label>
              <Input
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
          )}
        </div>

        {/* ── Footer actions ── */}
        <DialogFooter>
          {/* বাতিল = Cancel */}
          <Button variant="outline" onClick={onClose}>
            বাতিল
          </Button>

          {/*
           * Save button — validates required fields then calls onSave.
           * Disabled while mutation is in-flight.
           *
           * বাংলা: "সেভ করুন" = Save | "সেভ হচ্ছে..." = Saving...
           */}
          <Button
            disabled={pending}
            onClick={() => {
              // ── Client-side validation ─────────────────────────────────────
              // বাংলা: নাম ও ফোন না থাকলে error toast দেখায়।
              if (!form.full_name || !form.phone) {
                toast({
                  title:   "নাম ও ফোন আবশ্যক",
                  variant: "destructive",
                });
                return;
              }
              if (customer) {
                onSave({ id: customer.id, type: customer.type, data: form });
              }
            }}
          >
            {pending ? "সেভ হচ্ছে..." : "সেভ করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
