import { describe, it, expect } from "vitest";
import { buildProductAuditCsv } from "@/lib/admin/productAuditCsv";
import type { AdminProduct } from "@/lib/admin/productHelpers";

const p = (over: Partial<AdminProduct>): AdminProduct => ({
  id: over.id ?? "id",
  name: "Dubai Abaya",
  category: "Abaya",
  price: 2000,
  sale_price: null,
  stock: 5,
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

describe("buildProductAuditCsv", () => {
  it("stock audit → OOS columns and filename", () => {
    const { csv, filename } = buildProductAuditCsv(
      [p({ id: "x", stock: 0, sku: "SKU1" })],
      "oos", "", "2026-07-09",
    );
    expect(filename).toBe("products-audit-oos-2026-07-09.csv");
    const [header, row] = csv.split("\n");
    expect(header.split(",")).toEqual([
      "id","name","sku","category","subcategory","stock","price","sale_price","verify_status",
    ]);
    expect(row).toContain(`"SKU1"`);
    expect(row).toContain(`"fail"`); // no description → fail
  });

  it("low_stock audit filename", () => {
    const { filename } = buildProductAuditCsv([], "low_stock", "", "2026-07-09");
    expect(filename).toBe("products-audit-low_stock-2026-07-09.csv");
  });

  it("duplicates → groups rows with G1/G2 prefix", () => {
    const rows = [
      p({ id: "1", name: "Dubai Abaya" }),
      p({ id: "2", name: "Dubai Abaya" }),
      p({ id: "3", name: "Silk Borka" }),
    ];
    const { csv, filename } = buildProductAuditCsv(rows, "duplicates", "", "2026-07-09");
    expect(filename).toBe("products-audit-duplicates-2026-07-09.csv");
    const lines = csv.split("\n");
    expect(lines[0]).toMatch(/^duplicate_group,id,name,/);
    expect(lines.slice(1).filter((l) => l.startsWith('"G1"')).length).toBe(2);
    expect(lines.slice(1).filter((l) => l.startsWith('"G2"')).length).toBe(1);
  });

  it("verify filter renames the file", () => {
    const { filename } = buildProductAuditCsv([p({})], "", "fail", "2026-07-09");
    expect(filename).toBe("products-verify-fail-2026-07-09.csv");
  });

  it("no filter → generic filtered filename", () => {
    const { filename } = buildProductAuditCsv([p({})], "", "", "2026-07-09");
    expect(filename).toBe("products-filtered-2026-07-09.csv");
  });
});
