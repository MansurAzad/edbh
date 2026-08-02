/**
 * @file keywordTaxonomy.ts
 * Single source of truth for the FULL keyword taxonomy of the site
 * (priority keywords, Bengali keywords, design/occasion/fabric/work/color,
 * complementary products, buyer-intent, size & feature tags, local SEO,
 * recommended categories and the copy-paste product tag vocabulary).
 *
 * Rules enforced here — so no page has to remember them:
 *  - every keyword appears EXACTLY ONCE across the whole taxonomy
 *    (case-insensitive dedupe, first group wins)
 *  - misspellings are normalised ("Poket Sleeve" -> "Pocket Sleeve")
 *  - page-level helpers return a deduped, capped keyword list, so meta tags
 *    never ship duplicate keywords
 *  - product tags are capped at 5–10 genuinely relevant tags
 */

export type KeywordGroupId =
  | "priority"
  | "bengali"
  | "borka-design"
  | "abaya-design"
  | "occasion"
  | "fabric"
  | "work"
  | "color"
  | "complementary"
  | "buyer-intent"
  | "size-feature"
  | "local";

export interface KeywordGroup {
  id: KeywordGroupId;
  label: string;
  /** Where this group belongs: page copy/meta vs. product filter tags. */
  usage: "page" | "tag";
  keywords: string[];
}

/** Normalises casing/spacing and fixes known misspellings. */
export function normaliseKeyword(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bPoket\b/gi, "Pocket")
    .replace(/\bBorkha\b/g, "Borka")
    .replace(/\bBurka\b/g, "Borka");
}

/** Case-insensitive dedupe preserving the first occurrence. */
export function dedupeKeywords(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const kw = normaliseKeyword(raw);
    const key = kw.toLowerCase();
    if (!kw || seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
  }
  return out;
}

