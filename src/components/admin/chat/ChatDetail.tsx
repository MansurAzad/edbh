import { useCallback, useEffect, useRef, useState } from "react";
import {
  Calendar, Package, Phone, Send, ShoppingCart, User, UserCog,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getStatusBengali, getStatusColor, getStatusIcon, type ChatHistory,
} from "@/lib/admin/chatHelpers";
import { useChatAdminActions } from "@/hooks/admin/useChatAdminActions";
import AdminToolsPanel from "@/components/admin/chat/AdminToolsPanel";

interface Props {
  chat: ChatHistory;
  onUpdate: () => void;
}

export default function ChatDetail({ chat, onUpdate }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [replyText, setReplyText] = useState("");
  const [showTools, setShowTools] = useState(false);
  const messages = chat.messages;

  const { saving, sendAdminReply } = useChatAdminActions(chat, onUpdate);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages.length, scrollToBottom]);

  const handleReply = async () => {
    const ok = await sendAdminReply(replyText);
    if (ok) setReplyText("");
  };

  return (
    <div className="mt-3 border-t pt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm bg-muted/50 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{chat.customer_name || "N/A"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="truncate">{chat.customer_phone || "N/A"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-xs sm:text-sm">{new Date(chat.created_at).toLocaleString("bn-BD")}</span>
        </div>
        {chat.order_id && (
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>#{chat.order_id.slice(0, 8).toUpperCase()}</span>
            {chat.order_total != null && (
              <span className={cn("font-bold ml-1", chat.order_status === "cancelled" ? "text-destructive line-through" : "text-primary")}>
                ৳{chat.order_total.toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {chat.order_status && (
          <span className={cn("text-xs px-2 py-1 rounded-full flex items-center gap-1", getStatusColor(chat.order_status))}>
            {getStatusIcon(chat.order_status)}
            অর্ডার: {getStatusBengali(chat.order_status)}
          </span>
        )}
        {chat.products_discussed?.length > 0 && chat.products_discussed.map((p: any, i: number) => (
          <Badge key={i} variant="secondary" className="text-[10px] sm:text-xs">
            {p.name}{p.quantity ? ` x${p.quantity}` : ""}{p.size ? ` (${p.size})` : ""} — ৳{(p.sale_price || p.price)?.toLocaleString()}
          </Badge>
        ))}
      </div>

      <div ref={scrollRef} className="border rounded-lg p-3 bg-muted/20 max-h-[400px] overflow-y-auto space-y-2.5 scroll-smooth">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">কোনো মেসেজ নেই</p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] sm:max-w-[75%] rounded-2xl px-3 py-2 text-xs sm:text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : msg.content.includes("🛡️ **অ্যাডমিন রিপ্লাই")
                      ? "bg-accent/20 border border-accent/30 rounded-bl-md"
                      : "bg-background border rounded-bl-md",
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                {msg.timestamp && (
                  <p className="text-[10px] opacity-50 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Textarea
            placeholder="অ্যাডমিন রিপ্লাই লিখুন... (AI ক্রেডিট ছাড়াই সরাসরি রিপ্লাই)"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={2}
            className="resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleReply();
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Button size="sm" onClick={handleReply} disabled={!replyText.trim() || saving} className="h-8 gap-1.5">
            <Send className="w-4 h-4" />
            {saving ? "..." : "পাঠান"}
          </Button>
          <Button size="sm" variant={showTools ? "default" : "outline"}
            onClick={() => setShowTools(!showTools)} className="h-8 gap-1.5 text-xs">
            <ShoppingCart className="w-3.5 h-3.5" />টুলস
          </Button>
        </div>
      </div>

      {showTools && <AdminToolsPanel chat={chat} onUpdate={onUpdate} />}

      <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
        <UserCog className="w-3 h-3" />
        মোট {messages.length}টি মেসেজ • ৩৬০° অ্যাডমিন টুলস সক্রিয়
      </p>
    </div>
  );
}
