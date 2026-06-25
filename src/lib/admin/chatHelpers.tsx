/**
 * @file chatHelpers.tsx
 * @description Shared types, pure helper functions, and the CSV exporter for
 * the Admin Chat feature.
 *
 * Exported symbols:
 *   • ChatMessage        — single message in a chat thread.
 *   • ChatHistory        — full chat_histories DB row shape.
 *   • CHAT_PAGE_SIZE     — pagination constant (currently unused; reserved).
 *   • getStatusColor()   — Tailwind class string for an order status pill.
 *   • getStatusIcon()    — Lucide React icon node for an order status.
 *   • getStatusBengali() — Bengali label for an order status.
 *   • exportChatHistoriesCSV() — triggers a CSV download in the browser.
 *
 * Bengali status label map:
 *   pending    → পেন্ডিং
 *   confirmed  → কনফার্মড
 *   processing → প্রসেসিং
 *   shipped    → শিপড
 *   delivered  → ডেলিভারড
 *   cancelled  → ক্যান্সেলড
 */

import {
  AlertTriangle, CheckCircle, Clock, Package, Truck, XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * A single message within a chat_histories.messages[] JSON array.
 * Stored as JSONB in Supabase; role drives alignment in the UI.
 */
export interface ChatMessage {
  /** "user" = customer message; "assistant" = AI or admin reply. */
  role: "user" | "assistant";
  /** Raw text content (may contain Markdown for assistant messages). */
  content: string;
  /** ISO 8601 timestamp string; optional for legacy messages. */
  timestamp?: string;
}

/**
 * Maps to a single row in the `chat_histories` Supabase table.
 * The `messages` and `products_discussed` columns are stored as JSONB.
 */
export interface ChatHistory {
  /** UUID primary key. */
  id: string;
  /** FK to `orders.id`; null until an order is created from the chat. */
  order_id: string | null;
  /** Customer's display name collected during the chat session. */
  customer_name: string | null;
  /** Customer's phone number (BD format, e.g. 01XXXXXXXXX). */
  customer_phone: string | null;
  /** Ordered array of all messages in the thread. */
  messages: ChatMessage[];
  /**
   * Denormalised array of products the admin sent via `sendProductsToChat`.
   * Shape: { name, price, sale_price, quantity, size, color }[].
   * Stored as JSONB; typed as `any[]` because schema may evolve.
   */
  products_discussed: any[];
  /** Cached copy of `orders.total` for display without a join. */
  order_total: number | null;
  /** Cached copy of `orders.status`; kept in sync by `syncMutation`. */
  order_status: string | null;
  /** Row creation timestamp (ISO 8601). */
  created_at: string;
}

/**
 * Page size for paginated chat list views.
 * Currently the list loads up to 500 rows and filters client-side,
 * but this constant is kept for future server-side pagination.
 */
export const CHAT_PAGE_SIZE = 20;

/**
 * Returns a Tailwind CSS class string that styles an order-status pill.
 * Covers both light and dark mode via `dark:` variants.
 *
 * @param status - Order status string (e.g. "pending", "shipped").
 * @returns Tailwind classes for background + text colour.
 *
 * @example
 * <span className={getStatusColor("shipped")}>Shipped</span>
 */
export function getStatusColor(status: string | null): string {
  switch (status) {
    case "pending":    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "confirmed":
    case "processing": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "shipped":    return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "delivered":  return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "cancelled":  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:           return "bg-muted text-muted-foreground";
  }
}

/**
 * Returns a Lucide React icon element matching the given order status.
 * Used inside status pills next to the Bengali label text.
 *
 * @param status - Order status string.
 * @returns A sized Lucide icon ReactNode (w-3.5 h-3.5).
 */
export function getStatusIcon(status: string | null): ReactNode {
  switch (status) {
    case "pending":    return <Clock className="w-3.5 h-3.5" />;
    case "confirmed":
    case "processing": return <Package className="w-3.5 h-3.5" />;
    case "shipped":    return <Truck className="w-3.5 h-3.5" />;
    case "delivered":  return <CheckCircle className="w-3.5 h-3.5" />;
    case "cancelled":  return <XCircle className="w-3.5 h-3.5" />;
    default:           return <AlertTriangle className="w-3.5 h-3.5" />;
  }
}

/**
 * Returns the Bengali display label for an order status string.
 * Falls back to the raw status string (or "—") for unknown values.
 *
 * Bengali label map:
 *   pending    → পেন্ডিং   (waiting for confirmation)
 *   confirmed  → কনফার্মড  (admin confirmed)
 *   processing → প্রসেসিং  (being packed)
 *   shipped    → শিপড      (dispatched to courier)
 *   delivered  → ডেলিভারড  (delivered to customer)
 *   cancelled  → ক্যান্সেলড (order cancelled)
 *
 * @param status - Order status string (may be null).
 * @returns Bengali label string.
 */
export function getStatusBengali(status: string | null): string {
  switch (status) {
    case "pending":    return "পেন্ডিং";
    case "confirmed":  return "কনফার্মড";
    case "processing": return "প্রসেসিং";
    case "shipped":    return "শিপড";
    case "delivered":  return "ডেলিভারড";
    case "cancelled":  return "ক্যান্সেলড";
    default:           return status || "—";
  }
}

/**
 * Generates and triggers a browser download of a UTF-8 CSV file containing
 * all visible chat history rows.
 *
 * CSV details:
 *   • BOM prefix (`\uFEFF`) ensures Excel opens the file correctly in UTF-8
 *     mode without garbled Bengali characters.
 *   • Headers are in Bengali for admin readability.
 *   • Each cell is double-quote wrapped; internal `"` are escaped as `""`.
 *   • Dates are formatted with the "bn-BD" locale (Bangla numerals).
 *   • products_discussed product names are joined with ", ".
 *   • The browser download is triggered via a temporary `<a>` element;
 *     the object URL is revoked immediately after click to free memory.
 *
 * Bengali CSV headers:
 *   তারিখ          = Date
 *   কাস্টমার নাম   = Customer name
 *   ফোন            = Phone
 *   অর্ডার ID      = Order ID
 *   অর্ডার স্ট্যাটাস = Order status
 *   অর্ডার টোটাল   = Order total
 *   মেসেজ সংখ্যা   = Message count
 *   প্রোডাক্ট      = Products discussed
 *
 * @param rows - Array of ChatHistory rows to export (typically the filtered list).
 * @returns `{ ok: true, count: n }` on success or `{ ok: false, count: 0 }` if empty.
 */
export function exportChatHistoriesCSV(rows: ChatHistory[]): { ok: boolean; count: number } {
  if (rows.length === 0) return { ok: false, count: 0 };

  // Bengali column headers for the admin-facing export.
  const headers = ["তারিখ", "কাস্টমার নাম", "ফোন", "অর্ডার ID", "অর্ডার স্ট্যাটাস", "অর্ডার টোটাল", "মেসেজ সংখ্যা", "প্রোডাক্ট"];

  const data = rows.map((h) => [
    new Date(h.created_at).toLocaleString("bn-BD"), // Bangla numerals for date
    h.customer_name || "",
    h.customer_phone || "",
    h.order_id ? h.order_id.slice(0, 8).toUpperCase() : "", // Short order ID
    h.order_status || "",
    h.order_total != null ? h.order_total.toString() : "",
    h.messages.length.toString(),
    // Flatten products_discussed to a comma-separated name list.
    h.products_discussed ? h.products_discussed.map((p: any) => p.name).join(", ") : "",
  ]);

  // Build the CSV string: BOM + header row + data rows.
  // Each cell is quoted; internal quotes are doubled per RFC 4180.
  const csv = "\uFEFF" +
    [headers, ...data].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");

  // Trigger browser download via a temporary anchor element.
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat-histories-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url); // Free memory immediately after click.

  return { ok: true, count: rows.length };
}
