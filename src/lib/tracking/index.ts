// Public surface for tracking. Import from "@/lib/tracking" in new code.
// Older imports of "@/components/seo/AnalyticsTracker" still work — that file
// re-exports from here for back-compat.
export * from "./events";
export { dedupKey, eid } from "./dedup";
export { fanout, gtmLoaded, type TrackInput } from "./core";
