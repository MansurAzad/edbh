/**
 * @file keywordLandingPages.ts
 * Single source of truth for SEO keyword landing pages (`/collections/:slug`).
 *
 * Each entry drives, from ONE object:
 *  - the route slug
 *  - `<title>` / meta description / meta keywords (SEOHead)
 *  - the visible H1 (guaranteed to contain the primary keyword)
 *  - the product query (category + optional price ceiling)
 *  - internal-linking blocks and the admin keyword-coverage audit
 *
 * Keeping copy and metadata in one object is what makes the "H1 ↔ heading ↔ title"
 * consistency check (see `validateKeywordPages`) possible and automatic.
 */

export type LandingCategory = "All" | "Abaya" | "Borka" | "Hijab" | "Kaftan";

export interface KeywordLandingPage {
  /** URL slug under /collections/ */
  slug: string;
  /** Primary ranking keyword — MUST appear in h1, title and description. */
  primaryKeyword: string;
  /** Secondary keywords targeted by this page. */
  secondaryKeywords: string[];
  /** Visible H1 copy (plain text; rendered with the last word highlighted). */
  h1: string;
  /** SEO <title> (used as-is). */
  title: string;
  /** Meta description. */
  description: string;
  /** Bengali intro paragraph shown under the H1. */
  intro: string;
  /** Short selling points rendered as a visible list (keyword-rich body text). */
  highlights: string[];
  /** Product filter */
  category: LandingCategory;
  /** Optional max price filter (BDT). */
  maxPrice?: number;
  /** Slugs of related landing pages for the internal-linking block. */
  related: string[];
}

