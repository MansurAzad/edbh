/**
 * @file DuplicateCompareDialog.tsx
 * @description Side-by-side details/compare modal for the "duplicates" audit
 * filter. Given a focus product, lists every other product whose name and/or
 * description is a near-duplicate (based on cheap client-side similarity of
 * name+description). Purely presentational — parent supplies the full product
 * list so no extra network calls are needed.
 */
import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  DESCRIPTION_VERIFY_META,
  getDescriptionVerifyDetail,
  type AdminProduct,
} from "@/lib/admin/productHelpers";

interface Props {
  focus: AdminProduct | null;
  allProducts: AdminProduct[];
  onOpenChange: (open: boolean) => void;
}

/** Character-trigram Jaccard similarity — good enough for admin-side triage. */
function trigramSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const A = norm(a);
  const B = norm(b);
  if (!A || !B) return 0;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const ga = grams(A);
  const gb = grams(B);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  ga.forEach((g) => { if (gb.has(g)) inter += 1; });
  return inter / (ga.size + gb.size - inter);
}

export default function DuplicateCompareDialog({ focus, allProducts, onOpenChange }: Props) {
  const matches = useMemo(() => {
    if (!focus) return [];
    const focusName = focus.name.trim().toLowerCase();
    const focusDesc = (focus.description || "").trim();
    return allProducts
      .filter((p) => p.id !== focus.id)
      .map((p) => {
        const nameSim = trigramSimilarity(focus.name, p.name);
        const descSim = focusDesc && p.description
          ? trigramSimilarity(focusDesc, p.description)
          : 0;
        const nameMatch = p.name.trim().toLowerCase() === focusName;
        return { product: p, nameSim, descSim, nameMatch };
      })
      .filter((m) => m.nameMatch || m.nameSim >= 0.7 || m.descSim >= 0.7)
      .sort((a, b) => Math.max(b.nameSim, b.descSim) - Math.max(a.nameSim, a.descSim))
      .slice(0, 12);
  }, [focus, allProducts]);

  const focusStatus = focus ? getDescriptionVerifyStatus(focus.description) : "pass";

  return (
    <Dialog open={!!focus} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Compare near-duplicates — {focus?.name}
          </DialogTitle>
        </DialogHeader>

        {focus && (
          <div className="space-y-4">
            <section className="rounded-lg border p-3 bg-muted/30">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Focused product</div>
                  <div className="font-medium">{focus.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {focus.category}{focus.subcategory ? ` · ${focus.subcategory}` : ""}
                  </div>
                </div>
                <Badge variant="outline" className={`text-xs ${DESCRIPTION_VERIFY_META[focusStatus].badge}`}>
                  Desc: {DESCRIPTION_VERIFY_META[focusStatus].label}
                </Badge>
              </div>
              <p className="text-xs mt-2 whitespace-pre-wrap line-clamp-6">
                {focus.description || <span className="text-muted-foreground italic">(কোন ডেসক্রিপশন নেই)</span>}
              </p>
            </section>

            <div>
              <div className="text-xs text-muted-foreground mb-2">
                Near-duplicate matches ({matches.length})
              </div>
              {matches.length === 0 ? (
                <div className="text-sm text-muted-foreground rounded-md border border-dashed p-4 text-center">
                  কাছাকাছি কোন ডুপ্লিকেট পাওয়া যায়নি (name/description similarity ≥ 70%)।
                </div>
              ) : (
                <ul className="space-y-2">
                  {matches.map((m) => {
                    const s = getDescriptionVerifyStatus(m.product.description);
                    return (
                      <li key={m.product.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{m.product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {m.product.category}{m.product.subcategory ? ` · ${m.product.subcategory}` : ""}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant="outline" className={`text-xs ${DESCRIPTION_VERIFY_META[s].badge}`}>
                              Desc: {DESCRIPTION_VERIFY_META[s].label}
                            </Badge>
                            <div className="text-[10px] text-muted-foreground">
                              name {(m.nameSim * 100).toFixed(0)}% · desc {(m.descSim * 100).toFixed(0)}%
                              {m.nameMatch && <span className="ml-1 text-red-600 font-medium">exact name</span>}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs mt-2 whitespace-pre-wrap line-clamp-4">
                          {m.product.description || <span className="text-muted-foreground italic">(কোন ডেসক্রিপশন নেই)</span>}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
