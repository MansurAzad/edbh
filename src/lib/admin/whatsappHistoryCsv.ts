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

/**
 * Download a CSV of the given WhatsApp share events for `orderId`.
 *
 * When `variant` is `"failed"`, only events with status `failed` or `blocked`
 * (or delivery_status `failed`) are included and the filename is suffixed
 * with `-failed` so admins can tell exports apart in their downloads folder.
 */
export function exportWhatsAppHistoryCSV(
  orderId: string,
  events: WhatsAppShareEvent[],
  variant: "all" | "failed" = "all",
) {
  const filtered =
    variant === "failed"
      ? events.filter(
          (e) => e.status === "failed" || e.status === "blocked" || e.delivery_status === "failed",
        )
      : events;
  const csv = whatsappEventsToCsv(filtered);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const suffix = variant === "failed" ? "-failed" : "";
  a.download = `whatsapp-history-${orderId.slice(0, 8)}${suffix}-${new Date()
    .toISOString()
    .split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
