/**
 * @file productCsv.ts
 * @description Pure (dependency-free) CSV serialization + parsing helpers for
 * the admin product import/export flow. Extracted from ProductImportExport.tsx
 * so we can round-trip test that new standardized fields (sku, subcategory,
 * fabric, work_type, part, hijab_included, inner_included, purchase_cost,
 * image_alt_text, meta_title, meta_description) survive export → import.
 *
 * Row-level validation returns structured errors so callers can render a
 * clear import error summary listing the row number, field, and reason.
 */

export const PRODUCT_CSV_HEADERS = [
  "name", "category", "price", "sale_price", "stock", "featured",
  "description", "image_url", "sizes", "colors", "material",
  "sku", "subcategory", "fabric", "work_type", "part",
  "hijab_included", "inner_included", "purchase_cost",
  "image_alt_text", "meta_title", "meta_description",
] as const;

export type ProductCsvHeader = (typeof PRODUCT_CSV_HEADERS)[number];

export interface CsvRowError {
  row: number;      // 1-indexed data row (excludes header)
  field?: string;   // offending column, if known
  message: string;  // human readable reason
}

/* ─────────────────────── serialization ─────────────────────── */

export function esc(field: unknown): string {
  const s = field == null ? "" : String(field);
  if (!s) return '""';
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return `"${s}"`;
}

export function serializeProduct(p: Record<string, any>): string[] {
  return [
    esc(p.name), esc(p.category), String(p.price ?? ""),
    p.sale_price == null || p.sale_price === "" ? "" : String(p.sale_price),
    String(p.stock ?? 0),
    p.featured ? "true" : "false",
    esc(p.description || ""), esc(p.image_url || ""),
    esc((p.sizes || []).join("; ")), esc((p.colors || []).join("; ")),
    esc(p.material || ""),
    esc(p.sku || ""), esc(p.subcategory || ""), esc(p.fabric || ""),
    esc(p.work_type || ""), esc(p.part || ""),
    p.hijab_included ? "true" : "false",
    p.inner_included ? "true" : "false",
    p.purchase_cost == null || p.purchase_cost === "" ? "" : String(p.purchase_cost),
    esc(p.image_alt_text || ""), esc(p.meta_title || ""), esc(p.meta_description || ""),
  ];
}

export function productsToCsv(products: Record<string, any>[]): string {
  const rows = products.map((p) => serializeProduct(p).join(","));
  return [PRODUCT_CSV_HEADERS.join(","), ...rows].join("\n");
}

/* ───────────────────────── parsing ────────────────────────── */

export function parseCsvField(field: string): string {
  if (!field) return "";
  let f = field.trim();
  if (f.startsWith('"') && f.endsWith('"')) f = f.slice(1, -1).replace(/""/g, '"');
  return f;
}

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { current += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ",") { result.push(current); current = ""; }
      else { current += c; }
    }
  }
  result.push(current);
  return result;
}

/**
 * Parses a single CSV row into a product record. Throws on hard failures
 * (invalid price) so the caller can attribute the row number in the error
 * summary. Soft issues (missing required fields) surface via
 * validateProductRow so we can list every missing field at once.
 */
export function parseProductRow(headers: string[], values: string[]): Record<string, any> {
  const product: Record<string, any> = {};
  headers.forEach((header, index) => {
    const value = parseCsvField(values[index] || "");
    switch (header) {
      case "name": case "category": case "description": case "image_url": case "material":
      case "sku": case "subcategory": case "fabric": case "work_type": case "part":
      case "image_alt_text": case "meta_title": case "meta_description":
        if (value) product[header] = value; break;
      case "price": case "sale_price": {
        const num = parseFloat(value);
        if (!isNaN(num) && num > 0) product[header] = num;
        else if (header === "price" && value !== "") throw new Error(`অবৈধ মূল্য "${value}"`);
        break;
      }
      case "stock": product.stock = parseInt(value) || 0; break;
      case "purchase_cost": {
        const pc = parseFloat(value);
        if (!isNaN(pc)) product.purchase_cost = pc;
        break;
      }
      case "featured": product.featured = value.toLowerCase() === "true"; break;
      case "hijab_included": product.hijab_included = value.toLowerCase() === "true"; break;
      case "inner_included": product.inner_included = value.toLowerCase() === "true"; break;
      case "sizes":
        product.sizes = value ? value.split(";").map((s) => s.trim()).filter(Boolean) : [];
        break;
      case "colors":
        product.colors = value ? value.split(";").map((c) => c.trim()).filter(Boolean) : [];
        break;
    }
  });
  if (product.fabric && !product.material) product.material = product.fabric;
  if (product.material && !product.fabric) product.fabric = product.material;
  return product;
}

