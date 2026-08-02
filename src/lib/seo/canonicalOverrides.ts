/**
 * Canonical / re-targeting bulk updater.
 *
 * Turns the cannibalisation report's suggestions into concrete canonical
 * overrides that admins can review and apply in one batch. Applied rows live
 * in `public.seo_canonical_overrides` and are read at render time so a page
 * can point its canonical at the keyword owner instead of itself.
 */
import { supabase } from "@/integrations/supabase/client";
import { BASE_URL } from "@/lib/seo/metaGenerator";
import type { CannibalRow } from "@/lib/seo/cannibalization";

export interface CanonicalOverride {
  id?: string;
  /** Page whose canonical is being overridden. */
  path: string;
  /** Page the canonical should point to (the keyword owner). */
  canonical_path: string;
  /** Keyword that triggered the change. */
  target_keyword?: string | null;
  note?: string | null;
  updated_at?: string;
}

/** A proposed change derived from the cannibalisation report (not yet saved). */
export interface CanonicalProposal extends CanonicalOverride {
  ownerLabel: string;
  competitorLabel: string;
  severity: CannibalRow["severity"];
  /** True when an identical override is already stored. */
  alreadyApplied: boolean;
}

export const absoluteCanonical = (path: string) =>
  `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/**
 * Builds one proposal per (competitor page, keyword) pair for high-risk rows.
 * Medium/none rows need no canonical change — only copy tweaks.
 */
export function buildCanonicalProposals(
  rows: CannibalRow[],
  existing: CanonicalOverride[] = [],
): CanonicalProposal[] {
  const seen = new Set<string>();
  const proposals: CanonicalProposal[] = [];

  for (const row of rows) {
    if (row.severity !== "high" || !row.owner) continue;
    const owner = row.owner;

    for (const competitor of row.competitors) {
      const isStrong =
        competitor.fields.includes("title") || competitor.fields.includes("heading");
      if (!isStrong || competitor.path === owner.path) continue;

      const key = `${competitor.path}→${owner.path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const match = existing.find(
        (e) => e.path === competitor.path && e.canonical_path === owner.path,
      );

      proposals.push({
        path: competitor.path,
        canonical_path: owner.path,
        target_keyword: row.keyword,
        note: `"${row.keyword}" কীওয়ার্ডের owner ${owner.label} (${owner.path}); ${competitor.label} সেখানেই canonical করা হলো।`,
        ownerLabel: owner.label,
        competitorLabel: competitor.label,
        severity: row.severity,
        alreadyApplied: Boolean(match),
      });
    }
  }

  return proposals;
}

export async function fetchCanonicalOverrides(): Promise<CanonicalOverride[]> {
  const { data, error } = await supabase
    .from("seo_canonical_overrides")
    .select("id, path, canonical_path, target_keyword, note, updated_at, batch_id")
    .order("path");
  if (error) throw error;
  return (data ?? []) as CanonicalOverride[];
}

export interface CanonicalBatch {
  batch_id: string;
  created_at: string;
  paths: string[];
  rolled_back: boolean;
}

/**
 * Upserts a batch of overrides and records the previous canonical of every
 * touched path, so the whole batch can be rolled back with one click.
 * Returns the batch id.
 */
export async function applyCanonicalOverrides(rows: CanonicalOverride[]): Promise<{ batchId: string; count: number }> {
  if (rows.length === 0) return { batchId: "", count: 0 };
  const batchId = crypto.randomUUID();

  const paths = rows.map((r) => r.path);
  const { data: before } = await supabase
    .from("seo_canonical_overrides")
    .select("path, canonical_path")
    .in("path", paths);
  const previous = new Map((before ?? []).map((b) => [b.path, b.canonical_path]));

  const payload = rows.map((r) => ({
    path: r.path,
    canonical_path: r.canonical_path,
    target_keyword: r.target_keyword ?? null,
    note: r.note ?? null,
    batch_id: batchId,
  }));
  const { error } = await supabase
    .from("seo_canonical_overrides")
    .upsert(payload, { onConflict: "path" });
  if (error) throw error;

  const { data: session } = await supabase.auth.getUser();
  const { error: histError } = await supabase.from("seo_canonical_history").insert(
    rows.map((r) => ({
      batch_id: batchId,
      path: r.path,
      previous_canonical_path: previous.get(r.path) ?? null,
      new_canonical_path: r.canonical_path,
      operation: "apply",
      changed_by: session?.user?.id ?? null,
    })),
  );
  if (histError) throw histError;

  return { batchId, count: payload.length };
}

/** Lists applied batches (newest first) for the rollback UI. */
export async function fetchCanonicalBatches(limit = 20): Promise<CanonicalBatch[]> {
  const { data, error } = await supabase
    .from("seo_canonical_history")
    .select("batch_id, path, created_at, rolled_back, operation")
    .eq("operation", "apply")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const batches = new Map<string, CanonicalBatch>();
  for (const row of data ?? []) {
    const existing = batches.get(row.batch_id);
    if (existing) {
      existing.paths.push(row.path);
      existing.rolled_back = existing.rolled_back && row.rolled_back;
    } else {
      batches.set(row.batch_id, {
        batch_id: row.batch_id,
        created_at: row.created_at,
        paths: [row.path],
        rolled_back: row.rolled_back,
      });
    }
  }
  return Array.from(batches.values()).slice(0, limit);
}

/**
 * One-click rollback: restores each path in the batch to the canonical it had
 * before the batch was applied (deleting the override when there was none).
 */
export async function rollbackCanonicalBatch(batchId: string): Promise<number> {
  const { data: entries, error } = await supabase
    .from("seo_canonical_history")
    .select("id, path, previous_canonical_path, rolled_back")
    .eq("batch_id", batchId)
    .eq("operation", "apply");
  if (error) throw error;

  const rows = (entries ?? []).filter((e) => !e.rolled_back);
  if (rows.length === 0) return 0;

  const restore = rows.filter((r) => r.previous_canonical_path);
  const drop = rows.filter((r) => !r.previous_canonical_path).map((r) => r.path);

  if (restore.length > 0) {
    const { error: upErr } = await supabase.from("seo_canonical_overrides").upsert(
      restore.map((r) => ({
        path: r.path,
        canonical_path: r.previous_canonical_path as string,
        batch_id: null,
      })),
      { onConflict: "path" },
    );
    if (upErr) throw upErr;
  }
  if (drop.length > 0) {
    const { error: delErr } = await supabase
      .from("seo_canonical_overrides")
      .delete()
      .in("path", drop);
    if (delErr) throw delErr;
  }

  const { error: markErr } = await supabase
    .from("seo_canonical_history")
    .update({ rolled_back: true })
    .eq("batch_id", batchId);
  if (markErr) throw markErr;

  return rows.length;
}

export async function removeCanonicalOverride(path: string) {
  const { error } = await supabase.from("seo_canonical_overrides").delete().eq("path", path);
  if (error) throw error;
}


/** Resolves the canonical URL for a path, honouring any stored override. */
export function resolveCanonical(path: string, overrides: CanonicalOverride[]): string {
  const hit = overrides.find((o) => o.path === path);
  return absoluteCanonical(hit?.canonical_path ?? path);
}
