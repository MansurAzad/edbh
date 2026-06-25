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
}

/**
 * `AdminProductInput` – write payload for INSERT and UPDATE operations.
 *
 * Identical to {@link AdminProduct} with the server-assigned `id` field
 * stripped out.  Used as:
 *  - The type of `formData` state in the products admin page.
 *  - The `data` argument passed to `saveMutation` in {@link useAdminProducts}.
 *
 * ```ts
 * // Insert
 * supabase.from("products").insert(productData)
 * // Update
 * supabase.from("products").update(productData).eq("id", existingId)
 * ```
 *
 * বাংলা: নতুন প্রোডাক্ট তৈরি বা বিদ্যমান প্রোডাক্ট আপডেটের জন্য পেলোড টাইপ।
 */
export type AdminProductInput = Omit<AdminProduct, "id">;

// ─────────────────────────────────────────────────────────────────────────────
// Form seed value
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `emptyProduct` – blank {@link AdminProductInput} used to reset / initialise
 * the {@link ProductFormDialog} state when opening the "Add New Product" flow.
 *
 * All required numeric fields default to `0`; all optional nullable fields
 * default to their appropriate falsy value (`null` or `""`) so that controlled
 * inputs are always in "controlled" mode from the first render.
 *
 * Usage in the admin products page:
 * ```ts
 * const [formData, setFormData] = useState<AdminProductInput>(emptyProduct);
 * // Reset on dialog close:
 * setFormData(emptyProduct);
 * ```
 *
 * বাংলা: নতুন প্রোডাক্ট ফর্ম খোলার সময় এই অবজেক্টটি দিয়ে ফর্ম রিসেট করা হয়।
 */
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
};
