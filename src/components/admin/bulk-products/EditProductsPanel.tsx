import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBulkEditProducts } from "@/hooks/admin/useBulkEditProducts";
import ProductRowCard from "./ProductRowCard";
import { EDIT_PAGE_SIZE } from "@/lib/admin/bulkProducts/types";

interface Props {
  state: ReturnType<typeof useBulkEditProducts>;
  categories: string[];
}

const EditProductsPanel = ({ state, categories }: Props) => {
  const {
    editLoaded, editSaving, editSearch, setEditSearch,
    editProducts, deleteId, setDeleteId,
    bulkDeleteIds, toggleBulkSelect,
    editPage, setEditPage, editTotalPages,
    filteredEditProducts, paginatedEditProducts, dirtyCount,
    loadExistingProducts, updateEditProduct, toggleEditExpand,
    addEditVariant, updateEditVariant, removeEditVariant, autoGenerateEditVariants,
    saveEditedProducts, handleDeleteProduct, handleBulkDelete,
  } = state;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={loadExistingProducts} variant={editLoaded ? "outline" : "default"}>
          <RefreshCw className="w-4 h-4 mr-2" /> {editLoaded ? "রিফ্রেশ" : "প্রোডাক্ট লোড করুন"}
        </Button>
        {editLoaded && (
          <>
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="সার্চ..."
                value={editSearch}
                onChange={e => { setEditSearch(e.target.value); setEditPage(1); }}
                className="pl-10 h-9"
              />
            </div>
            <Badge variant="outline">{editProducts.length} প্রোডাক্ট</Badge>
            {dirtyCount > 0 && <Badge variant="outline" className="border-primary text-primary">{dirtyCount} পরিবর্তিত</Badge>}
            {bulkDeleteIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="w-3 h-3 mr-1" /> {bulkDeleteIds.size}টি ডিলিট
              </Button>
            )}
          </>
        )}
      </div>

      {editLoaded ? (
        <>
          <div className="overflow-auto max-h-[75vh] border rounded-md p-2">
            <div className="space-y-3">
              {paginatedEditProducts.map((p, i) => (
                <ProductRowCard
                  key={p.id}
                  product={p}
                  index={i + (editPage - 1) * EDIT_PAGE_SIZE}
                  isEdit
                  categories={categories}
                  isBulkSelected={bulkDeleteIds.has(p.id)}
                  onToggleBulk={toggleBulkSelect}
                  onUpdate={updateEditProduct}
                  onExpand={toggleEditExpand}
                  onAddVariant={addEditVariant}
                  onUpdateVariant={updateEditVariant}
                  onRemoveVariant={removeEditVariant}
                  onAutoVariants={autoGenerateEditVariants}
                  onRemove={setDeleteId}
                />
              ))}
            </div>
          </div>

          {editTotalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                {(editPage - 1) * EDIT_PAGE_SIZE + 1}-{Math.min(editPage * EDIT_PAGE_SIZE, filteredEditProducts.length)} / {filteredEditProducts.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={editPage <= 1} onClick={() => setEditPage(p => p - 1)}>পূর্ববর্তী</Button>
                {Array.from({ length: Math.min(editTotalPages, 7) }, (_, i) => {
                  let page: number;
                  if (editTotalPages <= 7) page = i + 1;
                  else if (editPage <= 4) page = i + 1;
                  else if (editPage >= editTotalPages - 3) page = editTotalPages - 6 + i;
                  else page = editPage - 3 + i;
                  return (
                    <Button key={page} variant={editPage === page ? "default" : "outline"} size="sm" className="w-9 h-8 text-xs" onClick={() => setEditPage(page)}>
                      {page}
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" disabled={editPage >= editTotalPages} onClick={() => setEditPage(p => p + 1)}>পরবর্তী</Button>
              </div>
            </div>
          )}

          {dirtyCount > 0 && (
            <Card className="sticky bottom-4 z-10 border-2 border-primary/20 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm"><span className="font-semibold">{dirtyCount}</span>টি প্রোডাক্ট পরিবর্তিত</span>
                  <Button onClick={saveEditedProducts} disabled={editSaving}>
                    {editSaving
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> সেভ হচ্ছে...</>
                      : <><Save className="w-4 h-4 mr-2" /> সব পরিবর্তন সেভ</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-muted-foreground">
            <Pencil className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>"প্রোডাক্ট লোড করুন" বাটনে ক্লিক করে বিদ্যমান প্রোডাক্ট এডিট, আপডেট ও ডিলিট করুন</p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>প্রোডাক্ট ডিলিট করবেন?</AlertDialogTitle>
            <AlertDialogDescription>এই প্রোডাক্ট ও এর সব ভেরিয়েন্ট স্থায়ীভাবে মুছে যাবে।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProduct} className="bg-destructive text-destructive-foreground">ডিলিট</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EditProductsPanel;
