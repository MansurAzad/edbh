/**
 * @file ChatFilters.tsx
 * @description Stateless filter bar rendered at the top of the Admin Chat page.
 *
 * Controls exposed:
 *   • Text search  — matches against customer name, phone, or order ID.
 *   • Status filter — maps to order `status` values (all | pending | processing |
 *                     shipped | delivered | cancelled).
 *   • Date filter   — relative presets (all | today | last 7 days | last 30 days).
 *   • Sync button   — triggers `syncMutation` in useAdminChatHistories to pull
 *                     latest order statuses from the `orders` table into
 *                     `chat_histories`.
 *   • CSV export button — calls `exportChatHistoriesCSV` from chatHelpers.
 *
 * All state is owned by the parent page; this component is fully controlled.
 *
 * Bengali UI strings (with English translations):
 *   নাম, ফোন বা অর্ডার ID = Name, phone or order ID (search placeholder)
 *   স্ট্যাটাস             = Status
 *   সব স্ট্যাটাস          = All statuses
 *   পেন্ডিং               = Pending
 *   প্রসেসিং              = Processing
 *   শিপড                  = Shipped
 *   ডেলিভারড              = Delivered
 *   ক্যান্সেলড            = Cancelled
 *   তারিখ                 = Date
 *   সব তারিখ              = All dates
 *   আজ                    = Today
 *   গত ৭ দিন              = Last 7 days
 *   গত ৩০ দিন             = Last 30 days
 *   সিঙ্ক                 = Sync
 */

import { CalendarDays, Download, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Props for the ChatFilters bar. All values are controlled by the parent. */
interface Props {
  /** Current search query string. */
  searchQuery: string;
  /** Setter for searchQuery. */
  setSearchQuery: (v: string) => void;
  /** Active status filter ("all" | "pending" | "processing" | "shipped" | "delivered" | "cancelled"). */
  statusFilter: string;
  /** Setter for statusFilter. */
  setStatusFilter: (v: string) => void;
  /** Active date filter ("all" | "today" | "7days" | "30days"). */
  dateFilter: string;
  /** Setter for dateFilter. */
  setDateFilter: (v: string) => void;
  /**
   * Called when the admin clicks "সিঙ্ক" (Sync).
   * Triggers `useAdminChatHistories.syncMutation` which walks all chat_histories
   * rows that have an order_id and updates their cached order_status / order_total
   * from the live `orders` table.
   */
  onSync: () => void;
  /** True while the sync mutation is in flight — the sync icon spins. */
  syncing: boolean;
  /**
   * Called when the admin clicks "CSV".
   * Triggers `exportChatHistoriesCSV` in chatHelpers which builds a BOM-prefixed
   * UTF-8 CSV (Bengali headers) and triggers a browser download.
   */
  onExport: () => void;
}

/**
 * ChatFilters
 *
 * A responsive filter bar (stacks vertically on mobile, row on sm+).
 * Renders as a pure presentation component — no internal state.
 *
 * @param props - See {@link Props}
 */
export default function ChatFilters({
  searchQuery, setSearchQuery, statusFilter, setStatusFilter,
  dateFilter, setDateFilter, onSync, syncing, onExport,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">

      {/* ── Text search ─────────────────────────────────────────────────── */}
      {/* Placeholder: "নাম, ফোন বা অর্ডার ID..." = "Name, phone or order ID..." */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="নাম, ফোন বা অর্ডার ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* ── Status filter ────────────────────────────────────────────────── */}
      {/*
       * Values map directly to the `order_status` column in chat_histories.
       * "all" is the UI sentinel for "no filter" — the parent filters
       * accordingly (usually: status === "all" ? show all : show matching).
       *
       * Bengali values:
       *   সব স্ট্যাটাস = All statuses
       *   পেন্ডিং      = Pending
       *   প্রসেসিং     = Processing
       *   শিপড         = Shipped
       *   ডেলিভারড     = Delivered
       *   ক্যান্সেলড   = Cancelled
       */}
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue placeholder="স্ট্যাটাস" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">সব স্ট্যাটাস</SelectItem>
          <SelectItem value="pending">পেন্ডিং</SelectItem>
          <SelectItem value="processing">প্রসেসিং</SelectItem>
          <SelectItem value="shipped">শিপড</SelectItem>
          <SelectItem value="delivered">ডেলিভারড</SelectItem>
          <SelectItem value="cancelled">ক্যান্সেলড</SelectItem>
        </SelectContent>
      </Select>

      {/* ── Date filter ──────────────────────────────────────────────────── */}
      {/*
       * Relative presets — the parent translates these to actual date ranges
       * before filtering (e.g. "today" → start of today's UTC day).
       *
       * Bengali values:
       *   সব তারিখ  = All dates
       *   আজ        = Today
       *   গত ৭ দিন  = Last 7 days
       *   গত ৩০ দিন = Last 30 days
       */}
      <Select value={dateFilter} onValueChange={setDateFilter}>
        <SelectTrigger className="w-full sm:w-[160px]">
          <CalendarDays className="w-4 h-4 mr-1.5 text-muted-foreground" />
          <SelectValue placeholder="তারিখ" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">সব তারিখ</SelectItem>
          <SelectItem value="today">আজ</SelectItem>
          <SelectItem value="7days">গত ৭ দিন</SelectItem>
          <SelectItem value="30days">গত ৩০ দিন</SelectItem>
        </SelectContent>
      </Select>

      {/* ── Sync button ──────────────────────────────────────────────────── */}
      {/* সিঙ্ক = Sync; icon spins while syncing */}
      <Button variant="outline" size="sm" onClick={onSync} disabled={syncing} className="gap-1.5">
        <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
        সিঙ্ক
      </Button>

      {/* ── CSV export button ────────────────────────────────────────────── */}
      {/* Triggers browser download of a BOM-prefixed UTF-8 CSV with Bengali headers */}
      <Button variant="outline" size="sm" onClick={onExport} className="gap-1.5">
        <Download className="w-4 h-4" />
        CSV
      </Button>
    </div>
  );
}
