import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitCompare, Loader2, Save, Plus, Minus, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

import {
  diffEntries,
  diffSummary,
  fetchSnapshots,
  publishSnapshots,
  type EntryDiff,
  type MetaSnapshotPayload,
} from "@/lib/seo/metaSnapshots";

export interface DiffSourceEntry {
  entryKey: string;
  path: string;
  label: string;
  snapshot: MetaSnapshotPayload;
}

const kindMeta: Record<EntryDiff["kind"], { label: string; variant: "secondary" | "outline" | "destructive"; Icon: typeof Plus }> = {
  changed: { label: "পরিবর্তিত", variant: "secondary", Icon: PencilLine },
  added: { label: "নতুন", variant: "outline", Icon: Plus },
  removed: { label: "মুছে গেছে", variant: "destructive", Icon: Minus },
  unchanged: { label: "অপরিবর্তিত", variant: "outline", Icon: PencilLine },
};

/**
 * Pre-publish diff: compares the meta/OG/canonical/JSON-LD that will render
 * now against the last published snapshot, so nothing ships unnoticed.
 */
const SeoDiffPanel = ({ entries }: { entries: DiffSourceEntry[] }) => {
  const [publishing, setPublishing] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const { data: stored, isLoading, refetch } = useQuery({
    queryKey: ["seo-meta-snapshots"],
    queryFn: fetchSnapshots,
  });

  const diffs = useMemo(
    () => (stored ? diffEntries(entries, stored) : []),
    [entries, stored],
  );
  const summary = useMemo(() => diffSummary(diffs), [diffs]);
  const visible = diffs.filter((d) => showUnchanged || d.kind !== "unchanged");

  const publish = async () => {
    setPublishing(true);
    try {
      const count = await publishSnapshots(entries);
      toast.success(`${count}টি পেজের SEO snapshot বেসলাইন হিসেবে সংরক্ষিত হয়েছে`);
      await refetch();
    } catch (e) {
      toast.error("Snapshot সংরক্ষণ ব্যর্থ", { description: (e as Error).message });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompare className="w-4 h-4" /> প্রকাশ-পূর্ব ডিফ প্রিভিউ
          </CardTitle>
          <CardDescription>
            মেটা টাইটেল/ডিসক্রিপশন, OpenGraph, canonical ও JSON-LD-এর পরিবর্তন শেষ প্রকাশিত snapshot-এর সাথে তুলনা।
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => void publish()} disabled={publishing || isLoading}>
          {publishing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Snapshot সংরক্ষণ
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        <div aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">পরিবর্তিত {summary.changed}</Badge>
          <Badge variant="outline">নতুন {summary.added}</Badge>
          <Badge variant="destructive">মুছে গেছে {summary.removed}</Badge>
          <Badge variant="outline">অপরিবর্তিত {summary.unchanged}</Badge>
          <Button variant="ghost" size="sm" onClick={() => setShowUnchanged((v) => !v)}>
            {showUnchanged ? "অপরিবর্তিতগুলো লুকান" : "অপরিবর্তিতও দেখান"}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">লোড হচ্ছে...</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            শেষ snapshot-এর তুলনায় কোনো SEO পরিবর্তন নেই — নিরাপদে প্রকাশ করা যাবে। ✅
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((d) => {
              const { label, variant, Icon } = kindMeta[d.kind];
              return (
                <li key={d.entryKey} className="rounded-md border p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{d.label}</span>
                      <span className="block font-mono text-muted-foreground truncate">{d.path}</span>
                    </span>
                    <Badge variant={variant}>
                      <Icon className="w-3 h-3 mr-1" />
                      {label}
                    </Badge>
                  </div>

                  {d.fields.map((f) => (
                    <div key={String(f.field)} className="grid gap-1 sm:grid-cols-2">
                      <div className="rounded bg-destructive/10 p-2">
                        <p className="font-medium text-destructive">− {String(f.field)}</p>
                        <pre className="whitespace-pre-wrap break-words text-[11px]">{f.before || "—"}</pre>
                      </div>
                      <div className="rounded bg-primary/10 p-2">
                        <p className="font-medium text-primary">+ {String(f.field)}</p>
                        <pre className="whitespace-pre-wrap break-words text-[11px]">{f.after || "—"}</pre>
                      </div>
                    </div>
                  ))}

                  {d.lastPublishedAt && (
                    <p className="text-muted-foreground">
                      শেষ প্রকাশ: {new Date(d.lastPublishedAt).toLocaleString("bn-BD")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default SeoDiffPanel;
