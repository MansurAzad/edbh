import { CheckCircle, MessageCircle, ShoppingBag, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  total: number;
  successOrders: number;
  cancelled: number;
  totalSales: number;
}

export default function ChatStatCards({ total, successOrders, cancelled, totalSales }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm text-muted-foreground">মোট চ্যাট</span>
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <div className="text-xl sm:text-2xl font-bold">{total}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm text-muted-foreground">সফল অর্ডার</span>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-green-600">{successOrders}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm text-muted-foreground">ক্যান্সেলড</span>
            <XCircle className="w-4 h-4 text-destructive" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-destructive">{cancelled}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm text-muted-foreground">মোট বিক্রি</span>
            <ShoppingBag className="w-4 h-4 text-primary" />
          </div>
          <div className="text-xl sm:text-2xl font-bold">৳{totalSales.toLocaleString()}</div>
        </CardContent>
      </Card>
    </div>
  );
}