const RAW_GROUPS: KeywordGroup[] = [
  {
    id: "priority",
    label: "Priority primary keywords",
    usage: "page",
    keywords: [
      "Dubai Borka House",
      "Dubai Borka Bangladesh",
      "Dubai Borka",
      "Dubai Imported Borka",
      "Original Dubai Borka",
      "Premium Dubai Borka",
      "Luxury Borka Bangladesh",
      "Borka Design Bangladesh",
      "New Borka Design",
      "Latest Borka Design",
      "Stylish Borka Design",
      "Premium Borka Bangladesh",
      "Imported Borka Bangladesh",
      "Dubai Abaya Bangladesh",
      "Dubai Imported Abaya",
      "Original Dubai Abaya",
      "Premium Abaya Bangladesh",
      "Abaya Design Bangladesh",
      "Borka and Abaya Shop Bangladesh",
      "Online Borka Shop Bangladesh",
      "Best Borka Shop in Bangladesh",
      "Dubai Borka Price in Bangladesh",
      "Abaya Price in Bangladesh",
      "Modest Fashion Bangladesh",
      "Islamic Clothing Bangladesh",
      "Premium Islamic Fashion",
      "Dubai Fashion Bangladesh",
    ],
  },
  {
    id: "bengali",
    label: "Bengali keywords",
    usage: "page",
    keywords: [
      "দুবাই বোরকা",
      "দুবাই বোরকা হাউস",
      "দুবাই বোরকা বাংলাদেশ",
      "দুবাই ইম্পোর্টেড বোরকা",
      "অরিজিনাল দুবাই বোরকা",
      "প্রিমিয়াম দুবাই বোরকা",
      "লাক্সারি বোরকা",
      "নতুন বোরকা ডিজাইন",
      "আধুনিক বোরকা ডিজাইন",
      "স্টাইলিশ বোরকা ডিজাইন",
      "ইউনিক বোরকা ডিজাইন",
      "বোরকা ডিজাইন বাংলাদেশ",
      "বোরকার দাম",
      "দুবাই বোরকার দাম",
      "বাংলাদেশে বোরকার দাম",
      "অনলাইনে বোরকা কিনুন",
      "বোরকা শপ বাংলাদেশ",
      "বাংলাদেশের সেরা বোরকা শপ",
      "ঢাকার বোরকা শপ",
      "দুবাই আবায়া",
      "দুবাই ইম্পোর্টেড আবায়া",
      "অরিজিনাল দুবাই আবায়া",
      "প্রিমিয়াম আবায়া",
      "নতুন আবায়া ডিজাইন",
      "স্টাইলিশ আবায়া ডিজাইন",
      "আবায়া শপ বাংলাদেশ",
      "আবায়ার দাম বাংলাদেশ",
      "হিজাবসহ বোরকা",
      "হিজাবসহ আবায়া",
      "পার্টি বোরকা",
      "বিয়ের বোরকা",
      "কারচুপি বোরকা",
      "এমব্রয়ডারি বোরকা",
      "দুই পার্ট বোরকা",
      "ফারাশা বোরকা",
      "কটি বোরকা",
      "হজ ও ওমরাহ বোরকা",
      "কাস্টম সাইজ বোরকা",
      "পাইকারি বোরকা বাংলাদেশ",
    ],
  },
  {
    id: "borka-design",
    label: "Borka design keywords",
    usage: "page",
    keywords: [
      "All Borka Design",
      "Unique Borka Design",
      "Simple Borka Design",
      "Plain Borka",
      "Gorgeous Borka Design",
      "Arabian Borka Design",
      "Dubai Borka Design",
      "Imported Borka Design",
      "Embroidery Borka",
      "Embroidered Borka",
      "Karchupi Borka",
      "Handmade Karchupi Borka",
      "Printed Borka",
      "Stone Work Borka",
      "Crystal Stone Borka",
      "Koti Borka",
      "Attach Koti Borka",
      "Extra Koti Borka",
      "Koti Style Borka",
      "Two Part Borka",
      "2 Part Borka",
      "Double Part Borka",
      "Four Part Borka",
      "One Part Borka",
      "Two Layer Borka",
      "Farasha Borka",
      "Cape Style Borka",
      "Gown Borka",
      "Buk Kuchi Borka",
      "Pocket Sleeve Borka",
      "Korean Silk Borka",
      "Black Borka",
      "Borka With Hijab",
      "Borka With Matching Hijab",
      "Long Hijab Borka",
      "Ready-to-Wear Borka",
      "Plus Size Borka",
      "Custom Size Borka",
    ],
  },
  {
    id: "abaya-design",
    label: "Abaya design keywords",
    usage: "page",
    keywords: [
      "All Abaya Design",
      "Dubai Abaya Design",
      "Imported Abaya Design",
      "New Abaya Design",
      "Latest Abaya Design",
      "Stylish Abaya Design",
      "Simple Abaya Design",
      "Plain Abaya",
      "Arabian Abaya Design",
      "Gorgeous Abaya Design",
      "Embroidery Abaya",
      "Embroidered Abaya",
      "Karchupi Abaya",
      "Printed Abaya",
      "Stone Work Abaya",
      "Two Part Abaya",
      "2 Part Abaya",
      "Four Part Abaya",
      "Farasha Abaya",
      "Dubai Farasha Abaya",
      "Chiffon Farasha Abaya",
      "Georgette Farasha Abaya",
      "Nida Farasha Abaya",
      "Pocket Sleeve Abaya",
      "Open Abaya",
      "Koti Abaya",
      "Abaya With Hijab",
      "Abaya With Matching Hijab",
      "Black Abaya",
      "Luxury Abaya",
      "Designer Abaya",
      "Ready-to-Wear Abaya",
      "Plus Size Abaya",
      "Custom Size Abaya",
    ],
  },
  {
    id: "occasion",
    label: "Occasion-based keywords",
    usage: "page",
    keywords: [
      "Party Borka",
      "Party Wear Borka",
      "Party Abaya",
      "Bridal Borka",
      "Bridal Abaya",
      "Wedding Borka",
      "Wedding Abaya",
      "Eid Borka Collection",
      "Eid Abaya Collection",
      "Eid Special Abaya",
      "Hajj Borka",
      "Umrah Borka",
      "Hajj and Umrah Clothing",
      "Hajj Abaya",
      "Daily Wear Borka",
      "Everyday Borka",
      "Casual Borka",
      "Office Wear Abaya",
      "Everyday Abaya",
      "Casual Abaya",
      "Formal Abaya",
      "Summer Borka",
      "Summer Friendly Borka",
      "Summer Abaya",
      "Special Occasion Abaya",
      "Luxury Party Borka",
      "Modest Wedding Dress",
    ],
  },
  {
    id: "fabric",
    label: "Fabric tags",
    usage: "tag",
    keywords: [
      "Dubai Cherry Fabric",
      "Original Dubai Cherry",
      "Premium Dubai Cherry",
      "Korean Nida",
      "Original Korean Nida",
      "Premium Nida",
      "Nida Fabric",
      "Zoom Fabric",
      "Zoom Jacquard",
      "Zoom Stripe Fabric",
      "Crystal Fabric",
      "Zafran Fabric",
      "Saffron Fabric",
      "Georgette",
      "Chiffon",
      "Indonesian Chiffon",
      "Crepe Fabric",
      "Korean Silk",
      "Malaysian Silk",
      "CY Fabric",
      "Swiss Dot Fabric",
      "Metallic Fabric",
      "Jacket Fabric",
      "Jacquard Fabric",
      "Popcorn Fabric",
      "Soft Fabric",
      "Breathable Fabric",
      "Summer Friendly Fabric",
      "Lightweight Fabric",
      "Imported Fabric",
      "Dubai Imported Fabric",
      "UAE Imported Fabric",
      "Premium Quality Fabric",
    ],
  },
  {
    id: "work",
    label: "Work, embroidery & decoration tags",
    usage: "tag",
    keywords: [
      "DMC Stone Work",
      "MC Stone Work",
      "Crystal Stone Work",
      "Bead Stone Work",
      "Premium Stone Work",
      "Handmade Stone Work",
      "Karchupi Work",
      "Handmade Karchupi",
      "Ari Embroidery",
      "Hand Embroidery",
      "Luxury Embroidery",
      "Floral Embroidery",
      "Leaf Embroidery",
      "Front Embroidery",
      "Sleeve Embroidery",
      "Lace Work",
      "Dubai Lace",
      "Korean Lace",
      "Imported Lace",
      "Karchupi Lace",
      "Pearl Work",
      "Locket Work",
      "Line-by-Line Design",
      "Contrast Work",
      "Golden Stone Work",
      "Silver Embroidery",
      "Black Stone Work",
      "Front and Back Embroidery",
      "Matching Lace",
      "Crystal and Lace Work",
    ],
  },
  {
    id: "color",
    label: "Color tags",
    usage: "tag",
    keywords: [
      "Brown Borka",
      "Coffee Borka",
      "Maroon Borka",
      "Deep Maroon",
      "Deep Green",
      "Bottle Green",
      "Sea Green",
      "Deep Sea Green",
      "Sage Green",
      "Mint Green",
      "Aqua Green",
      "Olive",
      "Deep Olive",
      "Sky Blue",
      "Royal Blue",
      "Deep Blue",
      "Purple",
      "Deep Purple",
      "Pastel Purple",
      "Pink",
      "Rose Pink",
      "Pastel Pink",
      "Orange",
      "Off-White",
      "White",
      "Cream",
      "Biscuit",
      "Gold",
      "Golden",
      "Grey",
      "Grey Cloud",
      "Mustard",
      "Royal Mustard",
      "Skin",
      "Nude",
      "Flesh",
      "Plum",
      "Koliza",
      "Deep Koliza",
      "Rossy Brown",
    ],
  },
  {
    id: "complementary",
    label: "Complementary product keywords",
    usage: "page",
    keywords: [
      "Premium Hijab",
      "Matching Hijab",
      "Long Hijab",
      "Dubai Hijab",
      "Hijab Collection Bangladesh",
      "Khimar",
      "Three Layer Khimar",
      "Jilbab",
      "Khimar and Jilbab",
      "Cover-Up",
      "Cover-Up Koti",
      "Kaftan",
      "Dubai Kaftan",
      "Premium Kaftan",
      "Scarf",
      "Dubai Scarf",
      "Poncho",
      "Modest Co-ords",
      "Islamic Clothing for Women",
      "Modest Wear for Women",
    ],
  },
  {
    id: "buyer-intent",
    label: "Price & buyer-intent keywords",
    usage: "page",
    keywords: [
      "Borka Price in Bangladesh",
      "Dubai Abaya Price in Bangladesh",
      "Borka Under 3000",
      "Borka Under 5000",
      "Premium Borka Under 5000",
      "Party Borka Price",
      "Bridal Borka Price",
      "Farasha Abaya Price",
      "Two Part Borka Price",
      "Black Borka Price",
      "Buy Borka Online",
      "Buy Abaya Online",
      "Buy Dubai Borka Online",
      "Buy Imported Abaya Online",
      "Order Borka Online Bangladesh",
      "Online Borka Shopping Bangladesh",
      "Cash on Delivery Borka",
      "Home Delivery Borka",
      "Nationwide Delivery Borka",
      "Borka Shop Near Me",
      "Abaya Shop Near Me",
      "Borka Showroom Bangladesh",
      "Dubai Borka Outlet",
      "Wholesale Borka Bangladesh",
      "Wholesale Abaya Bangladesh",
      "Retail Borka Bangladesh",
      "Ready Stock Borka",
      "New Arrival Borka",
      "Best Selling Borka",
      "Discount Borka",
      "Borka Sale Bangladesh",
    ],
  },
  {
    id: "size-feature",
    label: "Size & feature tags",
    usage: "tag",
    keywords: [
      "Size 50",
      "Size 52",
      "Size 54",
      "Size 56",
      "Size 58",
      "Size 60",
      "Free Size",
      "Custom Size",
      "Plus Size",
      "Full Coverage",
      "Loose Fit",
      "Comfortable Fit",
      "Front Zipper",
      "Matching Hijab Included",
      "Inner Included",
      "Two-Piece Set",
      "Four-Piece Set",
      "Washable",
      "Breathable",
      "Lightweight",
      "Summer Friendly",
      "Party Wear",
      "Ready-to-Wear",
      "Imported from Dubai",
      "Made in UAE",
      "Premium Finishing",
    ],
  },
  {
    id: "local",
    label: "Local SEO keywords",
    usage: "page",
    keywords: [
      "Borka Shop in Dhaka",
      "Dubai Borka Shop Dhaka",
      "Abaya Shop in Dhaka",
      "Borka Shop in Chattogram",
      "Dubai Borka Shop Chattogram",
      "Borka Shop in Sylhet",
      "Borka Shop in Khulna",
      "Borka Shop in Rajshahi",
      "Borka Shop in Cumilla",
      "Borka Shop in Bangladesh",
      "Dubai Borka Outlet Bangladesh",
      "Borka Home Delivery Bangladesh",
      "Borka Delivery All Over Bangladesh",
    ],
  },
];

