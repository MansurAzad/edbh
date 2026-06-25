import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ProductRow } from "@/lib/admin/bulkProducts/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  validProducts: ProductRow[];
  duplicates: Set<string>;
}

const PreviewDialog = ({ open, onOpenChange, validProducts, duplicates }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>প্রিভিউ — {validProducts.length}টি প্রোডাক্ট</DialogTitle></DialogHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead><TableHead>ইমেজ</TableHead><TableHead>নাম</TableHead>
            <TableHead>ক্যাটাগরি</TableHead><TableHead>মূল্য</TableHead><TableHead>স্টক</TableHead>
            <TableHead>ভেরিয়েন্ট</TableHead><TableHead>স্ট্যাটাস</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {validProducts.map((p, i) => (
            <TableRow key={p.id} className={duplicates.has(p.id) ? "bg-destructive/5" : ""}>
              <TableCell className="text-xs">{i + 1}</TableCell>
              <TableCell>{p.image_url ? <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover" /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
              <TableCell className="text-xs font-medium">{p.name}</TableCell>
              <TableCell className="text-xs">{p.category}</TableCell>
              <TableCell className="text-xs">৳{p.price}{p.sale_price && <span className="text-muted-foreground ml-1">(৳{p.sale_price})</span>}</TableCell>
              <TableCell className="text-xs">{p.stock}</TableCell>
              <TableCell className="text-xs">{p.variants.length}</TableCell>
              <TableCell>
                {duplicates.has(p.id)
                  ? <Badge variant="destructive" className="text-[10px]">ডুপ্লিকেট</Badge>
                  : <Badge variant="outline" className="text-[10px]">OK</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DialogContent>
  </Dialog>
);

export default PreviewDialog;
