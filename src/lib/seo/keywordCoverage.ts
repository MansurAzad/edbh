/**
 * @file keywordCoverage.ts
 * Static manifest of the SEO copy that ships on each public page, plus the
 * coverage-audit computation used by /admin/seo-keywords.
 *
 * The landing pages are derived automatically from `KEYWORD_LANDING_PAGES`,
 * so the manifest below only needs the hand-written pages.
 */

import {
  KEYWORD_LANDING_PAGES,
  ALL_TARGET_KEYWORDS,
} from "./keywordLandingPages";

export interface PageSeoCopy {
  path: string;
  label: string;
  title: string;
  description: string;
  headings: string[];
  /** Visible body copy that intentionally carries keywords. */
  visibleText: string[];
}

/** Hand-maintained pages (kept in sync with the components that render them). */
export const STATIC_PAGE_COPY: PageSeoCopy[] = [
  {
    path: "/",
    label: "Homepage",
    title: "Dubai Borka Price in Bangladesh – Best Borka Shop in Bangladesh",
    description:
      "Original Dubai borka in Bangladesh — luxury borka Bangladesh, premium black borka, Dubai imported abaya Bangladesh, two part Farasha borka, plus size ও custom size abaya। Online borka shopping in Bangladesh, cash on delivery borka, borka shop in Dhaka।",
    headings: ["Original Dubai Borka in Bangladesh — Luxury Borka Bangladesh"],
    visibleText: [
      "Dubai imported abaya Bangladesh — Two Part Farasha Borka, Four Part Abaya Bangladesh, Korean Nida Borka, Dubai Cherry Fabric Borka ও Premium Black Borka। Borka with matching hijab, custom size abaya Bangladesh ও Dubai borka price in Bangladesh এক জায়গায়।",
    ],
  },
  {
    path: "/shop",
    label: "Shop",
    title: "Best Borka Shop in Bangladesh – Dubai Borka Price & Abaya",
    description:
      "Best borka shop in Bangladesh — original Dubai borka in Bangladesh, Dubai imported abaya Bangladesh, luxury borka Bangladesh, plus size ও custom size abaya। Online borka shopping in Bangladesh, cash on delivery borka, borka shop in Dhaka ও wholesale borka in Bangladesh।",
    headings: ["Best Borka Shop in Bangladesh"],
    visibleText: [
      "Original Dubai borka in Bangladesh — luxury borka Bangladesh, premium black borka, two part Farasha borka, four part abaya, Korean Nida borka, plus size ও custom size abaya। Online borka shopping in Bangladesh, cash on delivery borka।",
    ],
  },
  {
    path: "/categories",
    label: "Categories",
    title: "Borka Shop in Dhaka – Online Borka Shopping in Bangladesh",
    description:
      "Online borka shopping in Bangladesh — best borka shop in Bangladesh, borka shop in Dhaka, Dubai imported abaya Bangladesh, plus size ও custom size abaya, wholesale borka in Bangladesh। Cash on delivery borka।",
    headings: ["Borka Shop in Dhaka"],
    visibleText: [
      "Online borka shopping in Bangladesh — best borka shop in Bangladesh, wholesale borka in Bangladesh ও cash on delivery borka।",
    ],
  },
];

/** Landing pages, projected into the same shape. */
export const LANDING_PAGE_COPY: PageSeoCopy[] = KEYWORD_LANDING_PAGES.map((p) => ({
  path: `/collections/${p.slug}`,
  label: p.primaryKeyword,
  title: p.title,
  description: p.description,
  headings: [p.h1],
  visibleText: [p.intro, ...p.highlights],
}));

export const ALL_PAGE_COPY: PageSeoCopy[] = [...STATIC_PAGE_COPY, ...LANDING_PAGE_COPY];

export type CoverageField = "title" | "description" | "heading" | "text";

export interface PageKeywordHit {
  path: string;
  label: string;
  fields: CoverageField[];
}

export interface KeywordCoverageRow {
  keyword: string;
  hits: PageKeywordHit[];
  /** A keyword is "strong" when at least one page has it in title AND heading. */
  strength: "strong" | "partial" | "missing";
}

const has = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

export function auditKeywordCoverage(
  keywords: string[] = ALL_TARGET_KEYWORDS,
  pages: PageSeoCopy[] = ALL_PAGE_COPY,
): KeywordCoverageRow[] {
  return keywords.map((keyword) => {
    const hits: PageKeywordHit[] = [];
    for (const page of pages) {
      const fields: CoverageField[] = [];
      if (has(page.title, keyword)) fields.push("title");
      if (has(page.description, keyword)) fields.push("description");
      if (page.headings.some((h) => has(h, keyword))) fields.push("heading");
      if (page.visibleText.some((t) => has(t, keyword))) fields.push("text");
      if (fields.length) hits.push({ path: page.path, label: page.label, fields });
    }
    const strong = hits.some(
      (h) => h.fields.includes("title") && h.fields.includes("heading"),
    );
    return {
      keyword,
      hits,
      strength: hits.length === 0 ? "missing" : strong ? "strong" : "partial",
    };
  });
}

export function coverageSummary(rows: KeywordCoverageRow[]) {
  return {
    total: rows.length,
    strong: rows.filter((r) => r.strength === "strong").length,
    partial: rows.filter((r) => r.strength === "partial").length,
    missing: rows.filter((r) => r.strength === "missing").length,
  };
}

export function coverageToCsv(rows: KeywordCoverageRow[]): string {
  const head = ["Keyword", "Strength", "Pages", "Fields"];
  const body = rows.map((r) => [
    r.keyword,
    r.strength,
    r.hits.map((h) => h.path).join(" | "),
    r.hits.map((h) => `${h.path}:${h.fields.join("+")}`).join(" | "),
  ]);
  return [head, ...body]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
