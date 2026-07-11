/**
 * CSV / JSON export for AI Product Studio drafts. Column set matches the
 * requirement: filename, sha256, predicted fabric/type, colors, estimate
 * price + all final product fields the admin can review.
 */
export interface ExportableDraft {
  id: string;
  file?: { name?: string };
  fileHash?: string;
  status: string;
  name: string;
  category: string;
  subcategory: string;
  fabric: string;
  work_type: string;
  part: string;
  colors: string;
  sizes: string[];
  stock: number;
  price: number;
  sale_price: number | null;
  description: string;
  meta_title: string;
  meta_description: string;
  image_alt_text: string;
  imageUrl: string;
}

const COLUMNS = [
  "filename",
  "sha256",
  "status",
  "name",
  "category",
  "subcategory",
  "predicted_fabric",
  "predicted_type",
  "colors",
  "sizes",
  "stock",
  "estimate_price",
  "sale_price",
  "part",
  "meta_title",
  "meta_description",
  "image_alt_text",
  "image_url",
  "description",
] as const;

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toRow(d: ExportableDraft): Record<string, string | number> {
  return {
    filename: d.file?.name || "",
    sha256: d.fileHash || "",
    status: d.status,
    name: d.name,
    category: d.category,
    subcategory: d.subcategory,
    predicted_fabric: d.fabric,
    predicted_type: d.work_type,
    colors: d.colors,
    sizes: d.sizes.join("|"),
    stock: d.stock,
    estimate_price: d.price,
    sale_price: d.sale_price ?? "",
    part: d.part,
    meta_title: d.meta_title,
    meta_description: d.meta_description,
    image_alt_text: d.image_alt_text,
    image_url: d.imageUrl,
    description: d.description,
  };
}

export function draftsToCsv(drafts: ExportableDraft[]): string {
  const header = COLUMNS.join(",");
  const lines = drafts.map((d) => {
    const row = toRow(d);
    return COLUMNS.map((c) => csvEscape(row[c])).join(",");
  });
  return [header, ...lines].join("\n");
}

export function draftsToJson(drafts: ExportableDraft[]): string {
  return JSON.stringify(drafts.map(toRow), null, 2);
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
