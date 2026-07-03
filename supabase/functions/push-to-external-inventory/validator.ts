/**
 * Pure validation + mapping helpers for the external-inventory push.
 * Isolated so we can unit-test them with Deno's built-in test runner.
 */

export interface ProductInput {
  id?: string;
  name?: string;
  price?: number | string | null;
  sale_price?: number | string | null;
  stock?: number | string | null;
  slug?: string | null;
  image_url?: string | null;
  product_images?: Array<{ image_url?: string; display_order?: number }>;
  description?: string | null;
  category?: string | null;
  material?: string | null;
  sizes?: string[] | null;
  colors?: string[] | null;
  updated_at?: string;
}

/**
 * Validate a product row against the external API's expected schema.
 *
 * @param p Raw product row (as returned by Supabase select).
 * @returns Array of human-readable error strings; empty means valid.
 */
export function validateProduct(p: ProductInput): string[] {
  const errs: string[] = [];
  if (!p.id) errs.push("Missing product id");
  if (!p.name || typeof p.name !== "string" || !p.name.trim()) {
    errs.push("`name` is required and must be a non-empty string");
  } else if (p.name.length > 255) {
    errs.push("`name` must be ≤ 255 characters");
  }
  const price = Number(p.price);
  if (p.price == null || Number.isNaN(price)) {
    errs.push("`price` is required and must be numeric");
  } else if (price < 0) {
    errs.push("`price` must be ≥ 0");
  }
  if (p.sale_price != null && p.sale_price !== "") {
    const sp = Number(p.sale_price);
    if (Number.isNaN(sp) || sp < 0) errs.push("`sale_price` must be a non-negative number");
    else if (!Number.isNaN(price) && sp > price) errs.push("`sale_price` should not exceed `price`");
  }
  if (p.stock != null && p.stock !== "") {
    const s = Number(p.stock);
    if (!Number.isInteger(s) || s < 0) errs.push("`stock` must be a non-negative integer");
  }
  if (!p.image_url && (!Array.isArray(p.product_images) || p.product_images.length === 0)) {
    errs.push("At least one image (image_url or gallery) is required");
  }
  if (p.slug && typeof p.slug === "string" && p.slug.length > 255) {
    errs.push("`slug` too long (≤ 255)");
  }
  return errs;
}

/**
 * Map our product row → external inventory API payload.
 */
export function mapProduct(p: ProductInput, branchId?: string | null) {
  const priceNum = Number(p.price ?? 0);
  const effectivePrice = p.sale_price != null && p.sale_price !== ""
    ? Number(p.sale_price)
    : priceNum;
  const gallery = (p.product_images ?? [])
    .slice()
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((i) => i.image_url)
    .filter(Boolean) as string[];
  const image_urls = Array.from(new Set([p.image_url, ...gallery].filter(Boolean))) as string[];

  const payload: Record<string, unknown> = {
    name: p.name,
    sku: p.slug ?? p.id,
    external_ref: p.id,
    selling_price: effectivePrice,
    regular_price: priceNum,
    stock: p.stock ?? 0,
    description: p.description ?? "",
    category: p.category ?? null,
    material: p.material ?? null,
    sizes: p.sizes ?? [],
    colors: p.colors ?? [],
    image_url: p.image_url ?? null,
    image_urls,
    is_active: true,
    updated_at: p.updated_at,
  };
  if (branchId) payload.branch_id = branchId;
  return payload;
}
