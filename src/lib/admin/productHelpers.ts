/**
 * @file productHelpers.ts
 * @description Pure domain constants, types, and the empty-form seed value for
 * the admin products feature.  No Supabase calls live here — this module is
 * consumed by {@link useAdminProducts} and every Products UI component.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase tables referenced (by consuming code, NOT this file)
 * ─────────────────────────────────────────────────────────────────────────────
 *  • products        – main product catalogue row (all scalar fields)
 *  • product_images  – gallery rows linked via `product_id` FK
 *
 * RLS notes (enforced on the Supabase side):
 *  • `products`       – SELECT is public; INSERT/UPDATE/DELETE requires
 *                       `is_admin = true` claim in the JWT.
 *  • `product_images` – same policy as `products`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports
 * ─────────────────────────────────────────────────────────────────────────────
 *  LOW_STOCK_THRESHOLD  – stock level at-or-below which a "Low" badge appears
 *  PRODUCTS_PER_PAGE    – default page size for the admin products table
 *  AdminProduct         – full product row shape (includes `id`)
 *  AdminProductInput    – write payload (AdminProduct minus the server-assigned `id`)
 *  emptyProduct         – blank AdminProductInput used to seed the "Add" dialog form
 *
 * বাংলা নোট: এই ফাইলে শুধু টাইপ ও কনস্ট্যান্ট। কোনো API কল নেই।
 * useAdminProducts হুক এই টাইপগুলো ব্যবহার করে Supabase থেকে ডেটা আনে।
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stock quantity at-or-below which a product is considered "low stock".
 * Products with `stock <= LOW_STOCK_THRESHOLD` receive an orange warning badge
 * in {@link ProductsTable}.
 *
 * Set to `1` so that any product with only 1 unit remaining is flagged.
 * Adjust this constant to change the threshold site-wide without touching
 * individual components.
 *
 * বাংলা: এই সংখ্যার সমান বা কম স্টক থাকলে "Low" ব্যাজ দেখানো হয়।
 */
export const LOW_STOCK_THRESHOLD = 1;

/**
 * Default number of product rows rendered per page in the admin products table.
 * Changing this constant updates pagination across {@link ProductsPagination}
 * and the slice logic in the admin products page.
 *
 * বাংলা: প্রতি পেজে কতটি প্রোডাক্ট দেখানো হবে তার ডিফল্ট সংখ্যা।
 */
export const PRODUCTS_PER_PAGE = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `AdminProduct` – exact shape of a row returned by:
 * ```ts
 * supabase.from("products").select("*")
 * ```
 *
 * All fields map 1-to-1 to `products` table columns.  Array columns (`sizes`,
 * `colors`) are stored as Postgres `text[]` and arrive as `string[] | null`.
 *
 * Nullability reflects the database column constraints:
 *   - `sale_price`  nullable (no sale)
 *   - `image_url`   nullable (no primary image)
 *   - `description` nullable
 *   - `sizes`       nullable text[]
 *   - `colors`      nullable text[]
 *   - `material`    nullable
 *   - `video_url`   nullable
 *
 * বাংলা: Supabase `products` টেবিলের একটি রো-এর সম্পূর্ণ ডেটা স্ট্রাকচার।
 */
export interface AdminProduct {
  /** UUID primary key assigned by Postgres (`gen_random_uuid()`). */
  id: string;

  /**
   * Human-readable product name shown in the table and product detail page.
   * Maps to `products.name` (NOT NULL).
   */
  name: string;

  /**
   * Category string used for filtering in {@link ProductsFilters}.
   * Free-form text; unique values are extracted at query time for the
   * category dropdown.  Maps to `products.category` (NOT NULL).
   *
   * বাংলা: ফিল্টার ড্রপডাউনে ক্যাটাগরি নির্ধারণ করে।
   */
  category: string;

  /**
   * Regular (MRP) price in BDT (Bangladeshi Taka).
   * Displayed with ৳ prefix.  Maps to `products.price` (NOT NULL, numeric).
   *
   * বাংলা: পণ্যের নিয়মিত মূল্য (টাকা)।
   */
  price: number;

  /**
   * Discounted sale price in BDT, or `null` when no active sale exists.
   * When non-null, the table shows `price` struck through and `sale_price`
   * highlighted in primary colour.
   *
   * বাংলা: বিক্রয় মূল্য; null হলে কোনো ছাড় নেই।
   */
  sale_price: number | null;

  /**
   * Available inventory count.  Stock = 0 → "Out of stock" badge (red).
   * Stock ≤ LOW_STOCK_THRESHOLD → "Low" badge (orange).
   * Maps to `products.stock` (NOT NULL, integer, default 0).
   *
   * বাংলা: স্টক শূন্য হলে "Out of stock" ব্যাজ দেখানো হয়।
   */
  stock: number;

  /**
   * Whether the product is pinned to featured sections (homepage, etc.).
   * Maps to `products.featured` (boolean, default false).
   *
   * বাংলা: ফিচার্ড প্রোডাক্ট হোমপেজে দেখানো হয়।
   */
  featured: boolean;

