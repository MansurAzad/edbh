/**
 * @file categoryDescriptions.ts
 * Auto-generates a UNIQUE 300–500 word SEO description for every category /
 * collection page.
 *
 * Language rule: Bengali and English copy are generated as SEPARATE blocks —
 * never mixed inside one paragraph — so the language-mix detector
 * (`languageMix.ts`) stays clean.
 */

import { dedupeKeywords } from "./keywordTaxonomy";

export interface CategoryDescriptionBlock {
  lang: "bn" | "en";
  heading: string;
  paragraphs: string[];
}

export interface CategoryDescription {
  category: string;
  path: string;
  blocks: CategoryDescriptionBlock[];
  keywords: string[];
  wordCount: number;
  /** Flat plain-text version (used for JSON-LD `description` + audits). */
  text: string;
}

export const DESC_WORD_MIN = 300;
export const DESC_WORD_MAX = 500;

/** Counts Bengali + Latin words in a string. */
export const countWords = (text: string): number =>
  ((text.match(/[\u0980-\u09FF]+/g) ?? []).length +
    (text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length);

interface CategorySeed {
  category: string;
  path: string;
  /** English display name used inside sentences. */
  en: string;
  /** Bengali display name used inside sentences. */
  bn: string;
  fabrics: string[];
  designs: string[];
  occasions: string[];
  /** Bengali design words — keeps the Bengali block unique per category. */
  bnDesigns: string;
  /** Bengali fabric words. */
  bnFabrics: string;
  priceFrom: number;
  priceTo: number;
  keywords: string[];
}

const SEEDS: CategorySeed[] = [
  {
    category: "All",
    path: "/shop",
    en: "Dubai imported borka and abaya collection",
    bn: "দুবাই ইম্পোর্টেড বোরকা ও আবায়া কালেকশন",
    fabrics: ["Korean Nida", "Dubai Cherry", "Barbie Crepe", "Georgette"],
    designs: ["Two Part Farasha", "Four Part Abaya", "Koti Borka", "Karchupi Borka"],
    occasions: ["daily wear", "office", "party", "Hajj & Umrah", "bridal"],
    bnDesigns: "দুই পার্ট ফারাশা, ফোর পার্ট আবায়া, কোটি বোরকা ও কারচুপি ডিজাইন",
    bnFabrics: "কোরিয়ান নিদা, দুবাই চেরি, বার্বি ক্রেপ ও জর্জেট",
    priceFrom: 1800,
    priceTo: 12000,
    keywords: [
      "Best Borka Shop in Bangladesh",
      "Dubai Borka Price in Bangladesh",
      "Online Borka Shopping in Bangladesh",
      "Cash on Delivery Borka",
    ],
  },
  {
    category: "Borka",
    path: "/shop?category=Borka",
    en: "original Dubai borka collection",
    bn: "অরিজিনাল দুবাই বোরকা কালেকশন",
    fabrics: ["Korean Nida", "Dubai Cherry", "Zoom fabric", "Premium Crepe"],
    designs: ["Two Part Farasha Borka", "Koti Borka", "Buk Kuchi Borka", "Karchupi Borka"],
    occasions: ["daily wear", "university", "party", "Hajj", "wedding"],
    bnDesigns: "দুই পার্ট ফারাশা বোরকা, কোটি বোরকা, বুক কুচি বোরকা ও কারচুপি বোরকা",
    bnFabrics: "কোরিয়ান নিদা, দুবাই চেরি, জুম ফেব্রিক ও প্রিমিয়াম ক্রেপ",
    priceFrom: 1800,
    priceTo: 9500,
    keywords: [
      "Original Dubai Borka in Bangladesh",
      "Luxury Borka Bangladesh",
      "Premium Black Borka",
      "Plus Size Borka Bangladesh",
    ],
  },
  {
    category: "Abaya",
    path: "/shop?category=Abaya",
    en: "Dubai imported abaya collection",
    bn: "দুবাই ইম্পোর্টেড আবায়া কালেকশন",
    fabrics: ["Nida", "Barbie Crepe", "Chiffon", "Silk blend"],
    designs: ["Four Part Abaya", "Open Abaya", "Pocket Sleeve Abaya", "Embroidery Abaya"],
    occasions: ["office", "travel", "eid", "party", "bridal"],
    priceTo: 12000,
    bnDesigns: "ফোর পার্ট আবায়া, ওপেন আবায়া, পকেট স্লিভ আবায়া ও এমব্রয়ডারি আবায়া",
    bnFabrics: "নিদা, বার্বি ক্রেপ, শিফন ও সিল্ক মিশ্রিত কাপড়",
    priceFrom: 2200,
    keywords: [
      "Dubai Imported Abaya Bangladesh",
      "Custom Size Abaya Bangladesh",
      "Four Part Abaya Bangladesh",
      "Abaya Price in Bangladesh",
    ],
  },
  {
    category: "Hijab",
    path: "/shop?category=Hijab",
    en: "matching hijab collection",
    bn: "ম্যাচিং হিজাব কালেকশন",
    fabrics: ["Georgette", "Chiffon", "Jersey", "Silk"],
    designs: ["Instant Hijab", "Shawl Hijab", "Printed Hijab", "Stone Work Hijab"],
    occasions: ["daily wear", "office", "party", "Umrah"],
    bnDesigns: "ইনস্ট্যান্ট হিজাব, শাল হিজাব, প্রিন্টেড হিজাব ও স্টোন ওয়ার্ক হিজাব",
    bnFabrics: "জর্জেট, শিফন, জার্সি ও সিল্ক",
    priceFrom: 350,
    priceTo: 2500,
    keywords: [
      "Borka With Matching Hijab",
      "Hijab Shop Bangladesh",
      "Hajj Borka With Hijab",
      "Cash on Delivery Borka",
    ],
  },
  {
    category: "Kaftan",
    path: "/shop?category=Kaftan",
    en: "Dubai kaftan collection",
    bn: "দুবাই কাফতান কালেকশন",
    fabrics: ["Georgette", "Silk", "Velvet", "Chiffon"],
    designs: ["Embroidery Kaftan", "Stone Work Kaftan", "Printed Kaftan", "Bridal Kaftan"],
    occasions: ["eid", "party", "gift", "home wear"],
    bnDesigns: "এমব্রয়ডারি কাফতান, স্টোন ওয়ার্ক কাফতান, প্রিন্টেড কাফতান ও ব্রাইডাল কাফতান",
    bnFabrics: "জর্জেট, সিল্ক, ভেলভেট ও শিফন",
    priceFrom: 1500,
    priceTo: 8500,
    keywords: [
      "Dubai Kaftan Bangladesh",
      "Party Kaftan Bangladesh",
      "Luxury Borka Bangladesh",
      "Online Borka Shopping in Bangladesh",
    ],
  },
];

const list = (items: string[]) => items.join(", ");

function englishParagraphs(s: CategorySeed): string[] {
  return [
    `Dubai Borka House brings you a hand-picked ${s.en} for modest fashion lovers across Bangladesh. Every piece is sourced from trusted Dubai suppliers and checked for stitching quality and colour fastness before it reaches our Dhaka showroom.`,
    `The category currently features ${list(s.designs)} silhouettes, cut from premium ${list(s.fabrics)} fabrics. These fabrics are chosen for the Bangladeshi climate: breathable in humid weather, soft in drape and stable in shape after repeated washes.`,
    `Styles here suit ${list(s.occasions)} occasions. Prices generally range from BDT ${s.priceFrom.toLocaleString("en-US")} to BDT ${s.priceTo.toLocaleString("en-US")}, so a student, a working professional and a bride can all find something appropriate without leaving the category. Sizes run from 50 to 60 inches, and custom sizing is available on request for plus size and petite customers alike.`,
    `Ordering from the ${s.en} is simple: add to cart, confirm on WhatsApp and pay cash on delivery anywhere in Bangladesh. Inside Dhaka takes one to two days, outside Dhaka two to four. Exchange is available if the size does not fit.`,
    `Key search terms shoppers use for this page include ${list(s.keywords)}. If you are comparing prices before buying, visit our showroom or message us for live stock photos, fabric close-ups and honest advice about which design will suit your height, body type and everyday routine best.`,
  ];
}

function bengaliParagraphs(s: CategorySeed): string[] {
  return [
    `দুবাই বোরকা হাউস-এর ${s.bn} সাজানো হয়েছে বাংলাদেশের মডেস্ট ফ্যাশনপ্রেমীদের জন্য। ${s.bn}-এর প্রতিটি পণ্য সরাসরি দুবাই থেকে আমদানি করা এবং আমাদের ঢাকার শোরুমে পৌঁছানোর আগে সেলাই, কাপড়ের ওজন ও রঙের স্থায়িত্ব যাচাই করা হয়, তাই অনলাইনে যা দেখছেন হাতে পাবেন ঠিক তেমনটাই।`,
    `এই ক্যাটাগরিতে পাবেন ${s.bnDesigns} সহ নানা ডিজাইন। ব্যবহৃত কাপড়ের মধ্যে রয়েছে ${s.bnFabrics}, যা বাংলাদেশের আবহাওয়ায় আরামদায়ক, সহজে কুঁচকে যায় না এবং বারবার ধোয়ার পরেও আকার ঠিক থাকে।`,
    `দৈনন্দিন ব্যবহার, অফিস, ভার্সিটি, দাওয়াত, ঈদ, হজ-উমরাহ কিংবা বিয়ের অনুষ্ঠান — সব উপলক্ষের জন্য ${s.bn}-এ আলাদা ডিজাইন সাজানো আছে। দাম শুরু ${s.priceFrom} টাকা থেকে এবং প্রিমিয়াম কালেকশনে সর্বোচ্চ ${s.priceTo} টাকা পর্যন্ত, ফলে বাজেট অনুযায়ী পছন্দ করা সহজ হয়।`,
    `${s.bn}-এ সাইজ পাওয়া যায় ৫০ থেকে ৬০ ইঞ্চি পর্যন্ত এবং কাস্টম সাইজের অর্ডারও নেওয়া হয়। কার্টে যোগ করে হোয়াটসঅ্যাপে কনফার্ম করুন; সারা বাংলাদেশে ক্যাশ অন ডেলিভারি সুবিধা রয়েছে।`,
    `সাইজ না মিললে নির্ধারিত সময়ের মধ্যে এক্সচেঞ্জ করার সুযোগ আছে। ${s.bn} থেকে কোন ডিজাইনটি আপনার উচ্চতা ও শরীরের গড়নের সাথে মানাবে তা জানতে আমাদের শোরুমে আসুন অথবা মেসেজ দিন — লাইভ স্টক ছবি ও কাপড়ের ক্লোজ-আপ দেখে নিশ্চিত হয়ে তবেই অর্ডার করতে পারবেন।`,
  ];
}

function buildDescription(s: CategorySeed): CategoryDescription {
  const blocks: CategoryDescriptionBlock[] = [
    { lang: "bn", heading: "বাংলায় বিস্তারিত", paragraphs: bengaliParagraphs(s) },
    { lang: "en", heading: "In English", paragraphs: englishParagraphs(s) },
  ];
  const text = blocks.flatMap((b) => b.paragraphs).join("\n\n");
  return {
    category: s.category,
    path: s.path,
    blocks,
    keywords: dedupeKeywords(s.keywords),
    wordCount: countWords(text),
    text,
  };
}

export const CATEGORY_DESCRIPTIONS: CategoryDescription[] = SEEDS.map(buildDescription);

export const getCategoryDescription = (category?: string): CategoryDescription =>
  CATEGORY_DESCRIPTIONS.find(
    (d) => d.category.toLowerCase() === (category ?? "All").toLowerCase(),
  ) ?? CATEGORY_DESCRIPTIONS[0];

export interface CategoryDescriptionIssue {
  category: string;
  message: string;
}

/** Validates word count + uniqueness across categories. */
export function validateCategoryDescriptions(
  descriptions: CategoryDescription[] = CATEGORY_DESCRIPTIONS,
): CategoryDescriptionIssue[] {
  const issues: CategoryDescriptionIssue[] = [];
  const seenParagraphs = new Map<string, string>();

  for (const d of descriptions) {
    if (d.wordCount < DESC_WORD_MIN)
      issues.push({ category: d.category, message: `description too short (${d.wordCount} words, min ${DESC_WORD_MIN})` });
    if (d.wordCount > DESC_WORD_MAX)
      issues.push({ category: d.category, message: `description too long (${d.wordCount} words, max ${DESC_WORD_MAX})` });

    for (const block of d.blocks) {
      for (const p of block.paragraphs) {
        const key = p.trim().toLowerCase();
        const owner = seenParagraphs.get(key);
        if (owner && owner !== d.category)
          issues.push({ category: d.category, message: `duplicate paragraph shared with ${owner}` });
        else seenParagraphs.set(key, d.category);
      }
    }
  }
  return issues;
}
