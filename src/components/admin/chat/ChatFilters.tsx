import { CalendarDays, Download, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  dateFilter: string;
  setDateFilter: (v: string) => void;
  onSync: () => void;
  syncing: boolean;
  onExport: () => void;
}

export default function ChatFilters({
  searchQuery, setSearchQuery, statusFilter, setStatusFilter,
  dateFilter, setDateFilter, onSync, syncing, onExport,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="নাম, ফোন বা অর্ডার ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue placeholder="স্ট্যাটাস" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">সব স্ট্যাটাস</SelectItem>
          <SelectItem value="pending">পেন্ডিং</SelectItem>
          <SelectItem value="processing">প্রসেসিং</SelectItem>
          <SelectItem value="shipped">শিপড</SelectItem>
          <SelectItem value="delivered">ডেলিভারড</SelectItem>
          <SelectItem value="cancelled">ক্যান্সেলড</SelectItem>
        </SelectContent>
      </Select>
      <Select value={dateFilter} onValueChange={setDateFilter}>
        <SelectTrigger className="w-full sm:w-[160px]">
          <CalendarDays className="w-4 h-4 mr-1.5 text-muted-foreground" />
          <SelectValue placeholder="তারিখ" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">সব তারিখ</SelectItem>
          <SelectItem value="today">আজ</SelectItem>
          <SelectItem value="7days">গত ৭ দিন</SelectItem>
          <SelectItem value="30days">গত ৩০ দিন</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={onSync} disabled={syncing} className="gap-1.5">
        <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
        সিঙ্ক
      </Button>
      <Button variant="outline" size="sm" onClick={onExport} className="gap-1.5">
        <Download className="w-4 h-4" />
        CSV
      </Button>
    </div>
  );
}
