import {
  AlertTriangle, CheckCircle, Clock, Package, Truck, XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface ChatHistory {
  id: string;
  order_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  messages: ChatMessage[];
  products_discussed: any[];
  order_total: number | null;
  order_status: string | null;
  created_at: string;
}

export const CHAT_PAGE_SIZE = 20;

export function getStatusColor(status: string | null): string {
  switch (status) {
    case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "confirmed":
    case "processing": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "shipped": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-muted text-muted-foreground";
  }
}

export function getStatusIcon(status: string | null): ReactNode {
  switch (status) {
    case "pending": return <Clock className="w-3.5 h-3.5" />;
    case "confirmed":
    case "processing": return <Package className="w-3.5 h-3.5" />;
    case "shipped": return <Truck className="w-3.5 h-3.5" />;
    case "delivered": return <CheckCircle className="w-3.5 h-3.5" />;
    case "cancelled": return <XCircle className="w-3.5 h-3.5" />;
    default: return <AlertTriangle className="w-3.5 h-3.5" />;
  }
}

export function getStatusBengali(status: string | null): string {
  switch (status) {
    case "pending": return "পেন্ডিং";
    case "confirmed": return "কনফার্মড";
    case "processing": return "প্রসেসিং";
    case "shipped": return "শিপড";
    case "delivered": return "ডেলিভারড";
    case "cancelled": return "ক্যান্সেলড";
    default: return status || "—";
  }
}

export function exportChatHistoriesCSV(rows: ChatHistory[]): { ok: boolean; count: number } {
  if (rows.length === 0) return { ok: false, count: 0 };
  const headers = ["তারিখ", "কাস্টমার নাম", "ফোন", "অর্ডার ID", "অর্ডার স্ট্যাটাস", "অর্ডার টোটাল", "মেসেজ সংখ্যা", "প্রোডাক্ট"];
  const data = rows.map((h) => [
    new Date(h.created_at).toLocaleString("bn-BD"),
    h.customer_name || "",
    h.customer_phone || "",
    h.order_id ? h.order_id.slice(0, 8).toUpperCase() : "",
    h.order_status || "",
    h.order_total != null ? h.order_total.toString() : "",
    h.messages.length.toString(),
    h.products_discussed ? h.products_discussed.map((p: any) => p.name).join(", ") : "",
  ]);
  const csv = "\uFEFF" +
    [headers, ...data].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat-histories-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, count: rows.length };
}
