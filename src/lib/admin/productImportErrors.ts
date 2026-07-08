/**
 * Groups CSV import errors by row number so the admin import dialog can
 * render a clear per-row summary of what needs to be fixed.
 *
 * Field-level errors (from `validateProductRow`) are preferred. If a row
 * appears only in the free-form `errors` list (e.g. thrown from Supabase),
 * the entry is captured under that row with no `field`.
 *
 * বাংলা: CSV ইম্পোর্টের ত্রুটিগুলোকে রো অনুযায়ী গ্রুপ করে যাতে অ্যাডমিন সহজে
 * প্রতিটি রো'র ভুল ফিল্ডসমূহ দেখতে পারেন।
 */

import type { CsvRowError } from "@/lib/admin/productCsv";

export interface GroupedErrorMessage {
  field?: string;
  message: string;
}

export interface GroupedErrorRow {
  row: number | null;
  messages: GroupedErrorMessage[];
}

/**
 * Parse a legacy free-form error string like `"রো 3 · price: must be positive"`
 * back into a structured `{ row, field, message }` object. Returns `null` when
 * the string does not match the expected format.
 */
export function parseLegacyErrorString(input: string): {
  row: number | null;
  field?: string;
  message: string;
} {
  const rowMatch = input.match(/রো\s+(\d+)\s*[·:]\s*(.*)$/);
  if (!rowMatch) {
    const simpleRow = input.match(/রো\s+(\d+):\s*(.*)$/);
    if (simpleRow) return { row: Number(simpleRow[1]), message: simpleRow[2] };
    return { row: null, message: input };
  }
  const rest = rowMatch[2];
  const fieldMatch = rest.match(/^([\w_]+):\s*(.*)$/);
  if (fieldMatch) {
    return { row: Number(rowMatch[1]), field: fieldMatch[1], message: fieldMatch[2] };
  }
  return { row: Number(rowMatch[1]), message: rest };
}

/**
 * Group per-field errors and legacy string errors by row number.
 * Prefers `fieldErrors` when both are present for the same row.
 */
export function groupErrorsByRow(
  fieldErrors: CsvRowError[],
  legacyErrors: string[] = [],
): GroupedErrorRow[] {
  const map = new Map<string, GroupedErrorRow>();

  const keyFor = (row: number | null) => (row == null ? "null" : String(row));

  for (const e of fieldErrors) {
    const key = keyFor(e.row ?? null);
    if (!map.has(key)) map.set(key, { row: e.row ?? null, messages: [] });
    map.get(key)!.messages.push({ field: e.field, message: e.message });
  }

  for (const raw of legacyErrors) {
    const parsed = parseLegacyErrorString(raw);
    const key = keyFor(parsed.row);
    // Avoid duplicating messages already covered by field-level errors.
    const existing = map.get(key);
    if (existing) {
      const dup = existing.messages.some(
        (m) => m.message === parsed.message && (m.field ?? "") === (parsed.field ?? ""),
      );
      if (!dup) existing.messages.push({ field: parsed.field, message: parsed.message });
      continue;
    }
    map.set(key, {
      row: parsed.row,
      messages: [{ field: parsed.field, message: parsed.message }],
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.row == null) return 1;
    if (b.row == null) return -1;
    return a.row - b.row;
  });
}
