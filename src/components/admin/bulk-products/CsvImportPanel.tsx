import { useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { downloadCSVTemplate, parseCSVText } from "@/lib/admin/bulkProducts/csv";
import type { ProductRow } from "@/lib/admin/bulkProducts/types";

interface Props {
  onImport: (rows: ProductRow[]) => void;
}

const CsvImportPanel = ({ onImport }: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith(".csv")) {
      toast.error("CSV ফাইল দিন");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    try {
      const text = await file.text();
      const imported = parseCSVText(text);
      if (!imported.length) { toast.error("কোনো প্রোডাক্ট পাওয়া যায়নি"); return; }
      onImport(imported);
      toast.success(`${imported.length}টি প্রোডাক্ট CSV থেকে লোড হয়েছে`);
    } catch (err: any) {
      toast.error(`CSV পার্স ব্যর্থ: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" /> CSV ইম্পোর্ট
        </CardTitle>
        <CardDescription>CSV ফাইলে প্রোডাক্ট ও ভেরিয়েন্ট ডেটা দিয়ে আপলোড করুন</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" onClick={downloadCSVTemplate}>
            <Download className="w-4 h-4 mr-2" /> টেমপ্লেট
          </Button>
          <div>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> CSV আপলোড
            </Button>
          </div>
        </div>
        <Alert>
          <AlertDescription className="text-xs space-y-1">
            <p><strong>কলাম:</strong> name, category, price, sale_price, stock, featured, description, image_url, sizes, colors, material</p>
            <p><strong>ভেরিয়েন্ট:</strong> variant_size, variant_color, variant_stock, variant_sku, variant_price_adjustment</p>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default CsvImportPanel;
