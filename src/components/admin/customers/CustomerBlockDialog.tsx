/**
 * @file CustomerBlockDialog.tsx
 * @description Confirmation dialog for blocking a registered customer account.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Purpose & Data Flow
 * ─────────────────────────────────────────────────────────────────────────────
 * Purely presentational — collects an optional reason string and delegates the
 * actual Supabase mutation to the parent via `onConfirm`.
 *
 * Parent mutation (useAdminCustomers → blockMutation):
 *   INSERT INTO blocked_users (user_id, reason, is_active)
 *   VALUES (<userId>, <reason>, true)
 *   RLS: admin JWT required.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Bengali UI notes  (বাংলা UI নোট)
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Title:    "ইউজার ব্লক করুন"     — Block user
 *  • Body:     "<name> কে ব্লক করতে চাইছেন?" — Confirm block prompt
 *  • কারণ     — Reason textarea label
 *  • "ব্লক করুন"   — destructive confirm button
 *  • "ব্লক হচ্ছে…" — pending state
 *  • "বাতিল"       — cancel button
 *  • Default reason (when textarea is empty):
 *    "আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ করা হয়েছে।"
 *    ("Your account has been temporarily suspended.")
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * State reset
 * ─────────────────────────────────────────────────────────────────────────────
 *  `reason` is reset to "" whenever `open` becomes false, preventing stale
 *  text from appearing on the next open.
 */

import { useState, useEffect } from "react";
import { ShieldBan } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Props for {@link CustomerBlockDialog}.
 *
 * বাংলা: ব্লক ডায়ালগের প্রপসের বিবরণ।
 */
interface Props {
  /** Controls dialog visibility. */
  open: boolean;
  /** Display name of the customer being blocked — shown in the confirmation text. */
  name: string;
  /**
   * Auth UID of the user to block.
   * Passed through to `onConfirm` so the parent can target the correct row.
   * Maps to `blocked_users.user_id` in the Supabase INSERT.
   *
   * বাংলা: ব্লক করার জন্য user_id; Supabase INSERT-এ ব্যবহৃত হয়।
   */
  userId: string;
  /**
   * True while the parent's `blockMutation` is in-flight.
   * Disables the "ব্লক করুন" button to prevent double-submission.
   *
   * বাংলা: mutation চলাকালীন true; বাটন disable হয়।
   */
  pending: boolean;
  /** Called when the user dismisses the dialog without confirming. */
  onClose: () => void;
  /**
   * Called with `{ userId, reason }` when the admin confirms the block.
   * If no reason is typed, a default Bengali message is substituted so the
   * `blocked_users.reason` column is never empty.
   *
   * Parent performs:
   *   INSERT INTO blocked_users (user_id, reason, is_active)
   *   VALUES (userId, reason, true)
   *
   * @param args.userId – auth UID of the user being blocked
   * @param args.reason – human-readable block reason (Bengali text)
   *
   * বাংলা: ব্লক নিশ্চিত হলে parent mutation-এ পাঠায়।
   */
  onConfirm: (args: { userId: string; reason: string }) => void;
}

/**
 * `CustomerBlockDialog` – modal for blocking a registered customer.
 *
 * Shows the customer's name in the confirmation prompt and provides a Textarea
 * for the admin to record a Bengali-language block reason.
 *
 * @param props – see {@link Props}
 *
 * বাংলা: রেজিস্টার্ড কাস্টমার ব্লক করার নিশ্চিতকরণ ডায়ালগ।
 */
export default function CustomerBlockDialog({
  open,
  name,
  userId,
  pending,
  onClose,
  onConfirm,
}: Props) {
  /**
   * Local controlled state for the block reason textarea.
   * Reset to "" whenever `open` transitions to false.
   *
   * বাংলা: ব্লক করার কারণ লোকাল স্টেটে রাখা হয়।
   */
  const [reason, setReason] = useState("");

  /** Reset reason text on dialog close. বাংলা: ডায়ালগ বন্ধ হলে কারণ মুছে যায়। */
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {/* ── Header ── */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {/* ShieldBan icon signals a destructive / security action */}
            <ShieldBan className="w-5 h-5 text-destructive" />
            {/* বাংলা: "ইউজার ব্লক করুন" = Block user */}
            ইউজার ব্লক করুন
          </DialogTitle>
        </DialogHeader>

        {/*
         * Confirmation copy — interpolates the customer's display name.
         * বাংলা: "<name> কে ব্লক করতে চাইছেন? ব্লক করার কারণ লিখুন:"
         *        = "Do you want to block <name>? Write the reason:"
         */}
        <p className="text-sm text-muted-foreground">
          <strong>{name}</strong> কে ব্লক করতে চাইছেন? ব্লক করার কারণ লিখুন:
        </p>

        {/* ── Reason textarea ── */}
        <div className="space-y-2">
          {/* বাংলা: "কারণ" = Reason */}
          <Label>কারণ</Label>
          <Textarea
            placeholder="ব্লক করার কারণ লিখুন..." // "Write the reason for blocking..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        {/* ── Footer actions ── */}
        <DialogFooter>
          {/* বাতিল = Cancel */}
          <Button variant="outline" onClick={onClose}>
            বাতিল
          </Button>

          {/*
           * Destructive confirm button.
           * Falls back to a default Bengali reason string when the textarea
           * is left blank, ensuring `blocked_users.reason` is never empty.
           *
           * Supabase mutation (in parent):
           *   INSERT INTO blocked_users (user_id, reason, is_active)
           *   VALUES (userId, reason || "<default>", true)
           *
           * বাংলা: "ব্লক করুন" = Block | "ব্লক হচ্ছে..." = Blocking...
           * কারণ খালি থাকলে ডিফল্ট বাংলা বার্তা ব্যবহার হয়।
           */}
          <Button
            variant="destructive"
            onClick={() =>
              onConfirm({
                userId,
                reason:
                  reason ||
                  "আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ করা হয়েছে।",
                // Default: "Your account has been temporarily suspended."
              })
            }
            disabled={pending}
          >
            {/* বাংলা: মিউটেশন চলাকালীন "ব্লক হচ্ছে..." দেখায় */}
            {pending ? "ব্লক হচ্ছে..." : "ব্লক করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
