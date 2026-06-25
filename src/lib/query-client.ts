/**
 * @file query-client.ts
 * @module lib/query-client
 *
 * Singleton TanStack Query client. In addition to default cache options, it
 * installs global QueryCache / MutationCache error handlers that automatically
 * surface a friendly bilingual toast for any unhandled error — so individual
 * call-sites don't need to remember a try/catch + toast for the common case.
 *
 * Per-call sites can still opt out by setting `meta.silent = true` on their
 * useQuery / useMutation, e.g. when they show inline errors instead.
 */

import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { getFriendlyError } from "@/lib/error/getFriendlyError";

/**
 * Shared helper: decide whether to swallow the auto-toast for a given query
 * or mutation. Set `meta: { silent: true }` to opt out.
 */
const isSilent = (meta: Record<string, unknown> | undefined) =>
  Boolean(meta && meta.silent === true);

export const queryClient = new QueryClient({
  /** Global handler for query errors (e.g. background refetches). */
  queryCache: new QueryCache({
    onError: (error, query) => {
      // eslint-disable-next-line no-console
      console.error("[query]", query.queryKey, error);
      if (isSilent(query.meta)) return;
      // Only show a toast if the query has observers actively waiting on it —
      // avoids noisy toasts for background prefetches that nobody is watching.
      if (query.getObserversCount() === 0) return;
      toast.error(getFriendlyError(error));
    },
  }),

  /** Global handler for mutation errors not caught by the caller. */
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      // eslint-disable-next-line no-console
      console.error("[mutation]", mutation.options.mutationKey, error);
      if (isSilent(mutation.meta)) return;
      toast.error(getFriendlyError(error));
    },
  }),

  defaultOptions: {
    queries: {
      // See file header for rationale on each value.
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
      refetchOnMount: false,
    },
  },
});
