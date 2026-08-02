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
    .select("id, path, canonical_path, target_keyword, note, updated_at")
    .order("path");
  if (error) throw error;
  return (data ?? []) as CanonicalOverride[];
}

/** Upserts a batch of overrides (one row per path). */
export async function applyCanonicalOverrides(rows: CanonicalOverride[]) {
  if (rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    path: r.path,
    canonical_path: r.canonical_path,
    target_keyword: r.target_keyword ?? null,
    note: r.note ?? null,
  }));
  const { error } = await supabase
    .from("seo_canonical_overrides")
    .upsert(payload, { onConflict: "path" });
  if (error) throw error;
  return payload.length;
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
