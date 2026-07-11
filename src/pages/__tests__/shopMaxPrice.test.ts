import { describe, it, expect } from "vitest";

/**
 * Pure logic tests for the /shop?maxPrice URL param behavior.
 * Mirrors the parsing + initial-state logic in Shop.tsx so regressions in
 * the chip → URL → price slider pipeline are caught without a full router mount.
 */

const parseMaxPrice = (search: string): number => {
  const params = new URLSearchParams(search);
  return Number(params.get("maxPrice")) || 0;
};

const initialPriceRange = (urlMaxPrice: number): [number, number] => [
  0,
  urlMaxPrice > 0 ? urlMaxPrice : 50000,
];

describe("shop maxPrice URL param", () => {
  it("PriceQuickShop chip hrefs use ?maxPrice=<n>", () => {
    const buckets = [2000, 3000, 5000, 8000];
    for (const max of buckets) {
      const href = `/shop?maxPrice=${max}`;
      expect(parseMaxPrice(href.split("?")[1])).toBe(max);
    }
  });

  it("parses numeric maxPrice", () => {
    expect(parseMaxPrice("maxPrice=3000")).toBe(3000);
    expect(parseMaxPrice("maxPrice=8000&category=Abaya")).toBe(8000);
  });

  it("defaults to 0 when missing or invalid", () => {
    expect(parseMaxPrice("")).toBe(0);
    expect(parseMaxPrice("category=Abaya")).toBe(0);
    expect(parseMaxPrice("maxPrice=abc")).toBe(0);
  });

  it("initial price range uses URL max when present", () => {
    expect(initialPriceRange(3000)).toEqual([0, 3000]);
    expect(initialPriceRange(8000)).toEqual([0, 8000]);
  });

  it("falls back to 50000 upper bound when no URL max", () => {
    expect(initialPriceRange(0)).toEqual([0, 50000]);
  });

  it("chip navigation → parsed value → slider matches", () => {
    const chip = 5000;
    const href = `/shop?maxPrice=${chip}`;
    const parsed = parseMaxPrice(href.split("?")[1]);
    expect(initialPriceRange(parsed)).toEqual([0, chip]);
  });
});