export const KEYWORD_LANDING_PAGES: KeywordLandingPage[] = [
  {
    slug: "dubai-borka-price-bangladesh",
    primaryKeyword: "Dubai Borka Price in Bangladesh",
    secondaryKeywords: ["Dubai Cherry Fabric Borka", "Cash on Delivery Borka"],
    h1: "Dubai Borka Price in Bangladesh",
    title: "Dubai Borka Price in Bangladesh – আপডেট প্রাইস লিস্ট",
    description:
      "Dubai borka price in Bangladesh — দুবাই চেরি ফেব্রিক বোরকা, নিদা ও ফারাশা বোরকার আপডেট দাম এক জায়গায়। Cash on delivery borka, সারা দেশে ডেলিভারি।",
    intro:
      "Dubai borka price in Bangladesh জানতে চাইলে এখানেই দেখুন — প্রতিটি বোরকার আপডেট দাম, ফেব্রিক ও সাইজ সহ। Dubai Cherry fabric borka থেকে শুরু করে প্রিমিয়াম কালেকশন, সবকিছুতেই cash on delivery borka সুবিধা।",
    highlights: [
      "সব প্রোডাক্টে আপডেট Dubai borka price in Bangladesh দেখানো",
      "Dubai Cherry Fabric Borka ও নিদা ফেব্রিকের অপশন",
      "Cash on delivery borka — সারা বাংলাদেশে হোম ডেলিভারি",
    ],
    category: "Borka",
    related: ["original-dubai-borka-bangladesh", "best-borka-shop-bangladesh", "luxury-borka-bangladesh"],
  },
  {
    slug: "original-dubai-borka-bangladesh",
    primaryKeyword: "Original Dubai Borka in Bangladesh",
    secondaryKeywords: ["Dubai Imported Abaya Bangladesh", "Wholesale Borka in Bangladesh"],
    h1: "Original Dubai Borka in Bangladesh",
    title: "Original Dubai Borka in Bangladesh – ১০০% ইম্পোর্টেড",
    description:
      "Original Dubai borka in Bangladesh — সরাসরি দুবাই থেকে আমদানিকৃত অরিজিনাল বোরকা ও Dubai imported abaya Bangladesh। Wholesale borka in Bangladesh অর্ডারও নেওয়া হয়।",
    intro:
      "Original Dubai borka in Bangladesh খুঁজছেন? আমাদের প্রতিটি বোরকা সরাসরি দুবাই থেকে আমদানি করা — কপি নয়, অরিজিনাল ফেব্রিক ও ফিনিশিং। Dubai imported abaya Bangladesh কালেকশন ও wholesale borka in Bangladesh দুটোই পাওয়া যাচ্ছে।",
    highlights: [
      "১০০% original Dubai borka in Bangladesh — ইম্পোর্ট প্রুফ সহ",
      "Dubai imported abaya Bangladesh কালেকশন নিয়মিত আপডেট",
      "Wholesale borka in Bangladesh — রিসেলারদের জন্য বিশেষ দাম",
    ],
    category: "Borka",
    related: ["dubai-borka-price-bangladesh", "dubai-imported-abaya-bangladesh", "online-borka-shopping-bangladesh"],
  },
  {
    slug: "best-borka-shop-bangladesh",
    primaryKeyword: "Best Borka Shop in Bangladesh",
    secondaryKeywords: ["Borka Shop in Dhaka", "Online Borka Shopping in Bangladesh"],
    h1: "Best Borka Shop in Bangladesh",
    title: "Best Borka Shop in Bangladesh – Borka Shop in Dhaka",
    description:
      "Best borka shop in Bangladesh — borka shop in Dhaka ও চট্টগ্রামে শোরুম, সাথে online borka shopping in Bangladesh সুবিধা। হাজারো কাস্টমারের আস্থা।",
    intro:
      "Best borka shop in Bangladesh হিসেবে আমরা অনলাইন ও শোরুম দুই জায়গাতেই সেবা দিচ্ছি। Borka shop in Dhaka থেকে অর্ডার করুন কিংবা online borka shopping in Bangladesh করুন ঘরে বসেই।",
    highlights: [
      "Borka shop in Dhaka ও চট্টগ্রাম — রিয়েল শোরুম ঠিকানা",
      "Online borka shopping in Bangladesh — ২৪/৭ অর্ডার",
      "রিটার্ন ও এক্সচেঞ্জ পলিসি সহ নিরাপদ কেনাকাটা",
    ],
    category: "All",
    related: ["online-borka-shopping-bangladesh", "luxury-borka-bangladesh", "dubai-borka-price-bangladesh"],
  },
  {
    slug: "luxury-borka-bangladesh",
    primaryKeyword: "Luxury Borka Bangladesh",
    secondaryKeywords: ["Premium Black Borka", "Bridal Borka Price in Bangladesh"],
    h1: "Luxury Borka Bangladesh",
    title: "Luxury Borka Bangladesh – Premium Black Borka Collection",
    description:
      "Luxury borka Bangladesh — premium black borka, স্টোন ও কারচুপি কাজের এক্সক্লুসিভ ডিজাইন এবং bridal borka price in Bangladesh এক জায়গায়।",
    intro:
      "Luxury borka Bangladesh কালেকশনে রয়েছে premium black borka, হেভি কারচুপি ও স্টোন ওয়ার্কের এক্সক্লুসিভ ডিজাইন। বিয়ে বা বিশেষ অনুষ্ঠানের জন্য bridal borka price in Bangladesh সহ বিস্তারিত দেখুন।",
    highlights: [
      "Premium black borka — প্রিমিয়াম ফেব্রিক ও ফিনিশিং",
      "Bridal borka price in Bangladesh — বাজেট অনুযায়ী অপশন",
      "লিমিটেড স্টক এক্সক্লুসিভ luxury borka Bangladesh ডিজাইন",
    ],
    category: "Borka",
    related: ["party-borka-under-5000", "dubai-imported-abaya-bangladesh", "best-borka-shop-bangladesh"],
  },
  {
    slug: "dubai-imported-abaya-bangladesh",
    primaryKeyword: "Dubai Imported Abaya Bangladesh",
    secondaryKeywords: ["Four Part Abaya Bangladesh", "Two Part Farasha Borka"],
    h1: "Dubai Imported Abaya Bangladesh",
    title: "Dubai Imported Abaya Bangladesh – Four Part Abaya",
    description:
      "Dubai imported abaya Bangladesh — four part abaya Bangladesh, two part Farasha borka ও এক্সক্লুসিভ দুবাই ডিজাইন। Cash on delivery borka সুবিধা সহ।",
    intro:
      "Dubai imported abaya Bangladesh কালেকশনে পাবেন four part abaya Bangladesh, two part Farasha borka ও লেটেস্ট দুবাই ডিজাইন — সবই সরাসরি আমদানিকৃত।",
    highlights: [
      "Four part abaya Bangladesh — বোরকা, হিজাব, নিকাব ও হ্যান্ড সকস",
      "Two part Farasha borka — আরামদায়ক ও ট্রেন্ডি কাট",
      "Dubai imported abaya Bangladesh — নিয়মিত নতুন স্টক",
    ],
    category: "Abaya",
    related: ["korean-nida-borka-price", "custom-size-abaya-bangladesh", "original-dubai-borka-bangladesh"],
  },
  {
    slug: "korean-nida-borka-price",
    primaryKeyword: "Korean Nida Borka Price",
    secondaryKeywords: ["Dubai Cherry Fabric Borka", "Comfortable Borka for Summer"],
    h1: "Korean Nida Borka Price",
    title: "Korean Nida Borka Price – Dubai Cherry Fabric Borka",
    description:
      "Korean Nida borka price ও Dubai Cherry fabric borka এর আপডেট দাম — হালকা, আরামদায়ক ও comfortable borka for summer কালেকশন।",
    intro:
      "Korean Nida borka price জানতে চাইলে এই কালেকশন দেখুন — কোরিয়ান নিদা ও Dubai Cherry fabric borka দুটোই হালকা, নন-ট্রান্সপারেন্ট এবং comfortable borka for summer হিসেবে সেরা।",
    highlights: [
      "Korean Nida borka price — ফেব্রিক অনুযায়ী স্বচ্ছ দাম",
      "Dubai Cherry Fabric Borka — সফট ও ফ্লোয়ি ফল",
      "Comfortable borka for summer — ব্রিদেবল ও হালকা",
    ],
    category: "Borka",
    related: ["comfortable-borka-for-summer", "dubai-borka-price-bangladesh", "dubai-imported-abaya-bangladesh"],
  },
  {
    slug: "party-borka-under-5000",
    primaryKeyword: "Party Borka Under 5000",
    secondaryKeywords: ["Bridal Borka Price in Bangladesh", "Luxury Borka Bangladesh"],
    h1: "Party Borka Under 5000",
    title: "Party Borka Under 5000 – বাজেট পার্টি বোরকা",
    description:
      "Party borka under 5000 — ৫০০০ টাকার মধ্যে পার্টি ও দাওয়াতের বোরকা, সাথে bridal borka price in Bangladesh ও luxury borka Bangladesh অপশন।",
    intro:
      "Party borka under 5000 বাজেটে সেরা ডিজাইনগুলো এখানে। দাওয়াত, ঈদ বা বিয়ের অনুষ্ঠানের জন্য — bridal borka price in Bangladesh সহ সব দাম পরিষ্কারভাবে দেওয়া।",
    highlights: [
      "সব প্রোডাক্ট ৳৫০০০ এর নিচে — party borka under 5000",
      "Bridal borka price in Bangladesh — বাজেট ফ্রেন্ডলি অপশন",
      "স্টোন, কারচুপি ও এমব্রয়ডারি ডিটেইল",
    ],
    category: "All",
    maxPrice: 5000,
    related: ["luxury-borka-bangladesh", "best-borka-shop-bangladesh", "online-borka-shopping-bangladesh"],
  },
  {
    slug: "plus-size-borka-bangladesh",
    primaryKeyword: "Plus Size Borka Bangladesh",
    secondaryKeywords: ["Custom Size Abaya Bangladesh", "Comfortable Borka for Summer"],
    h1: "Plus Size Borka Bangladesh",
    title: "Plus Size Borka Bangladesh – ৫২ থেকে ৬৪ সাইজ",
    description:
      "Plus size borka Bangladesh — ৫২ থেকে ৬৪ পর্যন্ত সাইজ, সাথে custom size abaya Bangladesh অর্ডার সুবিধা ও comfortable borka for summer ফেব্রিক।",
    intro:
      "Plus size borka Bangladesh খুঁজে পাওয়া কঠিন — আমাদের কাছে ৫২ থেকে ৬৪ পর্যন্ত সাইজ রেডি স্টকে আছে এবং custom size abaya Bangladesh অর্ডারও নেওয়া হয়।",
    highlights: [
      "৫২–৬৪ সাইজ — সত্যিকারের plus size borka Bangladesh",
      "Custom size abaya Bangladesh — মাপ অনুযায়ী তৈরি",
      "Comfortable borka for summer ফেব্রিক অপশন",
    ],
    category: "Borka",
    related: ["custom-size-abaya-bangladesh", "comfortable-borka-for-summer", "best-borka-shop-bangladesh"],
  },
  {
    slug: "custom-size-abaya-bangladesh",
    primaryKeyword: "Custom Size Abaya Bangladesh",
    secondaryKeywords: ["Plus Size Borka Bangladesh", "Four Part Abaya Bangladesh"],
    h1: "Custom Size Abaya Bangladesh",
    title: "Custom Size Abaya Bangladesh – মাপ অনুযায়ী আবায়া",
    description:
      "Custom size abaya Bangladesh — আপনার মাপ অনুযায়ী আবায়া ও plus size borka Bangladesh তৈরি, four part abaya Bangladesh অপশন সহ।",
    intro:
      "Custom size abaya Bangladesh সার্ভিসে আপনার লম্বা ও বডি মাপ অনুযায়ী আবায়া তৈরি করা হয়। Plus size borka Bangladesh এবং four part abaya Bangladesh — দুটোতেই কাস্টম সাইজ সম্ভব।",
    highlights: [
      "Custom size abaya Bangladesh — মাপ দিয়ে অর্ডার",
      "Plus size borka Bangladesh সহ যেকোনো সাইজ",
      "WhatsApp এ মাপ পাঠিয়েই কনফার্ম",
    ],
    category: "Abaya",
    related: ["plus-size-borka-bangladesh", "dubai-imported-abaya-bangladesh", "borka-with-matching-hijab"],
  },
  {
    slug: "borka-with-matching-hijab",
    primaryKeyword: "Borka With Matching Hijab",
    secondaryKeywords: ["Hajj Borka With Hijab", "Comfortable Borka for Summer"],
    h1: "Borka With Matching Hijab",
    title: "Borka With Matching Hijab – Hajj Borka With Hijab",
    description:
      "Borka with matching hijab ও Hajj borka with hijab — ম্যাচিং হিজাব-নিকাব সেট, comfortable borka for summer ফেব্রিকে।",
    intro:
      "Borka with matching hijab সেট মানেই ঝামেলামুক্ত স্টাইলিং। হজ ও ওমরাহর জন্য Hajj borka with hijab সেটগুলো হালকা ও comfortable borka for summer ফেব্রিকে তৈরি।",
    highlights: [
      "Borka with matching hijab — সম্পূর্ণ ম্যাচিং সেট",
      "Hajj borka with hijab — সাদা ও হালকা রঙের অপশন",
      "নিকাব ও হ্যান্ড সকস অ্যাড-অন",
    ],
    category: "Hijab",
    related: ["custom-size-abaya-bangladesh", "comfortable-borka-for-summer", "best-borka-shop-bangladesh"],
  },
  {
    slug: "comfortable-borka-for-summer",
    primaryKeyword: "Comfortable Borka for Summer",
    secondaryKeywords: ["Korean Nida Borka Price", "Plus Size Borka Bangladesh"],
    h1: "Comfortable Borka for Summer",
    title: "Comfortable Borka for Summer – গরমে আরামদায়ক বোরকা",
    description:
      "Comfortable borka for summer — গরমে আরামদায়ক হালকা ফেব্রিকের বোরকা, Korean Nida borka price ও plus size borka Bangladesh অপশন সহ।",
    intro:
      "Comfortable borka for summer কালেকশনে আছে ব্রিদেবল, হালকা ও নন-স্টিকি ফেব্রিকের বোরকা। Korean Nida borka price দেখে নিন, plus size borka Bangladesh সাইজও পাওয়া যাচ্ছে।",
    highlights: [
      "গরমে আরামদায়ক — comfortable borka for summer ফেব্রিক",
      "Korean Nida borka price — বাজেট অনুযায়ী",
      "Plus size borka Bangladesh সাইজ available",
    ],
    category: "Borka",
    related: ["korean-nida-borka-price", "plus-size-borka-bangladesh", "borka-with-matching-hijab"],
  },
  {
    slug: "online-borka-shopping-bangladesh",
    primaryKeyword: "Online Borka Shopping in Bangladesh",
    secondaryKeywords: ["Cash on Delivery Borka", "Wholesale Borka in Bangladesh", "Borka Shop in Dhaka"],
    h1: "Online Borka Shopping in Bangladesh",
    title: "Online Borka Shopping in Bangladesh – Cash on Delivery",
    description:
      "Online borka shopping in Bangladesh — cash on delivery borka, borka shop in Dhaka ডেলিভারি ও wholesale borka in Bangladesh অর্ডার সুবিধা।",
    intro:
      "Online borka shopping in Bangladesh এখন আরও সহজ — অর্ডার করুন, হাতে পেয়ে টাকা দিন। Cash on delivery borka সারা দেশে, borka shop in Dhaka এলাকায় দ্রুত ডেলিভারি এবং wholesale borka in Bangladesh অর্ডারও নেওয়া হয়।",
    highlights: [
      "Cash on delivery borka — হাতে পেয়ে পেমেন্ট",
      "Borka shop in Dhaka — ২৪–৪৮ ঘণ্টায় ডেলিভারি",
      "Wholesale borka in Bangladesh — বাল্ক প্রাইস",
    ],
    category: "All",
    related: ["best-borka-shop-bangladesh", "dubai-borka-price-bangladesh", "party-borka-under-5000"],
  },
];

