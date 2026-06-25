import { useState, useEffect } from "react";
import { ShieldBan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  name: string;
  userId: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (args: { userId: string; reason: string }) => void;
}

export default function CustomerBlockDialog({ open, name, userId, pending, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (!open) setReason(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldBan className="w-5 h-5 text-destructive" />ইউজার ব্লক করুন
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          <strong>{name}</strong> কে ব্লক করতে চাইছেন? ব্লক করার কারণ লিখুন:
        </p>
        <div className="space-y-2">
          <Label>কারণ</Label>
          <Textarea placeholder="ব্লক করার কারণ লিখুন..." value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>বাতিল</Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm({ userId, reason: reason || "আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ করা হয়েছে।" })}
            disabled={pending}
          >
            {pending ? "ব্লক হচ্ছে..." : "ব্লক করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
