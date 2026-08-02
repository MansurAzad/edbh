import { describe, it, expect } from "vitest";
import { validateJsonLdNode, validateJsonLdPages, jsonLdSummary } from "@/lib/seo/jsonLdValidator";
import { diffEntries, diffSummary, type StoredSnapshot } from "@/lib/seo/metaSnapshots";

const product = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Korean Nida Borka",
  description: "অরিজিনাল দুবাই কোয়ালিটি কোরিয়ান নিদা বোরকা, ক্যাশ অন ডেলিভারি সহ সারা দেশে।",
  image: ["https://dubaiborkahouse.com/a.jpg"],
  brand: { "@type": "Brand", name: "Dubai Borka House" },
  offers: {
    "@type": "Offer",
    price: 3200,
    priceCurrency: "BDT",
    availability: "https://schema.org/InStock",
    url: "https://dubaiborkahouse.com/product/x",
  },
};

describe("jsonLdValidator", () => {
  it("passes a complete Product schema", () => {
    expect(validateJsonLdNode(product, "/product/x")).toHaveLength(0);
  });

  it("flags missing required Product fields as errors", () => {
    const { offers, ...noOffers } = product;
    const issues = validateJsonLdNode(noOffers, "/product/x");
    expect(issues.some((i) => i.field === "offers" && i.severity === "error")).toBe(true);
  });

  it("rejects a non-positive price and missing currency", () => {
    const issues = validateJsonLdNode(
      { ...product, offers: { "@type": "Offer", price: 0 } },
      "/product/x",
    );
    expect(issues.filter((i) => i.severity === "error").map((i) => i.field)).toEqual(
      expect.arrayContaining(["offers.price", "offers.priceCurrency"]),
    );
  });

  it("rejects relative image URLs", () => {
    const issues = validateJsonLdNode({ ...product, image: ["/a.jpg"] }, "/product/x");
    expect(issues.some((i) => i.field === "image" && i.severity === "error")).toBe(true);
  });

  it("requires sequential breadcrumb positions", () => {
    const issues = validateJsonLdNode(
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "হোম", item: "https://x/" },
          { "@type": "ListItem", position: 3, name: "শপ", item: "https://x/shop" },
        ],
      },
      "/shop",
    );
    expect(issues.some((i) => i.field.includes("position"))).toBe(true);
  });

  it("requires FAQ acceptedAnswer text", () => {
    const issues = validateJsonLdNode(
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [{ "@type": "Question", name: "ডেলিভারি কতদিনে?" }],
      },
      "/faq",
    );
    expect(issues.some((i) => i.field === "mainEntity[0].acceptedAnswer")).toBe(true);
  });

  it("summarises page reports", () => {
    const reports = validateJsonLdPages([
      { path: "/a", label: "A", nodes: [product] },
      { path: "/b", label: "B", nodes: [{ "@type": "Product" } as never] },
    ]);
    const summary = jsonLdSummary(reports);
    expect(summary.total).toBe(2);
    expect(summary.errors).toBeGreaterThan(0);
    expect(summary.clean).toBe(1);
  });
});

const snapshot = {
  title: "T",
  description: "D",
  canonical: "https://x/a",
  ogTitle: "T",
  ogDescription: "D",
  ogImage: "https://x/og.jpg",
  ogType: "website",
  keywords: "k",
  jsonLd: [],
};

describe("meta diff", () => {
  const stored = new Map<string, StoredSnapshot>([
    ["a", { entry_key: "a", path: "/a", snapshot, updated_at: "2026-01-01T00:00:00Z" }],
  ]);

  it("detects unchanged entries", () => {
    const diffs = diffEntries([{ entryKey: "a", path: "/a", label: "A", snapshot }], stored);
    expect(diffs[0].kind).toBe("unchanged");
  });

  it("detects changed fields", () => {
    const diffs = diffEntries(
      [{ entryKey: "a", path: "/a", label: "A", snapshot: { ...snapshot, title: "New" } }],
      stored,
    );
    expect(diffs[0].kind).toBe("changed");
    expect(diffs[0].fields[0]).toMatchObject({ field: "title", before: "T", after: "New" });
  });

  it("detects added and removed pages", () => {
    const diffs = diffEntries([{ entryKey: "b", path: "/b", label: "B", snapshot }], stored);
    const summary = diffSummary(diffs);
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(1);
  });
});
