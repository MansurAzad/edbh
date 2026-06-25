/**
 * @file query-client.ts
 * @module lib/query-client
 *
 * Singleton TanStack Query (`@tanstack/react-query`) client shared across the
 * entire application.  A single instance is mandatory — multiple QueryClient
 * instances would create isolated caches and duplicate in-flight requests.
 *
 * ## Default options (rationale)
 *
 * | Option                | Value      | Why                                                             |
 * |-----------------------|------------|-----------------------------------------------------------------|
 * | `staleTime`           | 5 min      | Avoids redundant re-fetches while users navigate between pages. |
 * | `gcTime`              | 15 min     | Keeps data in memory long enough for back-navigation to feel    |
 * |                       |            | instant while still eventually freeing memory.                  |
 * | `refetchOnWindowFocus`| false      | Products / content don't change every focus; prevents flicker.  |
 * | `retry`               | 1          | One retry handles transient network glitches without hammering   |
 * |                       |            | the API on hard failures (e.g. 4xx, auth errors).              |
 * | `refetchOnMount`      | false      | Respects `staleTime`; don't re-fetch when navigating back to a  |
 * |                       |            | page whose data is still fresh.                                 |
 *
 * ## Cross-module contract
 * - Import `queryClient` wherever programmatic cache manipulation is needed
 *   (e.g. `queryClient.invalidateQueries`, `queryClient.setQueryData`).
 * - Never create a second `new QueryClient()` elsewhere in the codebase.
 * - Use the keys from `@/lib/query-keys` so invalidation is type-safe.
 *
 * @example
 * // Invalidate all product queries after a mutation
 * import { queryClient } from "@/lib/query-client";
 * import { queryKeys } from "@/lib/query-keys";
 * await queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
 */

import { QueryClient } from "@tanstack/react-query";

/**
 * Application-wide TanStack Query client.
 *
 * Exported as a named singleton so that both the React provider
 * (`<QueryClientProvider client={queryClient}>`) and imperative call sites
 * (mutations, Supabase real-time handlers) share the exact same cache.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Data is considered fresh for 5 minutes after it was fetched.
       * Within this window, `useQuery` will **not** trigger a background
       * re-fetch even if the component re-mounts.
       */
      staleTime: 5 * 60 * 1000, // 5 minutes in milliseconds

      /**
       * Inactive query results are kept in memory for 15 minutes before the
       * garbage collector removes them.  Setting this higher than `staleTime`
       * lets users navigate back to a page and see cached data immediately
       * while a background fetch runs.
       */
      gcTime: 15 * 60 * 1000, // 15 minutes in milliseconds

      /**
       * Disable automatic re-fetch when the browser window regains focus.
       * Content (products, categories) changes infrequently; enabling this
       * would cause jarring re-renders while users tab back to the store.
       */
      refetchOnWindowFocus: false,

      /**
       * Retry once on failure.  A single retry covers transient network drops
       * without looping indefinitely on genuine server errors (40x / 50x).
       * Individual queries can override this per-call via `{ retry: N }`.
       */
      retry: 1,

      /**
       * When a component that already has cached data re-mounts, do NOT
       * automatically kick off a background fetch.  Combined with `staleTime`,
       * this prevents double-fetches on route transitions.
       */
      refetchOnMount: false,
    },
  },
});
