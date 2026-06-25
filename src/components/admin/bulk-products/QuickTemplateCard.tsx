import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CategorySelectContent from "./CategorySelectContent";
import { COMMON_MATERIALS, type ProductRow } from "@/lib/admin/bulkProducts/types";
import { toast } from "sonner";

interface Props {
  categories: string[];
  setProducts: React.Dispatch<React.SetStateAction<ProductRow[]>>;
}

const QuickTemplateCard = ({ categories, setProducts }: Props) => {
  const [category, setCategory] = useState("");
  const [material, setMaterial] = useState("");
  const [sizes, setSizes] = useState("");
  const [colors, setColors] = useState("");
  const [stock, setStock] = useState("");
  const [price, setPrice] = useState("");

  const apply = () => {
    setProducts(prev => prev.map(p => ({
      ...p,
      ...(category && { category }),
      ...(material && { material }),
      ...(sizes && { sizes }),
      ...(colors && { colors }),
      ...(stock && { stock: Number(stock) }),
      ...(price && { price: Number(price) }),
    })));
    toast.success("টেমপ্লেট প্রয়োগ হয়েছে");
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">কুইক টেমপ্লেট</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">ক্যাটাগরি</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger>
              <CategorySelectContent items={categories} />
            </Select>
          </div>
          <div>
            <Label className="text-xs">ম্যাটেরিয়াল</Label>
            <Select value={material} onValueChange={setMaterial}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="সিলেক্ট" /></SelectTrigger>
              <SelectContent>{COMMON_MATERIALS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">সাইজ</Label><Input className="h-8 text-xs" value={sizes} onChange={e => setSizes(e.target.value)} /></div>
          <div><Label className="text-xs">কালার</Label><Input className="h-8 text-xs" value={colors} onChange={e => setColors(e.target.value)} /></div>
          <div><Label className="text-xs">স্টক</Label><Input className="h-8 text-xs" type="number" value={stock} onChange={e => setStock(e.target.value)} /></div>
          <div><Label className="text-xs">মূল্য</Label><Input className="h-8 text-xs" type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
        </div>
        <Button size="sm" className="mt-3" onClick={apply}>সব প্রোডাক্টে প্রয়োগ</Button>
      </CardContent>
    </Card>
  );
};

export default QuickTemplateCard;
