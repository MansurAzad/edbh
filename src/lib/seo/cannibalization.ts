/**
 * @file cannibalization.ts
 * Automated keyword-cannibalisation report.
 *
 * Two or more pages that target the SAME primary/secondary keyword in their
 * title or H1 compete with each other in Google. This module detects that,
 * picks the page that should own the keyword, and emits concrete
 * canonical / re-targeting suggestions for every other page.
 */

import {
  ALL_PAGE_COPY,
  auditKeywordCoverage,
  type PageSeoCopy,
  type CoverageField,
} from "./keywordCoverage";
import { ALL_TARGET_KEYWORDS } from "./keywordLandingPages";
import { PRIMARY_KEYWORDS } from "./metaGenerator";
import { dedupeKeywords } from "./keywordTaxonomy";

export type CannibalSeverity = "high" | "medium" | "none";

export interface CannibalPage {
  path: string;
  label: string;
  fields: CoverageField[];
  /** Weighted strength of this page's claim on the keyword. */
  score: number;
}

export interface CannibalRow {
  keyword: string;
  severity: CannibalSeverity;
  /** Page that should keep targeting the keyword (highest score). */
  owner?: CannibalPage;
  /** Pages that compete with the owner. */
  competitors: CannibalPage[];
  /** Actionable canonical / targeting advice (Bengali, admin-facing). */
  suggestions: string[];
}

/** Field weights — title and H1 are what actually causes cannibalisation. */
const FIELD_WEIGHT: Record<CoverageField, number> = {
  title: 5,
  heading: 4,
  description: 2,
  text: 1,
};

const scoreFields = (fields: CoverageField[]) =>
  fields.reduce((sum, f) => sum + FIELD_WEIGHT[f], 0);

/** Keywords we monitor: landing-page targets + the primary strategy set. */
export const MONITORED_KEYWORDS: string[] = dedupeKeywords([
  ...ALL_TARGET_KEYWORDS,
  ...PRIMARY_KEYWORDS,
]);

/**
 * Builds the cannibalisation report.
 * A keyword is `high` risk when 2+ pages carry it in title AND/OR heading,
 * `medium` when a competitor only overlaps in description/body copy.
 */
export function auditCannibalization(
  keywords: string[] = MONITORED_KEYWORDS,
  pages: PageSeoCopy[] = ALL_PAGE_COPY,
): CannibalRow[] {
  const coverage = auditKeywordCoverage(keywords, pages);

  return coverage.map(({ keyword, hits }) => {
    const scored: CannibalPage[] = hits
      .map((h) => ({ ...h, score: scoreFields(h.fields) }))
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

    const [owner, ...competitors] = scored;
    const strongCompetitors = competitors.filter(
      (c) => c.fields.includes("title") || c.fields.includes("heading"),
    );

    let severity: CannibalSeverity = "none";
    if (strongCompetitors.length > 0) severity = "high";
    else if (competitors.length > 0) severity = "medium";

    const suggestions: string[] = [];
    if (severity === "high" && owner) {
      suggestions.push(
        `"${keyword}" কীওয়ার্ডের প্রাইমারি টার্গেট রাখুন ${owner.path} পেজে (সবচেয়ে শক্তিশালী সিগন্যাল)।`,
      );
      for (const c of strongCompetitors) {
        suggestions.push(
          `${c.path} পেজের title/H1 থেকে "${keyword}" সরিয়ে একটি ইউনিক long-tail ভ্যারিয়েন্ট ব্যবহার করুন, এবং ${owner.path}-এ internal link দিন।`,
        );
        suggestions.push(
          `যদি ${c.path} ও ${owner.path}-এর কনটেন্ট প্রায় একই হয়, তবে ${c.path}-এ canonical সেট করুন: <link rel="canonical" href="https://dubaiborkahouse.com${owner.path}" />`,
        );
      }
    } else if (severity === "medium" && owner) {
      suggestions.push(
        `"${keyword}" শুধু ${owner.path}-এর title/H1-এ রাখুন; বাকি পেজে এটি supporting text হিসেবেই থাকুক — canonical পরিবর্তনের দরকার নেই।`,
      );
    }

    return { keyword, severity, owner, competitors, suggestions };
  });
}

export interface CannibalSummary {
  total: number;
  high: number;
  medium: number;
  clean: number;
}

export function cannibalizationSummary(rows: CannibalRow[]): CannibalSummary {
  return {
    total: rows.length,
    high: rows.filter((r) => r.severity === "high").length,
    medium: rows.filter((r) => r.severity === "medium").length,
    clean: rows.filter((r) => r.severity === "none").length,
  };
}

export function cannibalizationToCsv(rows: CannibalRow[]): string {
  const head = ["Keyword", "Severity", "Owner page", "Competing pages", "Suggestions"];
  const body = rows.map((r) => [
    r.keyword,
    r.severity,
    r.owner?.path ?? "",
    r.competitors.map((c) => `${c.path}(${c.fields.join("+")})`).join(" | "),
    r.suggestions.join(" || "),
  ]);
  return [head, ...body]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
