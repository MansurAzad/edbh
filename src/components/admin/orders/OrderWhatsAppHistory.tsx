/**
 * @file OrderWhatsAppHistory.tsx
 * @description Full WhatsApp share history for a single order — used inside
 * the admin OrderDetailDialog. Shows timestamp, actor, status,
 * delivery_status, attempt_variant, error_reason, and two retry actions:
 *   • Retry (same variant)
 *   • Retry with fallback (escalation ladder picks the next variant)
 *
 * Subscribes to realtime updates so delivery_status transitions arriving via
 * the whatsapp-webhook flow appear without a manual refresh.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Send, Zap, MessageCircle, Star, Search, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchWhatsAppShareEvents,
  type WhatsAppShareEvent,
  type WhatsAppDeliveryStatus,
} from "@/lib/checkout/whatsappShare";
import { retryWhatsAppShareForOrder, retryWithEscalation } from "@/lib/admin/adminWhatsAppRetry";
import { exportWhatsAppHistoryCSV } from "@/lib/admin/whatsappHistoryCsv";

interface Props {
  orderId: string;
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
}

function statusColor(s: WhatsAppShareEvent["status"]) {
  if (s === "opened" || s === "retried" || s === "queued") return "text-green-600 bg-green-500/10 border-green-500/20";
  if (s === "blocked") return "text-amber-600 bg-amber-500/10 border-amber-500/20";
  return "text-destructive bg-destructive/10 border-destructive/20";
}

function deliveryBadge(s: WhatsAppDeliveryStatus | null | undefined) {
  if (!s) return null;
  const map: Record<WhatsAppDeliveryStatus, string> = {
    pending:   "bg-muted text-muted-foreground",
    sent:      "bg-blue-500/10 text-blue-600",
    delivered: "bg-green-500/10 text-green-600",
    read:      "bg-emerald-500/10 text-emerald-700 font-semibold",
    failed:    "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${map[s]}`}>
      📡 {s}
    </span>
  );
}

/** Delivery statuses that mean the send is done — success or terminal failure. */
const TERMINAL_DELIVERY: readonly WhatsAppDeliveryStatus[] = ["delivered", "read", "failed"];

