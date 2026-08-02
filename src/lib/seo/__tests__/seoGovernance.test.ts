import { describe, it, expect } from "vitest";
import {
  auditCannibalization,
  cannibalizationSummary,
  cannibalizationToCsv,
} from "@/lib/seo/cannibalization";
import {
  CATEGORY_DESCRIPTIONS,
  DESC_WORD_MAX,
  DESC_WORD_MIN,
  getCategoryDescription,
  validateCategoryDescriptions,
} from "@/lib/seo/categoryDescriptions";
import { analyseLanguageMix, analyseParagraph } from "@/lib/seo/languageMix";
import { enforceProductTags, MAX_PRODUCT_TAGS, MIN_PRODUCT_TAGS } from "@/lib/seo/productTags";

describe("keyword cannibalization report", () => {
  const rows = auditCannibalization();

  it("returns a row per monitored keyword with a stable summary", () => {
    expect(rows.length).toBeGreaterThan(10);
    const s = cannibalizationSummary(rows);
    expect(s.high + s.medium + s.clean).toBe(s.total);
  });

  it("flags a keyword shared by two page titles as high severity with canonical advice", () => {
    const pages = [
      { path: "/a", label: "A", title: "Luxury Borka Bangladesh", description: "", headings: ["Luxury Borka Bangladesh"], visibleText: [] },
      { path: "/b", label: "B", title: "Luxury Borka Bangladesh", description: "", headings: ["Luxury Borka Bangladesh"], visibleText: [] },
    ];
    const [row] = auditCannibalization(["Luxury Borka Bangladesh"], pages);
    expect(row.severity).toBe("high");
    expect(row.owner?.path).toBe("/a");
    expect(row.competitors[0].path).toBe("/b");
    expect(row.suggestions.some((s) => s.includes("canonical"))).toBe(true);
  });

  it("exports CSV with a header row", () => {
    expect(cannibalizationToCsv(rows).split("\n")[0]).toContain("Keyword");
  });
});

describe("auto-generated category descriptions", () => {
  it("gives every category a unique 300–500 word description", () => {
    expect(validateCategoryDescriptions()).toEqual([]);
    for (const d of CATEGORY_DESCRIPTIONS) {
      expect(d.wordCount).toBeGreaterThanOrEqual(DESC_WORD_MIN);
      expect(d.wordCount).toBeLessThanOrEqual(DESC_WORD_MAX);
    }
  });

  it("keeps Bengali and English copy in separate blocks (no forced mixing)", () => {
    for (const d of CATEGORY_DESCRIPTIONS) {
      for (const block of d.blocks) {
        for (const p of block.paragraphs) {
          expect(analyseParagraph(p).severity).toBe("ok");
        }
      }
    }
  });

  it("falls back to the default category", () => {
    expect(getCategoryDescription("Abaya").category).toBe("Abaya");
    expect(getCategoryDescription("Nope").category).toBe("All");
  });
});

describe("Bengali/English mixing detector", () => {
  it("warns when both languages are stuffed into one paragraph", () => {
    const text =
      "আমাদের কালেকশনে রয়েছে premium quality luxury borka bangladesh online shopping cash delivery discount offer price today বাংলাদেশের সেরা মানের পণ্য।";
    const report = analyseLanguageMix(text);
    expect(report.severity).not.toBe("ok");
    expect(report.suggestion).toContain("আলাদা");
  });

  it("stays clean for single-language paragraphs", () => {
    const text =
      "আমাদের প্রতিটি বোরকা সরাসরি আমদানি করা এবং ঢাকার শোরুমে যাচাই করা হয় বলে গুণগত মান নিয়ে চিন্তার কিছু নেই।\n\nEvery piece in this collection is checked for stitching quality and fabric weight before it reaches your door anywhere in the country.";
    expect(analyseLanguageMix(text).severity).toBe("ok");
  });
});

describe("product tag enforcement", () => {
  const product = {
    name: "Two Part Farasha Borka",
    category: "Borka",
    fabric: "Korean Nida",
    color: "Black",
    description: "Premium Dubai imported borka with embroidery",
  };

  it("caps tags at the maximum and reports the removed ones", () => {
    const raw = Array.from({ length: MAX_PRODUCT_TAGS + 4 }, (_, i) => `Tag ${i}`);
    const res = enforceProductTags(raw, product);
    expect(res.tags.length).toBe(MAX_PRODUCT_TAGS);
    expect(res.removed.length).toBe(4);
    expect(res.status).toContain("too-many");
  });

  it("suggests extra tags when below the minimum", () => {
    const res = enforceProductTags(["Borka"], product);
    expect(res.status).toContain("too-few");
    expect(res.suggestions.length).toBeGreaterThan(0);
    expect(res.tags.length + res.suggestions.length).toBeGreaterThanOrEqual(MIN_PRODUCT_TAGS);
  });

  it("dedupes case-insensitively and flags irrelevant tags", () => {
    const res = enforceProductTags(["Borka", "borka", "Car Engine Oil"], product);
    expect(res.tags.filter((t) => t.toLowerCase() === "borka").length).toBe(1);
    expect(res.irrelevant).toContain("Car Engine Oil");
  });
});
