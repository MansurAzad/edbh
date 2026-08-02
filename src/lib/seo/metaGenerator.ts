/**
 * @file metaGenerator.ts
 * Auto-generates and validates <title>, meta description, meta keywords and
 * OpenGraph/Twitter tags for every category and key section of the site.
 *
 * One source of truth so that:
 *  - no page ships a duplicate title/description (SERP cannibalisation)
 *  - the new 21-keyword strategy is applied everywhere
 *  - the site's ORIGINAL unique/brand keywords (Bengali brand terms, hijab &
 *    kaftan shop, Karchupi, Farasha, Nida, Chattogram/showroom terms) are
 *    preserved — those were never meant to be dropped by the keyword refresh.
 */

import { KEYWORD_LANDING_PAGES } from "./keywordLandingPages";

export const SITE_NAME = "Dubai Borka House";
export const SITE_NAME_BN = "দুবাই বোরকা হাউস";
export const BASE_URL = "https://dubaiborkahouse.com";
export const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.jpg`;

/**
 * Evergreen brand + category keywords that must stay on the site regardless of
 * which ranking-keyword batch is currently active. These are appended (deduped)
 * to every generated keyword list.
 */
export const EVERGREEN_KEYWORDS = [
  "Dubai Borka House",
  "দুবাই বোরকা হাউস",
  "প্রিমিয়াম বোরকা বাংলাদেশ",
  "আবায়া শপ বাংলাদেশ",
  "borka shop Bangladesh",
  "abaya shop Bangladesh",
  "hijab shop Bangladesh",
  "kaftan shop Bangladesh",
  "Karchupi borka Bangladesh",
  "Farasha abaya Bangladesh",
  "Dubai imported Nida abaya Bangladesh",
  "borka shop Chattogram",
];

/** The active ranking-keyword strategy (primary batch). */
export const PRIMARY_KEYWORDS = [
  "Dubai Borka Price in Bangladesh",
  "Original Dubai Borka in Bangladesh",
  "Best Borka Shop in Bangladesh",
  "Luxury Borka Bangladesh",
  "Premium Black Borka",
  "Dubai Imported Abaya Bangladesh",
  "Two Part Farasha Borka",
  "Four Part Abaya Bangladesh",
  "Borka With Matching Hijab",
  "Korean Nida Borka Price",
  "Dubai Cherry Fabric Borka",
  "Party Borka Under 5000",
  "Bridal Borka Price in Bangladesh",
  "Comfortable Borka for Summer",
  "Plus Size Borka Bangladesh",
  "Custom Size Abaya Bangladesh",
  "Hajj Borka With Hijab",
  "Online Borka Shopping in Bangladesh",
  "Cash on Delivery Borka",
  "Borka Shop in Dhaka",
  "Wholesale Borka in Bangladesh",
];

export interface GeneratedMeta {
  /** Stable id used by the validator + admin audit. */
  key: string;
  /** Canonical path (without origin). */
  path: string;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  ogTitle: string;
  ogDescription: string;
  ogType: string;
  ogUrl: string;
  ogImage: string;
  twitterCard: string;
}

interface MetaSeed {
  key: string;
  path: string;
  h1: string;
  titleCore: string;
  description: string;
  keywords: string[];
  ogType?: string;
}

const dedupe = (list: string[]) => {
  const seen = new Set<string>();
  return list.filter((k) => {
    const norm = k.trim().toLowerCase();
    if (!norm || seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
};

/** Builds the full meta object (incl. OG/Twitter) from a compact seed. */
export function buildMeta(seed: MetaSeed): GeneratedMeta {
  const title = seed.titleCore;
  const ogTitle = `${title} | ${SITE_NAME}`;
  return {
    key: seed.key,
    path: seed.path,
    title,
    description: seed.description,
    keywords: dedupe([...seed.keywords, ...EVERGREEN_KEYWORDS]).join(", "),
    h1: seed.h1,
    ogTitle,
    ogDescription: seed.description,
    ogType: seed.ogType || "website",
    ogUrl: `${BASE_URL}${seed.path}`,
    ogImage: DEFAULT_OG_IMAGE,
    twitterCard: "summary_large_image",
  };
}

/** Category seeds — one per shop category, each with a unique angle. */
const CATEGORY_SEEDS: MetaSeed[] = [
  {
    key: "category:All",
    path: "/shop",
    h1: "Best Borka Shop in Bangladesh",
    titleCore: "Best Borka Shop in Bangladesh – Dubai Borka Price & Abaya",
    description:
      "Best borka shop in Bangladesh — original Dubai borka in Bangladesh, Dubai imported abaya Bangladesh, luxury borka Bangladesh, plus size ও custom size abaya। Online borka shopping in Bangladesh, cash on delivery borka, borka shop in Dhaka।",
    keywords: PRIMARY_KEYWORDS,
  },
  {
    key: "category:Abaya",
    path: "/shop?category=Abaya",
    h1: "Dubai Imported Abaya Bangladesh",
    titleCore: "Dubai Imported Abaya Bangladesh – Custom Size Abaya",
    description:
      "Dubai imported abaya Bangladesh — four part abaya Bangladesh, two part Farasha borka, Korean Nida borka price ও custom size abaya Bangladesh। Farasha abaya Bangladesh ও abaya shop Bangladesh, cash on delivery borka সহ সারা দেশে ডেলিভারি।",
    keywords: [
      "Dubai Imported Abaya Bangladesh",
      "Four Part Abaya Bangladesh",
      "Custom Size Abaya Bangladesh",
      "Two Part Farasha Borka",
      "Korean Nida Borka Price",
      "Online Borka Shopping in Bangladesh",
      "Cash on Delivery Borka",
    ],
  },
  {
    key: "category:Borka",
    path: "/shop?category=Borka",
    h1: "Original Dubai Borka in Bangladesh",
    titleCore: "Original Dubai Borka in Bangladesh – Luxury Borka Price",
    description:
      "Original Dubai borka in Bangladesh — luxury borka Bangladesh, premium black borka, Dubai Cherry fabric borka, Karchupi borka Bangladesh, plus size borka Bangladesh ও bridal borka price in Bangladesh। Cash on delivery borka, borka shop in Dhaka।",
    keywords: [
      "Original Dubai Borka in Bangladesh",
      "Dubai Borka Price in Bangladesh",
      "Luxury Borka Bangladesh",
      "Premium Black Borka",
      "Dubai Cherry Fabric Borka",
      "Plus Size Borka Bangladesh",
      "Bridal Borka Price in Bangladesh",
      "Comfortable Borka for Summer",
      "Borka Shop in Dhaka",
      "Wholesale Borka in Bangladesh",
    ],
  },
  {
    key: "category:Hijab",
    path: "/shop?category=Hijab",
    h1: "Borka With Matching Hijab",
    titleCore: "Borka With Matching Hijab – Hijab Shop Bangladesh",
    description:
      "Borka with matching hijab ও Hajj borka with hijab — hijab shop Bangladesh-এর দুবাই ইম্পোর্টেড সিল্ক, শিফন ও জর্জেট হিজাব। Online borka shopping in Bangladesh, cash on delivery borka।",
    keywords: [
      "Borka With Matching Hijab",
      "Hajj Borka With Hijab",
      "hijab shop Bangladesh",
      "Online Borka Shopping in Bangladesh",
      "Cash on Delivery Borka",
    ],
  },
  {
    key: "category:Kaftan",
    path: "/shop?category=Kaftan",
    h1: "Party Borka Under 5000",
    titleCore: "Party Borka Under 5000 – Kaftan Shop Bangladesh",
    description:
      "Party borka under 5000 ও bridal borka price in Bangladesh — kaftan shop Bangladesh-এর প্রিমিয়াম দুবাই কাফতান, স্টোন, বিডস ও Karchupi ওয়ার্ক। Cash on delivery borka।",
    keywords: [
      "Party Borka Under 5000",
      "Bridal Borka Price in Bangladesh",
      "kaftan shop Bangladesh",
      "Luxury Borka Bangladesh",
      "Cash on Delivery Borka",
    ],
  },
];

/** Key non-category sections that also need unique, keyword-aligned meta. */
const SECTION_SEEDS: MetaSeed[] = [
  {
    key: "section:home",
    path: "/",
    h1: "Original Dubai Borka in Bangladesh — Luxury Borka Bangladesh",
    titleCore: "Dubai Borka Price in Bangladesh – Best Borka Shop in Bangladesh",
    description:
      "Original Dubai borka in Bangladesh — luxury borka Bangladesh, premium black borka, Dubai imported abaya Bangladesh, two part Farasha borka, plus size ও custom size abaya। Online borka shopping in Bangladesh, cash on delivery borka, borka shop in Dhaka।",
    keywords: PRIMARY_KEYWORDS,
  },
  {
    key: "section:categories",
    path: "/categories",
    h1: "Borka Shop in Dhaka",
    titleCore: "Borka Shop in Dhaka – Online Borka Shopping in Bangladesh",
    description:
      "Online borka shopping in Bangladesh — best borka shop in Bangladesh, borka shop in Dhaka, Dubai imported abaya Bangladesh, hijab shop Bangladesh ও kaftan shop Bangladesh। Wholesale borka in Bangladesh, cash on delivery borka।",
    keywords: [
      "Borka Shop in Dhaka",
      "Online Borka Shopping in Bangladesh",
      "Best Borka Shop in Bangladesh",
      "Wholesale Borka in Bangladesh",
      "Cash on Delivery Borka",
    ],
  },
];

/** Landing pages, projected into the same generated-meta shape. */
const LANDING_SEEDS: MetaSeed[] = KEYWORD_LANDING_PAGES.map((p) => ({
  key: `landing:${p.slug}`,
  path: `/collections/${p.slug}`,
  h1: p.h1,
  titleCore: p.title,
  description: p.description,
  keywords: [p.primaryKeyword, ...p.secondaryKeywords],
}));

export const ALL_META: GeneratedMeta[] = [
  ...SECTION_SEEDS,
  ...CATEGORY_SEEDS,
  ...LANDING_SEEDS,
].map(buildMeta);

export function getMeta(key: string): GeneratedMeta | undefined {
  return ALL_META.find((m) => m.key === key);
}

/** Category meta lookup used by /shop. Falls back to the "All" variant. */
export function getCategoryMeta(category: string): GeneratedMeta {
  return getMeta(`category:${category}`) || getMeta("category:All")!;
}

/* ------------------------------- validation ------------------------------ */

export interface MetaIssue {
  key: string;
  field: "title" | "description" | "keywords" | "h1" | "og";
  message: string;
}

export const TITLE_MAX = 65;
export const DESC_MIN = 70;
export const DESC_MAX = 300;

/**
 * Validates generated meta: length limits, keyword presence, H1↔title
 * alignment, OG completeness and cross-page duplicates.
 */
export function validateMeta(metas: GeneratedMeta[] = ALL_META): MetaIssue[] {
  const issues: MetaIssue[] = [];
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();

  for (const m of metas) {
    if (!m.title) issues.push({ key: m.key, field: "title", message: "title missing" });
    else if (m.title.length > TITLE_MAX)
      issues.push({ key: m.key, field: "title", message: `title too long (${m.title.length} > ${TITLE_MAX})` });

    if (m.description.length < DESC_MIN || m.description.length > DESC_MAX)
      issues.push({
        key: m.key,
        field: "description",
        message: `description length ${m.description.length} outside ${DESC_MIN}-${DESC_MAX}`,
      });

    if (!m.keywords.trim()) issues.push({ key: m.key, field: "keywords", message: "keywords missing" });

    // Every evergreen brand keyword set must survive the strategy refresh.
    const kw = m.keywords.toLowerCase();
    for (const ever of EVERGREEN_KEYWORDS) {
      if (!kw.includes(ever.toLowerCase()))
        issues.push({ key: m.key, field: "keywords", message: `evergreen keyword dropped: ${ever}` });
    }

    if (!m.h1) issues.push({ key: m.key, field: "h1", message: "h1 missing" });

    if (!m.ogTitle || !m.ogDescription || !m.ogUrl || !m.ogImage || !m.ogType)
      issues.push({ key: m.key, field: "og", message: "incomplete OpenGraph tags" });
    if (m.ogDescription !== m.description)
      issues.push({ key: m.key, field: "og", message: "og:description differs from meta description" });
    if (!m.ogUrl.startsWith(BASE_URL))
      issues.push({ key: m.key, field: "og", message: "og:url is not self-referencing the site domain" });

    const dupTitle = titles.get(m.title.toLowerCase());
    if (dupTitle) issues.push({ key: m.key, field: "title", message: `duplicate title with ${dupTitle}` });
    else titles.set(m.title.toLowerCase(), m.key);

    const dupDesc = descriptions.get(m.description.toLowerCase());
    if (dupDesc)
      issues.push({ key: m.key, field: "description", message: `duplicate description with ${dupDesc}` });
    else descriptions.set(m.description.toLowerCase(), m.key);
  }

  return issues;
}
