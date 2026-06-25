import { MapPin, Pencil, Phone, ShieldBan, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { UnifiedCustomer } from "@/lib/admin/customerHelpers";

interface Props {
  loading: boolean;
  customers: UnifiedCustomer[];
  blockedSet: Set<string>;
  onEdit: (c: UnifiedCustomer) => void;
  onDelete: (c: UnifiedCustomer) => void;
  onBlock: (userId: string, name: string) => void;
  onUnblock: (userId: string) => void;
  unblockPending: boolean;
}

export default function CustomersTable({
  loading, customers, blockedSet, onEdit, onDelete, onBlock, onUnblock, unblockPending,
}: Props) {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>নাম</TableHead>
            <TableHead>যোগাযোগ</TableHead>
            <TableHead>ঠিকানা</TableHead>
            <TableHead>ধরন</TableHead>
            <TableHead>তারিখ</TableHead>
            <TableHead className="text-right">অ্যাকশন</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8">লোড হচ্ছে...</TableCell></TableRow>
          ) : customers.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">কোনো কাস্টমার পাওয়া যায়নি</TableCell></TableRow>
          ) : (
            customers.map((customer) => {
              const isBlocked = blockedSet.has(customer.user_id);
              return (
                <TableRow key={customer.id} className={isBlocked ? "bg-destructive/5" : ""}>
                  <TableCell>
                    <div className="font-medium">{customer.full_name || "নাম দেওয়া হয়নি"}</div>
                    {customer.email && <div className="text-xs text-muted-foreground">{customer.email}</div>}
                  </TableCell>
                  <TableCell>
                    {customer.phone ? (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground"><Phone className="w-3 h-3" />{customer.phone}</div>
                    ) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {customer.address && <div className="truncate max-w-[200px]">{customer.address}</div>}
                      {customer.city && <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="w-3 h-3" />{customer.city}</div>}
                      {!customer.address && !customer.city && <span className="text-muted-foreground">-</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isBlocked ? (
                      <Badge variant="destructive" className="gap-1"><ShieldBan className="w-3 h-3" />ব্লকড</Badge>
                    ) : customer.type === "guest" ? (
                      <Badge variant="outline" className="gap-1"><UserX className="w-3 h-3" />গেস্ট</Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1"><UserCheck className="w-3 h-3" />রেজিস্টার্ড</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(customer.created_at).toLocaleDateString("bn-BD")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onEdit(customer)} title="এডিট">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(customer)} title="ডিলিট">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      {customer.type === "registered" && (
                        isBlocked ? (
                          <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => onUnblock(customer.user_id)} disabled={unblockPending}>
                            <ShieldCheck className="w-3 h-3" />আনব্লক
                          </Button>
                        ) : (
                          <Button size="sm" variant="destructive" className="gap-1 h-8 text-xs" onClick={() => onBlock(customer.user_id, customer.full_name || "Unknown")}>
                            <ShieldBan className="w-3 h-3" />ব্লক
                          </Button>
                        )
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
