import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CategorySelectContent from "./CategorySelectContent";
import { COMMON_MATERIALS, type ProductRow } from "@/lib/admin/bulkProducts/types";
import { toast } from "sonner";

/**
 * Props for the QuickTemplateCard component.
 * কুইক টেমপ্লেট কার্ড উপাদানের প্রপস।
 */
interface Props {
  /** List of available categories | উপলব্ধ ক্যাটাগরিগুলোর তালিকা */
  categories: string[];
  /** State setter for the products list | প্রোডাক্ট লিস্টের স্টেট সেটার */
  setProducts: React.Dispatch<React.SetStateAction<ProductRow[]>>;
}

/**
 * QuickTemplateCard Component
 * Provides a way to apply common values (category, material, etc.) to all products at once.
 * সব প্রোডাক্টে একসাথে কমন ভ্যালু (ক্যাটাগরি, ম্যাটেরিয়াল ইত্যাদি) প্রয়োগ করার সুবিধা দেয়।
 * 
 * @param {Props} props - Component properties.
 */
const QuickTemplateCard = ({ categories, setProducts }: Props) => {
  // Local states for template fields | টেমপ্লেট ফিল্ডের লোকাল স্টেট
  const [category, setCategory] = useState("");
  const [material, setMaterial] = useState("");
  const [sizes, setSizes] = useState("");
  const [colors, setColors] = useState("");
  const [stock, setStock] = useState("");
  const [price, setPrice] = useState("");

  /**
   * Applies the template values to all products.
   * সকল প্রোডাক্টে টেমপ্লেট ভ্যালুগুলো প্রয়োগ করে।
   */
  const apply = () => {
    setProducts(prev => prev.map(p => ({
      ...p,
      // Only update fields that have a value in the template | শুধুমাত্র সেই ফিল্ডগুলো আপডেট হয় যেগুলোতে টেমপ্লেটে মান আছে
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
      <CardHeader className="pb-3">
        <CardTitle className="text-base">কুইক টেমপ্লেট</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Responsive grid for template inputs | টেমপ্লেট ইনপুটের জন্য রেসপন্সিভ গ্রিড */}
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
              <SelectContent>
                {COMMON_MATERIALS.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">সাইজ</Label>
            <Input className="h-8 text-xs" value={sizes} onChange={e => setSizes(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">কালার</Label>
            <Input className="h-8 text-xs" value={colors} onChange={e => setColors(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">স্টক</Label>
            <Input className="h-8 text-xs" type="number" value={stock} onChange={e => setStock(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">মূল্য</Label>
            <Input className="h-8 text-xs" type="number" value={price} onChange={e => setPrice(e.target.value)} />
          </div>
        </div>
        
        {/* Apply button | প্রয়োগ বাটন */}
        <Button size="sm" className="mt-3" onClick={apply}>
          সব প্রোডাক্টে প্রয়োগ
        </Button>
      </CardContent>
    </Card>
  );
};

export default QuickTemplateCard;
