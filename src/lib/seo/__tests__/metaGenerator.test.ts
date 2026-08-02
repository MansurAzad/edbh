import { describe, it, expect } from "vitest";
import {
  ALL_META,
  EVERGREEN_KEYWORDS,
  PRIMARY_KEYWORDS,
  getCategoryMeta,
  getMeta,
  validateMeta,
  buildMeta,
  TITLE_MAX,
} from "@/lib/seo/metaGenerator";
import { getCategoryFaqs, getLandingFaqs } from "@/lib/seo/faqs";

describe("auto-generated meta", () => {
  it("validates clean across every category and section", () => {
    expect(validateMeta()).toEqual([]);
  });

  it("keeps every category title unique and within the SERP limit", () => {
    const titles = ALL_META.map((m) => m.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const t of titles) expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it("preserves the site's original unique/brand keywords on every page", () => {
    for (const m of ALL_META) {
      for (const ever of EVERGREEN_KEYWORDS) {
        expect(m.keywords.toLowerCase()).toContain(ever.toLowerCase());
      }
    }
  });

  it("covers the full active keyword strategy across the site", () => {
    const blob = ALL_META.map((m) => `${m.title} ${m.description} ${m.keywords} ${m.h1}`)
      .join(" ")
      .toLowerCase();
    for (const kw of PRIMARY_KEYWORDS) expect(blob).toContain(kw.toLowerCase());
  });

  it("emits complete, self-referencing OpenGraph tags", () => {
    for (const m of ALL_META) {
      expect(m.ogTitle).toContain(m.title);
      expect(m.ogDescription).toBe(m.description);
      expect(m.ogUrl).toBe(`https://dubaiborkahouse.com${m.path}`);
      expect(m.ogImage).toMatch(/^https:\/\//);
      expect(m.twitterCard).toBe("summary_large_image");
    }
  });

  it("flags a dropped evergreen keyword and an over-long title", () => {
    const bad = buildMeta({
      key: "test:bad",
      path: "/test",
      h1: "Test",
      titleCore: "x".repeat(TITLE_MAX + 5),
      description: "d".repeat(100),
      keywords: ["only this"],
    });
    bad.keywords = "only this";
    const issues = validateMeta([bad]);
    expect(issues.some((i) => i.field === "title")).toBe(true);
    expect(issues.some((i) => i.message.includes("evergreen keyword dropped"))).toBe(true);
  });

  it("resolves category meta with a safe fallback", () => {
    expect(getCategoryMeta("Abaya").key).toBe("category:Abaya");
    expect(getCategoryMeta("Unknown").key).toBe("category:All");
    expect(getMeta("section:home")).toBeTruthy();
  });
});

describe("FAQ content for JSON-LD", () => {
  it("returns non-empty question/answer pairs per category", () => {
    for (const cat of ["All", "Abaya", "Borka", "Hijab", "Kaftan"]) {
      const faqs = getCategoryFaqs(cat);
      expect(faqs.length).toBeGreaterThan(2);
      for (const f of faqs) {
        expect(f.question.length).toBeGreaterThan(5);
        expect(f.answer.length).toBeGreaterThan(20);
      }
    }
  });

  it("seeds landing FAQs with the primary keyword and caps the list", () => {
    const faqs = getLandingFaqs("Luxury Borka Bangladesh", "Borka");
    expect(faqs[0].question).toContain("Luxury Borka Bangladesh");
    expect(faqs.length).toBeLessThanOrEqual(5);
  });
});
