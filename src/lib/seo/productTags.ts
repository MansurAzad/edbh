/**
 * @file productTags.ts
 * Enforces the "5–10 genuinely relevant tags per product" rule and suggests
 * additional tags from the keyword taxonomy when a product is under-tagged.
 */

import {
  MAX_PRODUCT_TAGS,
  MIN_PRODUCT_TAGS,
  PRODUCT_TAG_VOCABULARY,
  dedupeKeywords,
  normaliseKeyword,
  suggestProductTags,
  type TaggableProduct,
} from "./keywordTaxonomy";

export { MAX_PRODUCT_TAGS, MIN_PRODUCT_TAGS };

export type TagStatus = "ok" | "too-few" | "too-many" | "irrelevant";

export interface TagEnforcementResult {
  /** Cleaned, deduped, capped tag list — safe to persist. */
  tags: string[];
  /** Tags dropped because the list exceeded the cap. */
  removed: string[];
  /** Tags that are not part of the vocabulary and don't match the product. */
  irrelevant: string[];
  /** Extra tags recommended to reach the minimum. */
  suggestions: string[];
  status: TagStatus[];
  /** Bengali admin-facing messages. */
  messages: string[];
}

const relevantToProduct = (tag: string, product: TaggableProduct) => {
  const haystack = [
    product.name,
    product.category,
    product.subcategory,
    product.fabric,
    product.color,
    product.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const t = tag.toLowerCase();
  return (
    PRODUCT_TAG_VOCABULARY.some((v) => v.toLowerCase() === t) || haystack.includes(t)
  );
};

/**
 * Cleans and validates a product's tags.
 * - trims/normalises/dedupes (case-insensitive)
 * - caps at MAX_PRODUCT_TAGS (keeps the first, most relevant ones)
 * - flags tags unrelated to both the taxonomy and the product copy
 * - suggests taxonomy tags when below MIN_PRODUCT_TAGS
 */
export function enforceProductTags(
  rawTags: string[] | null | undefined,
  product: TaggableProduct,
): TagEnforcementResult {
  const cleaned = dedupeKeywords(
    (rawTags ?? []).map((t) => normaliseKeyword(String(t))).filter(Boolean),
  );

  const irrelevant = cleaned.filter((t) => !relevantToProduct(t, product));
  const ordered = [
    ...cleaned.filter((t) => !irrelevant.includes(t)),
    ...irrelevant,
  ];

  const tags = ordered.slice(0, MAX_PRODUCT_TAGS);
  const removed = ordered.slice(MAX_PRODUCT_TAGS);

  const suggestions =
    tags.length < MIN_PRODUCT_TAGS
      ? suggestProductTags(product)
          .filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
          .slice(0, MIN_PRODUCT_TAGS - tags.length + 3)
      : suggestProductTags(product)
          .filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
          .slice(0, 3);

  const status: TagStatus[] = [];
  const messages: string[] = [];

  if (tags.length < MIN_PRODUCT_TAGS) {
    status.push("too-few");
    messages.push(
      `কমপক্ষে ${MIN_PRODUCT_TAGS}টি ট্যাগ দরকার — এখন আছে ${tags.length}টি। নিচের সাজেশন থেকে যোগ করুন।`,
    );
  }
  if (removed.length) {
    status.push("too-many");
    messages.push(
      `সর্বোচ্চ ${MAX_PRODUCT_TAGS}টি ট্যাগ রাখা যাবে — অতিরিক্ত ${removed.length}টি বাদ দেওয়া হয়েছে: ${removed.join(", ")}।`,
    );
  }
  if (irrelevant.length) {
    status.push("irrelevant");
    messages.push(
      `এই ট্যাগগুলো প্রোডাক্টের সাথে প্রাসঙ্গিক মনে হচ্ছে না: ${irrelevant.join(", ")}।`,
    );
  }
  if (!status.length) status.push("ok");

  return { tags, removed, irrelevant, suggestions, status, messages };
}

export const isTagCountValid = (tags: string[]) =>
  tags.length >= MIN_PRODUCT_TAGS && tags.length <= MAX_PRODUCT_TAGS;
