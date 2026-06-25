// Centralized query keys. Use these in useQuery + invalidateQueries so
// invalidation is type-safe and a typo doesn't silently break caching.
export const queryKeys = {
  siteContent: (keys?: string[]) => ["site-content", keys ?? "all"] as const,
  products: {
    all: ["products"] as const,
    featured: () => ["products", "featured"] as const,
    detail: (id: string) => ["products", "detail", id] as const,
    bySlug: (slug: string) => ["products", "slug", slug] as const,
  },
  categories: {
    all: ["categories"] as const,
  },
  orders: {
    all: ["orders"] as const,
    detail: (id: string) => ["orders", "detail", id] as const,
    byPhone: (phone: string) => ["orders", "phone", phone] as const,
  },
  homepageSections: () => ["homepage-sections"] as const,
  analytics: {
    audit: () => ["tracking-audit-stats"] as const,
  },
} as const;