export const getLandingPage = (slug?: string) =>
  KEYWORD_LANDING_PAGES.find((p) => p.slug === slug);

/** Every keyword targeted across the landing-page set. */
export const ALL_TARGET_KEYWORDS: string[] = Array.from(
  new Set(
    KEYWORD_LANDING_PAGES.flatMap((p) => [p.primaryKeyword, ...p.secondaryKeywords]),
  ),
);

export interface KeywordPageIssue {
  slug: string;
  field: "h1" | "title" | "description" | "slug" | "related";
  message: string;
}

/**
 * Automatic consistency check: the visible H1 must contain the primary keyword,
 * and the title/description must target it too. Used by the admin audit page
 * and by unit tests so drift is caught before it ships.
 */
export function validateKeywordPages(
  pages: KeywordLandingPage[] = KEYWORD_LANDING_PAGES,
): KeywordPageIssue[] {
  const issues: KeywordPageIssue[] = [];
  const seen = new Set<string>();
  const known = new Set(pages.map((p) => p.slug));

  for (const p of pages) {
    const kw = p.primaryKeyword.toLowerCase();
    if (seen.has(p.slug)) issues.push({ slug: p.slug, field: "slug", message: "ডুপ্লিকেট slug" });
    seen.add(p.slug);

    if (!p.h1.toLowerCase().includes(kw)) {
      issues.push({ slug: p.slug, field: "h1", message: `H1-এ primary keyword নেই: "${p.primaryKeyword}"` });
    }
    if (!p.title.toLowerCase().includes(kw)) {
      issues.push({ slug: p.slug, field: "title", message: `Title-এ primary keyword নেই: "${p.primaryKeyword}"` });
    }
    if (!p.description.toLowerCase().includes(kw)) {
      issues.push({
        slug: p.slug,
        field: "description",
        message: `Description-এ primary keyword নেই: "${p.primaryKeyword}"`,
      });
    }
    for (const r of p.related) {
      if (!known.has(r)) {
        issues.push({ slug: p.slug, field: "related", message: `অজানা related slug: ${r}` });
      }
    }
  }
  return issues;
}