/**
 * Groups with cross-group duplicates removed — a keyword lives in exactly one
 * group (the first one that claims it), so nothing is emitted twice.
 */
export const KEYWORD_GROUPS: KeywordGroup[] = (() => {
  const claimed = new Set<string>();
  return RAW_GROUPS.map((g) => {
    const keywords: string[] = [];
    for (const kw of dedupeKeywords(g.keywords)) {
      const key = kw.toLowerCase();
      if (claimed.has(key)) continue;
      claimed.add(key);
      keywords.push(kw);
    }
    return { ...g, keywords };
  });
})();

export const getGroup = (id: KeywordGroupId): KeywordGroup =>
  KEYWORD_GROUPS.find((g) => g.id === id)!;

export const groupKeywords = (...ids: KeywordGroupId[]): string[] =>
  dedupeKeywords(ids.flatMap((id) => getGroup(id).keywords));

/** Every keyword in the taxonomy, guaranteed duplicate-free. */
export const ALL_TAXONOMY_KEYWORDS: string[] = dedupeKeywords(
  KEYWORD_GROUPS.flatMap((g) => g.keywords),
);

/** Keywords that belong in page copy/meta (not product filter tags). */
export const PAGE_KEYWORDS: string[] = dedupeKeywords(
  KEYWORD_GROUPS.filter((g) => g.usage === "page").flatMap((g) => g.keywords),
);

