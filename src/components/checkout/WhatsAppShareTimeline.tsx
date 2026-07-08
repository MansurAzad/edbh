/**
 * @file WhatsAppShareTimeline.tsx
 * @description Renders WhatsApp share attempts grouped by status, with the
 * most recent attempt highlighted at the top. Used on both the customer-facing
 * CheckoutSuccess screen and the admin OrderDetailDialog.
 */

import type { WhatsAppShareStatus, WhatsAppShareActor } from "@/lib/checkout/whatsappShare";

export interface TimelineEvent {
  status: WhatsAppShareStatus;
  /** ISO timestamp of the attempt. */
  at: string;
  actor?: WhatsAppShareActor;
  error?: string | null;
}

interface Props {
  events: TimelineEvent[];
  title?: string;
}

const STATUS_ORDER: WhatsAppShareStatus[] = ["opened", "retried", "blocked", "failed"];

function statusClass(s: WhatsAppShareStatus) {
  if (s === "opened" || s === "retried") return "text-green-600";
  if (s === "blocked") return "text-amber-600";
  return "text-destructive";
}

function statusLabel(s: WhatsAppShareStatus) {
  return (
    {
      opened: "খোলা হয়েছে",
      retried: "পুনরায় শেয়ার",
      blocked: "পপআপ ব্লকড",
      failed: "ব্যর্থ",
    } as const
  )[s];
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export default function WhatsAppShareTimeline({ events, title = "WhatsApp শেয়ার টাইমলাইন" }: Props) {
  if (events.length === 0) return null;

  // Sort by time, newest first.
  const sorted = [...events].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  const latest = sorted[0];

  // Group remaining events by status.
  const groups = new Map<WhatsAppShareStatus, TimelineEvent[]>();
  for (const e of sorted) groups.set(e.status, [...(groups.get(e.status) ?? []), e]);

  return (
    <div
      data-testid="wa-share-timeline"
      className="rounded-lg border border-border/40 bg-muted/30 p-3 text-left"
    >
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {title} ({events.length})
        </p>
      </div>

      {/* Most recent attempt — always highlighted */}
      <div
        data-testid="wa-latest-attempt"
        className={`mb-3 rounded-md border p-2 text-xs ${
          latest.status === "opened" || latest.status === "retried"
            ? "border-green-500/40 bg-green-500/5"
            : latest.status === "blocked"
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-destructive/40 bg-destructive/5"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">🕒 সর্বশেষ চেষ্টা</span>
          <span className={`font-mono uppercase ${statusClass(latest.status)}`}>
            {statusLabel(latest.status)}
          </span>
        </div>
        <div className="mt-1 flex justify-between gap-2 text-muted-foreground">
          <span>{fmt(latest.at)}</span>
          {latest.actor && <span>[{latest.actor}]</span>}
        </div>
        {latest.error && (
          <p className="mt-1 text-destructive/90 break-words">{latest.error}</p>
        )}
      </div>

      {/* Grouped by status */}
      <div className="space-y-2">
        {STATUS_ORDER.filter((s) => groups.has(s)).map((s) => {
          const list = groups.get(s)!;
          return (
            <details
              key={s}
              data-testid={`wa-group-${s}`}
              open={s === latest.status}
              className="rounded border border-border/40 bg-background/40"
            >
              <summary className="cursor-pointer select-none px-2 py-1 text-xs flex justify-between">
                <span className={`font-medium ${statusClass(s)}`}>
                  {statusLabel(s)}
                </span>
                <span className="text-muted-foreground">{list.length}টি</span>
              </summary>
              <ul className="px-2 pb-2 space-y-1 text-xs font-mono">
                {list.map((ev, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{fmt(ev.at)}</span>
                    <span className="text-muted-foreground truncate">
                      {ev.actor ? `[${ev.actor}]` : ""}
                      {ev.error ? ` — ${ev.error}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}
