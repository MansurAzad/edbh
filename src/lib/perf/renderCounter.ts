/**
 * @file renderCounter.ts
 * @module lib/perf/renderCounter
 *
 * Tiny render-counter utility used by the Performance Budget dashboard.
 *
 * Components call `useRenderCount("ComponentName")` to bump a shared
 * counter every time they render. The dashboard reads the counter map
 * via `readRenderCounts()` to surface "hot" components that re-render
 * more than expected (a common React perf footgun).
 *
 * No external dependency — this is intentionally cheap so it stays on
 * in production. The map is bounded by component-name keys, so memory
 * is O(unique-components), not O(renders).
 *
 * বাংলা: রেন্ডার গণনা করার ছোট হুক — অ্যাডমিন পারফরম্যান্স ড্যাশবোর্ডে
 * কোন কম্পোনেন্ট বেশি রেন্ডার হচ্ছে তা শনাক্ত করতে ব্যবহৃত।
 */

import { useRef } from "react";

/** Global tally of renders per component label. */
const counts = new Map<string, number>();

/** React hook — bumps the counter on every render of the host component. */
export function useRenderCount(label: string) {
  // useRef avoids re-creating the closure each render; the increment runs
  // unconditionally so even the first render is counted.
  const ref = useRef(0);
  ref.current += 1;
  counts.set(label, (counts.get(label) || 0) + 1);
  return ref.current;
}

/** Snapshot of all render counts; safe to call from anywhere. */
export function readRenderCounts(): Record<string, number> {
  return Object.fromEntries(counts);
}

/** Reset all counters — useful for the dashboard's "clear" button. */
export function resetRenderCounts() {
  counts.clear();
}
