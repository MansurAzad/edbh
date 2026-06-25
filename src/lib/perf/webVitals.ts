/**
 * @file webVitals.ts
 * @module lib/perf/webVitals
 *
 * Lightweight Core Web Vitals collector — no third-party dependency.
 *
 * We deliberately avoid pulling in the `web-vitals` package to keep the
 * storefront bundle small. Browsers ship the underlying PerformanceObserver
 * APIs natively, and the metric definitions below mirror Google's spec:
 *
 *   - LCP  (Largest Contentful Paint)   — loading speed
 *   - FCP  (First Contentful Paint)     — first render
 *   - CLS  (Cumulative Layout Shift)    — visual stability
 *   - INP  (Interaction to Next Paint)  — input responsiveness
 *   - TTFB (Time To First Byte)         — network latency
 *
 * Latest samples are stashed in-memory AND mirrored to `sessionStorage`
 * so the admin Performance Budget dashboard can read them across route
 * changes (the dashboard lives inside the SPA, so no network hop needed).
 *
 * বাংলা: এই ফাইলটি Core Web Vitals সংগ্রহ করে এবং অ্যাডমিন ড্যাশবোর্ডে
 * প্রদর্শনের জন্য সংরক্ষণ করে — কোনো বহিরাগত প্যাকেজ ছাড়াই।
 */

/** Metric names we currently report on. */
export type VitalName = "LCP" | "FCP" | "CLS" | "INP" | "TTFB";

/** Shape stored per metric. */
export interface VitalSample {
  /** Metric name. */
  name: VitalName;
  /** Numeric value in ms (or unitless for CLS). */
  value: number;
  /** Higher-is-worse rating bucket. */
  rating: "good" | "needs-improvement" | "poor";
  /** Wall-clock timestamp of capture (ms since epoch). */
  ts: number;
}

/** sessionStorage key for the cached snapshot. */
const STORAGE_KEY = "perf_vitals_v1";

/** In-memory store (mirrored to sessionStorage). */
const samples: Partial<Record<VitalName, VitalSample>> = {};

/** Google-recommended thresholds (ms unless noted). */
const THRESHOLDS: Record<VitalName, [number, number]> = {
  LCP:  [2500, 4000],
  FCP:  [1800, 3000],
  CLS:  [0.1,  0.25],
  INP:  [200,  500],
  TTFB: [800,  1800],
};

/** Map a raw metric value → good/needs-improvement/poor. */
function rate(name: VitalName, value: number): VitalSample["rating"] {
  const [good, poor] = THRESHOLDS[name];
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

/** Persist a fresh sample to memory + sessionStorage. */
function record(name: VitalName, value: number) {
  const sample: VitalSample = { name, value, rating: rate(name, value), ts: Date.now() };
  samples[name] = sample;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch {
    /* private mode / quota — silently ignore */
  }
}

/**
 * Idempotent initialiser — safe to call from `main.tsx`.
 * Wires up PerformanceObservers for each metric and computes TTFB from
 * the Navigation Timing entry. All work is best-effort; missing APIs
 * (older Safari, SSR) are silently skipped.
 */
let booted = false;
export function initWebVitals() {
  if (booted || typeof window === "undefined") return;
  booted = true;

  // TTFB — derive from the Navigation Timing entry.
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) record("TTFB", Math.max(0, nav.responseStart - nav.requestStart));
  } catch { /* unsupported */ }

  // Helper that wraps PerformanceObserver in a try/catch so an unsupported
  // entryType (e.g. "event" on older Safari) doesn't blow up the others.
  const observe = (type: string, cb: (entries: PerformanceEntryList) => void) => {
    try {
      const po = new PerformanceObserver((list) => cb(list.getEntries()));
      po.observe({ type, buffered: true } as PerformanceObserverInit);
    } catch { /* entryType not supported */ }
  };

  // FCP — first "first-contentful-paint" paint entry.
  observe("paint", (entries) => {
    for (const e of entries) {
      if (e.name === "first-contentful-paint") record("FCP", e.startTime);
    }
  });

  // LCP — last largest-contentful-paint entry wins (per spec, take the latest).
  observe("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1];
    if (last) record("LCP", (last as PerformanceEntry & { renderTime?: number; loadTime?: number }).renderTime
      || (last as PerformanceEntry & { loadTime?: number }).loadTime
      || last.startTime);
  });

  // CLS — sum of layout-shift values excluding shifts caused by recent input.
  let cls = 0;
  observe("layout-shift", (entries) => {
    for (const e of entries as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      if (!e.hadRecentInput) cls += e.value;
    }
    record("CLS", cls);
  });

  // INP — track worst (highest) interaction duration so far.
  let worstInp = 0;
  observe("event", (entries) => {
    for (const e of entries as (PerformanceEntry & { duration: number; interactionId?: number })[]) {
      // Only count entries that belong to a real user interaction.
      if (e.interactionId && e.duration > worstInp) {
        worstInp = e.duration;
        record("INP", worstInp);
      }
    }
  });
}

/** Read the current snapshot (memory first, then sessionStorage fallback). */
export function readVitals(): Partial<Record<VitalName, VitalSample>> {
  if (Object.keys(samples).length > 0) return { ...samples };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<VitalName, VitalSample>>) : {};
  } catch {
    return {};
  }
}

/** Expose thresholds for the dashboard's "budget" column. */
export const vitalsThresholds = THRESHOLDS;
