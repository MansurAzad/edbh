/**
 * @file BulkInventoryDialog.tsx
 * @description Admin tool to update `stock` and `purchase_cost` for many
 * products in a single dialog. Rows are pre-filtered by the parent (e.g. the
 * currently visible / low-stock subset) and admins can search within the list,
 * edit values inline, then save all changes in one Supabase update batch.
 *
 * বাংলা: একসাথে অনেক প্রোডাক্টের stock এবং purchase_cost আপডেট করার টুল।
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
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

/** Build the initial draft map from an incoming product list. */
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

  const selectedCount = Object.values(drafts).filter((d) => d.selected).length;

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

  const handleSave = async () => {
    const changes = Object.entries(drafts)
      .filter(([, d]) => d.selected)
      .map(([id, d]) => ({
        id,
        stock: Number(d.stock) || 0,
        purchase_cost: d.purchase_cost === "" ? null : Number(d.purchase_cost),
      }));

    if (changes.length === 0) {
      toast({ title: "কোনো পরিবর্তন নির্বাচন করা হয়নি", variant: "destructive" });
      return;
    }

    setSaving(true);
    let ok = 0;
    let failed = 0;
    for (const c of changes) {
      const { error } = await supabase
        .from("products")
        .update({ stock: c.stock, purchase_cost: c.purchase_cost })
        .eq("id", c.id);
      if (error) failed++;
      else ok++;
    }
    setSaving(false);

    toast({
      title: failed === 0 ? "ইনভেন্টরি আপডেট হয়েছে" : "কিছু আপডেট ব্যর্থ",
      description: `${ok}টি সফল · ${failed}টি ব্যর্থ`,
      variant: failed === 0 ? "default" : "destructive",
    });

    if (ok > 0) {
      onSaved();
      onOpenChange(false);
    }
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
            saved.
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
                <th className="p-2 w-28">Stock</th>
                <th className="p-2 w-32">Purchase ৳</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const d = drafts[p.id];
                if (!d) return null;
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">
                      <Checkbox
                        checked={d.selected}
                        onCheckedChange={(v) => setDraft(p.id, { selected: Boolean(v) })}
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.sku || "—"} · {p.category}
                      </div>
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={0}
                        value={d.stock}
                        onChange={(e) => setDraft(p.id, { stock: e.target.value })}
                        aria-label={`Stock for ${p.name}`}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={0}
                        value={d.purchase_cost}
                        onChange={(e) => setDraft(p.id, { purchase_cost: e.target.value })}
                        aria-label={`Purchase cost for ${p.name}`}
                      />
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
          <Button onClick={handleSave} disabled={saving || selectedCount === 0}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save {selectedCount > 0 ? `${selectedCount} ` : ""}changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