export default function OrderWhatsAppHistory({ orderId }: Props) {
  const [events, setEvents] = useState<WhatsAppShareEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  /** id of the event we're waiting on a terminal delivery_status for. */
  const [awaitingDeliveryId, setAwaitingDeliveryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEvents(await fetchWhatsAppShareEvents(orderId)); }
    finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  // Realtime: pick up delivery_status webhook updates + new inserts.
  useEffect(() => {
    const channel = supabase
      .channel(`wa-events-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_share_events", filter: `order_id=eq.${orderId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, load]);

  const runRetry = async (mode: "primary" | "escalate") => {
    setRetryingId(mode);
    try {
      const res = mode === "escalate"
        ? await retryWithEscalation(orderId)
        : await retryWhatsAppShareForOrder(orderId);
      const okStatus = res.status === "opened" || res.status === "retried" || res.status === "queued";
      if (okStatus) {
        toast.success(
          res.channel === "cloud_api"
            ? `Sent via Cloud API (${res.variant})`
            : `WhatsApp opened (${res.variant})`,
          { description: "Delivery status will update live." },
        );
      } else if (res.status === "blocked") {
        toast.warning(`Blocked (${res.variant})`, { description: res.error });
      } else {
        toast.error(`Retry failed (${res.variant})`, { description: res.error });
      }
      await load();
    } catch (e) {
      toast.error("Retry failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRetryingId(null);
    }
  };

  const latest = events[0];

  return (
    <section
      className="rounded-lg border border-border/50 bg-muted/20 p-3"
      role="region"
      aria-label="WhatsApp share history"
      data-testid="order-wa-history"
    >
      <header className="flex items-center gap-2 mb-3">
        <MessageCircle className="w-4 h-4 text-green-600" />
        <h4 className="text-sm font-semibold">WhatsApp Share History</h4>
        <span className="text-xs text-muted-foreground">({events.length} attempts)</span>
        <div className="ml-auto flex gap-1">
          <Button
            type="button" size="sm" variant="outline"
            onClick={() => runRetry("primary")}
            disabled={retryingId !== null}
            data-testid="wa-retry-primary"
          >
            {retryingId === "primary"
              ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              : <Send className="w-3.5 h-3.5 mr-1" />}
            Retry
          </Button>
          <Button
            type="button" size="sm"
            onClick={() => runRetry("escalate")}
            disabled={retryingId !== null}
            data-testid="wa-retry-escalate"
            title="Escalate: automatically pick a shorter fallback template on repeated failure"
          >
            {retryingId === "escalate"
              ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              : <Zap className="w-3.5 h-3.5 mr-1" />}
            Retry w/ fallback
          </Button>
        </div>
      </header>

      {loading && events.length === 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading…
        </p>
      )}
      {!loading && events.length === 0 && (
        <p className="text-xs text-muted-foreground">No WhatsApp share attempts yet.</p>
      )}

      {latest && (
        <div
          role="status"
          aria-live="polite"
          className="mb-3 rounded-md border-2 border-primary/40 bg-primary/5 p-2 text-xs"
        >
          <div className="flex items-center gap-2 mb-1 text-primary font-medium uppercase text-[10px]">
            <Star className="w-3 h-3" fill="currentColor" /> Most recent
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase font-mono ${statusColor(latest.status)}`}>
              {latest.status}
            </span>
            {deliveryBadge(latest.delivery_status)}
            {latest.attempt_variant && (
              <span className="text-[10px] font-mono text-muted-foreground">
                variant: {latest.attempt_variant}
              </span>
            )}
            <span className="text-[10px] font-mono ml-auto">{fmt(latest.created_at)}</span>
          </div>
          {latest.error && (
            <p className="mt-1 text-destructive/90 break-words text-[11px]">{latest.error}</p>
          )}
        </div>
      )}

      <ol className="space-y-1.5">
        {events.map((ev) => (
          <li
            key={ev.id}
            className="rounded border border-border/40 bg-background/60 px-2 py-1.5 text-[11px]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase font-mono ${statusColor(ev.status)}`}>
                {ev.status}
              </span>
              {deliveryBadge(ev.delivery_status)}
              <span className="font-mono text-muted-foreground">{fmt(ev.created_at)}</span>
              <span className="text-muted-foreground">[{ev.actor}]</span>
              {ev.attempt_variant && (
                <span className="text-muted-foreground font-mono">v:{ev.attempt_variant}</span>
              )}
              {ev.delivery_updated_at && ev.delivery_status && (
                <span className="text-muted-foreground text-[10px]">
                  {ev.delivery_status} @ {fmt(ev.delivery_updated_at)}
                </span>
              )}
            </div>
            {ev.error && (
              <p className="mt-1 text-destructive/90 break-words">{ev.error}</p>
            )}
            {/* Full Meta payload — collapsed by default so the log stays scannable. */}
            {(ev.wa_message_id || ev.payload_snapshot) && (
              <details className="mt-1">
                <summary className="cursor-pointer select-none text-[10px] text-muted-foreground hover:text-foreground">
                  {ev.wa_message_id ? `Meta id: ${ev.wa_message_id}` : "Payload"} · details
                </summary>
                <div className="mt-1 space-y-1">
                  {ev.wa_message_id && (
                    <p className="font-mono text-[10px] break-all">
                      <span className="text-muted-foreground">wa_message_id:</span> {ev.wa_message_id}
                    </p>
                  )}
                  {ev.payload_snapshot && (
                    <pre className="max-h-40 overflow-auto rounded bg-muted/40 p-1.5 text-[10px] font-mono whitespace-pre-wrap break-all">
{JSON.stringify(ev.payload_snapshot, null, 2)}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
