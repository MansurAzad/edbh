/**
 * In-page audit runner for AI Product Studio.
 * Executes the same assertions as the unit test suite against the pure
 * helper modules (sizeRules, validator, exportDrafts) so an admin can
 * verify the studio is behaving correctly directly from the UI without
 * running vitest. Also runs a live edge-function reachability probe.
 */
import { DEFAULT_RULES, resolveRule, applyRule } from "./sizeRules";
import { validateSchema, type DraftSchemaInput } from "./validator";
import { draftsToCsv, draftsToJson, type ExportableDraft } from "./exportDrafts";
import { supabase } from "@/integrations/supabase/client";

export interface AuditResult {
  name: string;
  group: "sizeRules" | "validator" | "exportDrafts" | "edgeFunction";
  ok: boolean;
  message?: string;
}

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
  sizes: ["52", "54"],
  stock: 20,
  price: 5000,
  sale_price: 4500,
  description: "desc\nline2",
  meta_title: "t",
  meta_description: "d",
  image_alt_text: "alt",
  imageUrl: "https://x/y.jpg",
};

function check(name: string, group: AuditResult["group"], fn: () => void): AuditResult {
  try {
    fn();
    return { name, group, ok: true };
  } catch (e: any) {
    return { name, group, ok: false, message: e?.message || String(e) };
  }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

export async function runStudioAudit(): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  // ── sizeRules ────────────────────────────────────────────────
  results.push(check("base rule fallback", "sizeRules", () => {
    assert(resolveRule(DEFAULT_RULES, "Unknown") === DEFAULT_RULES.base, "unknown must resolve to base");
    assert(resolveRule(DEFAULT_RULES) === DEFAULT_RULES.base, "no category must resolve to base");
  }));
  results.push(check("case-insensitive category override", "sizeRules", () => {
    assert(resolveRule(DEFAULT_RULES, "abaya").sizes.length === 6, "abaya override expects 6 sizes");
    assert(resolveRule(DEFAULT_RULES, "HIJAB").sizes[0] === "Free", "hijab override expects Free");
  }));
  results.push(check("applyRule total stock = sizes × per-size", "sizeRules", () => {
    const r = applyRule({ category: "Abaya" }, DEFAULT_RULES);
    assert(r.stock === 60, `expected 60, got ${r.stock}`);
  }));

  // ── validator ────────────────────────────────────────────────
  results.push(check("valid draft passes", "validator", () => {
    const errs = validateSchema(validDraft);
    assert(errs.length === 0, `expected 0 errors, got ${errs.length}`);
  }));
  results.push(check("missing required fields flagged", "validator", () => {
    const errs = validateSchema({ ...validDraft, name: " ", category: "", fabric: "", imageUrl: "" });
    const f = errs.map((e) => e.field);
    for (const req of ["name", "category", "fabric", "imageUrl"]) {
      assert(f.includes(req as any), `missing flag for ${req}`);
    }
  }));
  results.push(check("sale_price ≥ price flagged", "validator", () => {
    const errs = validateSchema({ ...validDraft, sale_price: 5000 });
    assert(errs.some((e) => e.field === "sale_price_vs_price"), "sale_price_vs_price must be flagged");
  }));
  results.push(check("null sale_price allowed", "validator", () => {
    assert(validateSchema({ ...validDraft, sale_price: null }).length === 0, "null sale_price should pass");
  }));

  // ── exportDrafts ─────────────────────────────────────────────
  results.push(check("CSV escapes quotes/commas/newlines", "exportDrafts", () => {
    const csv = draftsToCsv([exportDraft]);
    assert(csv.includes('"Test ""Premium"""'), "quote-escaping broken");
    assert(csv.includes('"img,1.jpg"'), "comma-wrapping broken");
    assert(csv.includes("52|54"), "sizes join broken");
  }));
  results.push(check("JSON export is parseable + preserves fields", "exportDrafts", () => {
    const parsed = JSON.parse(draftsToJson([exportDraft]));
    assert(parsed.length === 1, "row count");
    assert(parsed[0].sha256 === "abc123", "sha256 preserved");
    assert(parsed[0].estimate_price === 5000, "price preserved");
  }));

  // ── edge function reachability (validation-guard probe) ──────
  const efResult = await (async (): Promise<AuditResult> => {
    try {
      const { data, error } = await supabase.functions.invoke("analyze-product-image", { body: {} });
      // We expect a 400 "imageUrl is required" — surfaces either via error or data.error
      const msg = (error?.message || data?.error || "").toString().toLowerCase();
      if (msg.includes("imageurl")) {
        return { name: "edge function reachable + validates input", group: "edgeFunction", ok: true };
      }
      return {
        name: "edge function reachable + validates input",
        group: "edgeFunction",
        ok: false,
        message: `unexpected response: ${msg || JSON.stringify(data)}`,
      };
    } catch (e: any) {
      return { name: "edge function reachable + validates input", group: "edgeFunction", ok: false, message: e?.message };
    }
  })();
  results.push(efResult);

  return results;
}
