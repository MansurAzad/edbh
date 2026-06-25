import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Layers, Copy, Trash2, Plus, X } from "lucide-react";
import InlineImageUpload from "./InlineImageUpload";
import CategorySelectContent from "./CategorySelectContent";
import { COMMON_MATERIALS, type ProductRow } from "@/lib/admin/bulkProducts/types";

/**
 * Props for the ProductRowCard component.
 * প্রোডাক্ট রো কার্ড উপাদানের প্রপস।
 */
interface Props {
  /** Product data | প্রোডাক্টের ডাটা */
  product: ProductRow;
  /** Index in the list | লিস্টে ইনডেক্স */
  index: number;
  /** Whether the app is in edit mode | অ্যাপটি এডিট মোডে আছে কিনা */
  isEdit: boolean;
  /** Available categories | উপলব্ধ ক্যাটাগরিগুলো */
  categories: string[];
  /** Whether this product is a duplicate | প্রোডাক্টটি ডুপ্লিকেট কিনা */
  isDuplicate?: boolean;
  /** Whether this product is selected for bulk action | বাল্ক অ্যাকশনের জন্য সিলেক্ট করা হয়েছে কিনা */
  isBulkSelected?: boolean;
  /** Toggle bulk selection callback | বাল্ক সিলেকশন পরিবর্তনের কলব্যাক */
  onToggleBulk?: (id: string) => void;
  /** Update product field callback | প্রোডাক্টের ফিল্ড আপডেটের কলব্যাক */
  onUpdate: (id: string, field: string, value: any) => void;
  /** Toggle expansion of details | ডিটেইলস সেকশন প্রসারণের কলব্যাক */
  onExpand: (id: string) => void;
  /** Add a new variant | নতুন ভেরিয়েন্ট যুক্ত করার কলব্যাক */
  onAddVariant: (id: string) => void;
  /** Update a specific variant | নির্দিষ্ট ভেরিয়েন্ট আপডেটের কলব্যাক */
  onUpdateVariant: (pid: string, vid: string, f: string, v: any) => void;
  /** Remove a specific variant | নির্দিষ্ট ভেরিয়েন্ট মুছে ফেলার কলব্যাক */
  onRemoveVariant: (pid: string, vid: string) => void;
  /** Auto-generate variants based on sizes/colors | সাইজ/কালারের ভিত্তিতে অটো ভেরিয়েন্ট জেনারেট */
  onAutoVariants: (id: string) => void;
  /** Duplicate the entire product row | পুরো প্রোডাক্ট রো কপি করা */
  onDuplicate?: (p: ProductRow) => void;
  /** Remove the product row | প্রোডাক্ট রো মুছে ফেলা */
  onRemove: (id: string) => void;
}

/**
 * ProductRowCard Component
 * Represents a single product row in the bulk editor, with mobile and desktop responsive views.
 * বাল্ক এডিটরে একটি সিঙ্গেল প্রোডাক্ট রো রিপ্রেজেন্ট করে, মোবাইল এবং ডেস্কটপ রেসপন্সিভ ভিউ সহ।
 * 
 * @param {Props} props - Component properties.
 */