/** Vocabulary for product tags (fabric, work, color, size/feature). */
export const PRODUCT_TAG_VOCABULARY: string[] = dedupeKeywords(
  KEYWORD_GROUPS.filter((g) => g.usage === "tag").flatMap((g) => g.keywords),
);

/* --------------------------- page-scoped selection ------------------------ */

export type KeywordScope =
  | "home"
  | "shop"
  | "categories"
  | "category:Borka"
  | "category:Abaya"
  | "category:Hijab"
  | "category:Kaftan";

const SCOPE_GROUPS: Record<KeywordScope, KeywordGroupId[]> = {
  home: ["priority", "bengali", "buyer-intent", "local"],
  shop: ["priority", "buyer-intent", "local", "occasion"],
  categories: ["priority", "borka-design", "abaya-design", "local"],
  "category:Borka": ["borka-design", "occasion", "bengali", "buyer-intent"],
  "category:Abaya": ["abaya-design", "occasion", "buyer-intent"],
  "category:Hijab": ["complementary", "occasion"],
  "category:Kaftan": ["complementary", "occasion", "buyer-intent"],
};

/** Max keywords emitted in one meta tag — keeps tags focused, not spammy. */
export const MAX_META_KEYWORDS = 40;

/**
 * Returns a deduped, capped keyword list for a page scope. `seed` keywords
 * (page-specific, highest priority) always come first.
 */
