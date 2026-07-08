/**
 * @file WhatsAppShareEvents.tsx
 * @description Admin view: lists every `whatsapp_share_events` row for a given
 * order id. Adds status + actor filters, page-based pagination so long
 * histories stay fast, a highlighted "Most recent attempt" card, and a
 * one-click retry that surfaces success/error toasts and refreshes the list
 * so the admin sees the newly-recorded attempt at the top.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, RefreshCw, MessageCircle, Send, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchWhatsAppShareEvents,
  type WhatsAppShareEvent,
} from "@/lib/checkout/whatsappShare";
import { retryWhatsAppShareForOrder } from "@/lib/admin/adminWhatsAppRetry";

type StatusFilter = "all" | WhatsAppShareEvent["status"];
type ActorFilter = "all" | WhatsAppShareEvent["actor"];

const PAGE_SIZE = 20;

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function statusColor(s: WhatsAppShareEvent["status"]) {
  if (s === "opened" || s === "retried") return "text-green-600 bg-green-500/10";
  if (s === "blocked") return "text-amber-600 bg-amber-500/10";
  return "text-destructive bg-destructive/10";
}

export default function WhatsAppShareEventsAdmin() {
  const [params, setParams] = useSearchParams();
  const [orderId, setOrderId] = useState(params.get("order") ?? "");
  const [events, setEvents] = useState<WhatsAppShareEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [actorFilter, setActorFilter] = useState<ActorFilter>("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const rows = await fetchWhatsAppShareEvents(id);
      setEvents(rows);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (orderId) void load(orderId);
  }, [orderId, load]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(orderId ? { order: orderId } : {});
    void load(orderId);
  };

  const retry = async () => {
    if (!orderId || retrying) return;
    setRetrying(true);
    try {
      const res = await retryWhatsAppShareForOrder(orderId);
      if (res.status === "opened" || res.status === "retried") {
        toast.success("WhatsApp popup opened — share resent", {
          description: "Latest attempt added to the timeline.",
        });
      } else if (res.status === "blocked") {
        toast.warning("Popup blocked", { description: res.error ?? undefined });
      } else {
        toast.error("Share failed", { description: res.error ?? undefined });
      }
      // Refresh so the newly-inserted event appears at the top and the
      // "Most recent attempt" card reflects the fresh status.
      await load(orderId);
    } catch (e) {
      toast.error("Retry failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRetrying(false);
    }
  };

  // Newest attempt across the full list (unfiltered) — always shown at top
  // so the admin sees the current state regardless of active filters.
  const latest = events[0];

  const filtered = useMemo(
    () =>
      events.filter(
        (ev) =>
          (statusFilter === "all" || ev.status === statusFilter) &&
          (actorFilter === "all" || ev.actor === actorFilter),
      ),
    [events, statusFilter, actorFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset to page 1 whenever a filter narrows the set below the current page.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, actorFilter]);

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      <header className="flex items-center gap-3">
        <MessageCircle className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-semibold">WhatsApp Share Events</h1>
      </header>

      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <Input
          value={orderId}
          onChange={(e) => setOrderId(e.target.value.trim())}
          placeholder="Order UUID"
          className="flex-1 font-mono text-sm"
          aria-label="Order ID"
        />
        <Button type="submit" variant="outline" disabled={!orderId || loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Load
        </Button>
        <Button
          type="button"
          onClick={retry}
          disabled={!orderId || retrying}
          aria-busy={retrying}
          data-testid="admin-events-retry"
        >
          {retrying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          {retrying ? "Retrying..." : "Retry share"}
        </Button>
      </form>

      {/* Filters — kept close to the list so admins can quickly isolate
          failed or blocked attempts without scrolling. */}
      {events.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2" data-testid="wa-events-filters">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="sm:w-48" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="opened">Opened</SelectItem>
              <SelectItem value="retried">Retried</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actorFilter} onValueChange={(v) => setActorFilter(v as ActorFilter)}>
            <SelectTrigger className="sm:w-48" aria-label="Filter by actor">
              <SelectValue placeholder="Actor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground self-center ml-auto">
            {filtered.length} of {events.length} attempts
          </div>
        </div>
      )}

      {/* Most recent attempt — always the newest across all statuses so the
          admin sees current health at a glance. Refreshed after each retry. */}
      {latest && (
        <div
          data-testid="wa-events-latest"
          role="status"
          aria-live="polite"
          className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4"
        >
          <div className="flex items-center gap-2 mb-2 text-xs font-medium text-primary uppercase tracking-wide">
            <Star className="w-3.5 h-3.5" fill="currentColor" />
            Most recent attempt
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${statusColor(latest.status)}`}>
              {latest.status}
            </span>
            <span className="text-sm font-mono">{fmt(latest.created_at)}</span>
            <span className="text-xs text-muted-foreground">actor: {latest.actor}</span>
          </div>
          {latest.error && (
            <p className="mt-2 text-xs text-destructive/90 break-words">{latest.error}</p>
          )}
        </div>
      )}

      <div className="border rounded-lg divide-y">
        {loading && events.length === 0 && (
          <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading events…
          </div>
        )}
        {!loading && events.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {orderId ? "No WhatsApp share events for this order yet." : "Enter an order id to view its share attempts."}
          </div>
        )}
        {!loading && events.length > 0 && filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No attempts match the current filters.
          </div>
        )}
        {paged.map((ev) => (
          <div key={ev.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase w-fit ${statusColor(ev.status)}`}>
              {ev.status}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{fmt(ev.created_at)}</span>
            <span className="text-xs text-muted-foreground">actor: {ev.actor}</span>
            {ev.error && (
              <span className="text-xs text-destructive/90 break-words sm:ml-auto">
                {ev.error}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Pagination — page-based keeps the DOM small and the whole list
          already fits comfortably in a single fetch; if this ever grows into
          the thousands we can swap `fetchWhatsAppShareEvents` for a ranged
          query without changing this UI. */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm" data-testid="wa-events-pager">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
