/**
 * JSON-LD schema validation.
 *
 * Catches the structured-data errors Google actually rejects (missing required
 * fields, wrong types, empty offers, bad breadcrumb ordering) before deploy,
 * so we don't discover them days later in Search Console.
 */
export type JsonLdSeverity = "error" | "warning";

export interface JsonLdIssue {
  severity: JsonLdSeverity;
  /** Page the schema belongs to. */
  path: string;
  /** Schema @type, e.g. "Product". */
  type: string;
  field: string;
  message: string;
}

export interface JsonLdValidationSummary {
  total: number;
  errors: number;
  warnings: number;
  clean: number;
}

type Node = Record<string, unknown>;

const isNonEmptyString = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const isPositiveNumber = (v: unknown) =>
  (typeof v === "number" && Number.isFinite(v) && v > 0) ||
  (typeof v === "string" && Number(v) > 0);

/** Required top-level fields per schema type. */
const REQUIRED: Record<string, string[]> = {
  Product: ["name", "description", "image", "offers"],
  Article: ["headline", "datePublished", "author"],
  BlogPosting: ["headline", "datePublished", "author"],
  FAQPage: ["mainEntity"],
  BreadcrumbList: ["itemListElement"],
  CollectionPage: ["name", "url"],
  Organization: ["name", "url"],
  WebSite: ["name", "url"],
};

/** Validates a single JSON-LD node. */
export function validateJsonLdNode(node: Node, path: string): JsonLdIssue[] {
  const issues: JsonLdIssue[] = [];
  const type = String(node["@type"] ?? "");
  const add = (severity: JsonLdSeverity, field: string, message: string) =>
    issues.push({ severity, path, type: type || "unknown", field, message });

  if (!isNonEmptyString(node["@context"])) {
    add("error", "@context", "@context অনুপস্থিত — https://schema.org হতে হবে।");
  }
  if (!type) {
    add("error", "@type", "@type অনুপস্থিত।");
    return issues;
  }

  for (const field of REQUIRED[type] ?? []) {
    const value = node[field];
    const empty =
      value == null ||
      (typeof value === "string" && !value.trim()) ||
      (Array.isArray(value) && value.length === 0);
    if (empty) add("error", field, `${type}-এ আবশ্যক ফিল্ড "${field}" নেই।`);
  }

  if (type === "Product") {
    const offers = node.offers as Node | undefined;
    if (offers) {
      if (!isPositiveNumber(offers.price)) {
        add("error", "offers.price", "offers.price একটি ধনাত্মক সংখ্যা হতে হবে।");
      }
      if (!isNonEmptyString(offers.priceCurrency)) {
        add("error", "offers.priceCurrency", "offers.priceCurrency (যেমন BDT) দিতে হবে।");
      }
      if (!isNonEmptyString(offers.availability)) {
        add("warning", "offers.availability", "availability দিলে rich result-এ স্টক স্ট্যাটাস দেখাবে।");
      }
      if (!isNonEmptyString(offers.url)) {
        add("warning", "offers.url", "offers.url না থাকলে Google পণ্যের URL অনুমান করে।");
      }
    }
    const image = node.image;
    const images = Array.isArray(image) ? image : image ? [image] : [];
    if (images.some((i) => typeof i !== "string" || !/^https?:\/\//.test(i))) {
      add("error", "image", "image অবশ্যই absolute https URL হতে হবে।");
    }
    if (!node.brand) add("warning", "brand", "brand যোগ করলে product rich result শক্তিশালী হয়।");
    const desc = String(node.description ?? "");
    if (desc && desc.length < 40) {
      add("warning", "description", "description খুব ছোট (৪০ অক্ষরের কম)।");
    }
  }

  if (type === "BreadcrumbList") {
    const items = (node.itemListElement as Node[]) ?? [];
    items.forEach((item, i) => {
      if (Number(item.position) !== i + 1) {
        add("error", `itemListElement[${i}].position`, "breadcrumb position ১ থেকে ক্রমানুসারে হতে হবে।");
      }
      if (!isNonEmptyString(item.name)) {
        add("error", `itemListElement[${i}].name`, "breadcrumb item-এ name নেই।");
      }
      if (!isNonEmptyString(item.item)) {
        add("warning", `itemListElement[${i}].item`, "শেষ ধাপ ছাড়া প্রতিটি breadcrumb-এ item URL থাকা উচিত।");
      }
    });
  }

  if (type === "FAQPage") {
    const entities = (node.mainEntity as Node[]) ?? [];
    entities.forEach((q, i) => {
      if (!isNonEmptyString(q.name)) add("error", `mainEntity[${i}].name`, "প্রশ্নের name নেই।");
      const answer = q.acceptedAnswer as Node | undefined;
      if (!answer || !isNonEmptyString(answer.text)) {
        add("error", `mainEntity[${i}].acceptedAnswer`, "acceptedAnswer.text নেই।");
      }
    });
  }

  if (type === "Article" || type === "BlogPosting") {
    const headline = String(node.headline ?? "");
    if (headline.length > 110) {
      add("warning", "headline", "headline ১১০ অক্ষরের বেশি — Google ছোট করে দেখাবে।");
    }
    if (!node.image) add("warning", "image", "Article-এ image না থাকলে rich result দেখাবে না।");
  }

  return issues;
}

export interface JsonLdPageInput {
  path: string;
  label: string;
  nodes: Node[];
}

export interface JsonLdPageReport {
  path: string;
  label: string;
  issues: JsonLdIssue[];
  errors: number;
  warnings: number;
}

/** Validates every schema on every supplied page. */
export function validateJsonLdPages(pages: JsonLdPageInput[]): JsonLdPageReport[] {
  return pages.map((page) => {
    const issues = page.nodes.flatMap((n) => validateJsonLdNode(n, page.path));
    return {
      path: page.path,
      label: page.label,
      issues,
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
    };
  });
}

export function jsonLdSummary(reports: JsonLdPageReport[]): JsonLdValidationSummary {
  return {
    total: reports.length,
    errors: reports.reduce((n, r) => n + r.errors, 0),
    warnings: reports.reduce((n, r) => n + r.warnings, 0),
    clean: reports.filter((r) => r.errors === 0 && r.warnings === 0).length,
  };
}
