/**
 * @file productAuditCsv.ts
 * @description Pure helpers that build the CSV payload for the Business Audit
 * scoped exports (oos / low_stock / duplicates) and the description-verify
 * scoped export. Extracted out of the Products page so the column layout and
 * grouping logic can be unit-tested without React.
 */
import type { AdminProduct, DescriptionVerifyStatus } from "./productHelpers";
import { getDescriptionVerifyStatus } from "./productHelpers";
import { productsToCsv } from "./productCsv";

export type AuditFilter = "" | "oos" | "low_stock" | "duplicates" | "slow" | "dead";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const priceOf = (p: AdminProduct) => Number(p.sale_price || p.price || 0);

export interface AuditCsvResult {
  csv: string;
  filename: string;
}

/**
 * Build the CSV payload + filename for the current audit view.
 * - `oos` / `low_stock` → stock audit columns
 * - `duplicates`        → grouped rows with `duplicate_group` prefix column
 * - `verifyFilter` set  → filename tagged with the verify bucket
 * - otherwise           → full import/export serializer
 */
export function buildProductAuditCsv(
  filtered: AdminProduct[],
  auditFilter: AuditFilter,
  verifyFilter: "" | DescriptionVerifyStatus,
  today: string = new Date().toISOString().slice(0, 10),
): AuditCsvResult {
  if (auditFilter === "oos" || auditFilter === "low_stock") {
    const header = ["id", "name", "sku", "category", "subcategory", "stock", "price", "sale_price", "verify_status"];
    const rows = filtered.map((p) => [
      p.id, p.name, p.sku ?? "", p.category, p.subcategory ?? "",
      p.stock ?? 0, p.price, p.sale_price ?? "",
      getDescriptionVerifyStatus(p.description),
    ].map(esc).join(","));
    return {
      csv: [header.join(","), ...rows].join("\n"),
      filename: `products-audit-${auditFilter}-${today}.csv`,
    };
  }
  if (auditFilter === "duplicates") {
    const groups = new Map<string, AdminProduct[]>();
    filtered.forEach((p) => {
      const k = p.name.trim().toLowerCase().replace(/\s+/g, " ");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    });
    const header = ["duplicate_group", "id", "name", "sku", "category", "subcategory", "price", "stock", "verify_status"];
    const rows: string[] = [];
    let gi = 0;
    for (const [, group] of groups) {
      gi += 1;
      group.forEach((p) => {
        rows.push([
          `G${gi}`, p.id, p.name, p.sku ?? "", p.category, p.subcategory ?? "",
          priceOf(p), p.stock ?? 0,
          getDescriptionVerifyStatus(p.description),
        ].map(esc).join(","));
      });
    }
    return {
      csv: [header.join(","), ...rows].join("\n"),
      filename: `products-audit-duplicates-${today}.csv`,
    };
  }
  return {
    csv: productsToCsv(filtered as unknown as Record<string, any>[]),
    filename: verifyFilter
      ? `products-verify-${verifyFilter}-${today}.csv`
      : `products-filtered-${today}.csv`,
  };
}
