/**
 * @file BulkInventoryDialog.tsx
 * @description Admin tool to update `stock` and `purchase_cost` for many
 * products in a single dialog. Rows are pre-filtered by the parent (e.g. the
 * currently visible / low-stock subset) and admins can search within the list,
 * edit values inline, then save all changes in one Supabase update batch.
 *
 * Validation:
 *  • `stock` must be a non-negative integer (0, 1, 2, …).
 *  • `purchase_cost` must be a non-negative number or blank (blank → null).
 *  • Rows with invalid values show an inline error and block saving.
 *
 * বাংলা: একসাথে অনেক প্রোডাক্টের stock এবং purchase_cost আপডেট করার টুল।
 * নেগেটিভ স্টক বা ভুল purchase_cost দিলে সেভ বন্ধ থাকে।
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AdminProduct } from "@/lib/admin/productHelpers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: AdminProduct[];
  onSaved: () => void;
}

interface Draft {
  stock: string;
  purchase_cost: string;
  selected: boolean;
}

interface RowErrors {
  stock?: string;
  purchase_cost?: string;
}

/**
 * Validate a single row's draft values.
 * Returns per-field error strings; empty object means the row is valid.
 */
export function validateRow(draft: Draft): RowErrors {
  const errs: RowErrors = {};
  const stockStr = draft.stock.trim();
  if (stockStr === "") {
    errs.stock = "Required";
  } else {
    const n = Number(stockStr);
    if (!Number.isFinite(n)) errs.stock = "Must be a number";
    else if (n < 0) errs.stock = "Cannot be negative";
    else if (!Number.isInteger(n)) errs.stock = "Whole number only";
  }

  const pcStr = draft.purchase_cost.trim();
  if (pcStr !== "") {
    const n = Number(pcStr);
    if (!Number.isFinite(n)) errs.purchase_cost = "Must be a number";
    else if (n < 0) errs.purchase_cost = "Cannot be negative";
  }
  return errs;
}

function buildDrafts(products: AdminProduct[]): Record<string, Draft> {
  const out: Record<string, Draft> = {};
  for (const p of products) {
    out[p.id] = {
      stock: String(p.stock ?? 0),
      purchase_cost: p.purchase_cost != null ? String(p.purchase_cost) : "",
      selected: false,
    };
  }
  return out;
}

