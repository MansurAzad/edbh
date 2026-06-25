/**
 * @file ChatStatCards.tsx
 * @description Four KPI summary cards shown at the top of the Admin Chat page.
 *
 * Cards (left → right):
 *   1. মোট চ্যাট    (Total chats)   — all chat_histories rows matching current filters.
 *   2. সফল অর্ডার  (Success orders) — orders with status NOT in (cancelled, pending).
 *   3. ক্যান্সেলড  (Cancelled)      — orders with status = "cancelled".
 *   4. মোট বিক্রি  (Total sales)    — sum of order_total for successful orders.
 *
 * All values are computed by the parent page component and passed as props;
 * this component is purely presentational.
 *
 * Bengali UI strings:
 *   মোট চ্যাট  = Total chats
 *   সফল অর্ডার = Successful orders
 *   ক্যান্সেলড  = Cancelled
 *   মোট বিক্রি = Total sales
 */

import { CheckCircle, MessageCircle, ShoppingBag, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Props for ChatStatCards — all values pre-computed by the parent. */
interface Props {
  /** Total number of chat_histories rows after applying current filters. */
  total: number;
  /** Count of chats linked to non-cancelled, non-pending orders. */
  successOrders: number;
  /** Count of chats linked to cancelled orders. */
  cancelled: number;
  /** Sum of order_total for successful orders, displayed as ৳ (BDT). */
  totalSales: number;
}

/**
 * ChatStatCards
 *
 * Renders a 2×2 (mobile) / 1×4 (sm+) grid of stat cards.
 * Numbers are formatted with `toLocaleString()` for thousands separators.
 * The Taka symbol ৳ is the ISO 4217 BDT currency symbol used in Bangladesh.
 *
 * @param props - See {@link Props}
 */
export default function ChatStatCards({ total, successOrders, cancelled, totalSales }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

      {/* Card 1: মোট চ্যাট = Total chats */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm text-muted-foreground">মোট চ্যাট</span>
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <div className="text-xl sm:text-2xl font-bold">{total}</div>
        </CardContent>
      </Card>

      {/* Card 2: সফল অর্ডার = Successful orders (green) */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm text-muted-foreground">সফল অর্ডার</span>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-green-600">{successOrders}</div>
        </CardContent>
      </Card>

      {/* Card 3: ক্যান্সেলড = Cancelled (destructive red) */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm text-muted-foreground">ক্যান্সেলড</span>
            <XCircle className="w-4 h-4 text-destructive" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-destructive">{cancelled}</div>
        </CardContent>
      </Card>

      {/* Card 4: মোট বিক্রি = Total sales in BDT (৳) */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm text-muted-foreground">মোট বিক্রি</span>
            <ShoppingBag className="w-4 h-4 text-primary" />
          </div>
          {/* ৳ = Bangladeshi Taka; toLocaleString adds comma separators */}
          <div className="text-xl sm:text-2xl font-bold">৳{totalSales.toLocaleString()}</div>
        </CardContent>
      </Card>
    </div>
  );
}
