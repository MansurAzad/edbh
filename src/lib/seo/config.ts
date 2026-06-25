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

  const fallbackDesc = `${p.name} কিনুন দুবাই বোরকা হাউস থেকে — প্রিমিয়াম ${cat}${
    priceLabel ? `, মূল্য ${priceLabel}` : ""
  }। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।`;

  return {
    title: clamp(p.name, TITLE_MAX),
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
    title: "ব্লগ — ফ্যাশন টিপস ও স্টাইলিং গাইড",
    description:
      "দুবাই বোরকা হাউস ব্লগ — ইসলামিক ফ্যাশন ট্রেন্ড, বোরকা স্টাইলিং টিপস, আবায়া কেনার গাইড ও আরো অনেক কিছু।",
    canonical: "/blog",
    ogImage: DEFAULT_OG_IMAGE,
    ogType: "website",
    keywords:
      "বোরকা স্টাইলিং, আবায়া ফ্যাশন টিপস, হিজাব স্টাইল গাইড, ইসলামিক ফ্যাশন ব্লগ, borka styling tips, abaya fashion blog",
  };
}
