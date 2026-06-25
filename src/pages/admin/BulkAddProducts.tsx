import AdminLayout from "@/components/admin/AdminLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle, Loader2, PackagePlus } from "lucide-react";
import AddProductsPanel from "@/components/admin/bulk-products/AddProductsPanel";
import EditProductsPanel from "@/components/admin/bulk-products/EditProductsPanel";
import CsvImportPanel from "@/components/admin/bulk-products/CsvImportPanel";
import { useBulkAddProducts } from "@/hooks/admin/useBulkAddProducts";
import { useBulkEditProducts } from "@/hooks/admin/useBulkEditProducts";
import { useBulkCategories } from "@/hooks/admin/useBulkCategories";

const BulkAddProducts = () => {
  const { allCategories } = useBulkCategories();
  const addState = useBulkAddProducts();
  const editState = useBulkEditProducts();

  const { results, submitting, progress, setProducts } = addState;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-display font-bold flex items-center gap-2">
              <PackagePlus className="w-6 h-6 sm:w-8 sm:h-8 text-primary" /> Bulk Add Products
            </h1>
            <p className="text-muted-foreground">প্রোডাক্ট যুক্ত, এডিট, আপডেট ও ডিলিট করুন</p>
          </div>
        </div>

        {results && (
          <Alert variant={results.failed > 0 ? "destructive" : "default"} className="border-2">
            <AlertDescription>
              <div className="flex items-center gap-2 mb-1">
                {results.failed === 0
                  ? <CheckCircle className="w-5 h-5 text-primary" />
                  : <AlertCircle className="w-5 h-5" />}
                <strong>
                  {results.success}টি প্রোডাক্ট ও {results.variants}টি ভেরিয়েন্ট যুক্ত হয়েছে
                  {results.failed > 0 && ` | ${results.failed}টি ব্যর্থ`}
                </strong>
              </div>
              {results.errors.length > 0 && (
                <ScrollArea className="max-h-24">
                  {results.errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
                </ScrollArea>
              )}
            </AlertDescription>
          </Alert>
        )}

        {submitting && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">যুক্ত হচ্ছে... {progress}%</span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>
        )}

        <Tabs defaultValue="add" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="add">নতুন যুক্ত</TabsTrigger>
            <TabsTrigger value="edit">এডিট/আপডেট/ডিলিট</TabsTrigger>
            <TabsTrigger value="csv">CSV ইম্পোর্ট</TabsTrigger>
          </TabsList>

          <TabsContent value="csv">
            <CsvImportPanel
              onImport={rows => setProducts(prev => [...prev.filter(p => p.name.trim()), ...rows])}
            />
          </TabsContent>

          <TabsContent value="add">
            <AddProductsPanel state={addState} categories={allCategories} />
          </TabsContent>

          <TabsContent value="edit">
            <EditProductsPanel state={editState} categories={allCategories} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default BulkAddProducts;
