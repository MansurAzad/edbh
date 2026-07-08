/**
 * @file WhatsAppShareEvents.tsx
 * @description Admin view: lists every whatsapp_share_events row for a given
 * order id (from `?order=` query param or the input at the top). Shows
 * timestamp, status, actor, and error details, plus a one-click "Retry share"
 * button that calls `retryWhatsAppShareForOrder`.
 */

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, RefreshCw, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchWhatsAppShareEvents,
  type WhatsAppShareEvent,
} from "@/lib/checkout/whatsappShare";
import { retryWhatsAppShareForOrder } from "@/lib/admin/adminWhatsAppRetry";

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

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const rows = await fetchWhatsAppShareEvents(id);
      setEvents(rows);
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
        toast.success("WhatsApp popup opened — share resent");
      } else if (res.status === "blocked") {
        toast.warning("Popup blocked", { description: res.error ?? undefined });
      } else {
        toast.error("Share failed", { description: res.error ?? undefined });
      }
      await load(orderId);
    } catch (e) {
      toast.error("Retry failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRetrying(false);
    }
  };

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
        {events.map((ev) => (
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
    </div>
  );
}