export function getScopeKeywords(scope: KeywordScope, seed: string[] = []): string[] {
  // Round-robin across the scope's groups so the cap never starves a whole
  // group (e.g. the Bengali keywords) out of the tag.
  const lists = SCOPE_GROUPS[scope].map((id) => [...getGroup(id).keywords]);
  const interleaved: string[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length) interleaved.push(l[i]);
  return dedupeKeywords([...seed, ...interleaved]).slice(0, MAX_META_KEYWORDS);
}

/* ------------------------------ product tags ------------------------------ */

export interface TaggableProduct {
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  fabric?: string | null;
  color?: string | null;
  description?: string | null;
  sizes?: string[] | null;
}

export const MIN_PRODUCT_TAGS = 5;
export const MAX_PRODUCT_TAGS = 10;

/**
 * Suggests 5–10 genuinely relevant tags for a product by matching the
 * tag vocabulary against its real attributes — never the whole keyword list.
 */
export function suggestProductTags(product: TaggableProduct): string[] {
  const haystack = [
    product.name,
    product.category,
    product.subcategory,
    product.fabric,
    product.color,
    product.description,
    ...(product.sizes ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matched = PRODUCT_TAG_VOCABULARY.filter((tag) =>
    haystack.includes(tag.toLowerCase()),
  );

  const fallbacks = ["Dubai Imported Fabric", "Premium Finishing", "Breathable", "Ready-to-Wear", "Made in UAE"];
  return dedupeKeywords([...matched, ...fallbacks]).slice(0, MAX_PRODUCT_TAGS);
}

/* ------------------------------- categories ------------------------------- */

export interface CategoryNode {
  label: string;
  path: string;
  children?: { label: string; path: string }[];
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const sub = (parent: string, labels: string[]) =>
  labels.map((label) => ({ label, path: `/shop?category=${parent}&subcategory=${slugify(label)}` }));

/** Recommended menu/category structure (section 13 of the keyword plan). */
export const RECOMMENDED_CATEGORIES: CategoryNode[] = [
  {
    label: "Borka",
    path: "/shop?category=Borka",
    children: sub("Borka", [
      "Plain Borka",
      "Karchupi Borka",
      "Embroidery Borka",
      "Party Borka",
      "Koti Borka",
      "Two Part Borka",
      "Farasha Borka",
      "Bridal Borka",
      "Hajj Borka",
    ]),
  },
  {
    label: "Abaya",
    path: "/shop?category=Abaya",
    children: sub("Abaya", [
      "Dubai Abaya",
      "Nida Abaya",
      "Farasha Abaya",
      "Karchupi Abaya",
      "Embroidery Abaya",
      "Party Abaya",
      "Bridal Abaya",
      "Abaya With Hijab",
    ]),
  },
  { label: "Farasha", path: "/collections/dubai-imported-abaya-bangladesh" },
  { label: "Hijab", path: "/shop?category=Hijab" },
  { label: "Kaftan", path: "/shop?category=Kaftan" },
  { label: "Hajj & Umrah", path: "/collections/borka-with-matching-hijab" },
  { label: "New Arrivals", path: "/shop?sort=newest" },
  { label: "Party Collection", path: "/collections/party-borka-under-5000" },
  { label: "Bridal Collection", path: "/collections/luxury-borka-bangladesh" },
  { label: "Dubai Imported Collection", path: "/collections/original-dubai-borka-bangladesh" },
  { label: "Shop by Price", path: "/collections/dubai-borka-price-bangladesh" },
];

/* -------------------------------- validation ------------------------------ */

export interface TaxonomyIssue {
  keyword: string;
  message: string;
}

/** Flags duplicates or misspellings that slip into any keyword list. */
export function validateKeywordList(list: string[]): TaxonomyIssue[] {
  const issues: TaxonomyIssue[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const kw = raw.trim();
    const key = kw.toLowerCase();
    if (seen.has(key)) issues.push({ keyword: kw, message: "duplicate keyword" });
    seen.add(key);
    if (normaliseKeyword(kw) !== kw)
      issues.push({ keyword: kw, message: `misspelled — use "${normaliseKeyword(kw)}"` });
  }
  return issues;
}
