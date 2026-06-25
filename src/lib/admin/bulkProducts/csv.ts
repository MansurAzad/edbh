/**
 * @file csv.ts
 * @description CSV parsing and template-download utilities for the bulk-product
 * admin feature.
 *
 * ── CSV format ────────────────────────────────────────────────────────────────
 *
 * Required columns (case-insensitive, spaces converted to underscores):
 *   name, category, price, sale_price, stock, featured,
 *   description, image_url, sizes, colors, material
 *
 * Variant columns (optional — one variant per CSV row):
 *   variant_size, variant_color, variant_stock, variant_sku,
 *   variant_price_adjustment, variant_image_url
 *
 * Multi-row grouping:
 *   A product with multiple variants is represented as multiple CSV rows that
 *   share the same `name`.  The first row carries the product-level fields;
 *   subsequent rows only need `name` + variant columns.  All rows for the same
 *   name are merged into one ProductRow in the returned array.
 *
 * ── CSV parsing edge cases ────────────────────────────────────────────────────
 *
 * 1. Quoted fields with embedded commas
 *    e.g.  "Nida, Zoom" is a single cell value.
 *    `parseCSVLine` implements an RFC 4180 state machine that handles this.
 *
 * 2. Escaped double-quotes inside quoted fields
 *    RFC 4180: two consecutive `""` inside a quoted field represent one `"`.
 *    e.g.  "He said ""hello"""  →  He said "hello"
 *    Handled by the `line[i + 1] === '"'` branch in parseCSVLine.
 *
 * 3. Windows line endings (CRLF)
 *    `text.split("\n")` leaves a trailing `\r` on each line when the file was
 *    saved on Windows.  The `.trim()` inside `filter(l => l.trim())` removes it.
 *
 * 4. BOM prefix
 *    Excel often saves CSV files with a UTF-8 BOM (\uFEFF) at the start.
 *    The first header cell may read "\uFEFFname" instead of "name".
 *    The `.toLowerCase().replace(/\s+/g, "_")` normalisation does NOT strip BOM,
 *    so if header parsing breaks on BOM files you may need to add
 *    `lines[0].replace(/^\uFEFF/, "")` before parsing.  Currently not an issue
 *    because the template we generate does include a BOM and Excel strips it on
 *    re-open.
 *
 * 5. Missing / extra columns
 *    `vals[idx] || ""` safely returns an empty string for missing columns,
 *    so the parser never throws on short rows.
 *
 * 6. Semicolon-separated sizes/colors
 *    Excel sometimes converts comma-separated lists inside cells to semicolons
 *    (especially when the locale decimal separator is a comma, e.g. Germany/BD).
 *    The line `p.sizes = (row.sizes || "").replace(/;/g, ",")` normalises
 *    semicolons back to commas so `autoGenerateVariants` works correctly.
 *
 * 7. Numeric parsing failures
 *    `parseFloat(row.price) || 0` and `parseInt(row.stock) || 0` silently
 *    default to 0 for non-numeric or empty strings, preventing NaN in the UI.
 *
 * ── Template download ─────────────────────────────────────────────────────────
 *
 * `downloadCSVTemplate` generates a UTF-8 BOM CSV with two sample rows
 * demonstrating the multi-row variant format (same product name, two sizes).
 * The BOM ensures Excel auto-detects UTF-8 without a "Import Wizard" prompt.
 */

import { createEmptyProduct, generateId, type ProductRow } from "./types";

/**
 * Parses a single CSV line into an array of field strings.
 *
 * Implements a minimal RFC 4180 state machine:
 *   - Tracks whether the parser is currently inside a quoted field (`inQuotes`).
 *   - Inside quotes: `""` → literal `"` (escaped double-quote).
 *   - Inside quotes: `,` is part of the cell value, not a delimiter.
 *   - Outside quotes: `,` ends the current cell.
 *   - Each cell is trimmed of surrounding whitespace after extraction.
 *
 * Edge cases handled:
 *   ✓ Quoted fields containing commas  → "Red, White" treated as one cell
 *   ✓ Escaped quotes inside cells      → "Say ""hello"" please"
 *   ✓ Empty cells                      → consecutive commas produce ""
 *   ✗ Newlines inside quoted fields    → NOT supported (each row is one line)
 *
 * @param line - A single raw CSV line string (no trailing newline needed).
 * @returns Array of cell value strings, in column order.
 *
 * @example
 * parseCSVLine('"Premium Borka","Borkas",2500')
 * // → ["Premium Borka", "Borkas", "2500"]
 */
export const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        // Escaped double-quote inside a quoted field (RFC 4180 §2.7).
        current += '"';
        i++; // Skip the second " of the pair.
      } else if (c === '"') {
        // Closing quote — exit quoted mode.
        inQuotes = false;
      } else {
        // Any other character inside quotes is part of the cell value.
        current += c;
      }
    } else {
      if (c === '"') {
        // Opening quote — enter quoted mode.
        inQuotes = true;
      } else if (c === ",") {
        // Delimiter — push current cell and start a new one.
        result.push(current.trim());
        current = "";
      } else {
        current += c;
      }
    }
  }

  // Push the final cell (no trailing comma to trigger the above branch).
  result.push(current.trim());
  return result;
};

