/**
 * Hot Sale Admin — one page combining:
 *  1) Curation: manual mode + drag-free product picker (up to 12).
 *  2) A/B test: variant A/B title/subtitle/CTA/badge/grid config + toggle.
 *  3) Debug: live preview of which products the section would render right
 *     now, which fallback tier they came from, and per-product eligibility.
 *  4) Report: impression / click / add-to-cart / checkout counts + conversion
 *     rate per variant, computed from analytics_events.
 */
import { useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Search, X, GripVertical, Flame, Info, Trash2 } from "lucide-react";
import {
  parseHotSaleConfig, DEFAULT_HOT_SALE_CONFIG,
  type HotSaleConfig, type HotSaleVariantConfig,
} from "@/lib/hotSaleTracking";

const HotSaleAdmin = () => {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // ── Load section_content row ────────────────────────────────────────────
  const { data: section, isLoading } = useQuery({
    queryKey: ["hot-sale-section"],
    queryFn: async () => {
      const { data } = await supabase.from("site_content").select("*").eq("section_key", "hot_sale").maybeSingle();
      return data;
    },
  });

  const [config, setConfig] = useState<HotSaleConfig>(DEFAULT_HOT_SALE_CONFIG);
  const [title, setTitle] = useState<string>("");
  const [subtitle, setSubtitle] = useState<string>("");

  // hydrate once loaded
  useMemo(() => {
    if (section) {
      setConfig(parseHotSaleConfig(section.content));
      setTitle(section.title || "");
      setSubtitle(section.subtitle || "");
    }
  }, [section?.id]);

  // ── Products for curation + preview ─────────────────────────────────────
  const { data: allProducts = [] } = useQuery({
    queryKey: ["admin-hotsale-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, category, price, sale_price, stock, featured, image_url, slug")
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
  });

  const productMap = useMemo(() => {
    const m = new Map<string, any>();
    allProducts.forEach(p => m.set(p.id, p));
    return m;
  }, [allProducts]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allProducts.slice(0, 30);
    return allProducts.filter(p =>
      p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q)
    ).slice(0, 30);
  }, [allProducts, search]);

  // ── Save ────────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("site_content").upsert({
      section_key: "hot_sale",
      title: title || null,
      subtitle: subtitle || null,
      content: JSON.stringify(config),
      is_active: section?.is_active ?? true,
      display_order: section?.display_order ?? 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "section_key" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Hot Sale config সেভ হয়েছে");
    qc.invalidateQueries({ queryKey: ["hot-sale-section"] });
    qc.invalidateQueries({ queryKey: ["home-hot-sale"] });
    qc.invalidateQueries({ queryKey: ["homepage-sections"] });
  };

  const addManual = (id: string) => {
    if (config.manual_ids.includes(id)) return;
    if (config.manual_ids.length >= 12) { toast.error("সর্বোচ্চ ১২টি product"); return; }
    setConfig({ ...config, manual_ids: [...config.manual_ids, id] });
  };
  const removeManual = (id: string) =>
    setConfig({ ...config, manual_ids: config.manual_ids.filter(x => x !== id) });
  const moveManual = (id: string, dir: -1 | 1) => {
    const arr = [...config.manual_ids];
    const i = arr.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setConfig({ ...config, manual_ids: arr });
  };

  // ── Debug preview: run same 3-tier logic client-side, annotate each ─────
  const { data: preview } = useQuery({
    queryKey: ["hot-sale-preview", config.mode, config.manual_ids.join(",")],
    queryFn: async () => {
      const SELECT = "id, name, price, sale_price, stock, featured, category, slug";
      // tier 1: sale
      const { data: sale } = await supabase.from("products").select(SELECT)
        .not("sale_price", "is", null).gt("stock", 0).order("created_at", { ascending: false }).limit(12);
      // tier 2: featured
      const { data: feat } = await supabase.from("products").select(SELECT)
        .eq("featured", true).gt("stock", 0).order("created_at", { ascending: false }).limit(12);
      // tier 3: newest
      const { data: newest } = await supabase.from("products").select(SELECT)
        .gt("stock", 0).order("created_at", { ascending: false }).limit(12);
      let source: string; let chosen: any[] = [];
      if (config.mode === "manual" && config.manual_ids.length > 0) {
        const { data: manual } = await supabase.from("products").select(SELECT).in("id", config.manual_ids);
        const m = new Map((manual || []).map((p: any) => [p.id, p]));
        chosen = config.manual_ids.map(id => m.get(id)).filter(Boolean);
        source = "manual";
      } else if (sale && sale.length >= 4) { chosen = sale; source = "sale"; }
      else {
        const combined = [...(sale || []), ...(feat || [])];
        const seen = new Set<string>();
        const uniq = combined.filter((p: any) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
        if (uniq.length >= 4) { chosen = uniq.slice(0, 12); source = "featured"; }
        else { chosen = newest || []; source = newest && newest.length ? "newest" : "empty"; }
      }
      return {
        source,
        chosen,
        counts: { sale: sale?.length || 0, featured: feat?.length || 0, newest: newest?.length || 0 },
      };
    },
  });

  // ── A/B report ──────────────────────────────────────────────────────────
  const { data: report } = useQuery({
    queryKey: ["hot-sale-report"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("analytics_events")
        .select("event_name, metadata, created_at")
        .like("event_name", "hot_sale_%")
        .gte("created_at", since)
        .limit(10000);
      const rows = data || [];
      const acc: Record<string, Record<string, number>> = { A: {}, B: {} };
      rows.forEach((r: any) => {
        const v = r.metadata?.variant === "B" ? "B" : "A";
        acc[v][r.event_name] = (acc[v][r.event_name] || 0) + 1;
      });
      const totals = (v: string) => {
        const imp = acc[v]["hot_sale_impression"] || 0;
        const click = acc[v]["hot_sale_product_click"] || 0;
        const atc = acc[v]["hot_sale_add_to_cart"] || 0;
        const co = acc[v]["hot_sale_checkout"] || 0;
        return {
          impressions: imp, clicks: click, add_to_cart: atc, checkouts: co,
          ctr: imp ? (click / imp * 100) : 0,
          atcr: imp ? (atc / imp * 100) : 0,
          checkout_rate: imp ? (co / imp * 100) : 0,
        };
      };
      return { A: totals("A"), B: totals("B") };
    },
  });

  const updateVariant = (v: "A" | "B", patch: Partial<HotSaleVariantConfig>) => {
    if (v === "A") setConfig({ ...config, variant_a: { ...config.variant_a, ...patch } });
    else setConfig({ ...config, variant_b: { ...config.variant_b, ...patch } });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-2">
              <Flame className="w-7 h-7 text-destructive" /> Hot Sale Control
            </h1>
            <p className="text-muted-foreground">Curation, A/B test, debug preview & conversion report</p>
          </div>
          <Button onClick={save} disabled={saving || isLoading}>
            <Save className="w-4 h-4 mr-2" /> {saving ? "সেভ হচ্ছে..." : "Save"}
          </Button>
        </div>

        <Tabs defaultValue="curation">
          <TabsList>
            <TabsTrigger value="curation">Curation</TabsTrigger>
            <TabsTrigger value="ab">A/B Test</TabsTrigger>
            <TabsTrigger value="debug">Debug Preview</TabsTrigger>
            <TabsTrigger value="report">Conversion Report</TabsTrigger>
          </TabsList>

          {/* ── Curation ─────────────────────────────────────────────── */}
          <TabsContent value="curation" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Section Text</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label>Title (overrides variant title)</Label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="🔥 Hot Sale" />
                  </div>
                  <div>
                    <Label>Subtitle</Label>
                    <Input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="..." />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Empty রাখলে active A/B variant-এর title/subtitle ব্যবহৃত হবে।</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Product Source</CardTitle>
                <div className="flex items-center gap-2 text-sm">
                  <span className={config.mode === "auto" ? "font-semibold" : "text-muted-foreground"}>Auto (3-tier)</span>
                  <Switch checked={config.mode === "manual"} onCheckedChange={(v) => setConfig({ ...config, mode: v ? "manual" : "auto" })} />
                  <span className={config.mode === "manual" ? "font-semibold" : "text-muted-foreground"}>Manual pick</span>
                </div>
              </CardHeader>
              <CardContent>
                {config.mode === "auto" ? (
                  <Alert><Info className="w-4 h-4" /><AlertDescription>
                    Auto mode: sale_price + stock &gt; 0 → featured + stock &gt; 0 → newest in-stock (min ৪টি lagbe প্রতিটি tier-এ)।
                  </AlertDescription></Alert>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Selected list */}
                    <div>
                      <Label className="mb-2 block">Selected ({config.manual_ids.length}/12) — উপরে থাকলে আগে দেখাবে</Label>
                      <div className="space-y-2 max-h-[500px] overflow-auto pr-1">
                        {config.manual_ids.length === 0 && (
                          <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">এখনো কিছু বাছা হয়নি</p>
                        )}
                        {config.manual_ids.map((id, idx) => {
                          const p = productMap.get(id);
                          return (
                            <div key={id} className="flex items-center gap-2 border rounded-md p-2 bg-card">
                              <span className="text-xs font-mono text-muted-foreground w-6">{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">{p?.name || "(missing)"}</div>
                                <div className="text-xs text-muted-foreground">{p?.category} · ৳{p?.sale_price || p?.price} · stock {p?.stock ?? 0}</div>
                              </div>
                              <Button size="sm" variant="ghost" onClick={() => moveManual(id, -1)} disabled={idx === 0}>↑</Button>
                              <Button size="sm" variant="ghost" onClick={() => moveManual(id, 1)} disabled={idx === config.manual_ids.length - 1}>↓</Button>
                              <Button size="sm" variant="ghost" onClick={() => removeManual(id)}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Picker */}
                    <div>
                      <Label className="mb-2 block">Add Products</Label>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input placeholder="Search name/category..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
                      </div>
                      <div className="space-y-1 max-h-[460px] overflow-auto pr-1">
                        {filteredProducts.map(p => {
                          const picked = config.manual_ids.includes(p.id);
                          return (
                            <button key={p.id} onClick={() => addManual(p.id)} disabled={picked}
                              className={`w-full text-left p-2 rounded border text-sm hover:bg-muted disabled:opacity-40 flex items-center gap-2`}>
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{p.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {p.category} · ৳{p.sale_price || p.price} · stock {p.stock ?? 0}
                                  {p.featured && <Badge variant="outline" className="ml-1 text-[10px]">featured</Badge>}
                                  {p.sale_price && <Badge variant="outline" className="ml-1 text-[10px]">sale</Badge>}
                                </div>
                              </div>
                              {picked ? <Badge>picked</Badge> : <span className="text-primary text-xs">+ Add</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── A/B ─────────────────────────────────────────────────── */}
          <TabsContent value="ab" className="space-y-4">
            <Card>
              <CardContent className="pt-6 flex items-center justify-between">
                <div>
                  <Label className="text-base">Enable A/B test</Label>
                  <p className="text-xs text-muted-foreground">Visitors split deterministically by client id. Off = সবাই variant A দেখবে।</p>
                </div>
                <Switch checked={config.ab_test} onCheckedChange={(v) => setConfig({ ...config, ab_test: v })} />
              </CardContent>
            </Card>

            {(["A", "B"] as const).map(v => {
              const vc = v === "A" ? config.variant_a : config.variant_b;
              return (
                <Card key={v}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Variant {v}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid md:grid-cols-2 gap-3">
                    <div><Label>Title</Label><Input value={vc.title} onChange={e => updateVariant(v, { title: e.target.value })} /></div>
                    <div><Label>Subtitle</Label><Input value={vc.subtitle} onChange={e => updateVariant(v, { subtitle: e.target.value })} /></div>
                    <div><Label>CTA</Label><Input value={vc.cta} onChange={e => updateVariant(v, { cta: e.target.value })} /></div>
                    <div>
                      <Label>Discount badge style</Label>
                      <div className="flex gap-2 mt-1">
                        {(["solid", "outline"] as const).map(s => (
                          <Button key={s} type="button" size="sm" variant={vc.badge_style === s ? "default" : "outline"}
                            onClick={() => updateVariant(v, { badge_style: s })}>{s}</Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Grid columns (desktop)</Label>
                      <div className="flex gap-2 mt-1">
                        {[3, 4].map(n => (
                          <Button key={n} type="button" size="sm" variant={vc.grid_cols === n ? "default" : "outline"}
                            onClick={() => updateVariant(v, { grid_cols: n as 3 | 4 })}>{n} cols</Button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* ── Debug ───────────────────────────────────────────────── */}
          <TabsContent value="debug" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Live decision trace</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
                  <div className="p-3 rounded border">
                    <div className="text-xs text-muted-foreground">Chosen source</div>
                    <div className="font-bold text-lg capitalize">{preview?.source || "…"}</div>
                  </div>
                  <div className="p-3 rounded border">
                    <div className="text-xs text-muted-foreground">Tier 1 · Sale</div>
                    <div className="font-bold">{preview?.counts.sale ?? "…"}</div>
                  </div>
                  <div className="p-3 rounded border">
                    <div className="text-xs text-muted-foreground">Tier 2 · Featured</div>
                    <div className="font-bold">{preview?.counts.featured ?? "…"}</div>
                  </div>
                  <div className="p-3 rounded border">
                    <div className="text-xs text-muted-foreground">Tier 3 · Newest</div>
                    <div className="font-bold">{preview?.counts.newest ?? "…"}</div>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Why included</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(preview?.chosen || []).map((p: any, i: number) => {
                      const reasons: string[] = [];
                      if (preview?.source === "manual") reasons.push("manual pick");
                      if (p.sale_price) reasons.push("sale_price set");
                      if (p.featured) reasons.push("featured=true");
                      if ((p.stock ?? 0) > 0) reasons.push(`stock ${p.stock}`);
                      return (
                        <TableRow key={p.id}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell className="max-w-[260px] truncate">{p.name}</TableCell>
                          <TableCell className="text-xs">{p.category}</TableCell>
                          <TableCell>৳{p.sale_price || p.price}</TableCell>
                          <TableCell>{p.stock ?? 0}</TableCell>
                          <TableCell className="text-xs">
                            {reasons.map((r, j) => <Badge key={j} variant="outline" className="mr-1 text-[10px]">{r}</Badge>)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!preview?.chosen || preview.chosen.length === 0) && (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No products would render — section will auto-hide.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Report ──────────────────────────────────────────────── */}
          <TabsContent value="report" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Last 30 days · per variant</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variant</TableHead>
                      <TableHead>Impressions</TableHead>
                      <TableHead>Product clicks</TableHead>
                      <TableHead>Add to cart</TableHead>
                      <TableHead>Checkouts</TableHead>
                      <TableHead>CTR</TableHead>
                      <TableHead>ATC rate</TableHead>
                      <TableHead>Checkout rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(["A", "B"] as const).map(v => {
                      const r = report?.[v];
                      return (
                        <TableRow key={v}>
                          <TableCell><Badge>{v}</Badge></TableCell>
                          <TableCell>{r?.impressions ?? 0}</TableCell>
                          <TableCell>{r?.clicks ?? 0}</TableCell>
                          <TableCell>{r?.add_to_cart ?? 0}</TableCell>
                          <TableCell>{r?.checkouts ?? 0}</TableCell>
                          <TableCell>{(r?.ctr ?? 0).toFixed(2)}%</TableCell>
                          <TableCell>{(r?.atcr ?? 0).toFixed(2)}%</TableCell>
                          <TableCell className="font-semibold">{(r?.checkout_rate ?? 0).toFixed(2)}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {report && (report.A.impressions + report.B.impressions === 0) && (
                  <p className="text-xs text-muted-foreground mt-3">
                    এখনও কোনো data নেই — visitor Hot Sale section দেখলে ইভেন্ট রেকর্ড হবে।
                  </p>
                )}
                {report && report.A.impressions >= 30 && report.B.impressions >= 30 && (
                  <Alert className="mt-4">
                    <AlertDescription>
                      🏆 Winner (by checkout rate):{" "}
                      <strong>
                        Variant {report.A.checkout_rate >= report.B.checkout_rate ? "A" : "B"}
                      </strong>{" "}
                      — {(Math.max(report.A.checkout_rate, report.B.checkout_rate)).toFixed(2)}%
                      {" vs "}
                      {(Math.min(report.A.checkout_rate, report.B.checkout_rate)).toFixed(2)}%
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default HotSaleAdmin;
