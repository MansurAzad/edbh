import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Search, Sparkles, Wand2, RotateCcw } from "lucide-react";

interface ProductRow {
  id: string;
  name: string;
  category: string;
  material: string | null;
  price: number;
  sale_price: number | null;
  stock: number | null;
  featured: boolean;
  description: string | null;
  colors: string[] | null;
  sizes: string[] | null;
}

type EditPatch = Partial<Pick<ProductRow, "name" | "price" | "sale_price" | "stock" | "featured" | "description">>;

const DEFAULT_TEMPLATE = "Dubai Imported {name} – {color} – {category}";

/**
 * Fills a template string with product field values.
 * Placeholders: {name} {category} {material} {color} {size}
 * Missing values are removed cleanly (no stray "–" or double spaces).
 */
const applyTemplate = (tpl: string, p: ProductRow, currentName: string): string => {
  const firstColor = p.colors?.[0]?.trim() || "";
  const firstSize = p.sizes?.[0]?.trim() || "";
  const filled = tpl
    .replace(/\{name\}/gi, currentName || "")
    .replace(/\{category\}/gi, p.category || "")
    .replace(/\{material\}/gi, p.material || "")
    .replace(/\{color\}/gi, firstColor)
    .replace(/\{size\}/gi, firstSize);

  // Collapse empty separator patterns: " –  – ", "–  ", leading/trailing dashes
  return filled
    .replace(/–\s*–/g, "–")
    .replace(/\s+–\s*$/g, "")
    .replace(/^\s*–\s+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const BulkProductEdit = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, EditPatch>>({});
  const [saving, setSaving] = useState(false);

  // Bulk tools
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [descAppend, setDescAppend] = useState("COD Available. Size 52–58 available. দুবাই থেকে আমদানি।");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-bulk-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, category, material, price, sale_price, stock, featured, description, colors, sizes")
        .order("created_at", { ascending: false });
      return (data || []) as ProductRow[];
    },
  });

  const filtered = useMemo(() => products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(search.toLowerCase())
  ), [products, search]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  };

  const setEdit = (id: string, field: keyof EditPatch, value: any) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const getValue = <K extends keyof ProductRow>(product: ProductRow, field: K): ProductRow[K] => {
    const edited = edits[product.id]?.[field as keyof EditPatch];
    return (edited !== undefined ? edited : product[field]) as ProductRow[K];
  };

  const handleBulkSave = async () => {
    const ids = Object.keys(edits);
    if (ids.length === 0) { toast.error("কোনো পরিবর্তন নেই"); return; }

    setSaving(true);
    let success = 0;
    for (const id of ids) {
      const e = edits[id];
      const updates: any = {};
      if (e.name !== undefined) updates.name = String(e.name).trim();
      if (e.price !== undefined) updates.price = Number(e.price);
      if (e.sale_price !== undefined) updates.sale_price = e.sale_price ? Number(e.sale_price) : null;
      if (e.stock !== undefined) updates.stock = Number(e.stock);
      if (e.featured !== undefined) updates.featured = e.featured;
      if (e.description !== undefined) updates.description = e.description;
      if (Object.keys(updates).length === 0) continue;

      const { error } = await supabase.from("products").update(updates).eq("id", id);
      if (!error) success++;
    }

    toast.success(`${success}টি প্রোডাক্ট আপডেট হয়েছে`);
    setEdits({});
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["admin-bulk-products"] });
    queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
    setSaving(false);
  };

  const applyBulkPrice = () => {
    if (!bulkPrice) return;
    selected.forEach(id => setEdit(id, "price", Number(bulkPrice)));
    toast.info(`${selected.size}টি প্রোডাক্টে প্রাইস সেট করা হয়েছে`);
  };

  const applyBulkStock = () => {
    if (!bulkStock) return;
    selected.forEach(id => setEdit(id, "stock", Number(bulkStock)));
    toast.info(`${selected.size}টি প্রোডাক্টে স্টক সেট করা হয়েছে`);
  };

  /**
   * Apply the name template to every selected product.
   * Uses the CURRENT (possibly edited) name as {name} so re-applying
   * the same template twice does not create "Dubai Imported Dubai Imported ...".
   * We strip existing "Dubai Imported " prefix and " – Dubai Collection" suffix
   * before feeding into {name}, so repeated apply is idempotent.
   */
  const applyNameTemplate = () => {
    if (selected.size === 0) { toast.error("প্রোডাক্ট সিলেক্ট করুন"); return; }
    if (!template.includes("{name}")) { toast.error("টেমপ্লেটে {name} থাকতে হবে"); return; }

    let count = 0;
    products.forEach(p => {
      if (!selected.has(p.id)) return;
      const raw = String(getValue(p, "name") || "");
      // Strip our known SEO wrappers so re-runs are idempotent
      const base = raw
        .replace(/^Dubai Imported\s+/i, "")
        .replace(/\s*–\s*Dubai Collection\s*$/i, "")
        .trim();
      const next = applyTemplate(template, p, base);
      if (next && next !== raw) {
        setEdit(p.id, "name", next);
        count++;
      }
    });
    toast.success(`${count}টি নাম প্রিভিউ তৈরি — "সেভ" চাপুন লাইভ করতে`);
  };

  const appendDescription = () => {
    if (selected.size === 0) { toast.error("প্রোডাক্ট সিলেক্ট করুন"); return; }
    if (!descAppend.trim()) return;

    let count = 0;
    products.forEach(p => {
      if (!selected.has(p.id)) return;
      const current = String(getValue(p, "description") || "");
      if (current.includes(descAppend)) return; // avoid dup
      const next = (current ? current.trimEnd() + "\n\n" : "") + descAppend;
      setEdit(p.id, "description", next);
      count++;
    });
    toast.success(`${count}টি প্রোডাক্টের ডেসক্রিপশনে যোগ হয়েছে`);
  };

  const resetEdits = () => {
    setEdits({});
    toast.info("সব pending পরিবর্তন বাতিল করা হলো");
  };

  const editCount = Object.keys(edits).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold">Bulk Edit</h1>
            <p className="text-muted-foreground">একসাথে একাধিক প্রোডাক্ট এডিট + SEO name template</p>
          </div>
          <div className="flex items-center gap-2">
            {editCount > 0 && (
              <Button variant="outline" onClick={resetEdits}>
                <RotateCcw className="w-4 h-4 mr-2" /> Reset ({editCount})
              </Button>
            )}
            <Button onClick={handleBulkSave} disabled={saving || editCount === 0}>
              <Save className="w-4 h-4 mr-2" /> {saving ? "সেভ হচ্ছে..." : `সেভ করুন (${editCount})`}
            </Button>
          </div>
        </div>

        {/* Name Template Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> SEO Name Template
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Placeholders: <code className="bg-muted px-1 rounded">{"{name}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{category}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{material}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{color}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{size}"}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                "Dubai Imported {name} – {color} – {category}",
                "{name} – {material} – Size {size} – Dubai Collection",
                "Premium {category} – {name} – COD Available",
                "Dubai Imported {name} – {color} – Size 52–58",
              ].map(preset => (
                <Button key={preset} size="sm" variant="secondary" className="text-xs h-7"
                  onClick={() => setTemplate(preset)}>
                  {preset.length > 42 ? preset.slice(0, 40) + "…" : preset}
                </Button>
              ))}
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <Input value={template} onChange={e => setTemplate(e.target.value)}
                placeholder="e.g. Dubai Imported {name} – {color} – {category}" className="flex-1" />
              <Button onClick={applyNameTemplate} disabled={selected.size === 0}>
                <Wand2 className="w-4 h-4 mr-2" /> Apply to {selected.size} selected
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              টিপ: একই টেমপ্লেট বারবার apply করলে duplicate prefix হবে না — "Dubai Imported" এবং "– Dubai Collection" auto-strip হয়।
            </p>
          </CardContent>
        </Card>

        {/* Description Append Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Description Append (COD / Size / Badge)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={descAppend} onChange={e => setDescAppend(e.target.value)} rows={2}
              placeholder="e.g. COD Available. Size 52–58 available." />
            <Button onClick={appendDescription} disabled={selected.size === 0} variant="secondary">
              Append to {selected.size} selected
            </Button>
          </CardContent>
        </Card>

        {/* Search + quick bulk price/stock */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search name/category..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="text-muted-foreground">{selected.size} সিলেক্টেড —</span>
              <Input type="number" placeholder="Bulk Price" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} className="w-28 h-8" />
              <Button size="sm" variant="outline" onClick={applyBulkPrice}>Apply</Button>
              <Input type="number" placeholder="Bulk Stock" value={bulkStock} onChange={e => setBulkStock(e.target.value)} className="w-28 h-8" />
              <Button size="sm" variant="outline" onClick={applyBulkStock}>Apply</Button>
            </div>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={selectAll} />
                  </TableHead>
                  <TableHead className="min-w-[280px]">Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-28">Price (৳)</TableHead>
                  <TableHead className="w-28">Sale Price</TableHead>
                  <TableHead className="w-24">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filtered.map(product => {
                  const isEdited = !!edits[product.id];
                  return (
                    <TableRow key={product.id} className={isEdited ? "bg-primary/5" : ""}>
                      <TableCell>
                        <Checkbox checked={selected.has(product.id)} onCheckedChange={() => toggleSelect(product.id)} />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-sm"
                          value={String(getValue(product, "name") ?? "")}
                          onChange={e => setEdit(product.id, "name", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product.category}</TableCell>
                      <TableCell>
                        <Input type="number" className="h-8 text-sm" value={String(getValue(product, "price"))} onChange={e => setEdit(product.id, "price", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="h-8 text-sm" value={String(getValue(product, "sale_price") ?? "")} onChange={e => setEdit(product.id, "sale_price", e.target.value || null)} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="h-8 text-sm" value={String(getValue(product, "stock") ?? 0)} onChange={e => setEdit(product.id, "stock", e.target.value)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default BulkProductEdit;