  /**
   * URL of the primary product image (CDN or public Storage URL), or `null`.
   * Falls back to `/placeholder.svg` in {@link ProductsTable} when null.
   *
   * বাংলা: প্রধান ছবির URL।
   */
  image_url: string | null;

  /**
   * Optional long-form product description (supports plain text; no HTML).
   * Maps to `products.description` (nullable text).
   *
   * বাংলা: পণ্যের বিস্তারিত বিবরণ।
   */
  description: string | null;

  /**
   * Available size options stored as a Postgres `text[]`.
   * Example: `['52"', '54"', '56"', '58"', '60"']`.
   * Null when no sizes are defined.
   *
   * বাংলা: পণ্যের সাইজ তালিকা (কমা দিয়ে আলাদা করে ইনপুট করা হয়)।
   */
  sizes: string[] | null;

  /**
   * Available colour variants stored as a Postgres `text[]`.
   * Example: `['Black', 'White', 'Navy']`.
   * Null when no colours are defined.
   *
   * বাংলা: পণ্যের রঙের তালিকা।
   */
  colors: string[] | null;

  /**
   * Fabric / material descriptor (e.g. "Nida", "Zoom", "Jorjet").
   * Maps to `products.material` (nullable text).
   *
   * বাংলা: কাপড়ের ধরন বা উপাদান।
   */
  material: string | null;

  /**
   * Public URL of an optional product showcase video (mp4 or embed URL).
   * Maps to `products.video_url` (nullable text).
   *
   * বাংলা: পণ্যের ভিডিও URL (ঐচ্ছিক)।
   */
  video_url: string | null;

  // ── Standardized catalogue fields (see product-field standard) ────────────
  /** Merchant SKU, unique when set. Example: `DBH-ABY-1001`. */
  sku: string | null;
  /** Subcategory under `category`, e.g. Farasha / Open Abaya / Borka. */
  subcategory: string | null;
  /** Fabric / cloth type, e.g. Nida / Barbie / Chiffon / Crepe. */
  fabric: string | null;
  /** Ornamentation, e.g. Embroidery / Karchupi / Stone / Beaded. */
  work_type: string | null;
  /** Piece count, e.g. `1 Part` / `2 Part` / `3 Part`. */
  part: string | null;
  /** Whether a matching hijab ships with the product. */
  hijab_included: boolean;
  /** Whether an inner garment ships with the product. */
  inner_included: boolean;
  /** Internal-only cost price. Never shown to customers. */
  purchase_cost: number | null;
  /** Auto-computed by the database. Read-only in the client. */
  margin: number | null;
  /** SEO/accessibility alt text for the primary product image. */
  image_alt_text: string | null;
  /** SEO `<title>` for the product detail page. */
  meta_title: string | null;
  /** SEO meta description. */
  meta_description: string | null;
}

export type AdminProductInput = Omit<AdminProduct, "id" | "margin">;

