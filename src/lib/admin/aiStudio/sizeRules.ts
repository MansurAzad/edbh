/**
 * Size + stock auto-fill rules for AI Product Studio.
 * Admins pick a base rule (default 52–58 @ 10 each) and layer per-category
 * exceptions (e.g. Abaya = 50–60, Burqa = 54–58 stock 5).
 */
export interface SizeRule {
  sizes: string[];
  stockPerSize: number;
}

export interface SizeRuleSet {
  base: SizeRule;
  /** category (case-insensitive) → override */
  overrides: Record<string, SizeRule>;
}

export const DEFAULT_RULES: SizeRuleSet = {
  base: { sizes: ["52", "54", "56", "58"], stockPerSize: 10 },
  overrides: {
    Abaya: { sizes: ["50", "52", "54", "56", "58", "60"], stockPerSize: 10 },
    Burqa: { sizes: ["54", "56", "58"], stockPerSize: 10 },
    Hijab: { sizes: ["Free"], stockPerSize: 20 },
    Fareasha: { sizes: ["Free"], stockPerSize: 15 },
  },
};

export function resolveRule(rules: SizeRuleSet, category?: string): SizeRule {
  if (!category) return rules.base;
  const key = Object.keys(rules.overrides).find(
    (k) => k.toLowerCase() === category.toLowerCase(),
  );
  return key ? rules.overrides[key] : rules.base;
}

/**
 * Apply a rule to a draft-shaped object: computes total stock as
 * `sizes.length * stockPerSize` and returns the size list.
 */
export function applyRule(
  draft: { category?: string },
  rules: SizeRuleSet,
): { sizes: string[]; stock: number } {
  const rule = resolveRule(rules, draft.category);
  return {
    sizes: [...rule.sizes],
    stock: rule.sizes.length * rule.stockPerSize,
  };
}
