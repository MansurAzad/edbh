/**
 * On-page QA debug overlay for tracking events.
 *
 * Activate: append `?tracking_debug=1` to any URL (persists via localStorage),
 * or run `localStorage.tracking_debug = "1"` in DevTools. Deactivate with
 * `?tracking_debug=0`.
 *
 * Shows the last 50 fired events with timestamp, source (dataLayer / gtag /
 * client pixel / server CAPI), event name, and event_id — useful for
 * cross-checking against Meta Events Manager Test Events and Pixel Helper.
 */
import { useEffect, useState } from "react";
import {
  subscribeDebug,
  getDebugBuffer,
  clearDebugBuffer,
  isDebugEnabled,
  type TrackingDebugEntry,
  type TrackingSource,
} from "@/lib/tracking/debug";

const SOURCE_COLOR: Record<TrackingSource, string> = {
  dataLayer: "#94a3b8", // slate
  gtag: "#3b82f6",      // blue
  pixel: "#1877f2",     // Meta blue
  capi: "#10b981",      // emerald
};

const TrackingDebugOverlay = () => {
  const [enabled, setEnabled] = useState<boolean>(() =>
    typeof window !== "undefined" ? isDebugEnabled() : false,
  );
  const [entries, setEntries] = useState<TrackingDebugEntry[]>(() => getDebugBuffer());
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setEntries(getDebugBuffer());
    return subscribeDebug((e) => setEntries((prev) => [...prev, e].slice(-50)));
  }, [enabled]);

  useEffect(() => {
    // Re-evaluate on route/URL change so flipping the URL toggle works live.
    const iv = window.setInterval(() => setEnabled(isDebugEnabled()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  if (!enabled) return null;

  return (
    <div
      role="region"
      aria-label="Tracking debug overlay"
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 99999,
        width: minimized ? 220 : 420,
        maxHeight: minimized ? 44 : "60vh",
        background: "rgba(15,23,42,0.96)",
        color: "#f8fafc",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        border: "1px solid #334155",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          background: "#1e293b",
          borderBottom: minimized ? "none" : "1px solid #334155",
        }}
      >
        <strong style={{ fontSize: 11 }}>🎯 Tracking Debug ({entries.length})</strong>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => { clearDebugBuffer(); setEntries([]); }}
            style={btnStyle}
            aria-label="Clear tracking log"
          >Clear</button>
          <button
            onClick={() => setMinimized((m) => !m)}
            style={btnStyle}
            aria-label={minimized ? "Expand tracking overlay" : "Minimize tracking overlay"}
          >{minimized ? "▲" : "▼"}</button>
        </div>
      </div>
      {!minimized && (
        <div style={{ overflowY: "auto", maxHeight: "calc(60vh - 44px)", padding: "6px 8px" }}>
          {entries.length === 0 ? (
            <div style={{ padding: 8, opacity: 0.7 }}>
              No events yet. Navigate, add to cart, or checkout to see events.
            </div>
          ) : (
            entries.slice().reverse().map((e, i) => (
              <div
                key={`${e.event_id}-${e.ts}-${e.source}-${i}`}
                style={{
                  padding: "4px 6px",
                  marginBottom: 4,
                  background: "#0f172a",
                  borderLeft: `3px solid ${SOURCE_COLOR[e.source]}`,
                  borderRadius: 3,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ color: SOURCE_COLOR[e.source], fontWeight: 600 }}>
                    [{e.source}] {e.event}
                  </span>
                  <span style={{ opacity: 0.6 }}>
                    {new Date(e.ts).toLocaleTimeString(undefined, { hour12: false })}
                  </span>
                </div>
                <div style={{ opacity: 0.6, wordBreak: "break-all" }}>id: {e.event_id}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  background: "#334155",
  color: "#f8fafc",
  border: "none",
  padding: "3px 8px",
  fontSize: 10,
  borderRadius: 4,
  cursor: "pointer",
};

export default TrackingDebugOverlay;
