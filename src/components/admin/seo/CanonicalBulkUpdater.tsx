import { useEffect, useMemo, useState } from "react";
import { Check, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

import { auditCannibalization } from "@/lib/seo/cannibalization";
import {
  applyCanonicalOverrides,
  buildCanonicalProposals,
  fetchCanonicalOverrides,
  removeCanonicalOverride,
  absoluteCanonical,
  type CanonicalOverride,
  type CanonicalProposal,
} from "@/lib/seo/canonicalOverrides";

/**
 * Admin bulk updater: reads the cannibalisation suggestions, lets the admin
 * tick the pages to re-canonicalise, and applies them all in one save.
 */
const CanonicalBulkUpdater = () => {
  const [existing, setExisting] = useState<CanonicalOverride[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => auditCannibalization(), []);

  const load = async () => {
    setLoading(true);
    try {
      setExisting(await fetchCanonicalOverrides());
    } catch (e) {
      toast.error("Canonical override লোড করা যায়নি", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const proposals: CanonicalProposal[] = useMemo(
    () => buildCanonicalProposals(rows, existing),
    [rows, existing],
  );

  const pending = proposals.filter((p) => !p.alreadyApplied);
  const selectedProposals = pending.filter((p) => selected[`${p.path}→${p.canonical_path}`]);

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    for (const p of pending) next[`${p.path}→${p.canonical_path}`] = checked;
    setSelected(next);
  };

  const apply = async () => {
    if (selectedProposals.length === 0) return;
    setSaving(true);
    try {
      const count = await applyCanonicalOverrides(selectedProposals);
      toast.success(`${count}টি canonical override প্রয়োগ হয়েছে`);
      setSelected({});
      await load();
    } catch (e) {
      toast.error("প্রয়োগ ব্যর্থ", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (path: string) => {
    try {
      await removeCanonicalOverride(path);
      toast.success("Override সরানো হয়েছে");
      await load();
    } catch (e) {
      toast.error("সরানো যায়নি", { description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4" /> Canonical ও রি-টার্গেটিং bulk updater
          </CardTitle>
          <CardDescription>
            ক্যানিবালাইজেশন রিপোর্টের সাজেশন অনুযায়ী একসাথে canonical সেট করুন।
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> রিফ্রেশ
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Pending proposals ─────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              প্রস্তাবিত পরিবর্তন <Badge variant="secondary">{pending.length}</Badge>
            </p>
            {pending.length > 0 && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => toggleAll(true)}>
                  সব নির্বাচন
                </Button>
                <Button size="sm" onClick={() => void apply()} disabled={saving || selectedProposals.length === 0}>
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                  {selectedProposals.length}টি প্রয়োগ করুন
                </Button>
              </div>
            )}
          </div>

          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              কোনো high-risk ক্যানিবালাইজেশন নেই — canonical পরিবর্তনের দরকার নেই। ✅
            </p>
          ) : (
            <ul className="space-y-2">
              {pending.map((p) => {
                const key = `${p.path}→${p.canonical_path}`;
                return (
                  <li key={key} className="flex gap-3 rounded-md border p-3 text-sm">
                    <Checkbox
                      id={key}
                      checked={Boolean(selected[key])}
                      onCheckedChange={(v) => setSelected((s) => ({ ...s, [key]: Boolean(v) }))}
                      aria-label={`${p.path} canonical পরিবর্তন নির্বাচন করুন`}
                    />
                    <div className="space-y-1">
                      <p className="font-medium">
                        <span className="font-mono text-xs">{p.path}</span>
                        <span className="mx-1.5 text-muted-foreground">→</span>
                        <span className="font-mono text-xs">{p.canonical_path}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        কীওয়ার্ড: <Badge variant="outline">{p.target_keyword}</Badge> · owner: {p.ownerLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">{p.note}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Applied overrides ─────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            প্রয়োগকৃত override <Badge variant="secondary">{existing.length}</Badge>
          </p>
          {existing.length === 0 ? (
            <p className="text-xs text-muted-foreground">এখনো কোনো override সংরক্ষিত নেই।</p>
          ) : (
            <ul className="space-y-1.5">
              {existing.map((o) => (
                <li key={o.path} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                  <span className="font-mono truncate">
                    {o.path} → {absoluteCanonical(o.canonical_path)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => void remove(o.path)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CanonicalBulkUpdater;
