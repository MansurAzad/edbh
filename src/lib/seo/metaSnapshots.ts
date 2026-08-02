/**
 * Meta snapshots + diff.
 *
 * Before publishing we compare the meta/OpenGraph/canonical/JSON-LD that the
 * app *will* render against the last published snapshot, so no SEO change
 * ships unnoticed.
 */
import { supabase } from "@/integrations/supabase/client";

export interface MetaSnapshotPayload {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: string;
  keywords: string;
  jsonLd: unknown[];
}

export interface StoredSnapshot {
  entry_key: string;
  path: string;
  snapshot: MetaSnapshotPayload;
  updated_at: string;
}

export type DiffKind = "added" | "removed" | "changed" | "unchanged";

export interface FieldDiff {
  field: keyof MetaSnapshotPayload | "jsonLd";
  before: string;
  after: string;
  kind: DiffKind;
}

export interface EntryDiff {
  entryKey: string;
  path: string;
  label: string;
  kind: DiffKind;
  fields: FieldDiff[];
  lastPublishedAt?: string;
}

const stringify = (v: unknown) =>
  typeof v === "string" ? v : v == null ? "" : JSON.stringify(v, null, 2);

const FIELDS: (keyof MetaSnapshotPayload)[] = [
  "title",
  "description",
  "canonical",
  "ogTitle",
  "ogDescription",
  "ogImage",
  "ogType",
  "keywords",
  "jsonLd",
];

/** Loads the last published snapshots keyed by entry key. */
export async function fetchSnapshots(): Promise<Map<string, StoredSnapshot>> {
  const { data, error } = await supabase
    .from("seo_meta_snapshots")
    .select("entry_key, path, snapshot, updated_at");
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.entry_key, r as unknown as StoredSnapshot]));
}

/** Stores the current state as the new published baseline. */
export async function publishSnapshots(
  entries: { entryKey: string; path: string; snapshot: MetaSnapshotPayload }[],
) {
  if (entries.length === 0) return 0;
  const { data: session } = await supabase.auth.getUser();
  const { error } = await supabase.from("seo_meta_snapshots").upsert(
    entries.map((e) => ({
      entry_key: e.entryKey,
      path: e.path,
      snapshot: e.snapshot as never,
      published_by: session?.user?.id ?? null,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "entry_key" },
  );
  if (error) throw error;
  return entries.length;
}

/** Diffs current entries against stored snapshots. */
export function diffEntries(
  current: { entryKey: string; path: string; label: string; snapshot: MetaSnapshotPayload }[],
  stored: Map<string, StoredSnapshot>,
): EntryDiff[] {
  const diffs: EntryDiff[] = [];
  const seen = new Set<string>();

  for (const entry of current) {
    seen.add(entry.entryKey);
    const previous = stored.get(entry.entryKey);
    if (!previous) {
      diffs.push({
        entryKey: entry.entryKey,
        path: entry.path,
        label: entry.label,
        kind: "added",
        fields: FIELDS.map((f) => ({
          field: f,
          before: "",
          after: stringify(entry.snapshot[f]),
          kind: "added" as DiffKind,
        })).filter((f) => f.after),
      });
      continue;
    }

    const fields: FieldDiff[] = [];
    for (const field of FIELDS) {
      const before = stringify(previous.snapshot?.[field]);
      const after = stringify(entry.snapshot[field]);
      if (before !== after) fields.push({ field, before, after, kind: "changed" });
    }
    diffs.push({
      entryKey: entry.entryKey,
      path: entry.path,
      label: entry.label,
      kind: fields.length ? "changed" : "unchanged",
      fields,
      lastPublishedAt: previous.updated_at,
    });
  }

  // Pages that existed in the last snapshot but no longer render.
  for (const [key, snap] of stored) {
    if (seen.has(key)) continue;
    diffs.push({
      entryKey: key,
      path: snap.path,
      label: snap.path,
      kind: "removed",
      fields: [],
      lastPublishedAt: snap.updated_at,
    });
  }

  const order: Record<DiffKind, number> = { changed: 0, added: 1, removed: 2, unchanged: 3 };
  return diffs.sort((a, b) => order[a.kind] - order[b.kind] || a.path.localeCompare(b.path));
}

export function diffSummary(diffs: EntryDiff[]) {
  return {
    changed: diffs.filter((d) => d.kind === "changed").length,
    added: diffs.filter((d) => d.kind === "added").length,
    removed: diffs.filter((d) => d.kind === "removed").length,
    unchanged: diffs.filter((d) => d.kind === "unchanged").length,
  };
}
