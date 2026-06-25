/**
 * @file _shared/log.ts
 *
 * @purpose
 *   Tiny structured JSON logger used by every edge function.
 *   Emitting newline-delimited JSON lets Supabase's log aggregator index
 *   fields like `fn`, `level`, and `ts` for fast filtering/grepping.
 *
 * @httpContract
 *   Not an HTTP handler — import `log` wherever structured logging is needed.
 *
 * @envVars
 *   None.
 *
 * @authModel
 *   N/A.
 *
 * @outputShape
 *   Each log line is a single-line JSON object:
 *   ```json
 *   { "ts": "2024-01-01T00:00:00.000Z", "level": "info", "fn": "server-tracking", "msg": "event stored", "extra": "..." }
 *   ```
 *
 * @rateLimiting / @idempotency
 *   None — pure utility; no I/O side-effects.
 */

/** Allowed severity levels, mapped to the matching `console.*` method. */
type Level = "info" | "warn" | "error";

/**
 * Emit a structured JSON log line to stdout/stderr.
 *
 * - `"error"` → `console.error` (captured as an error in Supabase logs)
 * - `"warn"`  → `console.warn`
 * - `"info"`  → `console.log`
 *
 * @param level - Severity level.
 * @param fn    - Name of the calling edge function (used as a correlation key).
 * @param msg   - Short human-readable message.
 * @param extra - Optional key-value pairs merged into the log line
 *                (e.g. `{ order_id: "abc", status: 500 }`).
 *
 * @example
 * log("info",  "server-tracking", "event stored", { event_name: "purchase" });
 * log("error", "steadfast-courier", "Steadfast 429", { path: "/create_order" });
 */
export function log(level: Level, fn: string, msg: string, extra?: Record<string, unknown>) {
  // Build the log record — spread `extra` last so callers can override `ts` if needed
  const line = { ts: new Date().toISOString(), level, fn, msg, ...(extra || {}) };
  const out = JSON.stringify(line);

  // Route to the appropriate console channel so Supabase classifies severity correctly
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}
