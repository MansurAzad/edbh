/**
 * @file useAdminChatHistories.ts
 * @description React Query hook that owns all server-state for the Admin Chat page.
 *
 * Exports one hook: `useAdminChatHistories`.
 *
 * Responsibilities:
 *   • Fetches up to 500 chat_histories rows ordered newest-first.
 *   • Exposes a `deleteMutation` to hard-delete a single chat row.
 *   • Exposes a `syncMutation` that reconciles `order_status` / `order_total`
 *     cached on chat_histories with the live `orders` table — useful when an
 *     order's status is changed outside the chat UI.
 *
 * Bengali toast strings:
 *   চ্যাট ডিলিট হয়েছে              = Chat deleted
 *   ডিলিট করতে সমস্যা হয়েছে        = Problem deleting
 *   {n}টি চ্যাটের স্ট্যাটাস আপডেট হয়েছে = {n} chats' status updated
 *   সিঙ্ক করতে সমস্যা হয়েছে        = Problem syncing
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { ChatHistory } from "@/lib/admin/chatHelpers";

/**
 * Stable query key used for the chat histories list.
 * Centralised here so invalidation calls in mutations always hit the same key.
 */
const QUERY_KEY = ["admin-chat-histories"];

/**
 * useAdminChatHistories
 *
 * Combines a TanStack Query `useQuery` for fetching with two `useMutation`s
 * for delete and sync, all sharing the same `queryClient` for cache management.
 *
 * Fetch details:
 *   - Selects all columns (`*`) from `chat_histories`.
 *   - `limit(500)` prevents the payload from growing unbounded on large stores.
 *   - `staleTime: 30_000` means the cached list is considered fresh for 30 s
 *     before a background refetch is triggered.
 *
 * Sync mutation logic:
 *   1. Fetches only chat_histories rows that have a non-null order_id.
 *   2. Gathers all referenced order IDs and fetches them in one `in()` query.
 *   3. Builds a Map<orderId, order> for O(1) lookup.
 *   4. Sequentially updates only the rows where `order.status !== chat.order_status`
 *      to minimise unnecessary writes.
 *   Returns the count of actually-updated rows (shown in the success toast).
 *
 * @returns All TanStack Query properties from the inner `useQuery` plus
 *   `deleteMutation`, `syncMutation`, and `invalidate` helper.
 */
export function useAdminChatHistories() {
  const queryClient = useQueryClient();

  // ── Main list query ─────────────────────────────────────────────────────
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_histories")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500); // Hard cap — increase if the business grows significantly.
      if (error) throw error;
      // Supabase returns `unknown` for jsonb columns; cast via `unknown` first.
      return (data || []) as unknown as ChatHistory[];
    },
    staleTime: 30 * 1000, // 30 s — balance between freshness and request count.
  });

  /**
   * Invalidates the cached query, forcing a background refetch.
   * Called by both mutations on success.
   */
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  // ── Delete mutation ─────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    /**
     * Hard-deletes a chat_histories row by primary key.
     * @param id - UUID of the chat_histories row to delete.
     */
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_histories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "চ্যাট ডিলিট হয়েছে" }); // "Chat deleted"
    },
    onError: () => toast({ title: "ডিলিট করতে সমস্যা হয়েছে", variant: "destructive" }),
  });

  // ── Sync mutation ───────────────────────────────────────────────────────
  const syncMutation = useMutation({
    /**
     * Reconciles order_status / order_total on chat_histories with the
     * authoritative `orders` table.
     *
     * Returns the number of chat rows that were actually updated (i.e. where
     * the cached status differed from the live order status).
     */
    mutationFn: async () => {
      // Step 1: fetch only chats with a linked order.
      const { data: chats } = await supabase
        .from("chat_histories")
        .select("id, order_id, order_status")
        .not("order_id", "is", null);
      if (!chats || chats.length === 0) return 0;

      // Step 2: bulk-fetch all referenced orders in one query.
      const orderIds = chats.map((c) => c.order_id!).filter(Boolean);
      const { data: orders } = await supabase
        .from("orders")
        .select("id, status, total")
        .in("id", orderIds);
      if (!orders) return 0;

      // Step 3: O(1) lookup map — avoids nested loops.
      const orderMap = new Map(orders.map((o) => [o.id, o]));

      // Step 4: update only stale rows (avoids redundant writes).
      let updated = 0;
      for (const chat of chats) {
        const order = orderMap.get(chat.order_id!);
        if (order && order.status !== chat.order_status) {
          await supabase
            .from("chat_histories")
            .update({ order_status: order.status, order_total: order.total })
            .eq("id", chat.id);
          updated++;
        }
      }
      return updated;
    },
    onSuccess: (count) => {
      invalidate();
      // "{n}টি চ্যাটের স্ট্যাটাস আপডেট হয়েছে" = "{n} chats' status updated"
      toast({ title: `${count}টি চ্যাটের স্ট্যাটাস আপডেট হয়েছে` });
    },
    onError: () => toast({ title: "সিঙ্ক করতে সমস্যা হয়েছে", variant: "destructive" }),
  });

  return { ...query, deleteMutation, syncMutation, invalidate };
}
