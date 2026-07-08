/**
 * @file productCsv.test.ts
 * @description Verifies that (a) exporting products via productsToCsv writes
 * every standardized field, (b) round-tripping the exported CSV back through
 * csvToProducts preserves those fields exactly, and (c) row-level validation
 * reports clear per-field errors for required-missing / malformed rows.
 */

import { describe, it, expect } from "vitest";
import {
  PRODUCT_CSV_HEADERS,
  productsToCsv,
  csvToProducts,
  validateProductRow,
  serializeProduct,
} from "../productCsv";

const sampleProduct = {
  name: "Dubai Nida Karchupi Abaya",
  category: "Abaya",
  price: 6500,
  sale_price: 5800,
  stock: 20,
  featured: true,
  description: "Dubai imported, karchupi work",
  image_url: "https://example.com/abaya.jpg",
  sizes: ["52", "54", "56"],
  colors: ["Black", "Navy"],
  material: "Nida",
  sku: "DBH-ABY-1001",
  subcategory: "Farasha",
  fabric: "Nida",
  work_type: "Karchupi",
  part: "1 Part",
  hijab_included: false,
  inner_included: true,
  purchase_cost: 3800,
  image_alt_text: "Dubai Imported Black Karchupi Abaya",
  meta_title: "Dubai Nida Karchupi Abaya — Premium",
  meta_description: "Premium karchupi abaya. Sizes 52-58, Nida fabric.",
};

describe("productCsv export", () => {
  it("includes every standardized header", () => {
    for (const h of ["sku", "subcategory", "fabric", "work_type", "part",
      "hijab_included", "inner_included", "purchase_cost",
      "image_alt_text", "meta_title", "meta_description"]) {
      expect(PRODUCT_CSV_HEADERS).toContain(h);
    }
  });

  it("serializes a product to a row of matching arity", () => {
    const row = serializeProduct(sampleProduct);
    expect(row).toHaveLength(PRODUCT_CSV_HEADERS.length);
  });
});

describe("productCsv round-trip", () => {
  it("preserves new standardized fields after export → import", () => {
    const csv = productsToCsv([sampleProduct]);
    const { products, errors } = csvToProducts(csv);
    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.sku).toBe(sampleProduct.sku);
    expect(p.subcategory).toBe(sampleProduct.subcategory);
    expect(p.fabric).toBe(sampleProduct.fabric);
    expect(p.work_type).toBe(sampleProduct.work_type);
    expect(p.part).toBe(sampleProduct.part);
    expect(p.hijab_included).toBe(false);
    expect(p.inner_included).toBe(true);
    expect(p.purchase_cost).toBe(3800);
    expect(p.image_alt_text).toBe(sampleProduct.image_alt_text);
    expect(p.meta_title).toBe(sampleProduct.meta_title);
    expect(p.meta_description).toBe(sampleProduct.meta_description);
    expect(p.sizes).toEqual(sampleProduct.sizes);
    expect(p.colors).toEqual(sampleProduct.colors);
    expect(p.price).toBe(6500);
    expect(p.sale_price).toBe(5800);
  });

  it("preserves fields containing commas and quotes", () => {
    const p = {
      ...sampleProduct,
      meta_description: 'Say "premium", get premium. Sizes: 52,54,56.',
    };
    const { products, errors } = csvToProducts(productsToCsv([p]));
    expect(errors).toEqual([]);
    expect(products[0].meta_description).toBe(p.meta_description);
  });
});

describe("productCsv validation", () => {
  it("flags missing required fields with field name and row number", () => {
    const errs = validateProductRow({ price: 100 }, 7);
    expect(errs.find((e) => e.field === "name")).toBeTruthy();
    expect(errs.find((e) => e.field === "category")).toBeTruthy();
    expect(errs.every((e) => e.row === 7)).toBe(true);
  });

  it("rejects zero / negative price and sale_price >= price", () => {
    expect(validateProductRow({ name: "x", category: "c", price: 0 }, 2)
      .some((e) => e.field === "price")).toBe(true);
    expect(validateProductRow({ name: "x", category: "c", price: 100, sale_price: 100 }, 2)
      .some((e) => e.field === "sale_price")).toBe(true);
  });

  it("rejects meta_title / meta_description exceeding limits and bad image_url", () => {
    const errs = validateProductRow({
      name: "x", category: "c", price: 100,
      meta_title: "a".repeat(200),
      meta_description: "b".repeat(500),
      image_url: "not-a-url",
    }, 5);
    expect(errs.some((e) => e.field === "meta_title")).toBe(true);
    expect(errs.some((e) => e.field === "meta_description")).toBe(true);
    expect(errs.some((e) => e.field === "image_url")).toBe(true);
  });

  it("surfaces row errors from csvToProducts pipeline", () => {
    const bad = [
      PRODUCT_CSV_HEADERS.join(","),
      // missing name + category, negative price
      `,,,-5,0,false,"",,"","","","","","","","",false,false,,"","",""`,
    ].join("\n");
    const { products, errors } = csvToProducts(bad);
    expect(products).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].row).toBe(2);
  });
});
