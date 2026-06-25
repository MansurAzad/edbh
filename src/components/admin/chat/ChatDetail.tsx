/**
 * @file ChatDetail.tsx
 * @description Expanded detail panel for a single chat thread.
 *
 * Rendered when a ChatListItem is toggled open.  Shows:
 *   • Customer metadata strip (name, phone, date, linked order badge).
 *   • Products-discussed badges — derived from `chat.products_discussed[]`.
 *   • Scrollable message bubble list — user messages on the right,
 *     assistant/admin messages on the left.
 *     - Regular assistant messages render as Markdown via ReactMarkdown.
 *     - Admin-injected replies are detected by the sentinel prefix
 *       "🛡️ **অ্যাডমিন রিপ্লাই" and shown with a distinct accent border.
 *   • Admin reply textarea + send button (Enter sends, Shift+Enter newline).
 *   • "টুলস" (Tools) toggle button that mounts <AdminToolsPanel />.
 *
 * Bengali UI strings in this file:
 *   অ্যাডমিন রিপ্লাই লিখুন = Write admin reply
 *   পাঠান                   = Send
 *   টুলস                    = Tools
 *   কোনো মেসেজ নেই         = No messages
 *   অর্ডার                  = Order
 *   মোট {n}টি মেসেজ        = Total {n} messages
 *   ৩৬০° অ্যাডমিন টুলস সক্রিয় = 360° admin tools active
 */

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

/** Props accepted by ChatDetail. */
interface Props {
  /** The full chat record including messages[], order metadata, customer info. */
  chat: ChatHistory;
  /**
   * Called after any successful mutation so the parent list can re-fetch.
   * Passed down to AdminToolsPanel and useChatAdminActions.
   */
  onUpdate: () => void;
}

/**
 * ChatDetail
 *
 * Expands beneath a ChatListItem row to show the full conversation and
 * provide the admin reply + tools interface.
 *
 * Scroll behaviour: `scrollRef` is attached to the message container;
 * `scrollToBottom()` is called whenever `messages.length` changes so new
 * messages are always visible.
 *
 * Admin reply flow:
 *   1. Admin types in Textarea and presses Enter (or clicks "পাঠান").
 *   2. `handleReply` calls `sendAdminReply(replyText)` from useChatAdminActions.
 *   3. On success the textarea is cleared.
 *   4. The message is stored as role="assistant" with a "🛡️ **অ্যাডমিন রিপ্লাই:**"
 *      prefix so the UI can visually distinguish it from AI messages.
 *
 * @param props - See {@link Props}
 */
