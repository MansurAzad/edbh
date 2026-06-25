/**
 * @file query-keys.ts
 * @module lib/query-keys
 *
 * **Centralised TanStack Query key registry.**
 *
 * Every `useQuery`, `useSuspenseQuery`, `queryClient.invalidateQueries`, and
 * `queryClient.setQueryData` call in the application MUST use a key from this
 * file instead of an inline string literal.  This prevents the following
 * classes of bugs:
 *
 * 1. **Silent cache misses** — typos in string keys create a second cache
 *    entry instead of hitting the existing one.
 * 2. **Stale invalidation** — after a mutation you want to invalidate *all*
 *    queries under a logical namespace (e.g. every product query).  Prefix-
 *    based invalidation only works when keys are constructed consistently.
 * 3. **Refactor drift** — when a back-end endpoint changes, updating the key
 *    factory here ensures every consumer is automatically updated.
 *
 * ## Key-array convention
 *
 * TanStack Query performs **partial matching** for invalidation: passing
 * `{ queryKey: ["products"] }` to `invalidateQueries` will also match
 * `["products", "featured"]` and `["products", "detail", "123"]`.
 *
 * The hierarchy used here is:
 * ```
 * [entity]              — matches the entire entity namespace
 * [entity, "featured"]  — specific list variant
 * [entity, "detail", id]— single resource
 * [entity, "slug", slug]— alternate lookup key
 * [entity, "phone", ph] — lookup by phone (orders)
 * ```
 *
 * Keys are typed `as const` so TypeScript infers the narrowest literal tuple
 * type, which makes passing them to `queryKey:` type-safe without extra casts.
 *
 * ## Adding a new entity
 * 1. Add a new sub-object or function to `queryKeys`.
 * 2. Use `["entity-name", …discriminator…] as const` so invalidation narrows.
 * 3. Document the discriminators in this header.
 *
 * @example
 * // In a hook:
 * import { queryKeys } from "@/lib/query-keys";
 * const { data } = useQuery({
 *   queryKey: queryKeys.products.detail(productId),
 *   queryFn:  () => fetchProduct(productId),
 * });
 *
 * @example
 * // After a mutation that changes a product:
 * import { queryClient } from "@/lib/query-client";
 * import { queryKeys } from "@/lib/query-keys";
 * await queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
 * // ↑ Invalidates featured, detail, bySlug — all product sub-keys at once.
 */

/**
 * Canonical query-key factory for the entire application.
 *
 * All members are typed `as const` to give TypeScript the narrowest literal
 * types.  Factories (functions) accept the discriminating arguments so that
 * partial-match invalidation still works at the entity level while individual
 * records can be targeted precisely.
 *
 * @remarks
 * Treat this object as **the only source of truth** for cache keys.
 * Never pass raw string arrays to `useQuery` / `invalidateQueries`.
 */
export const queryKeys = {
  /**
   * CMS / site-content keys.
   *
   * @param keys - Optional array of content slugs/identifiers to scope the
   *   query to specific content blocks.  When omitted the query fetches all
   *   site content ("all").
   *
   * @example
   * queryKeys.siteContent()            // ["site-content", "all"]
   * queryKeys.siteContent(["hero"])    // ["site-content", ["hero"]]
   */
  siteContent: (keys?: string[]) => ["site-content", keys ?? "all"] as const,

  /** Product-related cache keys.  All share the `"products"` root prefix. */
  products: {
    /**
     * Root key for the products namespace.
     * Passing this to `invalidateQueries` clears **every** product cache entry.
     */
    all: ["products"] as const,

    /**
     * Featured / promoted products (home-page highlights).
     * Discriminator: `"featured"`.
     */
    featured: () => ["products", "featured"] as const,

    /**
     * Single product detail by numeric/UUID id.
     *
     * @param id - The product's primary-key string (UUID or integer-as-string).
     */
    detail: (id: string) => ["products", "detail", id] as const,

    /**
     * Single product lookup by URL slug.
     * Used by product-detail pages that receive the slug from the route.
     *
     * @param slug - URL-friendly slug, e.g. `"cotton-saree-red"`.
     */
    bySlug: (slug: string) => ["products", "slug", slug] as const,
  },

  /** Category list keys.  Currently a single flat list; extend as needed. */
  categories: {
    /**
     * All categories.  There is no pagination variant yet; if one is added,
     * add a `page(n)` factory here and keep `all` as the invalidation root.
     */
    all: ["categories"] as const,
  },

  /** Order-related cache keys. */
  orders: {
    /**
     * Root key for the orders namespace.
     * Invalidate this after any mutation that could affect the order list.
     */
    all: ["orders"] as const,

    /**
     * Single order by its UUID primary key.
     *
     * @param id - Order UUID, e.g. from the `orders.id` column.
     */
    detail: (id: string) => ["orders", "detail", id] as const,

    /**
     * Order lookup by customer phone number.
     * Used on the order-status page where the user enters their phone.
     *
     * @param phone - Normalised phone string as stored in the `orders` table.
     */
    byPhone: (phone: string) => ["orders", "phone", phone] as const,
  },

  /**
   * Homepage section configuration (banners, layout, featured collections).
   * Single key — no sub-variants needed yet.
   */
  homepageSections: () => ["homepage-sections"] as const,

  /** Analytics / admin keys — only consumed by admin dashboards. */
  analytics: {
    /**
     * Tracking audit stats panel.
     * Wraps the `tracking-audit-stats` Supabase view / RPC.
     */
    audit: () => ["tracking-audit-stats"] as const,
  },
} as const;
