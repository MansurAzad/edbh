import { describe, it, expect } from "vitest";
import {
  computeMaxNameSimilarity,
  getDescriptionVerifyDetail,
  getDescriptionVerifyStatus,
  nameTrigramSimilarity,
  sortAdminProducts,
  type AdminProduct,
} from "@/lib/admin/productHelpers";

const p = (over: Partial<AdminProduct>): AdminProduct => ({
  id: crypto.randomUUID(),
  name: "Product",
  category: "Abaya",
  price: 1000,
  sale_price: null,
  stock: 10,
  featured: false,
  image_url: null,
  description: null,
  sizes: null, colors: null, material: null, video_url: null,
  sku: null, subcategory: null, fabric: null, work_type: null, part: null,
  hijab_included: false, inner_included: false,
  purchase_cost: null, margin: null,
  image_alt_text: null, meta_title: null, meta_description: null,
  ...over,
});

describe("getDescriptionVerifyDetail", () => {
  it("returns fail/missing on blank", () => {
    const d = getDescriptionVerifyDetail("");
    expect(d.status).toBe("fail");
    expect(d.reason).toBe("missing");
  });
  it("returns fail/script on <script>", () => {
    const d = getDescriptionVerifyDetail("hello <script>alert(1)</script>");
    expect(d.status).toBe("fail");
    expect(d.reason).toBe("script");
  });
  it("flags short text as attention/short", () => {
    const d = getDescriptionVerifyDetail("অতি ছোট বিবরণ");
    expect(d.status).toBe("attention");
    expect(d.reason).toBe("short");
  });
  it("flags heavy html as attention/raw_html", () => {
    const html = "<div><p>" + "<span>x</span>".repeat(30) + "</p></div>";
    const d = getDescriptionVerifyDetail(html);
    expect(d.status).toBe("attention");
    expect(["raw_html", "unbalanced_tags"]).toContain(d.reason);
  });
  it("passes on readable prose ≥ 80 chars", () => {
    const text = "এই পণ্যটি উন্নত মানের কাপড়ে তৈরি এবং ডেলিভারি সারা দেশে বিনামূল্যে দেওয়া হয়। ক্যাশ অন ডেলিভারি সুবিধা আছে।";
    const d = getDescriptionVerifyDetail(text);
    expect(d.status).toBe("pass");
    expect(getDescriptionVerifyStatus(text)).toBe("pass");
  });
});

describe("sortAdminProducts", () => {
  const list = [
    p({ id: "a", stock: 5,  description: null }),                                              // fail
    p({ id: "b", stock: 1,  description: "ঠিকঠাক বড় ডেসক্রিপশন " + "ক".repeat(120) }),         // pass
    p({ id: "c", stock: 10, description: "খুব ছোট" }),                                         // attention
  ];
  it("sorts stock asc", () => {
    expect(sortAdminProducts(list, "stock_asc").map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
  it("verify_worst puts fail first", () => {
    expect(sortAdminProducts(list, "verify_worst").map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
  it("verify_best puts pass first", () => {
    expect(sortAdminProducts(list, "verify_best").map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
  it("similarity_desc uses simMap", () => {
    const simMap = new Map([["a", 0.1], ["b", 0.9], ["c", 0.5]]);
    expect(sortAdminProducts(list, "similarity_desc", { simMap }).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
});

describe("nameTrigramSimilarity / computeMaxNameSimilarity", () => {
  it("identical names → 1", () => {
    expect(nameTrigramSimilarity("Dubai Abaya", "Dubai Abaya")).toBeCloseTo(1);
  });
  it("very different names → low", () => {
    expect(nameTrigramSimilarity("Dubai Abaya", "Silk Saree")).toBeLessThan(0.2);
  });
  it("computes per-product max similarity", () => {
    const items = [
      p({ id: "1", name: "Dubai Embroidery Abaya" }),
      p({ id: "2", name: "Dubai Embroidery Abaya Deluxe" }),
      p({ id: "3", name: "Unrelated Cotton Shirt" }),
    ];
    const map = computeMaxNameSimilarity(items);
    expect(map.get("1")!).toBeGreaterThan(0.4);
    expect(map.get("3")!).toBeLessThan(0.2);
  });
});