export const emptyProduct: AdminProductInput = {
  name: "",
  category: "",
  price: 0,
  sale_price: null,
  stock: 0,
  featured: false,
  image_url: "",
  description: "",
  sizes: [],
  colors: [],
  material: "",
  video_url: "",
  sku: "",
  subcategory: "",
  fabric: "",
  work_type: "",
  part: "",
  hijab_included: false,
  inner_included: false,
  purchase_cost: null,
  image_alt_text: "",
  meta_title: "",
  meta_description: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Description render-verify status
// ─────────────────────────────────────────────────────────────────────────────

/** Verify status buckets shown in the admin table + audit banner filter. */
export type DescriptionVerifyStatus = "pass" | "attention" | "fail";

/**
 * Pure, cheap heuristic that classifies whether a product description will
 * render safely and usefully on the storefront.
 *
 * - **fail**       : missing/blank, or contains raw script/iframe residue.
 * - **attention**  : very short (<80 chars), looks like raw HTML with no
 *                    Bengali/Latin prose, or has unbalanced tags.
 * - **pass**       : plain readable prose over the length threshold.
 *
 * Kept sync + framework-free so it can be reused by table cells, CSV export,
 * and the compare modal without any network calls.
 */
export interface DescriptionVerifyDetail {
  status: DescriptionVerifyStatus;
  /** Machine reason code (e.g. missing / script / raw_html / short / unbalanced_tags). */
  reason: string;
  /** Human-readable one-liner explaining why the status was assigned. */
  message: string;
}

/**
 * Structured verify result with a reason code + human message. `status` is
 * unchanged from {@link getDescriptionVerifyStatus} — this variant just adds
 * the *why*, so the admin table can show a tooltip/inline hint.
 */
export function getDescriptionVerifyDetail(desc: string | null | undefined): DescriptionVerifyDetail {
  const raw = (desc || "").trim();
  if (!raw) return { status: "fail", reason: "missing", message: "কোন ডেসক্রিপশন নেই" };
  if (/<\s*(script|iframe|object|embed)\b/i.test(raw)) {
    return { status: "fail", reason: "script", message: "স্ক্রিপ্ট/iframe ট্যাগ পাওয়া গেছে — নিরাপদ নয়" };
  }
  const stripped = raw.replace(/<[^>]*>/g, "").trim();
  if (stripped.length < 80) {
    return { status: "attention", reason: "short", message: `খুব ছোট (${stripped.length} chars, দরকার ≥ 80)` };
  }
  const angleRatio = (raw.match(/[<>]/g)?.length ?? 0) / raw.length;
  if (angleRatio > 0.05) {
    return { status: "attention", reason: "raw_html", message: "raw HTML মার্কআপ বেশি — সাদা টেক্সট রেন্ডার নাও হতে পারে" };
  }
  const opens = (raw.match(/<[a-z]/gi) || []).length;
  const closes = (raw.match(/<\/[a-z]/gi) || []).length;
  if (opens !== closes) {
    return { status: "attention", reason: "unbalanced_tags", message: `unbalanced HTML tags (${opens} open / ${closes} close)` };
  }
  return { status: "pass", reason: "ok", message: "readable prose, নিরাপদ" };
}

/** Back-compat: existing callers that only need the bucket. */
export function getDescriptionVerifyStatus(desc: string | null | undefined): DescriptionVerifyStatus {
  return getDescriptionVerifyDetail(desc).status;
}

/** Human label + tailwind class for a verify status. */
export const DESCRIPTION_VERIFY_META: Record<DescriptionVerifyStatus, { label: string; badge: string }> = {
  pass:       { label: "Pass",      badge: "border-emerald-300 text-emerald-700 bg-emerald-50" },
  attention:  { label: "Attention", badge: "border-amber-300 text-amber-700 bg-amber-50" },
  fail:       { label: "Fail",      badge: "border-red-300 text-red-700 bg-red-50" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sort helpers (shared with URL-param deep-links)
// ─────────────────────────────────────────────────────────────────────────────

export type ProductSortMode =
  | "newest"
  | "stock_asc" | "stock_desc"
  | "margin_asc" | "margin_desc"
  | "verify_worst" | "verify_best"
  | "similarity_desc";

const VERIFY_ORDER: Record<DescriptionVerifyStatus, number> = { fail: 0, attention: 1, pass: 2 };

/** Char-trigram Jaccard similarity — dependency-free, reused by table + compare modal. */
export function nameTrigramSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const A = norm(a); const B = norm(b);
  if (!A || !B) return 0;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const ga = grams(A); const gb = grams(B);
  if (!ga.size || !gb.size) return 0;
  let inter = 0; ga.forEach((g) => { if (gb.has(g)) inter += 1; });
  return inter / (ga.size + gb.size - inter);
}

/**
 * For each product, precompute the max name-trigram-similarity to any *other*
 * product in the list. Used by the `similarity_desc` sort so admins can
 * surface near-duplicate names to the top of the table.
 * O(n²) — fine for the admin catalog (≤ a few hundred rows).
 */
export function computeMaxNameSimilarity(products: AdminProduct[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < products.length; i++) {
    let best = 0;
    for (let j = 0; j < products.length; j++) {
      if (i === j) continue;
      const s = nameTrigramSimilarity(products[i].name, products[j].name);
      if (s > best) best = s;
    }
    out.set(products[i].id, best);
  }
  return out;
}

/** Pure sort — pulled out of the page so it can be unit-tested. */
export function sortAdminProducts(
  list: AdminProduct[],
  mode: ProductSortMode,
  ctx?: { simMap?: Map<string, number>; marginOf?: (p: AdminProduct) => number },
): AdminProduct[] {
  if (mode === "newest") return list;
  const marginOf = ctx?.marginOf ?? ((p) => {
    const cost = Number((p as any).purchase_cost ?? 0);
    const sell = Number(p.sale_price || p.price || 0);
    if (!cost || !sell) return -Infinity;
    return ((sell - cost) / sell) * 100;
  });
  const arr = [...list];
  arr.sort((a, b) => {
    switch (mode) {
      case "stock_asc":  return (a.stock ?? 0) - (b.stock ?? 0);
      case "stock_desc": return (b.stock ?? 0) - (a.stock ?? 0);
      case "margin_asc":  return marginOf(a) - marginOf(b);
      case "margin_desc": return marginOf(b) - marginOf(a);
      case "verify_worst":
        return VERIFY_ORDER[getDescriptionVerifyStatus(a.description)] -
               VERIFY_ORDER[getDescriptionVerifyStatus(b.description)];
      case "verify_best":
        return VERIFY_ORDER[getDescriptionVerifyStatus(b.description)] -
               VERIFY_ORDER[getDescriptionVerifyStatus(a.description)];
      case "similarity_desc": {
        const sa = ctx?.simMap?.get(a.id) ?? 0;
        const sb = ctx?.simMap?.get(b.id) ?? 0;
        return sb - sa;
      }
      default: return 0;
    }
  });
  return arr;
}


