/**
 * @file whatsappHistoryCsv.ts
 * @description Pure helpers to serialize a single order's WhatsApp share
 * history (from `whatsapp_share_events`) into a CSV file and trigger a
 * browser download. Kept dependency-free so it can be unit-tested and reused
 * from any admin surface.
 *
 * Columns:
 *   created_at, actor, status, delivery_status, attempt_variant,
 *   wa_message_id, error
 */

import type { WhatsAppShareEvent } from "@/lib/checkout/whatsappShare";

const HEADERS = [
  "created_at",
  "actor",
  "status",
  "delivery_status",
  "attempt_variant",
  "wa_message_id",
  "error",
] as const;

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function whatsappEventsToCsv(events: WhatsAppShareEvent[]): string {
  const rows = events.map((e) =>
    [
      e.created_at,
      e.actor,
      e.status,
      e.delivery_status ?? "",
      e.attempt_variant ?? "",
      e.wa_message_id ?? "",
      e.error ?? "",
    ].map(esc).join(","),
  );
  // BOM so Excel opens Bengali error strings correctly.
  return "\uFEFF" + [HEADERS.join(","), ...rows].join("\n");
}

export function exportWhatsAppHistoryCSV(orderId: string, events: WhatsAppShareEvent[]) {
  const csv = whatsappEventsToCsv(events);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `whatsapp-history-${orderId.slice(0, 8)}-${new Date()
    .toISOString()
    .split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
