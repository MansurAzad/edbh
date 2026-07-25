import { describe, it, expect, vi } from "vitest";
import { DEFAULT_RULES, resolveRule, applyRule } from "../sizeRules";
import { validateSchema, type DraftSchemaInput } from "../validator";
import { draftsToCsv, draftsToJson, type ExportableDraft } from "../exportDrafts";
import { extractEdgeFunctionAuditMessage, extractEdgeFunctionAudit } from "../audit";

// Mock the supabase client BEFORE importing runStudioAudit so the module picks
// up the mocked functions.invoke when the integration test exercises it.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
import { runStudioAudit } from "../audit";
import { supabase } from "@/integrations/supabase/client";

const validDraft: DraftSchemaInput = {
  name: "Premium Dubai Abaya",
  category: "Abaya",
  fabric: "Nida",
  price: 5000,
  sale_price: 4500,
  stock: 60,
  sizes: ["52", "54", "56", "58"],
  colors: "Black",
  description: "A beautiful premium abaya imported from Dubai with fine craftsmanship.",
  imageUrl: "https://example.com/a.jpg",
};

describe("sizeRules", () => {
  it("resolves base rule when category unknown", () => {
    expect(resolveRule(DEFAULT_RULES, "Unknown")).toEqual(DEFAULT_RULES.base);
    expect(resolveRule(DEFAULT_RULES)).toEqual(DEFAULT_RULES.base);
  });

  it("resolves category override case-insensitively", () => {
    expect(resolveRule(DEFAULT_RULES, "abaya").sizes).toEqual(["50","52","54","56","58","60"]);
    expect(resolveRule(DEFAULT_RULES, "HIJAB").sizes).toEqual(["Free"]);
  });

  it("applyRule computes total stock = sizes * per-size", () => {
    const r = applyRule({ category: "Abaya" }, DEFAULT_RULES);
    expect(r.sizes.length).toBe(6);
    expect(r.stock).toBe(60);
    const h = applyRule({ category: "Hijab" }, DEFAULT_RULES);
    expect(h.stock).toBe(20);
  });
});

describe("validator", () => {
  it("passes a fully valid draft", () => {
    expect(validateSchema(validDraft)).toEqual([]);
  });

  it("flags missing name / category / fabric / image", () => {
    const errs = validateSchema({ ...validDraft, name: " ", category: "", fabric: "", imageUrl: "" });
    const fields = errs.map((e) => e.field);
    expect(fields).toContain("name");
    expect(fields).toContain("category");
    expect(fields).toContain("fabric");
    expect(fields).toContain("imageUrl");
  });

  it("flags invalid price / stock / sizes / description", () => {
    const errs = validateSchema({ ...validDraft, price: 0, stock: -1, sizes: [], description: "short" });
    const fields = errs.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["price","stock","sizes","description"]));
  });

  it("flags sale_price >= price", () => {
    const errs = validateSchema({ ...validDraft, sale_price: 5000 });
    expect(errs.some((e) => e.field === "sale_price_vs_price")).toBe(true);
  });

  it("accepts null sale_price without error", () => {
    expect(validateSchema({ ...validDraft, sale_price: null })).toEqual([]);
  });
});

const exportDraft: ExportableDraft = {
  id: "1",
  file: { name: "img,1.jpg" },
  fileHash: "abc123",
  status: "ready",
  name: 'Test "Premium"',
  category: "Abaya",
  subcategory: "Open Abaya",
  fabric: "Nida",
  work_type: "Embroidery",
  part: "1 Part",
  colors: "Black,Gold",
  sizes: ["52","54"],
  stock: 20,
  price: 5000,
  sale_price: 4500,
  description: "desc\nline2",
  meta_title: "t",
  meta_description: "d",
  image_alt_text: "alt",
  imageUrl: "https://x/y.jpg",
};

describe("exportDrafts", () => {
  it("CSV has header + escapes quotes/commas/newlines", () => {
    const csv = draftsToCsv([exportDraft]);
    const [header, row] = csv.split("\n").slice(0, 2);
    expect(header.split(",")).toContain("sha256");
    expect(header.split(",")).toContain("estimate_price");
    // name contains quote → wrapped and doubled
    expect(row).toContain('"Test ""Premium"""');
    // filename has comma → wrapped
    expect(row).toContain('"img,1.jpg"');
    // sizes joined with |
    expect(row).toContain("52|54");
  });

  it("JSON export is parseable and preserves fields", () => {
    const json = draftsToJson([exportDraft]);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].sha256).toBe("abc123");
    expect(parsed[0].estimate_price).toBe(5000);
    expect(parsed[0].sizes).toBe("52|54");
  });

  it("sale_price null exports as empty string in row", () => {
    const json = JSON.parse(draftsToJson([{ ...exportDraft, sale_price: null }]));
    expect(json[0].sale_price).toBe("");
  });
});

describe("audit edge-function probe", () => {
  it("extracts validation error from non-2xx function response body", async () => {
    const response = new Response(JSON.stringify({ error: "imageUrl is required", code: null }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    const msg = await extractEdgeFunctionAuditMessage(null, {
      message: "Edge Function returned a non-2xx status code",
      context: response,
    });

    expect(msg).toContain("imageurl is required");
  });

  it("extracts validation error from successful data payload", async () => {
    const msg = await extractEdgeFunctionAuditMessage({ error: "imageUrl is required" }, null);
    expect(msg).toContain("imageurl is required");
  });
});
