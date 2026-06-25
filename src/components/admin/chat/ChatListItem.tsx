/**
 * @file ChatListItem.tsx
 * @description A single collapsible row in the admin chat history list.
 *
 * When collapsed shows: customer avatar, name, phone, date, message count,
 *   order badge + total + status pill, and a delete button.
 * When expanded mounts <ChatDetail /> beneath the header row.
 *
 * Visual variants driven by order status:
 *   • cancelled  → destructive border/background tint + XCircle avatar icon.
 *   • expanded   → primary border + shadow for focus.
 *   • default    → neutral card.
 *
 * Bengali UI strings in this file:
 *   অজানা কাস্টমার = Unknown customer (fallback when customer_name is null)
 *   মেসেজ          = Messages (e.g. "৫ মেসেজ" = 5 messages)
 *   এই চ্যাট ডিলিট করতে চান? = Confirm delete prompt
 */

import {
  ChevronDown, ChevronUp, Clock, MessageCircle, Phone, Trash2, User, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getStatusBengali, getStatusColor, getStatusIcon, type ChatHistory,
} from "@/lib/admin/chatHelpers";
import ChatDetail from "@/components/admin/chat/ChatDetail";

/** Props accepted by ChatListItem. */
interface Props {
  /** Full chat record including messages[], order metadata, customer info. */
  chat: ChatHistory;
  /** Whether this item's detail panel is currently visible. */
  expanded: boolean;
  /**
   * Toggles expanded state.  The parent maintains a single `expandedId` so
   * only one item can be open at a time.
   */
  onToggle: () => void;
  /**
   * Called when the delete button is confirmed.
   * The parent calls `deleteMutation.mutate(chat.id)`.
   */
  onDelete: () => void;
  /**
   * Passed through to ChatDetail → AdminToolsPanel so any mutation (reply,
   * order create, status update) triggers a list re-fetch in the parent.
   */
  onUpdate: () => void;
}

/**
 * ChatListItem
 *
 * Renders a Card with a clickable header that expands/collapses ChatDetail.
 *
 * Delete flow:
 *   1. User clicks the Trash2 icon (stopPropagation prevents toggle).
 *   2. Browser `confirm()` dialog: "এই চ্যাট ডিলিট করতে চান?" (Delete this chat?)
 *   3. On confirmation `onDelete()` is called.
 *
 * @param props - See {@link Props}
 */
export default function ChatListItem({ chat, expanded, onToggle, onDelete, onUpdate }: Props) {
  return (
    <Card
      className={cn(
        "transition-colors",
        // Cancelled orders get a subtle red tint to draw attention.
        chat.order_status === "cancelled" && "border-destructive/20 bg-destructive/5",
        // Expanded item gets a primary-coloured border + shadow for clarity.
        expanded && "border-primary/40 shadow-md",
      )}
    >
      <CardContent className="p-3 sm:p-4">
        {/* ── Clickable header row ─────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-2 sm:gap-4 cursor-pointer" onClick={onToggle}>

          {/* Left section: avatar + name + meta */}
          <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
            {/* Avatar circle — red XCircle for cancelled, primary User otherwise */}
            <div
              className={cn(
                "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0",
                chat.order_status === "cancelled" ? "bg-destructive/10" : "bg-primary/10",
              )}
            >
              {chat.order_status === "cancelled"
                ? <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                : <User className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />}
            </div>

            <div className="min-w-0 flex-1">
              {/* অজানা কাস্টমার = Unknown customer (null fallback) */}
              <p className="font-semibold text-sm sm:text-base truncate">{chat.customer_name || "অজানা কাস্টমার"}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs sm:text-sm text-muted-foreground">
                {chat.customer_phone && (
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{chat.customer_phone}</span>
                )}
                {/* Date formatted with bn-BD locale for Bangla numerals */}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(chat.created_at).toLocaleDateString("bn-BD")}
                </span>
                {/* মেসেজ = messages; shows total message count */}
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  {chat.messages.length} মেসেজ
                </span>
              </div>
            </div>
          </div>

          {/* Right section: order badge, total, status pill, actions */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            {/* Short order ID badge — first 8 chars of UUID uppercased */}
            {chat.order_id && (
              <Badge variant="outline" className="text-[10px] sm:text-xs">
                #{chat.order_id.slice(0, 8).toUpperCase()}
              </Badge>
            )}
            {/* Order total in BDT — struck-through red if cancelled */}
            {chat.order_total != null && (
              <span className={cn(
                "text-xs sm:text-sm font-bold",
                chat.order_status === "cancelled" ? "text-destructive line-through" : "text-primary",
              )}>
                ৳{chat.order_total.toLocaleString()}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              {/* Status pill — colour + icon + Bengali label via chatHelpers */}
              {chat.order_status && (
                <span className={cn("text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full flex items-center gap-1", getStatusColor(chat.order_status))}>
                  {getStatusIcon(chat.order_status)}
                  {getStatusBengali(chat.order_status)}
                </span>
              )}

              {/*
               * Delete button — stopPropagation prevents the card toggle from firing.
               * Uses native browser confirm() for a fast, dependency-free confirmation.
               * "এই চ্যাট ডিলিট করতে চান?" = "Do you want to delete this chat?"
               */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("এই চ্যাট ডিলিট করতে চান?")) onDelete();
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>

              {/* Expand/collapse chevron */}
              {expanded
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
        </div>

        {/* ── Detail panel (lazy-mounted when expanded) ────────────────── */}
        {expanded && <ChatDetail chat={chat} onUpdate={onUpdate} />}
      </CardContent>
    </Card>
  );
}
