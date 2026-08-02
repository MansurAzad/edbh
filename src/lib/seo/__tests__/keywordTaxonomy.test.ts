import { describe, it, expect } from "vitest";
import {
  ALL_TAXONOMY_KEYWORDS,
  KEYWORD_GROUPS,
  PRODUCT_TAG_VOCABULARY,
  getScopeKeywords,
  suggestProductTags,
  validateKeywordList,
  normaliseKeyword,
  MAX_META_KEYWORDS,
  MAX_PRODUCT_TAGS,
  MIN_PRODUCT_TAGS,
  RECOMMENDED_CATEGORIES,
} from "@/lib/seo/keywordTaxonomy";
import { ALL_META } from "@/lib/seo/metaGenerator";

describe("keyword taxonomy", () => {
  it("contains no duplicate keyword anywhere", () => {
    expect(validateKeywordList(ALL_TAXONOMY_KEYWORDS)).toEqual([]);
    const lower = ALL_TAXONOMY_KEYWORDS.map((k) => k.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it("assigns each keyword to exactly one group", () => {
    const counts = new Map<string, number>();
    for (const g of KEYWORD_GROUPS)
      for (const k of g.keywords) counts.set(k.toLowerCase(), (counts.get(k.toLowerCase()) ?? 0) + 1);
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
  });

  it("fixes the known misspellings", () => {
    expect(normaliseKeyword("Poket Sleeve Abaya")).toBe("Pocket Sleeve Abaya");
    expect(ALL_TAXONOMY_KEYWORDS).toContain("Pocket Sleeve Abaya");
    expect(ALL_TAXONOMY_KEYWORDS.some((k) => /poket/i.test(k))).toBe(false);
  });

  it("returns deduped, capped, seed-first keywords per page scope", () => {
    const kws = getScopeKeywords("home", ["Dubai Borka Price in Bangladesh"]);
    expect(kws[0]).toBe("Dubai Borka Price in Bangladesh");
    expect(kws.length).toBeLessThanOrEqual(MAX_META_KEYWORDS);
    expect(validateKeywordList(kws)).toEqual([]);
  });

  it("keeps generated page meta keywords duplicate-free", () => {
    for (const m of ALL_META) {
      const list = m.keywords.split(", ");
      expect(validateKeywordList(list)).toEqual([]);
    }
  });

  it("suggests 5–10 relevant product tags from real attributes", () => {
    const tags = suggestProductTags({
      name: "Dubai Cherry Fabric Party Borka",
      category: "Borka",
      fabric: "Korean Nida",
      color: "Deep Maroon",
      description: "Handmade Karchupi with DMC Stone Work, breathable and summer friendly",
      sizes: ["Size 54", "Size 56"],
    });
    expect(tags.length).toBeGreaterThanOrEqual(MIN_PRODUCT_TAGS);
    expect(tags.length).toBeLessThanOrEqual(MAX_PRODUCT_TAGS);
    expect(tags).toContain("Korean Nida");
    expect(tags.every((t) => PRODUCT_TAG_VOCABULARY.includes(t))).toBe(true);
  });

  it("ships a recommended category tree with usable paths", () => {
    expect(RECOMMENDED_CATEGORIES.length).toBeGreaterThan(8);
    for (const c of RECOMMENDED_CATEGORIES) {
      expect(c.path.startsWith("/")).toBe(true);
      for (const child of c.children ?? []) expect(child.path.startsWith("/shop?category=")).toBe(true);
    }
  });
});
