/**
 * @file query-helpers.ts
 * @module lib/query-helpers
 *
 * Shared option presets for `useQuery` consumers.
 *
 * **Why this file exists**
 * Earlier in the project's life, many hooks each set their own `staleTime`,
 * `gcTime`, `refetchOnMount`, etc. That meant a single mutation could trigger
 * three different refetch behaviours depending on which hook owned the data.
 * Worse, rapid client-side navigation (e.g. shop → product → shop) was firing
 * duplicate background fetches because the keys didn't line up.
 *
 * This module offers a small set of **named presets** that every hook should
 * pick from. Presets are intentionally coarse — `reference`, `userScoped`,
 * `realtime`, `oneShot`. They compose with `queryKeys` from `query-keys.ts`
 * to guarantee TanStack Query dedupes identical fetches in flight.
 *
 * বাংলা: এই ফাইলটি `useQuery` হুকগুলির জন্য সাধারণ অপশন প্রিসেট সরবরাহ করে।
 * একই কী + একই অপশন ব্যবহার করলে দ্রুত পেজ পরিবর্তনের সময়
 * ব্যাকগ্রাউন্ড রিফেচ ডুপ্লিকেট হয় না।
 */

import type { UseQueryOptions } from "@tanstack/react-query";

/**
 * Reference-data preset: catalogue, CMS blocks, settings.
 * Long stale + gc, no aggressive refetching. Anything that changes
 * less than once per minute on the user's behalf belongs here.
 */
export const referencePreset: Partial<UseQueryOptions> = {
  staleTime: 10 * 60 * 1000, // 10 min — matches the global default in query-client.ts
  gcTime:    30 * 60 * 1000, // 30 min — keep in cache across route changes
  refetchOnMount: false,     // critical: rapid nav between shop/product/shop
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};

/**
 * User-scoped preset: profile, cart, wishlist, order list.
 * Shorter stale so the user sees their own changes promptly, but still
 * dedups for the duration of a single screen.
 */
export const userScopedPreset: Partial<UseQueryOptions> = {
  staleTime: 60 * 1000,     // 1 min
  gcTime:    10 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: true, // user came back to the tab — show their latest
  refetchOnReconnect: true,
};

/**
 * Realtime / dashboard preset: admin counters, live order feed.
 * Always-fresh, never cached longer than necessary.
 */
export const realtimePreset: Partial<UseQueryOptions> = {
  staleTime: 0,
  gcTime: 60 * 1000,
  refetchOnMount: true,
  refetchOnWindowFocus: true,
};

/**
 * One-shot preset: fire-and-forget reads that should never refetch
 * (e.g. a tracking-id lookup, a one-time invite check).
 */
export const oneShotPreset: Partial<UseQueryOptions> = {
  staleTime: Infinity,
  gcTime: 60 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: false,
};