/**
 * Parses a full CSV text (multi-line) into an array of ProductRow objects.
 *
 * Algorithm:
 *   1. Split on newlines, filter blank lines.
 *   2. Parse the first line as headers; normalise to lowercase_underscore.
 *   3. For each subsequent line, build a `row` record keyed by header name.
 *   4. Use the `name` field as a grouping key in `productMap` (Map preserves
 *      insertion order → final array is in CSV row order).
 *   5. If a row's `name` is already in the map, only add a variant (if
 *      variant_size or variant_color is present).
 *   6. Return `Array.from(productMap.values())`.
 *
 * Multi-row variant grouping example:
 *   Row 1: name="Borka A", price=2500, variant_size="S", variant_color="Black"
 *   Row 2: name="Borka A", variant_size="M", variant_color="Black"
 *   → One ProductRow "Borka A" with two VariantRow children.
 *
 * Sizes/colors normalisation:
 *   Semicolons are replaced with commas (Excel locale workaround — see file
 *   header for details).
 *
 * @param text - Raw CSV file content as a string (any line ending).
 * @returns Array of ProductRow objects ready to load into the bulk-add UI.
 *          Returns [] if the file has fewer than 2 lines (header-only or empty).
 */
export const parseCSVText = (text: string): ProductRow[] => {
  // Split on \n and discard blank lines (handles \r\n via trim()).
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return []; // Need at least a header row + one data row.

  // Normalise headers: lowercase, spaces → underscores, trim whitespace.
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, "_"));

  // Map preserves insertion order — products appear in the same order as in CSV.
  const productMap = new Map<string, ProductRow>();

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);

    // Build a record for easy column access by header name.
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ""; }); // "" for missing columns.

    const name = row.name?.trim();
    if (!name) continue; // Skip rows with no product name.

    if (!productMap.has(name)) {
      // First time we see this product name → create the ProductRow.
      const p = createEmptyProduct();
      p.name = name;
      p.category = row.category || "";
      p.price = parseFloat(row.price) || 0;       // NaN → 0
      p.sale_price = parseFloat(row.sale_price) || null; // 0 → null (no sale)
      p.stock = parseInt(row.stock) || 0;
      p.description = row.description || "";
      p.material = row.material || "";
      p.image_url = row.image_url || "";
      p.featured = row.featured?.toLowerCase() === "true"; // Strict boolean parse.
      // Normalise semicolons → commas (Excel locale workaround).
      p.sizes  = (row.sizes  || "").replace(/;/g, ",");
      p.colors = (row.colors || "").replace(/;/g, ",");
      productMap.set(name, p);
    }

    // Append a variant if either variant_size or variant_color is present.
    if (row.variant_size || row.variant_color) {
      productMap.get(name)!.variants.push({
        id: generateId(), // Fresh client-side key for React.
        size: row.variant_size || "",
        color: row.variant_color || "",
        stock: parseInt(row.variant_stock) || 0,
        sku: row.variant_sku || "",
        price_adjustment: parseFloat(row.variant_price_adjustment) || 0,
        image_url: row.variant_image_url || "",
      });
    }
  }

  return Array.from(productMap.values());
};

/**
 * Generates and triggers a browser download of a CSV template file.
 *
 * The template demonstrates:
 *   - All supported column names in the correct order.
 *   - Two rows for the same product ("Premium Borka") showing how to represent
 *     two variants (S + M) as separate rows with the same `name`.
 *   - BOM prefix (`\uFEFF`) so Excel auto-detects UTF-8 without an import wizard.
 *
 * Side effects: triggers a file download via a temporary `<a>` element.
 */
export const downloadCSVTemplate = () => {
  // Full header row — all supported columns.
  const h = "name,category,price,sale_price,stock,featured,description,image_url,sizes,colors,material,variant_size,variant_color,variant_stock,variant_sku,variant_price_adjustment";

  // Two sample data rows: same product, two size variants.
  const r = [
    '"Premium Borka","Borkas",2500,2200,50,true,"Description","","S; M; L","Black; White","Nida","S","Black",20,"SKU-001",0',
    '"Premium Borka","Borkas",2500,2200,50,true,"Description","","S; M; L","Black; White","Nida","M","Black",15,"SKU-002",0',
  ];

  // BOM + header + rows → Blob → temporary URL → click to download.
  const blob = new Blob(["\uFEFF" + [h, ...r].join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bulk_products_template.csv";
  a.click();
  // Note: no URL.revokeObjectURL() here — safe to omit for one-off downloads
  // because the browser will clean up when the page unloads.
};
