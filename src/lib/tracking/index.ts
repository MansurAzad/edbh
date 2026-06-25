// ============= Full file contents =============

/**
 * @file index.ts
 * @module lib/tracking
 *
 * @description
 * Public barrel export for the tracking subsystem.
 *
 * **Usage** — always import tracking utilities from this path in new code:
 * ```ts
 * import { trackAddToCart, trackPurchase, dedupKey } from "@/lib/tracking";
 * ```
 *
 * **Back-compat** — legacy imports of `"@/components/seo/AnalyticsTracker"`
 * continue to work because that file re-exports from here.
 *
 * **What is exported**
 * | Symbol | Source | Purpose |
 * |---|---|---|
 * | `track*` functions | `./events` | Per-event wrappers (add_to_cart, purchase, …) |
 * | `dedupKey` | `./dedup` | Stable cross-channel event id generator |
 * | `eid` | `./dedup` | Legacy alias for `dedupKey(name)` |
 * | `fanout` | `./core` | Low-level multi-channel broadcaster |
 * | `gtmLoaded` | `./core` | Boolean ref — true once GTM script is ready |
 * | `TrackInput` | `./core` | TypeScript type for the fanout payload shape |
 *
 * বাংলা টীকা:
 * এই ফাইলটি ট্র্যাকিং সাবসিস্টেমের পাবলিক এন্ট্রি পয়েন্ট।
 * নতুন কোডে সর্বদা `@/lib/tracking` থেকে ইম্পোর্ট করুন।
 * পুরনো `AnalyticsTracker` ইম্পোর্টও এখানেই রিডাইরেক্ট হয়।
 */

// Public surface for tracking. Import from "@/lib/tracking" in new code.
// Older imports of "@/components/seo/AnalyticsTracker" still work — that file
// re-exports from here for back-compat.

/** All per-event wrapper functions (trackAddToCart, trackPurchase, etc.). */
export * from "./events";

/**
 * `dedupKey` — stable cross-channel event id for a given (event, key) pair.
 * `eid`      — legacy single-argument alias for `dedupKey`.
 *
 * বাংলা: ইভেন্ট ডিডুপলিকেশনের জন্য স্থায়ী আইডি জেনারেটর এবং পুরনো নাম।
 */
export { dedupKey, eid } from "./dedup";

/**
 * `fanout`    — low-level broadcaster; use only when no typed wrapper exists yet.
 * `gtmLoaded` — reactive boolean ref that becomes `true` once the GTM script fires.
 * `TrackInput` — TypeScript type describing the full fanout payload shape.
 *
 * বাংলা: `fanout` সরাসরি সব চ্যানেলে পাঠায়। `gtmLoaded` GTM প্রস্তুত হলে true হয়।
 */
export { fanout, gtmLoaded, type TrackInput } from "./core";
