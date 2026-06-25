// Tiny structured logger so every function emits consistent JSON lines that
// are easy to grep in Supabase logs.
type Level = "info" | "warn" | "error";

export function log(level: Level, fn: string, msg: string, extra?: Record<string, unknown>) {
  const line = { ts: new Date().toISOString(), level, fn, msg, ...(extra || {}) };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}
