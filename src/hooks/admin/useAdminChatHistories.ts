import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { ChatHistory } from "@/lib/admin/chatHelpers";

const QUERY_KEY = ["admin-chat-histories"];

export function useAdminChatHistories() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_histories")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as ChatHistory[];
    },
    staleTime: 30 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_histories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "চ্যাট ডিলিট হয়েছে" });
    },
    onError: () => toast({ title: "ডিলিট করতে সমস্যা হয়েছে", variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data: chats } = await supabase
        .from("chat_histories")
        .select("id, order_id, order_status")
        .not("order_id", "is", null);
      if (!chats || chats.length === 0) return 0;

      const orderIds = chats.map((c) => c.order_id!).filter(Boolean);
      const { data: orders } = await supabase
        .from("orders")
        .select("id, status, total")
        .in("id", orderIds);
      if (!orders) return 0;

      const orderMap = new Map(orders.map((o) => [o.id, o]));
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
      toast({ title: `${count}টি চ্যাটের স্ট্যাটাস আপডেট হয়েছে` });
    },
    onError: () => toast({ title: "সিঙ্ক করতে সমস্যা হয়েছে", variant: "destructive" }),
  });

  return { ...query, deleteMutation, syncMutation, invalidate };
}
