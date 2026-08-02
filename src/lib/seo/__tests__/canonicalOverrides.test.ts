import { describe, expect, it } from "vitest";

import { auditCannibalization } from "@/lib/seo/cannibalization";
import {
  absoluteCanonical,
  buildCanonicalProposals,
  resolveCanonical,
} from "@/lib/seo/canonicalOverrides";

describe("canonical bulk updater", () => {
  const rows = auditCannibalization();

  it("only proposes canonical changes for high-risk keywords", () => {
    const proposals = buildCanonicalProposals(rows);
    for (const p of proposals) {
      expect(p.severity).toBe("high");
      expect(p.path).not.toBe(p.canonical_path);
    }
  });

  it("never proposes the same page twice for the same owner", () => {
    const proposals = buildCanonicalProposals(rows);
    const keys = proposals.map((p) => `${p.path}→${p.canonical_path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("marks proposals already stored as applied", () => {
    const proposals = buildCanonicalProposals(rows);
    if (proposals.length === 0) return;
    const [first] = proposals;
    const withExisting = buildCanonicalProposals(rows, [
      { path: first.path, canonical_path: first.canonical_path },
    ]);
    expect(withExisting.find((p) => p.path === first.path)?.alreadyApplied).toBe(true);
  });

  it("builds absolute canonical URLs on the production domain", () => {
    expect(absoluteCanonical("/shop")).toBe("https://dubaiborkahouse.com/shop");
    expect(absoluteCanonical("shop")).toBe("https://dubaiborkahouse.com/shop");
  });

  it("resolves the override target when one exists, else self-canonical", () => {
    const overrides = [{ path: "/collections/a", canonical_path: "/shop" }];
    expect(resolveCanonical("/collections/a", overrides)).toBe("https://dubaiborkahouse.com/shop");
    expect(resolveCanonical("/collections/b", overrides)).toBe(
      "https://dubaiborkahouse.com/collections/b",
    );
  });
});
