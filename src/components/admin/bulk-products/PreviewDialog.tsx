import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ProductRow } from "@/lib/admin/bulkProducts/types";

/**
 * Props for the PreviewDialog component.
 * প্রিভিউ ডায়ালগ উপাদানের প্রপস।
 */
interface Props {
  /** Whether the dialog is open | ডায়ালগটি খোলা আছে কিনা */
  open: boolean;
  /** Callback to change open state | ওপেন স্টেট পরিবর্তনের কলব্যাক */
  onOpenChange: (o: boolean) => void;
  /** List of valid products to show | দেখানোর জন্য বৈধ প্রোডাক্টের তালিকা */
  validProducts: ProductRow[];
  /** Set of duplicate product IDs | ডুপ্লিকেট প্রোডাক্ট আইডির সেট */
  duplicates: Set<string>;
}

/**
 * PreviewDialog Component
 * Displays a summary table of products before they are saved.
 * সেভ করার আগে প্রোডাক্টগুলোর একটি সংক্ষিপ্ত টেবিল দেখায়।
 * 
 * @param {Props} props - Component properties.
 * @returns {JSX.Element} The rendered preview dialog.
 */
const PreviewDialog = ({ open, onOpenChange, validProducts, duplicates }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
      {/* Dialog Header with product count | প্রোডাক্ট সংখ্যা সহ ডায়ালগ হেডার */}
      <DialogHeader>
        <DialogTitle>প্রিভিউ — {validProducts.length}টি প্রোডাক্ট</DialogTitle>
      </DialogHeader>

      {/* Product Summary Table | প্রোডাক্টের সংক্ষিপ্ত তালিকা টেবিল */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>ইমেজ</TableHead>
            <TableHead>নাম</TableHead>
            <TableHead>ক্যাটাগরি</TableHead>
            <TableHead>মূল্য</TableHead>
            <TableHead>স্টক</TableHead>
            <TableHead>ভেরিয়েন্ট</TableHead>
            <TableHead>স্ট্যাটাস</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {validProducts.map((p, i) => (
            <TableRow 
              key={p.id} 
              // Highlight duplicates with a light red background | ডুপ্লিকেট হলে হালকা লাল ব্যাকগ্রাউন্ড
              className={duplicates.has(p.id) ? "bg-destructive/5" : ""}
            >
              <TableCell className="text-xs">{i + 1}</TableCell>
              <TableCell>
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-xs font-medium">{p.name}</TableCell>
              <TableCell className="text-xs">{p.category}</TableCell>
              <TableCell className="text-xs">
                ৳{p.price}
                {p.sale_price && (
                  <span className="text-muted-foreground ml-1">(৳{p.sale_price})</span>
                )}
              </TableCell>
              <TableCell className="text-xs">{p.stock}</TableCell>
              <TableCell className="text-xs">{p.variants.length}</TableCell>
              <TableCell>
                {/* Status Badge | স্ট্যাটাস ব্যাজ */}
                {duplicates.has(p.id) ? (
                  <Badge variant="destructive" className="text-[10px]">ডুপ্লিকেট</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">OK</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DialogContent>
  </Dialog>
);

export default PreviewDialog;