const ProductRowCard = ({
  product, index, isEdit, categories, isDuplicate, isBulkSelected,
  onToggleBulk, onUpdate, onExpand, onAddVariant, onUpdateVariant,
  onRemoveVariant, onAutoVariants, onDuplicate, onRemove,
}: Props) => {
  // Determine card styles based on state | স্টেটের উপর ভিত্তি করে কার্ড স্টাইল নির্ধারণ
  const cls = `border ${!isEdit && isDuplicate ? "border-destructive/50 bg-destructive/5" : ""} ${isEdit && product._dirty ? "border-primary/30 bg-primary/5" : ""}`;

  return (
    <Card className={cls}>
      <CardContent className="p-2 sm:p-3">
        
        {/* Mobile View | মোবাইল ভিউ */}
        <div className="block sm:hidden space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono w-5">#{index + 1}</span>
            <InlineImageUpload value={product.image_url} onChange={url => onUpdate(product.id, "image_url", url)} />
            <div className="flex-1 min-w-0">
              <Input className="h-8 text-xs" placeholder="প্রোডাক্টের নাম *" value={product.name}
                onChange={e => onUpdate(product.id, "name", e.target.value)} />
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onExpand(product.id)}>
                {product.expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemove(product.id)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Select value={product.category} onValueChange={v => onUpdate(product.id, "category", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="ক্যাটাগরি" /></SelectTrigger>
              <CategorySelectContent items={categories} />
            </Select>
            <Input className="h-8 text-xs" type="number" placeholder="মূল্য" value={product.price || ""}
              onChange={e => onUpdate(product.id, "price", Number(e.target.value))} />
            <Input className="h-8 text-xs" type="number" placeholder="স্টক" value={product.stock}
              onChange={e => onUpdate(product.id, "stock", Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {isEdit && onToggleBulk && (
              <input type="checkbox" className="w-3.5 h-3.5 rounded" checked={!!isBulkSelected}
                onChange={() => onToggleBulk(product.id)} />
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAutoVariants(product.id)} title="অটো ভেরিয়েন্ট">
              <Layers className="w-3.5 h-3.5" />
            </Button>
            {!isEdit && onDuplicate && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicate(product)} title="কপি">
                <Copy className="w-3.5 h-3.5" />
              </Button>
            )}
            {product.variants.length > 0 && <Badge variant="secondary" className="text-[10px]">{product.variants.length}V</Badge>}
            {!isEdit && isDuplicate && <Badge variant="destructive" className="text-[10px]">ডুপ্লিকেট</Badge>}
            {isEdit && product._dirty && <Badge variant="outline" className="text-[10px] border-primary text-primary">পরিবর্তিত</Badge>}
          </div>
        </div>

        {/* Desktop View | ডেস্কটপ ভিউ */}
        <div className="hidden sm:grid grid-cols-12 gap-2 items-end">
          <div className="col-span-1 flex flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground font-mono">#{index + 1}</span>
            <InlineImageUpload value={product.image_url} onChange={url => onUpdate(product.id, "image_url", url)} />
          </div>
          <div className="col-span-3">
            <Label className="text-xs">নাম *</Label>
            <Input className="h-8 text-xs" placeholder="প্রোডাক্টের নাম" value={product.name}
              onChange={e => onUpdate(product.id, "name", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">ক্যাটাগরি *</Label>
            <Select value={product.category} onValueChange={v => onUpdate(product.id, "category", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger>
              <CategorySelectContent items={categories} />
            </Select>
          </div>
          <div className="col-span-1">
            <Label className="text-xs">মূল্য *</Label>
            <Input className="h-8 text-xs" type="number" value={product.price || ""}
              onChange={e => onUpdate(product.id, "price", Number(e.target.value))} />
          </div>
          <div className="col-span-1">
            <Label className="text-xs">সেল</Label>
            <Input className="h-8 text-xs" type="number" value={product.sale_price || ""}
              onChange={e => onUpdate(product.id, "sale_price", e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div className="col-span-1">
            <Label className="text-xs">স্টক</Label>
            <Input className="h-8 text-xs" type="number" value={product.stock}
              onChange={e => onUpdate(product.id, "stock", Number(e.target.value))} />
          </div>
          <div className="col-span-3 flex items-center gap-1 pt-4 flex-wrap">
            {isEdit && onToggleBulk && (
              <input type="checkbox" className="w-3.5 h-3.5 rounded" checked={!!isBulkSelected}
                onChange={() => onToggleBulk(product.id)} />
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onExpand(product.id)} title="বিস্তারিত">
              {product.expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAutoVariants(product.id)} title="অটো ভেরিয়েন্ট">
              <Layers className="w-3.5 h-3.5" />
            </Button>
            {!isEdit && onDuplicate && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicate(product)} title="কপি">
                <Copy className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemove(product.id)} title="মুছুন">
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
            {product.variants.length > 0 && <Badge variant="secondary" className="text-[10px]">{product.variants.length}V</Badge>}
            {!isEdit && isDuplicate && <Badge variant="destructive" className="text-[10px]">ডুপ্লিকেট</Badge>}
            {isEdit && product._dirty && <Badge variant="outline" className="text-[10px] border-primary text-primary">পরিবর্তিত</Badge>}
          </div>
        </div>

        {/* Expanded Details Section | বিস্তারিত সেকশন (প্রসারিত হলে দেখা যাবে) */}
        {product.expanded && (
          <div className="mt-3 pt-3 border-t border-border space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">ম্যাটেরিয়াল</Label>
                <Select value={product.material} onValueChange={v => onUpdate(product.id, "material", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger>
                  <SelectContent>{COMMON_MATERIALS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">সাইজ</Label>
                <Input className="h-8 text-xs" placeholder='52", 54"' value={product.sizes}
                  onChange={e => onUpdate(product.id, "sizes", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">কালার</Label>
                <Input className="h-8 text-xs" placeholder="Black, White" value={product.colors}
                  onChange={e => onUpdate(product.id, "colors", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">ইমেজ URL</Label>
                <Input className="h-8 text-xs" placeholder="https://..." value={product.image_url}
                  onChange={e => onUpdate(product.id, "image_url", e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">বিবরণ</Label>
              <Textarea className="text-xs min-h-[50px]" value={product.description}
                onChange={e => onUpdate(product.id, "description", e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={product.featured} onCheckedChange={v => onUpdate(product.id, "featured", v)} />
              <Label className="text-xs">ফিচার্ড</Label>
            </div>

            {/* Variants Management Section | ভেরিয়েন্ট ম্যানেজমেন্ট সেকশন */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold">ভেরিয়েন্ট ({product.variants.length})</Label>
                <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => onAddVariant(product.id)}>
                  <Plus className="w-3 h-3 mr-1" /> ভেরিয়েন্ট
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => onAutoVariants(product.id)}>
                  <Layers className="w-3 h-3 mr-1" /> অটো
                </Button>
              </div>
              {product.variants.length > 0 && (
                <div className="bg-muted/50 rounded-md p-2 space-y-1 overflow-x-auto">
                  {/* Variant Table Header | ভেরিয়েন্ট টেবিল হেডার */}
                  <div className="hidden sm:grid grid-cols-[1fr_1fr_0.7fr_1fr_0.7fr_auto_auto] gap-1.5 text-[10px] text-muted-foreground font-medium px-1 min-w-[560px]">
                    <span>সাইজ</span><span>কালার</span><span>স্টক</span><span>SKU</span><span>± মূল্য</span><span>ইমেজ</span><span></span>
                  </div>
                  {/* Variant List | ভেরিয়েন্ট তালিকা */}
                  {product.variants.map(v => (
                    <div key={v.id} className="grid grid-cols-[1fr_1fr_auto_auto] sm:grid-cols-[1fr_1fr_0.7fr_1fr_0.7fr_auto_auto] gap-1.5 items-center min-w-0">
                      <Input className="h-7 text-[11px]" placeholder="সাইজ" value={v.size}
                        onChange={e => onUpdateVariant(product.id, v.id, "size", e.target.value)} />
                      <Input className="h-7 text-[11px]" placeholder="কালার" value={v.color}
                        onChange={e => onUpdateVariant(product.id, v.id, "color", e.target.value)} />
                      <Input className="h-7 text-[11px] hidden sm:block" type="number" placeholder="স্টক" value={v.stock}
                        onChange={e => onUpdateVariant(product.id, v.id, "stock", Number(e.target.value))} />
                      <Input className="h-7 text-[11px] hidden sm:block" placeholder="SKU" value={v.sku}
                        onChange={e => onUpdateVariant(product.id, v.id, "sku", e.target.value)} />
                      <Input className="h-7 text-[11px] hidden sm:block" type="number" placeholder="±" value={v.price_adjustment}
                        onChange={e => onUpdateVariant(product.id, v.id, "price_adjustment", Number(e.target.value))} />
                      <InlineImageUpload value={v.image_url || ""} onChange={url => onUpdateVariant(product.id, v.id, "image_url", url)} />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemoveVariant(product.id, v.id)}>
                        <X className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProductRowCard;
