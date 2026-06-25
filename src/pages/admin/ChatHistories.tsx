import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAdminChatHistories } from "@/hooks/admin/useAdminChatHistories";
import {
  CHAT_PAGE_SIZE, exportChatHistoriesCSV,
} from "@/lib/admin/chatHelpers";
import ChatStatCards from "@/components/admin/chat/ChatStatCards";
import ChatFilters from "@/components/admin/chat/ChatFilters";
import ChatListItem from "@/components/admin/chat/ChatListItem";

const ChatHistories = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  const { data: histories = [], isLoading, deleteMutation, syncMutation, invalidate } = useAdminChatHistories();

  const filtered = useMemo(() => {
    let result = histories;
    if (dateFilter !== "all") {
      const now = new Date();
      let cutoff: Date;
      if (dateFilter === "today") cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (dateFilter === "7days") cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      result = result.filter((h) => new Date(h.created_at) >= cutoff);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((h) =>
        h.customer_name?.toLowerCase().includes(q) ||
        h.customer_phone?.includes(q) ||
        h.order_id?.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((h) => h.order_status === statusFilter);
    }
    return result;
  }, [histories, searchQuery, statusFilter, dateFilter]);

  const totalPages = Math.ceil(filtered.length / CHAT_PAGE_SIZE);
  const paginated = filtered.slice(page * CHAT_PAGE_SIZE, (page + 1) * CHAT_PAGE_SIZE);

  const totalOrders = histories.filter((h) => h.order_id).length;
  const cancelledCount = histories.filter((h) => h.order_status === "cancelled").length;
  const totalSales = histories
    .filter((h) => h.order_status !== "cancelled")
    .reduce((s, h) => s + (h.order_total || 0), 0);

  const handleExport = () => {
    const { ok, count } = exportChatHistoriesCSV(filtered);
    if (!ok) toast({ title: "এক্সপোর্ট করার মতো ডেটা নেই", variant: "destructive" });
    else toast({ title: `${count}টি রেকর্ড এক্সপোর্ট হয়েছে` });
  };

  return (
    <AdminLayout>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-2 sm:gap-3">
            <MessageCircle className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            চ্যাট হিস্টোরি
          </h1>
          <p className="text-sm text-muted-foreground mt-1">কাস্টমারদের চ্যাটবট কথোপকথন ও অর্ডার বিবরণ</p>
        </div>

        <ChatStatCards
          total={histories.length}
          successOrders={totalOrders - cancelledCount}
          cancelled={cancelledCount}
          totalSales={totalSales}
        />

        <ChatFilters
          searchQuery={searchQuery}
          setSearchQuery={(v) => { setSearchQuery(v); setPage(0); }}
          statusFilter={statusFilter}
          setStatusFilter={(v) => { setStatusFilter(v); setPage(0); }}
          dateFilter={dateFilter}
          setDateFilter={(v) => { setDateFilter(v); setPage(0); }}
          onSync={() => syncMutation.mutate()}
          syncing={syncMutation.isPending}
          onExport={handleExport}
        />

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">কোনো চ্যাট হিস্টোরি পাওয়া যায়নি</p>
          </div>
        ) : (
          <>
            <p className="text-xs sm:text-sm text-muted-foreground">মোট {filtered.length}টি রেজাল্ট</p>
            <div className="space-y-2 sm:space-y-3">
              {paginated.map((chat) => (
                <ChatListItem
                  key={chat.id}
                  chat={chat}
                  expanded={expandedId === chat.id}
                  onToggle={() => setExpandedId((p) => (p === chat.id ? null : chat.id))}
                  onDelete={() => deleteMutation.mutate(chat.id)}
                  onUpdate={invalidate}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default ChatHistories;
