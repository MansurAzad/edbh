/**
 * Schema-based required-field validator for AI Product Studio drafts.
 * Returns per-field human-readable errors so the UI can highlight the exact
 * missing input, not just show "something is wrong".
 */
export interface DraftSchemaInput {
  name: string;
  category: string;
  subcategory?: string;
  fabric?: string;
  price: number;
  sale_price: number | null;
  stock: number;
  sizes: string[];
  colors: string;
  description: string;
  imageUrl: string;
}

export interface FieldError {
  field: keyof DraftSchemaInput | "sale_price_vs_price";
  label: string;
  message: string;
}

const REQUIRED: Array<{
  field: keyof DraftSchemaInput;
  label: string;
  check: (d: DraftSchemaInput) => boolean;
  message: string;
}> = [
  { field: "name", label: "Name", check: (d) => !!d.name.trim(), message: "Product name required" },
  { field: "category", label: "Category", check: (d) => !!d.category.trim(), message: "Pick a category" },
  { field: "fabric", label: "Fabric", check: (d) => !!(d.fabric ?? "").trim(), message: "Fabric mapping required" },
  { field: "price", label: "Price", check: (d) => d.price > 0, message: "Price must be > 0" },
  { field: "stock", label: "Stock", check: (d) => d.stock >= 0, message: "Stock must be ≥ 0" },
  { field: "sizes", label: "Sizes", check: (d) => d.sizes.length > 0, message: "At least 1 size" },
  { field: "colors", label: "Colors", check: (d) => d.colors.trim().length > 0, message: "At least 1 color" },
  { field: "description", label: "Description", check: (d) => d.description.trim().length >= 10, message: "Description ≥ 10 chars" },
  { field: "imageUrl", label: "Image", check: (d) => !!d.imageUrl, message: "Image not uploaded" },
];

export function validateSchema(d: DraftSchemaInput): FieldError[] {
  const errors: FieldError[] = [];
  for (const rule of REQUIRED) {
    if (!rule.check(d)) errors.push({ field: rule.field, label: rule.label, message: rule.message });
  }
  if (d.sale_price != null && d.sale_price >= d.price) {
    errors.push({ field: "sale_price_vs_price", label: "Sale Price", message: "Sale must be < Price" });
  }
  return errors;
}
