/**
 * Centralized SEO configuration & metadata builders.
 *
 * কেন (Why): প্রতিটি পেজে আলাদা করে title/description/OG ট্যাগ লেখা হলে
 * ব্র্যান্ডিং অসমঞ্জস্য হয়ে যায়। এই ফাইল থেকেই সব ফরম্যাট তৈরি হয়, যাতে
 * Product ও Blog পেজে একই pattern + brand suffix প্রয়োগ হয়।
 *
 * Usage:
 *   const meta = buildProductSeo({ name, description, price, image, slug, category });
 *   <SEOHead {...meta} />
 */

// ---------- Site-wide constants ----------

/** Display brand name appended to every page title. */
export const SITE_NAME = "Dubai Borka House";

/** Canonical absolute base URL — used to build absolute OG URLs/images. */
export const SITE_URL = "https://dubaiborkahouse.com";

/** Default OG image for pages that don't supply one. */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpg`;

/** Default Bengali tagline / description. */
export const DEFAULT_DESCRIPTION =
  "দুবাই বোরকা হাউস — বাংলাদেশের সেরা প্রিমিয়াম বোরকা, আবায়া, হিজাব ও কাফতান শপ। দুবাই থেকে আমদানিকৃত সর্বোচ্চ মানের ফ্যাশন আপনার দোরগোড়ায়।";

/** Brand tagline used as homepage title suffix. */
export const DEFAULT_TITLE_SUFFIX = "প্রিমিয়াম ইসলামিক ফ্যাশন";

/** Hard limits recommended by Google for SERP truncation. */
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

// ---------- Shape returned by builders ----------

export interface SeoMeta {
  /** Page title BEFORE the brand suffix is appended (SEOHead adds " | SITE_NAME"). */
  title: string;
  /** Plain-text meta description (≤160 chars). */
  description: string;
  /** Site-relative canonical path, e.g. "/product/abc-123". */
  canonical: string;
  /** Absolute URL of the social share image. */
  ogImage: string;
  /** OpenGraph type — "website" | "article" | "product". */
  ogType: "website" | "article" | "product";
  /** Comma-separated keywords (legacy meta keywords). */
  keywords?: string;
}

// ---------- Helpers ----------

/**
 * Trim a string to `max` chars, breaking on the last word boundary
 * and appending an ellipsis if truncation happened.
 */
export function clamp(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

/** Resolve a possibly-relative image URL to an absolute one. */
export function absoluteUrl(pathOrUrl: string | undefined | null): string {
  if (!pathOrUrl) return DEFAULT_OG_IMAGE;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

// ---------- Product builder ----------

export interface ProductSeoInput {
  name: string;
  description?: string | null;
  price?: number;
  salePrice?: number | null;
  category?: string | null;
  image?: string | null;
  slug?: string | null;
  id: string;
}

/**
 * Build SEO metadata for a product detail page.
 * - Title: "<name>" (brand suffix added by SEOHead)
 * - Description: product description, or auto-generated price-aware fallback
 * - Canonical: /product/<slug || id>
 */
export function buildProductSeo(p: ProductSeoInput): SeoMeta {
  const effectivePrice = p.salePrice ?? p.price;
  const priceLabel =
    typeof effectivePrice === "number" ? `৳${effectivePrice.toLocaleString()}` : "";
  const cat = p.category?.trim() || "ইসলামিক ফ্যাশন";

  // Unique per-product title: "<name> – <category> – ৳price"
  // Prevents SERP-duplicate titles across the catalog.
  const titleParts = [p.name, cat, priceLabel].filter(Boolean);
  const uniqueTitle = titleParts.join(" – ");

  const fallbackDesc = `${p.name} কিনুন দুবাই বোরকা হাউস থেকে — প্রিমিয়াম ${cat}${
    priceLabel ? `, মূল্য ${priceLabel}` : ""
  }। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।`;

  return {
    title: clamp(uniqueTitle, TITLE_MAX),
    description: clamp(p.description?.trim() || fallbackDesc, DESCRIPTION_MAX),
    canonical: `/product/${p.slug || p.id}`,
    ogImage: absoluteUrl(p.image),
    ogType: "product",
    keywords: [p.name, cat, `buy ${cat} online`, "dubai borka house"]
      .filter(Boolean)
      .join(", "),
  };
}

// ---------- Blog builders ----------

export interface BlogPostSeoInput {
  title: string;
  excerpt?: string | null;
  slug: string;
  image?: string | null;
  tags?: string[];
}

/**
 * SEO metadata for a single blog post page (/blog/:slug).
 * ogType is "article" so social platforms render an article card.
 */
export function buildBlogPostSeo(post: BlogPostSeoInput): SeoMeta {
  const fallbackDesc = `${post.title} — দুবাই বোরকা হাউস ব্লগ থেকে ইসলামিক ফ্যাশন ও স্টাইলিং গাইড পড়ুন।`;
  return {
    title: clamp(post.title, TITLE_MAX),
    description: clamp(post.excerpt?.trim() || fallbackDesc, DESCRIPTION_MAX),
    canonical: `/blog/${post.slug}`,
    ogImage: absoluteUrl(post.image),
    ogType: "article",
    keywords: (post.tags && post.tags.length
      ? post.tags
      : ["ইসলামিক ফ্যাশন ব্লগ", "বোরকা স্টাইলিং", "abaya blog"]
    ).join(", "),
  };
}

/** SEO metadata for the blog index/listing page (/blog). */
export function buildBlogListSeo(): SeoMeta {
  return {
    title: "Abaya, Borka & Hijab Style Guide Bangladesh",
    description:
      "দুবাই বোরকা হাউস ব্লগ — আবায়া, বোরকা, হিজাব ও কাফতান স্টাইলিং গাইড, ট্রেন্ড ও কেনার টিপস বাংলাদেশে।",
    canonical: "/blog",
    ogImage: DEFAULT_OG_IMAGE,
    ogType: "website",
    keywords:
      "abaya style guide bangladesh, borka styling tips, hijab style guide, islamic fashion blog bd, দুবাই বোরকা হাউস ব্লগ",
  };
}

// ---------- JSON-LD (Schema.org) structured data builders ----------
//
// কেন (Why): Rich snippets (Google product cards, article previews) require
// schema.org markup. Centralizing the builders here keeps the Product/Article
// shapes consistent with the meta builders above — same SITE_URL, same
// canonical paths, same image resolution rules.

/** Schema.org @id / url for a product page. */
function productUrl(p: { slug?: string | null; id: string }): string {
  return `${SITE_URL}/product/${p.slug || p.id}`;
}

/**
 * Build a schema.org Product JSON-LD object for a product detail page.
 * Use with <StructuredData data={buildProductJsonLd(...)} />.
 *
 * @param p Product fields (subset of DB row).
 * @returns JSON-LD-ready Product object including Offer + optional AggregateRating.
 */
export interface ProductJsonLdInput extends ProductSeoInput {
  stock?: number | null;
  reviewCount?: number;
  averageRating?: number;
}

export function buildProductJsonLd(p: ProductJsonLdInput): Record<string, unknown> {
  const effectivePrice = p.salePrice ?? p.price ?? 0;
  const inStock = typeof p.stock === "number" ? p.stock > 0 : true;
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description?.trim() || `${p.name} — ${SITE_NAME}`,
    image: absoluteUrl(p.image),
    category: p.category || undefined,
    url: productUrl(p),
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: {
      "@type": "Offer",
      priceCurrency: "BDT",
      price: effectivePrice,
      url: productUrl(p),
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: SITE_NAME },
      // Sale prices are only valid for ~30 days per Google guidelines.
      ...(p.salePrice
        ? { priceValidUntil: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0] }
        : {}),
    },
  };

  // AggregateRating drives the star snippet — only emit when we have real data.
  if (p.reviewCount && p.reviewCount > 0 && p.averageRating) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: p.averageRating.toFixed(1),
      reviewCount: p.reviewCount,
      bestRating: "5",
      worstRating: "1",
    };
  }

  return schema;
}

/**
 * Build a schema.org Article JSON-LD object for a blog post.
 *
 * @param post Blog post fields.
 * @returns Article schema with publisher + image.
 */
export interface BlogPostJsonLdInput extends BlogPostSeoInput {
  publishedAt?: string;
  updatedAt?: string;
  author?: string;
}

export function buildBlogPostJsonLd(post: BlogPostJsonLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt?.trim() || `${post.title} — ${SITE_NAME}`,
    image: absoluteUrl(post.image),
    url: `${SITE_URL}/blog/${post.slug}`,
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
    author: { "@type": "Organization", name: post.author || SITE_NAME },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.jpg` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${post.slug}` },
  };
}
