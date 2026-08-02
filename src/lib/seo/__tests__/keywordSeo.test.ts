import { describe, it, expect } from "vitest";
import {
  KEYWORD_LANDING_PAGES,
  ALL_TARGET_KEYWORDS,
  validateKeywordPages,
  getLandingPage,
} from "@/lib/seo/keywordLandingPages";
import { auditKeywordCoverage, coverageSummary } from "@/lib/seo/keywordCoverage";

describe("keyword landing pages", () => {
  it("has no H1 / title / description drift", () => {
    expect(validateKeywordPages()).toEqual([]);
  });

  it("gives every page a unique slug and resolvable related links", () => {
    const slugs = KEYWORD_LANDING_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const p of KEYWORD_LANDING_PAGES) {
      for (const r of p.related) expect(getLandingPage(r)).toBeTruthy();
    }
  });

  it("keeps the visible H1 identical to the configured heading source", () => {
    for (const p of KEYWORD_LANDING_PAGES) {
      expect(p.h1.trim()).toBe(p.h1);
      expect(p.h1.toLowerCase()).toContain(p.primaryKeyword.toLowerCase());
    }
  });

  it("detects an injected H1 mismatch", () => {
    const broken = [{ ...KEYWORD_LANDING_PAGES[0], h1: "কিছু একটা" }];
    const issues = validateKeywordPages(broken);
    expect(issues.some((i) => i.field === "h1")).toBe(true);
  });
});

describe("keyword coverage audit", () => {
  it("covers every target keyword on at least one page", () => {
    const rows = auditKeywordCoverage();
    const missing = rows.filter((r) => r.strength === "missing").map((r) => r.keyword);
    expect(missing).toEqual([]);
    expect(coverageSummary(rows).total).toBe(ALL_TARGET_KEYWORDS.length);
  });

  it("marks a keyword strong only when a page has it in title and heading", () => {
    const rows = auditKeywordCoverage();
    for (const p of KEYWORD_LANDING_PAGES) {
      const row = rows.find((r) => r.keyword === p.primaryKeyword)!;
      expect(row.strength).toBe("strong");
    }
  });
});