/* ─────────────────────── validation ─────────────────────── */

const MAX_META_TITLE = 70;
const MAX_META_DESCRIPTION = 170;

export function validateProductRow(
  product: Record<string, any>,
  rowNumber: number,
): CsvRowError[] {
  const errors: CsvRowError[] = [];
  if (!product.name)     errors.push({ row: rowNumber, field: "name",     message: "name আবশ্যক" });
  if (!product.category) errors.push({ row: rowNumber, field: "category", message: "category আবশ্যক" });
  if (product.price == null || product.price <= 0) {
    errors.push({ row: rowNumber, field: "price", message: "price অবশ্যই > 0 হতে হবে" });
  }
  if (product.sale_price != null && product.price != null && product.sale_price >= product.price) {
    errors.push({ row: rowNumber, field: "sale_price", message: "sale_price অবশ্যই price-এর চেয়ে কম হতে হবে" });
  }
  if (product.stock != null && product.stock < 0) {
    errors.push({ row: rowNumber, field: "stock", message: "stock ঋণাত্মক হতে পারবে না" });
  }
  if (product.purchase_cost != null && product.purchase_cost < 0) {
    errors.push({ row: rowNumber, field: "purchase_cost", message: "purchase_cost ঋণাত্মক হতে পারবে না" });
  }
  if (product.meta_title && String(product.meta_title).length > MAX_META_TITLE) {
    errors.push({ row: rowNumber, field: "meta_title", message: `meta_title ${MAX_META_TITLE} অক্ষরের বেশি` });
  }
  if (product.meta_description && String(product.meta_description).length > MAX_META_DESCRIPTION) {
    errors.push({ row: rowNumber, field: "meta_description", message: `meta_description ${MAX_META_DESCRIPTION} অক্ষরের বেশি` });
  }
  if (product.image_url && !/^https?:\/\//i.test(product.image_url)) {
    errors.push({ row: rowNumber, field: "image_url", message: "image_url অবশ্যই http/https দিয়ে শুরু হবে" });
  }
  return errors;
}

/**
 * Full CSV → products pipeline. Returns products + row errors. Malformed
 * required fields are surfaced instead of silently dropped so the admin
 * sees exactly what to fix.
 */
export function csvToProducts(csvText: string): {
  products: Record<string, any>[];
  errors: CsvRowError[];
} {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { products: [], errors: [{ row: 0, message: "CSV-এ হেডার ও কমপক্ষে ১টি ডেটা রো থাকতে হবে" }] };
  }
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  for (const req of ["name", "category", "price"] as const) {
    if (!headers.includes(req)) {
      return { products: [], errors: [{ row: 0, message: `প্রয়োজনীয় কলাম নেই: ${req}` }] };
    }
  }
  const products: Record<string, any>[] = [];
  const errors: CsvRowError[] = [];
  lines.slice(1).forEach((line, idx) => {
    const rowNumber = idx + 2; // header is row 1
    try {
      const values = parseCSVLine(line);
      const product = parseProductRow(headers, values);
      const rowErrors = validateProductRow(product, rowNumber);
      if (rowErrors.length) errors.push(...rowErrors);
      else products.push(product);
    } catch (err: any) {
      errors.push({ row: rowNumber, message: err?.message ?? String(err) });
    }
  });
  return { products, errors };
}
