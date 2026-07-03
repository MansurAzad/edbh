/**
 * Unit tests for validator.ts — run via Deno test runner.
 *
 * Coverage:
 *  - Required-field checks (name, price, image)
 *  - Numeric constraints (negative price, sale > price, non-integer stock)
 *  - Length limits (name, slug)
 *  - Happy path (fully valid product)
 *  - mapProduct field mapping incl. sale-price precedence and gallery de-dupe
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapProduct, validateProduct } from "./validator.ts";

Deno.test("validateProduct: rejects missing name", () => {
  const errs = validateProduct({ id: "1", price: 10, image_url: "x" });
  assert(errs.some((e) => e.includes("name")));
});

Deno.test("validateProduct: rejects empty name string", () => {
  const errs = validateProduct({ id: "1", name: "   ", price: 10, image_url: "x" });
  assert(errs.some((e) => e.includes("name")));
});

Deno.test("validateProduct: rejects missing/invalid price", () => {
  assert(validateProduct({ id: "1", name: "A", image_url: "x" }).some((e) => e.includes("price")));
  assert(
    validateProduct({ id: "1", name: "A", price: "not-a-number", image_url: "x" })
      .some((e) => e.includes("price")),
  );
  assert(
    validateProduct({ id: "1", name: "A", price: -5, image_url: "x" })
      .some((e) => e.includes("≥ 0")),
  );
});

Deno.test("validateProduct: sale_price must not exceed price", () => {
  const errs = validateProduct({ id: "1", name: "A", price: 100, sale_price: 200, image_url: "x" });
  assert(errs.some((e) => e.includes("sale_price")));
});

Deno.test("validateProduct: stock must be non-negative integer", () => {
  assert(
    validateProduct({ id: "1", name: "A", price: 10, stock: -1, image_url: "x" })
      .some((e) => e.includes("stock")),
  );
  assert(
    validateProduct({ id: "1", name: "A", price: 10, stock: 1.5, image_url: "x" })
      .some((e) => e.includes("stock")),
  );
});

Deno.test("validateProduct: requires at least one image", () => {
  const errs = validateProduct({ id: "1", name: "A", price: 10 });
  assert(errs.some((e) => e.includes("image")));
});

Deno.test("validateProduct: accepts gallery image when image_url missing", () => {
  const errs = validateProduct({
    id: "1",
    name: "A",
    price: 10,
    product_images: [{ image_url: "https://x/y.jpg" }],
  });
  assertEquals(errs, []);
});

Deno.test("validateProduct: rejects overly long name/slug", () => {
  const long = "a".repeat(300);
  assert(
    validateProduct({ id: "1", name: long, price: 10, image_url: "x" })
      .some((e) => e.includes("255")),
  );
  assert(
    validateProduct({ id: "1", name: "A", price: 10, slug: long, image_url: "x" })
      .some((e) => e.includes("slug")),
  );
});

Deno.test("validateProduct: happy path", () => {
  const errs = validateProduct({
    id: "abc",
    name: "শাড়ি",
    price: 1200,
    sale_price: 999,
    stock: 5,
    image_url: "https://cdn/x.jpg",
    slug: "sari",
  });
  assertEquals(errs, []);
});

Deno.test("mapProduct: sale_price wins over regular price for selling_price", () => {
  const out = mapProduct({
    id: "abc",
    name: "A",
    price: 1000,
    sale_price: 800,
    image_url: "https://cdn/x.jpg",
  });
  assertEquals(out.selling_price, 800);
  assertEquals(out.regular_price, 1000);
  assertEquals(out.external_ref, "abc");
  assertEquals(out.sku, "abc"); // no slug → fallback to id
});

Deno.test("mapProduct: dedupes and orders gallery images", () => {
  const out = mapProduct({
    id: "1",
    name: "A",
    price: 1,
    image_url: "https://cdn/main.jpg",
    product_images: [
      { image_url: "https://cdn/b.jpg", display_order: 2 },
      { image_url: "https://cdn/a.jpg", display_order: 1 },
      { image_url: "https://cdn/main.jpg", display_order: 3 }, // duplicate of image_url
    ],
  });
  assertEquals(out.image_urls, [
    "https://cdn/main.jpg",
    "https://cdn/a.jpg",
    "https://cdn/b.jpg",
  ]);
});

Deno.test("mapProduct: uses slug for sku when present", () => {
  const out = mapProduct({ id: "1", name: "A", price: 10, slug: "kurti-red", image_url: "x" });
  assertEquals(out.sku, "kurti-red");
});
