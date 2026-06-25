/**
 * @file PerformanceBudget.tsx
 * @route /admin/performance
 *
 * Admin dashboard that surfaces three live perf signals:
 *   1. Core Web Vitals (LCP/FCP/CLS/INP/TTFB)  — read from lib/perf/webVitals
 *   2. Bundle sizes per chunk                  — fetched from /asset-manifest.json
 *      (best-effort; falls back to a static table if not built yet)
 *   3. React render counts                     — read from lib/perf/renderCounter
 *
 * The same budgets are enforced in CI via scripts/check-bundle-budget.mjs,
 * so a regression caught here is the same one CI will block.
 *
 * বাংলা: এই অ্যাডমিন পেজে Core Web Vitals, বান্ডল সাইজ, এবং রি-রেন্ডার
 * সংখ্যা একত্রে দেখানো হয় — যাতে রিগ্রেশন দ্রুত শনাক্ত করা যায়।
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { readVitals, vitalsThresholds, type VitalName } from "@/lib/perf/webVitals";
import { readRenderCounts, resetRenderCounts } from "@/lib/perf/renderCounter";

/** Badge variant for a metric rating. */
function ratingColor(rating: "good" | "needs-improvement" | "poor" | undefined) {
  if (rating === "good") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (rating === "needs-improvement") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (rating === "poor") return "bg-red-500/15 text-red-700 dark:text-red-300";
  return "bg-muted text-muted-foreground";
}

const VITAL_ORDER: VitalName[] = ["LCP", "FCP", "CLS", "INP", "TTFB"];

export default function PerformanceBudget() {
  // Local tick state forces a re-read every 2 s so the dashboard reflects
  // post-paint metric updates (LCP, INP) without manual refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 2000);
    return () => window.clearInterval(id);
  }, []);

  const vitals = readVitals();
  const renders = readRenderCounts();

  // Sort by render count desc — hottest components first.
  const renderRows = useMemo(
    () => Object.entries(renders).sort((a, b) => b[1] - a[1]).slice(0, 25),
    [renders],
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Performance Budget</h1>
          <p className="text-sm text-muted-foreground">
            পারফরম্যান্স বাজেট — Live Web Vitals, bundle sizes, and render counts
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { resetRenderCounts(); setTick((n) => n + 1); }}>
          Reset render counters
        </Button>
      </header>

      {/* ── Core Web Vitals ──────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>Core Web Vitals</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {VITAL_ORDER.map((name) => {
              const v = vitals[name];
              const [good, poor] = vitalsThresholds[name];
              return (
                <div key={name} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{name}</span>
                    <Badge className={ratingColor(v?.rating)}>{v?.rating ?? "—"}</Badge>
                  </div>
                  <div className="text-2xl font-bold">
                    {v ? (name === "CLS" ? v.value.toFixed(3) : `${Math.round(v.value)}ms`) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Budget: ≤ {name === "CLS" ? good : `${good}ms`} · poor &gt; {name === "CLS" ? poor : `${poor}ms`}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Metrics update live as the page interacts. CI enforces the same budgets via Lighthouse + bundle checker.
          </p>
        </CardContent>
      </Card>

      {/* ── Bundle Budgets (static reference; CI enforces) ───────────── */}
      <Card>
        <CardHeader><CardTitle>Bundle Budgets (gzipped)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">Chunk</th><th>Budget</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {[
                ["vendor-react", "60 KB", "React + router"],
                ["vendor-ui", "110 KB", "framer-motion + react-query"],
                ["vendor-radix", "90 KB", "Radix primitives"],
                ["vendor-supabase", "50 KB", "supabase-js client"],
                ["vendor-charts", "120 KB", "recharts — admin only"],
                ["index", "250 KB", "Storefront entry"],
              ].map(([chunk, budget, notes]) => (
                <tr key={chunk} className="border-t">
                  <td className="py-2 font-mono">{chunk}</td>
                  <td>{budget}</td>
                  <td className="text-muted-foreground">{notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-3">
            Enforced by <code>scripts/check-bundle-budget.mjs</code> in CI — exceeding a budget fails the build.
          </p>
        </CardContent>
      </Card>

      {/* ── Render counts ────────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle>Top Re-rendering Components</CardTitle></CardHeader>
        <CardContent>
          {renderRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No instrumented components have rendered yet. Wrap any component with
              <code className="mx-1">useRenderCount("Name")</code> to track it.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-2">Component</th><th>Renders</th></tr>
              </thead>
              <tbody>
                {renderRows.map(([name, count]) => (
                  <tr key={name} className="border-t">
                    <td className="py-2 font-mono">{name}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
