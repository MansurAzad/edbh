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

interface Props {
  chat: ChatHistory;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export default function ChatListItem({ chat, expanded, onToggle, onDelete, onUpdate }: Props) {
  return (
    <Card
      className={cn(
        "transition-colors",
        chat.order_status === "cancelled" && "border-destructive/20 bg-destructive/5",
        expanded && "border-primary/40 shadow-md",
      )}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2 sm:gap-4 cursor-pointer" onClick={onToggle}>
          <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
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
              <p className="font-semibold text-sm sm:text-base truncate">{chat.customer_name || "অজানা কাস্টমার"}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs sm:text-sm text-muted-foreground">
                {chat.customer_phone && (
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{chat.customer_phone}</span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(chat.created_at).toLocaleDateString("bn-BD")}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  {chat.messages.length} মেসেজ
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {chat.order_id && (
              <Badge variant="outline" className="text-[10px] sm:text-xs">
                #{chat.order_id.slice(0, 8).toUpperCase()}
              </Badge>
            )}
            {chat.order_total != null && (
              <span className={cn(
                "text-xs sm:text-sm font-bold",
                chat.order_status === "cancelled" ? "text-destructive line-through" : "text-primary",
              )}>
                ৳{chat.order_total.toLocaleString()}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              {chat.order_status && (
                <span className={cn("text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full flex items-center gap-1", getStatusColor(chat.order_status))}>
                  {getStatusIcon(chat.order_status)}
                  {getStatusBengali(chat.order_status)}
                </span>
              )}
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
              {expanded
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
        </div>

        {expanded && <ChatDetail chat={chat} onUpdate={onUpdate} />}
      </CardContent>
    </Card>
  );
}