export default function ChatDetail({ chat, onUpdate }: Props) {
  /** Ref used to scroll the message container to the bottom on new messages. */
  const scrollRef = useRef<HTMLDivElement>(null);

  /** Admin's draft reply text. Cleared on successful send. */
  const [replyText, setReplyText] = useState("");

  /** Whether the AdminToolsPanel is mounted below the reply box. */
  const [showTools, setShowTools] = useState(false);

  // Destructure messages for readability and to track length in useEffect.
  const messages = chat.messages;

  const { saving, sendAdminReply } = useChatAdminActions(chat, onUpdate);

  /**
   * Scrolls the message viewport to the bottom.
   * Wrapped in useCallback to maintain a stable reference for useEffect.
   */
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  // Scroll to bottom whenever a new message is appended.
  useEffect(() => { scrollToBottom(); }, [messages.length, scrollToBottom]);

  /**
   * Sends the admin reply and clears the textarea on success.
   * Guards against accidental double-submit via `saving` flag in the hook.
   */
  const handleReply = async () => {
    const ok = await sendAdminReply(replyText);
    if (ok) setReplyText("");
  };

  return (
    <div className="mt-3 border-t pt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">

      {/* ── Customer metadata strip ──────────────────────────────────────── */}
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
          {/* Locale "bn-BD" formats dates in Bangla numerals, e.g. ২৩/০১/২০২৫ */}
          <span className="text-xs sm:text-sm">{new Date(chat.created_at).toLocaleString("bn-BD")}</span>
        </div>
        {chat.order_id && (
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground shrink-0" />
            {/* Short UUID: first 8 chars uppercased used as human-readable order number */}
            <span>#{chat.order_id.slice(0, 8).toUpperCase()}</span>
            {chat.order_total != null && (
              <span className={cn("font-bold ml-1", chat.order_status === "cancelled" ? "text-destructive line-through" : "text-primary")}>
                ৳{chat.order_total.toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Products discussed badges ────────────────────────────────────── */}
      {/* These are populated by sendProductsToChat and stored in chat.products_discussed[] */}
      <div className="flex flex-wrap gap-2 items-center">
        {chat.order_status && (
          <span className={cn("text-xs px-2 py-1 rounded-full flex items-center gap-1", getStatusColor(chat.order_status))}>
            {getStatusIcon(chat.order_status)}
            {/* অর্ডার = Order */}
            অর্ডার: {getStatusBengali(chat.order_status)}
          </span>
        )}
        {chat.products_discussed?.length > 0 && chat.products_discussed.map((p: any, i: number) => (
          <Badge key={i} variant="secondary" className="text-[10px] sm:text-xs">
            {/* Format: "Name x qty (size) — ৳price" */}
            {p.name}{p.quantity ? ` x${p.quantity}` : ""}{p.size ? ` (${p.size})` : ""} — ৳{(p.sale_price || p.price)?.toLocaleString()}
          </Badge>
        ))}
      </div>

      {/* ── Message bubbles ──────────────────────────────────────────────── */}
      {/*
       * Bubble alignment:
       *   role="user"      → right-aligned, primary background.
       *   role="assistant" → left-aligned; admin replies get accent border.
       *
       * Admin reply detection: content string is tested for the sentinel
       * prefix "🛡️ **অ্যাডমিন রিপ্লাই" that useChatAdminActions prepends.
       */}
      <div ref={scrollRef} className="border rounded-lg p-3 bg-muted/20 max-h-[400px] overflow-y-auto space-y-2.5 scroll-smooth">
        {messages.length === 0 ? (
          // কোনো মেসেজ নেই = No messages
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
                      ? "bg-accent/20 border border-accent/30 rounded-bl-md" // Admin reply style
                      : "bg-background border rounded-bl-md",               // AI reply style
                )}
              >
                {/* AI/admin messages render as Markdown; user messages are plain text */}
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                {/* Timestamp shown in bn-BD locale HH:MM format */}
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

      {/* ── Reply box + action buttons ───────────────────────────────────── */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          {/*
           * Textarea for admin reply.
           * - "AI ক্রেডিট ছাড়াই সরাসরি রিপ্লাই" = Direct reply without AI credits
           *   (Admin replies bypass the AI edge function and are written directly
           *   to chat_histories.messages via supabase.update.)
           * - Enter submits; Shift+Enter inserts a newline.
           */}
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
          {/* পাঠান = Send; disabled while saving or text is empty */}
          <Button size="sm" onClick={handleReply} disabled={!replyText.trim() || saving} className="h-8 gap-1.5">
            <Send className="w-4 h-4" />
            {saving ? "..." : "পাঠান"}
          </Button>
          {/* টুলস = Tools — toggles AdminToolsPanel visibility */}
          <Button size="sm" variant={showTools ? "default" : "outline"}
            onClick={() => setShowTools(!showTools)} className="h-8 gap-1.5 text-xs">
            <ShoppingCart className="w-3.5 h-3.5" />টুলস
          </Button>
        </div>
      </div>

      {/* AdminToolsPanel is mounted lazily — only when showTools is true */}
      {showTools && <AdminToolsPanel chat={chat} onUpdate={onUpdate} />}

      {/* Footer: message count + feature indicator */}
      {/* মোট {n}টি মেসেজ = Total {n} messages | ৩৬০° অ্যাডমিন টুলস সক্রিয় = 360° admin tools active */}
      <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
        <UserCog className="w-3 h-3" />
        মোট {messages.length}টি মেসেজ • ৩৬০° অ্যাডমিন টুলস সক্রিয়
      </p>
    </div>
  );
}
