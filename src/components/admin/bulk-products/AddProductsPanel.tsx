import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, PackagePlus, Plus, X } from "lucide-react";
import { useBulkAddProducts } from "@/hooks/admin/useBulkAddProducts";
import QuickTemplateCard from "./QuickTemplateCard";
import ProductRowCard from "./ProductRowCard";
import PreviewDialog from "./PreviewDialog";

interface Props {
  state: ReturnType<typeof useBulkAddProducts>;
  categories: string[];
}

const AddProductsPanel = ({ state, categories }: Props) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const {
    products, setProducts, submitting, progress,
    duplicateCheck, setDuplicateCheck,
    validProducts, duplicates, totalVariants,
    updateProduct, removeProduct, addProducts, duplicateProduct,
    toggleExpand, addVariant, updateVariant, removeVariant, autoGenerateVariants,
    submit,
  } = state;

  return (
    <div className="space-y-4">
      <QuickTemplateCard categories={categories} setProducts={setProducts} />

      <div className="flex items-center gap-2 flex-wrap">
        {[1, 10, 25, 50, 100].map(n => (
          <Button key={n} variant="outline" size="sm" onClick={() => addProducts(n)}>
            <Plus className="w-3 h-3 mr-1" /> {n}
          </Button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Switch checked={duplicateCheck} onCheckedChange={setDuplicateCheck} id="dup" />
          <Label htmlFor="dup" className="text-xs">ডুপ্লিকেট চেক</Label>
        </div>
        <Button variant="outline" size="sm" onClick={() => setProducts(products.filter(p => p.name.trim()))}>
          <X className="w-3 h-3 mr-1" /> খালি সরান
        </Button>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{validProducts.length} বৈধ</Badge>
        <Badge variant="outline">{totalVariants} ভেরিয়েন্ট</Badge>
        {duplicates.size > 0 && <Badge variant="destructive">{duplicates.size} ডুপ্লিকেট</Badge>}
      </div>

      <div className="overflow-auto max-h-[75vh] border rounded-md p-2">
        <div className="space-y-3">
          {products.map((p, i) => (
            <ProductRowCard
              key={p.id}
              product={p}
              index={i}
              isEdit={false}
              categories={categories}
              isDuplicate={duplicates.has(p.id)}
              onUpdate={updateProduct}
              onExpand={toggleExpand}
              onAddVariant={addVariant}
              onUpdateVariant={updateVariant}
              onRemoveVariant={removeVariant}
              onAutoVariants={autoGenerateVariants}
              onDuplicate={duplicateProduct}
              onRemove={removeProduct}
            />
          ))}
        </div>
      </div>

      <Card className="sticky bottom-4 z-10 border-2 border-primary/20 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm">
              <span className="font-semibold">{validProducts.length}</span> বৈধ
              {duplicates.size > 0 && <span className="text-destructive ml-2">({duplicates.size}টি বাদ)</span>}
              {totalVariants > 0 && <span className="ml-2">| {totalVariants} ভেরিয়েন্ট</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!validProducts.length}>প্রিভিউ</Button>
              <Button onClick={submit} disabled={submitting || !validProducts.length} className="min-w-[160px]">
                {submitting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {progress}%</>
                  : <><PackagePlus className="w-4 h-4 mr-2" /> {validProducts.length - duplicates.size}টি যুক্ত করুন</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} validProducts={validProducts} duplicates={duplicates} />
    </div>
  );
};

export default AddProductsPanel;
