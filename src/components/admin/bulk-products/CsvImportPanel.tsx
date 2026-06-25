/**
 * @file CsvImportPanel.tsx
 * @description Admin panel card that handles CSV file selection, validation, parsing,
 * and handoff to the bulk-add product list.
 *
 * ── Responsibilities ──────────────────────────────────────────────────────────
 *
 * 1. **Template download** — calls `downloadCSVTemplate()` which generates a
 *    BOM-prefixed CSV blob and triggers a browser download.  See csv.ts for the
 *    full column specification and multi-row variant format.
 *
 * 2. **File selection** — a visually hidden `<input type="file" accept=".csv">`
 *    is triggered by the "CSV আপলোড" button via `fileInputRef.current?.click()`.
 *    The `accept=".csv"` attribute is a UX hint only; the runtime check
 *    `!file.name.endsWith(".csv")` is the authoritative guard.
 *
 * 3. **CSV parse & import** — reads the file as text and delegates to
 *    `parseCSVText` (csv.ts).  On success, calls `props.onImport(rows)` to hand
 *    the parsed ProductRow array to the parent (BulkAddTab) which sets it into
 *    the shared product list state.
 *
 * ── CSV edge cases handled upstream (parseCSVText / parseCSVLine in csv.ts) ──
 *
 * • Quoted fields with embedded commas → RFC 4180 state machine in parseCSVLine.
 * • Escaped double-quotes (`""`) inside quoted values.
 * • Windows CRLF line endings → stripped by `.trim()` in the line filter.
 * • UTF-8 BOM prefix added to the generated template so Excel opens it correctly.
 * • Missing or extra columns → `vals[idx] || ""` never throws for short rows.
 * • Semicolon-delimited sizes/colors (Excel locale quirk) → replaced with commas.
 * • Non-numeric price/stock → `parseFloat(...) || 0` prevents NaN in the UI.
 * • Multi-row products (multiple CSV rows sharing the same `name`) → merged into
 *   a single ProductRow with multiple VariantRow children.
 *
 * ── Reset guard ───────────────────────────────────────────────────────────────
 * After every import attempt (success or failure) the hidden file input is reset
 * via `fileInputRef.current.value = ""` inside the `finally` block.  Without
 * this, selecting the same file a second time would not fire the `onChange`
 * event, because the browser only triggers `change` when the value actually
 * changes.
 *
 * ── Bengali UI strings used ───────────────────────────────────────────────────
 * • "CSV ফাইল দিন"              → toast shown when a non-.csv file is selected
 * • "কোনো প্রোডাক্ট পাওয়া যায়নি" → toast shown when parseCSVText returns []
 * • "CSV থেকে লোড হয়েছে"        → success toast with row count
 * • "CSV পার্স ব্যর্থ:"           → prefix for unexpected parse errors
 * • "টেমপ্লেট"                  → template download button label
 * • "CSV আপলোড"                 → file picker trigger button label
 *
 * @module CsvImportPanel
 */

import { useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { downloadCSVTemplate, parseCSVText } from "@/lib/admin/bulkProducts/csv";
import type { ProductRow } from "@/lib/admin/bulkProducts/types";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for {@link CsvImportPanel}.
 */
interface Props {
  /**
   * Callback invoked with the fully-parsed array of {@link ProductRow} objects
   * after a successful CSV import.  The parent (BulkAddTab) should merge or
   * replace the existing product list with these rows.
   *
   * Called only when:
   *   - The selected file has a `.csv` extension.
   *   - `parseCSVText` returns at least one row.
   *   - No read/parse exception is thrown.
   */
  onImport: (rows: ProductRow[]) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `CsvImportPanel` — admin card for bulk CSV product import.
 *
 * Renders two action buttons:
 *   1. **টেমপ্লেট** (Template) — downloads a pre-filled CSV template showing
 *      the supported column layout and a multi-row variant example.
 *   2. **CSV আপলোড** (Upload CSV) — opens the OS file picker restricted to
 *      `.csv` files.  On selection, reads the file as text, parses it, and
 *      calls `props.onImport` with the resulting rows.
 *
 * Also shows a static help `<Alert>` listing accepted column names so admins
 * can prepare files without downloading the template first.
 *
 * @param props - {@link Props}
 * @returns A Card containing the import controls and column reference.
 *
 * @example
 * <CsvImportPanel onImport={(rows) => setProducts(rows)} />
 */
const CsvImportPanel = ({ onImport }: Props) => {
  /**
   * Ref to the hidden `<input type="file">` element.
   * Used both to programmatically open the OS file picker (`.click()`) and to
   * reset the input value after each import attempt so the same file can be
   * re-imported without needing to pick a different file first.
   */
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Handles the native `change` event on the hidden file `<input>`.
   *
   * Flow:
   *   1. Guard: reject if no file selected or extension is not `.csv`.
   *      Bengali toast: "CSV ফাইল দিন" (Please provide a CSV file).
   *   2. Read file as UTF-8 text via the File API (`file.text()`).
   *   3. Parse the text with `parseCSVText` — handles all CSV edge cases
   *      documented in csv.ts (quotes, CRLF, BOM, missing columns, etc.).
   *   4. Guard: reject empty parse result (file had only headers or was blank).
   *      Bengali toast: "কোনো প্রোডাক্ট পাওয়া যায়নি" (No products found).
   *   5. Call `onImport(imported)` to hand rows to the parent.
   *   6. Show success toast with imported row count.
   *      Bengali toast: e.g. "১৫টি প্রোডাক্ট CSV থেকে লোড হয়েছে"
   *   7. `finally`: reset input value regardless of outcome so the same file
   *      can be re-selected if needed (browser won't fire `change` again
   *      otherwise).
   *
   * Error handling:
   *   - File API failures (quota, permissions) and parser exceptions are caught
   *     and shown as Bengali error toasts:
   *     "CSV পার্স ব্যর্থ: <error message>"
   *
   * @param e - React ChangeEvent from the hidden file input.
   */
  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    // Guard 1: No file selected, or file does not have .csv extension.
    // Note: `accept=".csv"` on the input is a UX hint; this is the real guard.
    if (!file || !file.name.endsWith(".csv")) {
      // Bengali: "Please provide a CSV file"
      toast.error("CSV ফাইল দিন");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      // Read the file as a UTF-8 string via the File API.
      const text = await file.text();

      // Parse: handles quoted fields, CRLF, BOM, multi-row variants, etc.
      const imported = parseCSVText(text);

      // Guard 2: Parser returned no rows (header-only file or all rows blank).
      // Bengali: "No products were found"
      if (!imported.length) {
        toast.error("কোনো প্রোডাক্ট পাওয়া যায়নি");
        return;
      }

      // Hand rows to parent — replaces or merges with existing product list.
      onImport(imported);

      // Bengali success: "X products loaded from CSV"
      toast.success(`${imported.length}টি প্রোডাক্ট CSV থেকে লোড হয়েছে`);
    } catch (err: any) {
      // Unexpected parse or File API error.
      // Bengali prefix: "CSV parse failed: <detail>"
      toast.error(`CSV পার্স ব্যর্থ: ${err.message}`);
    } finally {
      // Always reset the input so re-selecting the same file fires `onChange`
      // again.  Without this, the browser does nothing on re-selection.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {/* FileSpreadsheet icon visually signals this card is about CSV files */}
          <FileSpreadsheet className="w-5 h-5" />
          {/* Bengali: "CSV Import" */}
          CSV ইম্পোর্ট
        </CardTitle>
        {/* Bengali: "Upload product and variant data in a CSV file" */}
        <CardDescription>
          CSV ফাইলে প্রোডাক্ট ও ভেরিয়েন্ট ডেটা দিয়ে আপলোড করুন
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          {/*
           * Template download button.
           * Calls downloadCSVTemplate() which creates a Blob of the sample CSV
           * and triggers a browser download of "bulk_products_template.csv".
           * Bengali label: "টেমপ্লেট" (Template)
           */}
          <Button variant="outline" onClick={downloadCSVTemplate}>
            <Download className="w-4 h-4 mr-2" />
            টেমপ্লেট
          </Button>

          <div>
            {/*
             * Hidden file input — programmatically triggered by the button below.
             * `accept=".csv"` restricts the OS file picker to .csv files (UX only;
             * the handler also validates the extension at runtime).
             * `value` is reset in the `finally` block of handleCSVImport so the
             * same file can be re-selected after a failed import.
             */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCSVImport}
              className="hidden"
            />

            {/*
             * Visible upload button — proxies the click to the hidden input.
             * Bengali label: "CSV আপলোড" (Upload CSV)
             */}
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              CSV আপলোড
            </Button>
          </div>
        </div>

        {/*
         * Static column reference alert shown below the buttons.
         * Lists all accepted column names so admins can prepare files manually
         * without needing to download the template first.
         *
         * Bengali labels:
         *   "কলাম:"    → "Columns:"
         *   "ভেরিয়েন্ট:" → "Variant columns:"
         */}
        <Alert>
          <AlertDescription className="text-xs space-y-1">
            <p>
              <strong>কলাম:</strong>{" "}
              name, category, price, sale_price, stock, featured, description,
              image_url, sizes, colors, material
            </p>
            <p>
              <strong>ভেরিয়েন্ট:</strong>{" "}
              variant_size, variant_color, variant_stock, variant_sku,
              variant_price_adjustment
            </p>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default CsvImportPanel;
