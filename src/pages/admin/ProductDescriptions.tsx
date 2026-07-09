/**
 * Admin tools for AI-generated product descriptions:
 *  - Re-run AI enrichment for selected/affected products only
 *  - Scan for duplicate or near-duplicate descriptions
 *  - Restore an original description from description_backup
 *  - Quick link to the live product page to verify rendering
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, RotateCcw, Sparkles, Search, Loader2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Row = {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  description: string | null;
  description_backup: string | null;
  updated_at: string;
};

type DupPair = {
  product_a: string; name_a: string; slug_a: string | null;
  product_b: string; name_b: string; slug_b: string | null;
  similarity: number; exact_match: boolean;
};

export default function ProductDescriptions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyBackup, setOnlyBackup] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enriching, setEnriching] = useState(false);

  const [threshold, setThreshold] = useState(0.7);
  const [scanning, setScanning] = useState(false);
  const [dupes, setDupes] = useState<DupPair[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id, name, slug, category, description, description_backup, updated_at")
      .order("updated_at", { ascending: false });
    setLoading(false);
    if (error) return toast({ title: "Load failed", description: error.message, variant: "destructive" });
    setRows((data || []) as Row[]);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(r.name.toLowerCase().includes(q) || (r.category || "").toLowerCase().includes(q))) return false;
      if (onlyMissing && r.description && r.description.trim().length > 20) return false;
      if (onlyBackup && !r.description_backup) return false;
      return true;
    });
  }, [rows, search, onlyMissing, onlyBackup]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filtered.forEach((r) => next.delete(r.id));
    else filtered.forEach((r) => next.add(r.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const runEnrich = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return toast({ title: "কোন প্রোডাক্ট সিলেক্ট করা হয়নি" });
    if (ids.length > 50) return toast({ title: "সর্বোচ্চ ৫০টি প্রোডাক্ট একসাথে", variant: "destructive" });
    setEnriching(true);
    const { data, error } = await supabase.functions.invoke("enrich-product", {
      body: { productIds: ids, fields: ["description"] },
    });
    setEnriching(false);
    if (error) return toast({ title: "Enrich failed", description: error.message, variant: "destructive" });
    const results = (data as any)?.results || [];
    const ok = results.filter((r: any) => r.saved).length;
    const failed = results.filter((r: any) => r.error).length;
    toast({ title: `${ok}টি প্রোডাক্ট আপডেট হয়েছে`, description: failed ? `${failed}টি ব্যর্থ` : undefined });
    setSelected(new Set());
    load();
  };

  const scanDuplicates = async () => {
    setScanning(true);
    const { data, error } = await supabase.rpc("find_duplicate_product_descriptions", { _threshold: threshold });
    setScanning(false);
    if (error) return toast({ title: "Scan failed", description: error.message, variant: "destructive" });
    setDupes((data || []) as DupPair[]);
    toast({ title: `${(data || []).length}টি সম্ভাব্য ডুপ্লিকেট জোড়া পাওয়া গেছে` });
  };

  const restoreBackup = async (id: string, name: string) => {
    if (!confirm(`"${name}" এর পুরনো ডেসক্রিপশন রিস্টোর করবেন?`)) return;
    const { data, error } = await supabase.rpc("restore_product_description", { _product_id: id });
    if (error) return toast({ title: "Restore failed", description: error.message, variant: "destructive" });
    const restored = Array.isArray(data) && data[0]?.restored;
    toast({
      title: restored ? "রিস্টোর সম্পন্ন" : "কোন backup নেই",
      variant: restored ? "default" : "destructive",
    });
    if (restored) load();
  };

  const enrichPair = async (aId: string, bId: string) => {
    setEnriching(true);
    const { data, error } = await supabase.functions.invoke("enrich-product", {
      body: { productIds: [aId, bId], fields: ["description"] },
    });
    setEnriching(false);
    if (error) return toast({ title: "Enrich failed", description: error.message, variant: "destructive" });
    toast({ title: "দুটি প্রোডাক্ট নতুন করে জেনারেট হয়েছে" });
    setDupes((prev) => prev.filter((d) => !(d.product_a === aId && d.product_b === bId)));
    load();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Product Descriptions</h1>
          <p className="text-muted-foreground">
            AI-জেনারেটেড ডেসক্রিপশন ম্যানেজ, ডুপ্লিকেট স্ক্যান, এবং backup থেকে রিস্টোর করুন।
          </p>
        </div>

        {/* Duplicate scanner */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Search className="w-4 h-4" /> Duplicate / Similarity Scan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
              <div className="flex-1">
                <label className="text-sm font-medium">Similarity threshold: {threshold.toFixed(2)}</label>
                <Slider value={[threshold]} onValueChange={(v) => setThreshold(v[0])} min={0.3} max={1} step={0.05} />
                <p className="text-xs text-muted-foreground mt-1">0.7+ = খুব কাছাকাছি, 1.0 = হুবহু এক</p>
              </div>
              <Button onClick={scanDuplicates} disabled={scanning}>
                {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Scan Now
              </Button>
            </div>

            {dupes.length > 0 && (
              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product A</TableHead>
                      <TableHead>Product B</TableHead>
                      <TableHead>Similarity</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dupes.map((d) => (
                      <TableRow key={d.product_a + d.product_b}>
                        <TableCell>
                          <Link to={`/product/${d.slug_a || d.product_a}`} target="_blank" className="text-primary hover:underline">
                            {d.name_a}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link to={`/product/${d.slug_b || d.product_b}`} target="_blank" className="text-primary hover:underline">
                            {d.name_b}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={d.exact_match ? "destructive" : d.similarity > 0.85 ? "destructive" : "secondary"}>
                            {(d.similarity * 100).toFixed(0)}%{d.exact_match ? " · exact" : ""}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => enrichPair(d.product_a, d.product_b)} disabled={enriching}>
                            <Sparkles className="w-3 h-3 mr-1" /> Regenerate both
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product list */}
        <Card>
          <CardHeader>
            <CardTitle>Products ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input placeholder="নাম বা ক্যাটাগরি খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={onlyMissing} onCheckedChange={(v) => setOnlyMissing(!!v)} />
                শুধু missing/short description
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={onlyBackup} onCheckedChange={(v) => setOnlyBackup(!!v)} />
                শুধু যাদের backup আছে
              </label>
              <div className="sm:ml-auto flex gap-2">
                <Button onClick={runEnrich} disabled={enriching || selected.size === 0}>
                  {enriching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Re-run AI ({selected.size})
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="hidden md:table-cell">Description preview</TableHead>
                    <TableHead>Backup</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8">লোড হচ্ছে…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">কোন প্রোডাক্ট নেই</TableCell></TableRow>
                  ) : filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} /></TableCell>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.category}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell max-w-md">
                        <div className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                          {p.description || <span className="italic text-destructive">missing</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.description_backup
                          ? <Badge variant="secondary">available</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <Button asChild size="sm" variant="ghost" title="Verify on site">
                            <Link to={`/product/${p.slug || p.id}`} target="_blank">
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </Button>
                          <Button size="sm" variant="ghost" title="Re-run AI"
                            onClick={async () => { setSelected(new Set([p.id])); await runEnrich(); }}
                            disabled={enriching}>
                            <Sparkles className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Restore from backup"
                            onClick={() => restoreBackup(p.id, p.name)}
                            disabled={!p.description_backup}>
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
