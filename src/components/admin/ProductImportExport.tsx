import { useState, useRef } from "react";
import { Download, Upload, Loader2, FileSpreadsheet, AlertCircle, CheckCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProductImportExportProps {
  onImportComplete: () => void;
}

interface ImportResult {
  success: number;
  failed: number;
  variantsAdded: number;
  errors: string[];
}

const BATCH_SIZE = 50;

const ProductImportExport = ({ onImportComplete }: ProductImportExportProps) => {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const variantFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // ============ EXPORT ============
  const exportToCSV = async () => {
    setExporting(true);
    try {
      const [{ data: products, error }, { data: variants }] = await Promise.all([
        supabase.from("products").select("*").order("created_at", { ascending: false }),
        supabase.from("product_variants").select("*").order("product_id"),
      ]);
      if (error) throw error;
      if (!products?.length) {
        toast({ title: "কোনো প্রোডাক্ট নেই", variant: "destructive" });
        return;
      }

      // Product CSV — includes standardized catalogue fields.
      const pHeaders = [
        "name", "category", "price", "sale_price", "stock", "featured",
        "description", "image_url", "sizes", "colors", "material",
        "sku", "subcategory", "fabric", "work_type", "part",
        "hijab_included", "inner_included", "purchase_cost",
        "image_alt_text", "meta_title", "meta_description",
      ];
      const pRows = products.map((p: any) => [
        esc(p.name), esc(p.category), p.price, p.sale_price || "", p.stock || 0,
        p.featured ? "true" : "false", esc(p.description || ""), esc(p.image_url || ""),
        esc((p.sizes || []).join("; ")), esc((p.colors || []).join("; ")), esc(p.material || ""),
        esc(p.sku || ""), esc(p.subcategory || ""), esc(p.fabric || ""),
        esc(p.work_type || ""), esc(p.part || ""),
        p.hijab_included ? "true" : "false", p.inner_included ? "true" : "false",
        p.purchase_cost ?? "",
        esc(p.image_alt_text || ""), esc(p.meta_title || ""), esc(p.meta_description || ""),
      ]);
      downloadCSV([pHeaders.join(","), ...pRows.map((r) => r.join(","))].join("\n"),
        `products_export_${new Date().toISOString().split("T")[0]}.csv`);

      // Variants CSV
      if (variants?.length) {
        const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));
        const vHeaders = ["product_name", "size", "color", "stock", "sku", "price_adjustment", "image_url"];
        const vRows = variants.map((v) => [
          esc(productMap[v.product_id] || v.product_id), esc(v.size || ""), esc(v.color || ""),
          v.stock, esc(v.sku || ""), v.price_adjustment || 0, esc(v.image_url || ""),
        ]);
        downloadCSV([vHeaders.join(","), ...vRows.map((r) => r.join(","))].join("\n"),
          `variants_export_${new Date().toISOString().split("T")[0]}.csv`);
      }

      toast({ title: "সফল", description: `${products.length}টি প্রোডাক্ট ও ${variants?.length || 0}টি ভেরিয়েন্ট এক্সপোর্ট হয়েছে` });
    } catch (error: any) {
      toast({ title: "এক্সপোর্ট ব্যর্থ", description: error.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // ============ IMPORT PRODUCTS (with inline variants) ============
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast({ title: "ভুল ফাইল", description: "CSV ফাইল আপলোড করুন", variant: "destructive" });
      return;
    }

    setImportDialogOpen(true);
    setImporting(true);
    setImportProgress(0);
    setImportResult(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) throw new Error("CSV-এ হেডার ও কমপক্ষে ১টি ডেটা রো থাকতে হবে");

      const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
      for (const req of ["name", "category", "price"]) {
        if (!headers.includes(req)) throw new Error(`প্রয়োজনীয় কলাম নেই: ${req}`);
      }

      // Check if CSV has variant columns
      const hasVariantCols = headers.includes("variant_size") || headers.includes("variant_color");

      const dataRows = lines.slice(1);
      const results: ImportResult = { success: 0, failed: 0, variantsAdded: 0, errors: [] };

      // Group rows: if variant columns exist, group by product name
      if (hasVariantCols) {
        await importWithInlineVariants(headers, dataRows, results);
      } else {
        await importProductsOnly(headers, dataRows, results);
      }

      setImportResult(results);
      if (results.success > 0) {
        onImportComplete();
        toast({ title: "ইম্পোর্ট সম্পন্ন", description: `${results.success}টি প্রোডাক্ট, ${results.variantsAdded}টি ভেরিয়েন্ট` });
      }
    } catch (error: any) {
      setImportResult({ success: 0, failed: 0, variantsAdded: 0, errors: [error.message] });
      toast({ title: "ইম্পোর্ট ব্যর্থ", description: error.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const importProductsOnly = async (headers: string[], dataRows: string[], results: ImportResult) => {
    // Batch insert for speed
    const allProducts: Record<string, any>[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      try {
        const values = parseCSVLine(dataRows[i]);
        const product = parseProductRow(headers, values);
        if (!product.name || !product.category || !product.price) throw new Error("প্রয়োজনীয় ফিল্ড নেই");
        allProducts.push(product);
      } catch (err: any) {
        results.failed++;
        results.errors.push(`রো ${i + 2}: ${err.message}`);
      }
    }

    // Insert in batches
    for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
      const batch = allProducts.slice(i, i + BATCH_SIZE);
      setImportProgress(Math.round(((i + batch.length) / allProducts.length) * 100));
      const { data, error } = await supabase.from("products").insert(batch as any).select("id, name");
      if (error) {
        results.failed += batch.length;
        results.errors.push(`ব্যাচ ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        results.success += (data || []).length;
      }
    }
  };

  const importWithInlineVariants = async (headers: string[], dataRows: string[], results: ImportResult) => {
    // Group rows by product name - each row can have variant_size, variant_color, variant_stock, variant_sku, variant_price_adjustment, variant_image_url
    const productMap = new Map<string, { product: Record<string, any>; variants: Record<string, any>[] }>();

    for (let i = 0; i < dataRows.length; i++) {
      try {
        const values = parseCSVLine(dataRows[i]);
        const product = parseProductRow(headers, values);
        const variant = parseVariantFromRow(headers, values);

        if (!product.name || !product.category || !product.price) throw new Error("প্রয়োজনীয় ফিল্ড নেই");

        const key = product.name;
        if (!productMap.has(key)) {
          productMap.set(key, { product, variants: [] });
        }
        if (variant && (variant.size || variant.color)) {
          productMap.get(key)!.variants.push(variant);
        }
      } catch (err: any) {
        results.failed++;
        results.errors.push(`রো ${i + 2}: ${err.message}`);
      }
    }

    // Insert products in batches
    const entries = Array.from(productMap.values());
    const productsToInsert = entries.map((e) => e.product);
    const insertedProducts: { id: string; name: string }[] = [];

    for (let i = 0; i < productsToInsert.length; i += BATCH_SIZE) {
      const batch = productsToInsert.slice(i, i + BATCH_SIZE);
      setImportProgress(Math.round(((i + batch.length) / productsToInsert.length) * 70));
      const { data, error } = await supabase.from("products").insert(batch as any).select("id, name");
      if (error) {
        results.failed += batch.length;
        results.errors.push(`প্রোডাক্ট ব্যাচ: ${error.message}`);
      } else {
        results.success += (data || []).length;
        insertedProducts.push(...(data || []));
      }
    }

    // Now insert variants
    const nameToId = Object.fromEntries(insertedProducts.map((p) => [p.name, p.id]));
    const variantsToInsert: Record<string, any>[] = [];

    for (const entry of entries) {
      const productId = nameToId[entry.product.name];
      if (!productId) continue;
      for (const v of entry.variants) {
        variantsToInsert.push({ product_id: productId, ...v });
      }
    }

    if (variantsToInsert.length > 0) {
      for (let i = 0; i < variantsToInsert.length; i += 100) {
        const batch = variantsToInsert.slice(i, i + 100);
        setImportProgress(70 + Math.round(((i + batch.length) / variantsToInsert.length) * 30));
        const { data, error } = await supabase.from("product_variants").insert(batch as any).select();
        if (error) {
          results.errors.push(`ভেরিয়েন্ট ব্যাচ: ${error.message}`);
        } else {
          results.variantsAdded += (data || []).length;
        }
      }
    }
  };

  // ============ IMPORT VARIANTS ONLY ============
  const handleVariantFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast({ title: "ভুল ফাইল", description: "CSV ফাইল আপলোড করুন", variant: "destructive" });
      return;
    }

    setImportDialogOpen(true);
    setImporting(true);
    setImportProgress(0);
    setImportResult(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) throw new Error("CSV-এ হেডার ও কমপক্ষে ১টি ডেটা রো থাকতে হবে");

      const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
      if (!headers.includes("product_name")) throw new Error("product_name কলাম আবশ্যক");

      // Get all products for name → id mapping
      const { data: allProducts } = await supabase.from("products").select("id, name");
      const nameToId: Record<string, string> = {};
      (allProducts || []).forEach((p) => { nameToId[p.name.toLowerCase()] = p.id; });

      const dataRows = lines.slice(1);
      const results: ImportResult = { success: 0, failed: 0, variantsAdded: 0, errors: [] };
      const variantsToInsert: Record<string, any>[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        try {
          const values = parseCSVLine(dataRows[i]);
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => { row[h] = parseCsvField(values[idx] || ""); });

          const productName = row["product_name"];
          const productId = nameToId[productName.toLowerCase()];
          if (!productId) throw new Error(`প্রোডাক্ট "${productName}" পাওয়া যায়নি`);

          variantsToInsert.push({
            product_id: productId,
            size: row["size"] || null,
            color: row["color"] || null,
            stock: parseInt(row["stock"]) || 0,
            sku: row["sku"] || null,
            price_adjustment: parseFloat(row["price_adjustment"]) || 0,
            image_url: row["image_url"] || null,
          });
        } catch (err: any) {
          results.failed++;
          results.errors.push(`রো ${i + 2}: ${err.message}`);
        }
      }

      for (let i = 0; i < variantsToInsert.length; i += 100) {
        const batch = variantsToInsert.slice(i, i + 100);
        setImportProgress(Math.round(((i + batch.length) / variantsToInsert.length) * 100));
        const { data, error } = await supabase.from("product_variants").insert(batch as any).select();
        if (error) {
          results.errors.push(`ব্যাচ: ${error.message}`);
        } else {
          results.variantsAdded += (data || []).length;
        }
      }

      results.success = variantsToInsert.length - results.failed;
      setImportResult(results);
      if (results.variantsAdded > 0) {
        onImportComplete();
        toast({ title: "সফল", description: `${results.variantsAdded}টি ভেরিয়েন্ট ইম্পোর্ট হয়েছে` });
      }
    } catch (error: any) {
      setImportResult({ success: 0, failed: 0, variantsAdded: 0, errors: [error.message] });
    } finally {
      setImporting(false);
      if (variantFileInputRef.current) variantFileInputRef.current.value = "";
    }
  };

  // ============ HELPERS ============
  const esc = (field: string): string => {
    if (!field) return '""';
    if (field.includes(",") || field.includes('"') || field.includes("\n")) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return `"${field}"`;
  };

  const parseCsvField = (field: string): string => {
    if (!field) return "";
    field = field.trim();
    if (field.startsWith('"') && field.endsWith('"')) field = field.slice(1, -1).replace(/""/g, '"');
    return field;
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (char === '"') { inQuotes = false; }
        else { current += char; }
      } else {
        if (char === '"') { inQuotes = true; }
        else if (char === ",") { result.push(current); current = ""; }
        else { current += char; }
      }
    }
    result.push(current);
    return result;
  };

  const parseProductRow = (headers: string[], values: string[]): Record<string, any> => {
    const product: Record<string, any> = {};
    headers.forEach((header, index) => {
      const value = parseCsvField(values[index] || "");
      switch (header) {
        case "name": case "category": case "description": case "image_url": case "material":
          product[header] = value; break;
        case "price": case "sale_price":
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0) product[header] = num;
          else if (header === "price") throw new Error("অবৈধ মূল্য");
          break;
        case "stock": product.stock = parseInt(value) || 0; break;
        case "featured": product.featured = value.toLowerCase() === "true"; break;
        case "sizes": product.sizes = value ? value.split(";").map((s) => s.trim()).filter(Boolean) : []; break;
        case "colors": product.colors = value ? value.split(";").map((c) => c.trim()).filter(Boolean) : []; break;
      }
    });
    return product;
  };

  const parseVariantFromRow = (headers: string[], values: string[]): Record<string, any> | null => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = parseCsvField(values[i] || ""); });
    if (!row["variant_size"] && !row["variant_color"]) return null;
    return {
      size: row["variant_size"] || null,
      color: row["variant_color"] || null,
      stock: parseInt(row["variant_stock"]) || 0,
      sku: row["variant_sku"] || null,
      price_adjustment: parseFloat(row["variant_price_adjustment"]) || 0,
      image_url: row["variant_image_url"] || null,
    };
  };

  const downloadCSV = (content: string, filename: string) => {
    const bom = "\uFEFF";
    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const downloadProductTemplate = () => {
    const template = `name,category,price,sale_price,stock,featured,description,image_url,sizes,colors,material,variant_size,variant_color,variant_stock,variant_sku,variant_price_adjustment,variant_image_url
"Premium Black Borka","Borkas",2500,2200,50,true,"প্রিমিয়াম কোয়ালিটি বোরকা","https://example.com/borka.jpg","S; M; L; XL","Black; White","Nida","S","Black",20,"PBB-S-BLK",0,"https://example.com/black.jpg"
"Premium Black Borka","Borkas",2500,2200,50,true,"প্রিমিয়াম কোয়ালিটি বোরকা","https://example.com/borka.jpg","S; M; L; XL","Black; White","Nida","M","Black",15,"PBB-M-BLK",0,"https://example.com/black.jpg"
"Premium Black Borka","Borkas",2500,2200,50,true,"প্রিমিয়াম কোয়ালিটি বোরকা","https://example.com/borka.jpg","S; M; L; XL","Black; White","Nida","S","White",10,"PBB-S-WHT",100,"https://example.com/white.jpg"
"Silk Hijab Collection","Hijabs",1500,,30,false,"সিল্ক হিজাব","","Free Size","Red; Blue","Silk","Free Size","Red",15,"SHC-RED",0,"https://example.com/red.jpg"
"Silk Hijab Collection","Hijabs",1500,,30,false,"সিল্ক হিজাব","","Free Size","Red; Blue","Silk","Free Size","Blue",15,"SHC-BLU",0,"https://example.com/blue.jpg"`;
    downloadCSV(template, "product_with_variants_template.csv");
  };

  const downloadVariantTemplate = () => {
    const template = `product_name,size,color,stock,sku,price_adjustment,image_url
"Premium Black Borka","S","Black",20,"PBB-S-BLK",0,"https://example.com/black.jpg"
"Premium Black Borka","M","Black",15,"PBB-M-BLK",0,"https://example.com/black.jpg"
"Premium Black Borka","S","White",10,"PBB-S-WHT",100,"https://example.com/white.jpg"`;
    downloadCSV(template, "variant_import_template.csv");
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" onClick={exportToCSV} disabled={exporting} size="sm">
          {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          এক্সপোর্ট
        </Button>

        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing} size="sm">
          <Upload className="w-4 h-4 mr-2" />
          প্রোডাক্ট ইম্পোর্ট
        </Button>

        <Button variant="outline" onClick={() => variantFileInputRef.current?.click()} disabled={importing} size="sm">
          <Upload className="w-4 h-4 mr-2" />
          ভেরিয়েন্ট ইম্পোর্ট
        </Button>

        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
        <input ref={variantFileInputRef} type="file" accept=".csv" onChange={handleVariantFileSelect} className="hidden" />
      </div>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              {importing ? "ইম্পোর্ট হচ্ছে..." : "ইম্পোর্ট সম্পন্ন"}
            </DialogTitle>
            <DialogDescription>
              {importing ? "প্রোডাক্ট ইম্পোর্ট হচ্ছে, অপেক্ষা করুন" : "ইম্পোর্ট প্রক্রিয়া শেষ হয়েছে"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {importing && (
              <div className="space-y-2">
                <Progress value={importProgress} />
                <p className="text-sm text-muted-foreground text-center">{importProgress}%</p>
              </div>
            )}

            {importResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span>{importResult.success}টি প্রোডাক্ট</span>
                  </div>
                  {importResult.variantsAdded > 0 && (
                    <div className="flex items-center gap-2 text-blue-600">
                      <CheckCircle className="w-5 h-5" />
                      <span>{importResult.variantsAdded}টি ভেরিয়েন্ট</span>
                    </div>
                  )}
                  {importResult.failed > 0 && (
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="w-5 h-5" />
                      <span>{importResult.failed}টি ব্যর্থ</span>
                    </div>
                  )}
                </div>

                {importResult.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="max-h-32 overflow-y-auto text-sm">
                        {importResult.errors.slice(0, 5).map((error, i) => (
                          <div key={i}>{error}</div>
                        ))}
                        {importResult.errors.length > 5 && (
                          <div className="mt-1 text-muted-foreground">...আরো {importResult.errors.length - 5}টি এরর</div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="pt-4 border-t space-y-2">
              <p className="text-xs font-medium text-muted-foreground">CSV টেমপ্লেট ডাউনলোড:</p>
              <div className="flex gap-2 flex-wrap">
                <Button variant="link" onClick={downloadProductTemplate} className="p-0 h-auto text-xs">
                  <Download className="w-3 h-3 mr-1" />
                  প্রোডাক্ট + ভেরিয়েন্ট টেমপ্লেট
                </Button>
                <Button variant="link" onClick={downloadVariantTemplate} className="p-0 h-auto text-xs">
                  <Download className="w-3 h-3 mr-1" />
                  শুধু ভেরিয়েন্ট টেমপ্লেট
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProductImportExport;