export default function BulkInventoryDialog({ open, onOpenChange, products, onSaved }: Props) {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /** Snapshot of the original stock/purchase_cost values for every product
   *  in the dialog. Used for optimistic rollback: if a per-row Supabase
   *  update fails, we restore that row's draft to this snapshot so the UI
   *  matches the DB state and the admin can retry. */
  const originalById = useMemo(() => {
    const m: Record<string, { stock: string; purchase_cost: string }> = {};
    for (const p of products) {
      m[p.id] = {
        stock: String(p.stock ?? 0),
        purchase_cost: p.purchase_cost != null ? String(p.purchase_cost) : "",
      };
    }
    return m;
  }, [products]);

  useEffect(() => {
    if (open) {
      setDrafts(buildDrafts(products));
      setSearch("");
    }
  }, [open, products]);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const toggleAll = (checked: boolean) => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of filtered) {
        if (next[p.id]) next[p.id] = { ...next[p.id], selected: checked };
      }
      return next;
    });
  };

  // Selected + invalid tracking derived from current drafts.
  const selectedEntries = Object.entries(drafts).filter(([, d]) => d.selected);
  const selectedCount = selectedEntries.length;
  const invalidSelectedIds = selectedEntries
    .filter(([, d]) => Object.keys(validateRow(d)).length > 0)
    .map(([id]) => id);
  const hasInvalidSelected = invalidSelectedIds.length > 0;

  /** Pending changes for the confirmation dialog — computed at the moment
   *  the admin clicks Save, then committed only after they confirm. */
  const pendingChanges = useMemo(
    () =>
      selectedEntries.map(([id, d]) => ({
        id,
        name: products.find((p) => p.id === id)?.name || id,
        prevStock: originalById[id]?.stock ?? "",
        nextStock: Number(d.stock),
        prevPurchase: originalById[id]?.purchase_cost ?? "",
        nextPurchase: d.purchase_cost.trim() === "" ? null : Number(d.purchase_cost),
      })),
    [selectedEntries, products, originalById],
  );

  const openConfirm = () => {
    if (hasInvalidSelected) {
      toast({
        title: "ভুল মান আছে",
        description: `${invalidSelectedIds.length}টি রোতে নেগেটিভ বা ভুল মান — ঠিক করুন`,
        variant: "destructive",
      });
      return;
    }
    if (pendingChanges.length === 0) {
      toast({ title: "কোনো পরিবর্তন নির্বাচন করা হয়নি", variant: "destructive" });
      return;
    }
    setConfirmOpen(true);
  };

  /** Commit path — runs after the admin confirms in the AlertDialog.
   *  Optimistic UI: parent list refresh happens as soon as any update
   *  succeeds. On per-row failure we roll that row's draft back to its
   *  original values so the visible state matches the DB. */
  const commit = async () => {
    setConfirmOpen(false);
    setSaving(true);
    const failedIds: string[] = [];
    let ok = 0;
    for (const c of pendingChanges) {
      const { error } = await supabase
        .from("products")
        .update({ stock: c.nextStock, purchase_cost: c.nextPurchase })
        .eq("id", c.id);
      if (error) failedIds.push(c.id);
      else ok++;
    }
    setSaving(false);

    // Rollback failed rows to their original snapshot values.
    if (failedIds.length > 0) {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of failedIds) {
          const orig = originalById[id];
          if (orig && next[id]) {
            next[id] = { ...next[id], stock: orig.stock, purchase_cost: orig.purchase_cost };
          }
        }
        return next;
      });
    }

    toast({
      title: failedIds.length === 0 ? "ইনভেন্টরি আপডেট হয়েছে" : "কিছু আপডেট ব্যর্থ — রোলব্যাক করা হয়েছে",
      description: `${ok}টি সফল · ${failedIds.length}টি ব্যর্থ`,
      variant: failedIds.length === 0 ? "default" : "destructive",
    });

    if (ok > 0) onSaved();
    if (failedIds.length === 0) onOpenChange(false);
  };

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((p) => drafts[p.id]?.selected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk inventory update</DialogTitle>
          <DialogDescription>
            Update stock and purchase cost for multiple products at once. Only checked rows are
            saved. Negative or non-numeric values block saving.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search by name / SKU / category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {selectedCount} selected
            {hasInvalidSelected && (
              <span className="ml-2 text-destructive font-medium">
                · {invalidSelectedIds.length} invalid
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left">
                <th className="p-2 w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                    aria-label="Select all visible"
                  />
                </th>
                <th className="p-2">Product</th>
                <th className="p-2 w-32">Stock</th>
                <th className="p-2 w-36">Purchase ৳</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const d = drafts[p.id];
                if (!d) return null;
                const errs = validateRow(d);
                const hasErr = d.selected && Object.keys(errs).length > 0;
                return (
                  <tr
                    key={p.id}
                    className={`border-t ${hasErr ? "bg-destructive/5" : ""}`}
                    data-testid="bulk-inventory-row"
                  >
                    <td className="p-2 align-top">
                      <Checkbox
                        checked={d.selected}
                        onCheckedChange={(v) => setDraft(p.id, { selected: Boolean(v) })}
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.sku || "—"} · {p.category}
                      </div>
                    </td>
                    <td className="p-2 align-top">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={d.stock}
                        onChange={(e) => setDraft(p.id, { stock: e.target.value })}
                        aria-label={`Stock for ${p.name}`}
                        aria-invalid={Boolean(errs.stock)}
                        className={errs.stock ? "border-destructive focus-visible:ring-destructive" : ""}
                      />
                      {errs.stock && (
                        <p className="mt-1 text-[11px] text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {errs.stock}
                        </p>
                      )}
                    </td>
                    <td className="p-2 align-top">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={d.purchase_cost}
                        onChange={(e) => setDraft(p.id, { purchase_cost: e.target.value })}
                        aria-label={`Purchase cost for ${p.name}`}
                        aria-invalid={Boolean(errs.purchase_cost)}
                        className={
                          errs.purchase_cost
                            ? "border-destructive focus-visible:ring-destructive"
                            : ""
                        }
                      />
                      {errs.purchase_cost && (
                        <p className="mt-1 text-[11px] text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {errs.purchase_cost}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No products match the current search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={openConfirm}
            disabled={saving || selectedCount === 0 || hasInvalidSelected}
            data-testid="bulk-inventory-save"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save {selectedCount > 0 ? `${selectedCount} ` : ""}changes
          </Button>
        </DialogFooter>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm bulk inventory changes</AlertDialogTitle>
              <AlertDialogDescription>
                আপনি {pendingChanges.length}টি প্রোডাক্টের stock/purchase_cost আপডেট করতে যাচ্ছেন।
                ব্যর্থ রোগুলো স্বয়ংক্রিয়ভাবে রোলব্যাক হবে; সফল রোগুলো ফিরিয়ে আনতে ম্যানুয়াল edit লাগবে।
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="max-h-64 overflow-y-auto rounded-md border text-xs">
              <table className="w-full">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">Product</th>
                    <th className="p-2 w-28">Stock</th>
                    <th className="p-2 w-32">Purchase ৳</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingChanges.map((c) => {
                    const stockChanged = String(c.nextStock) !== String(c.prevStock);
                    const pcChanged =
                      String(c.nextPurchase ?? "") !== String(c.prevPurchase ?? "");
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="p-2 truncate max-w-[220px]">{c.name}</td>
                        <td className={`p-2 ${stockChanged ? "font-medium" : "text-muted-foreground"}`}>
                          {c.prevStock} → {c.nextStock}
                        </td>
                        <td className={`p-2 ${pcChanged ? "font-medium" : "text-muted-foreground"}`}>
                          {c.prevPurchase || "—"} → {c.nextPurchase ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); void commit(); }}
                disabled={saving}
                data-testid="bulk-inventory-confirm"
              >
                {saving ? "সেভ হচ্ছে..." : `Yes, update ${pendingChanges.length}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
