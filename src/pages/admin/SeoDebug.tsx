/**
 * SEO Debug — admin-only page combining:
 *  1) Per-route OG / Twitter preview (rendered card + copyable meta).
 *  2) Product JSON-LD linter for both sale + non-sale sample products.
 *  3) Crawl / render checklist (canonical, robots, sitemap, structured data).
 *  4) Deep links to Google Rich Results Test & Facebook Sharing Debugger.
 *
 * Note: this is an in-app validator. It doesn't call Google's Rich Results
 * API (that API is public-preview only and not batch-friendly). It runs
 * schema.org shape checks locally + provides one-click deep links to the
 * official tools so the admin can confirm.
 */
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  buildProductJsonLd, buildProductSeo, buildBlogListSeo, SITE_URL,
} from "@/lib/seo/config";
import {
  CheckCircle2, XCircle, AlertTriangle, ExternalLink, Copy, Search,
} from "lucide-react";
import { toast } from "sonner";

// ── static route metadata (matches SEOHead calls across the app) ───────────
const STATIC_ROUTES = [
  { path: "/",           title: "Dubai Borka House – Premium Dubai Imported Borka, Abaya & Hijab in Bangladesh", desc: "Bangladesh-এর সেরা প্রিমিয়াম দুবাই ইম্পোর্টেড বোরকা, আবায়া, হিজাব ও কাফতান শপ।" },
  { path: "/shop",       title: "Shop – Dubai Imported Abaya, Borka & Hijab Collection Bangladesh | Dubai Borka House", desc: "সবচেয়ে বড় দুবাই ইম্পোর্টেড আবায়া, বোরকা, হিজাব ও কাফতান কালেকশন।" },
  { path: "/shop?category=Abaya", title: "Dubai Imported Abaya Collection in Bangladesh | Dubai Borka House", desc: "Premium Dubai imported abaya collection — embroidery, karchupi, stone work." },
  { path: "/shop?category=Borka", title: "Premium Dubai Borka Collection – Cash on Delivery in Bangladesh | Dubai Borka House", desc: "প্রিমিয়াম দুবাই বোরকা কালেকশন — ম্যাচিং হিজাবসহ, সেরা দামে।" },
  { path: "/shop?category=Hijab", title: "Premium Hijab & Scarf Collection Bangladesh | Dubai Borka House", desc: "দুবাই ইম্পোর্টেড হিজাব ও স্কার্ফ।" },
  { path: "/categories", title: "All Categories – Abaya, Borka, Hijab & Kaftan Collection Bangladesh | Dubai Borka House", desc: "সকল ক্যাটাগরি ব্রাউজ করুন।" },
  { path: "/blog",       title: `${buildBlogListSeo().title} | Dubai Borka House`, desc: buildBlogListSeo().description },
  { path: "/wishlist",   title: "My Wishlist – Saved Abaya & Borka Items | Dubai Borka House", desc: "Wishlist page (noindex)." },
];

// ── Product JSON-LD required-field linter ──────────────────────────────────
type LintResult = { ok: boolean; errors: string[]; warnings: string[] };
function lintProductSchema(schema: Record<string, unknown>): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const req = ["@context", "@type", "name", "image", "offers"];
  req.forEach(k => { if (!schema[k]) errors.push(`Missing required "${k}"`); });
  const offers = schema.offers as Record<string, unknown> | undefined;
  if (offers) {
    ["priceCurrency", "price", "availability"].forEach(k => {
      if (offers[k] === undefined || offers[k] === null || offers[k] === "")
        errors.push(`offers.${k} missing`);
    });
    if (offers.price === 0) warnings.push("offers.price is 0 — Google may reject.");
    if (!offers.url) warnings.push("offers.url missing — recommended for CTR.");
    if (schema.offers && (schema as any).offers.priceValidUntil) {
      const d = new Date((schema as any).offers.priceValidUntil);
      if (isNaN(d.getTime())) errors.push("offers.priceValidUntil is not ISO date");
    }
  }
  if (!schema.description) warnings.push("description missing — recommended.");
  if (!(schema as any).brand) warnings.push("brand missing — recommended.");
  if (!(schema as any).aggregateRating)
    warnings.push("aggregateRating absent — add reviews for star snippet.");
  return { ok: errors.length === 0, errors, warnings };
}

const richResultsLink = (url: string) =>
  `https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`;
const fbDebuggerLink = (url: string) =>
  `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(url)}`;
const twitterCardLink = (url: string) =>
  `https://cards-dev.twitter.com/validator?url=${encodeURIComponent(url)}`;

const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };

const SeoDebug = () => {
  // Sample products: one with sale_price, one without.
  const { data: samples } = useQuery({
    queryKey: ["seo-debug-samples"],
    queryFn: async () => {
      const [{ data: sale }, { data: normal }] = await Promise.all([
        supabase.from("products").select("id,name,description,price,sale_price,category,image_url,slug,stock")
          .not("sale_price", "is", null).gt("stock", 0).limit(1).maybeSingle(),
        supabase.from("products").select("id,name,description,price,sale_price,category,image_url,slug,stock")
          .is("sale_price", null).gt("stock", 0).limit(1).maybeSingle(),
      ]);
      return { sale, normal };
    },
  });

  const productChecks = useMemo(() => {
    if (!samples) return [];
    return [
      { label: "SALE product", p: samples.sale },
      { label: "NON-SALE product", p: samples.normal },
    ].filter(x => x.p).map(({ label, p }) => {
      const meta = buildProductSeo({ id: p.id, name: p.name, description: p.description, price: p.price, salePrice: p.sale_price, category: p.category, image: p.image_url, slug: p.slug });
      const schema = buildProductJsonLd({ id: p.id, name: p.name, description: p.description, price: p.price, salePrice: p.sale_price, category: p.category, image: p.image_url, slug: p.slug, stock: p.stock });
      return { label, product: p, meta, schema, lint: lintProductSchema(schema) };
    });
  }, [samples]);

  // Checklist: read robots.txt + sitemap availability.
  const [checklist, setChecklist] = useState<Array<{ label: string; ok: boolean; note?: string }>>([]);
  useEffect(() => {
    (async () => {
      const items: Array<{ label: string; ok: boolean; note?: string }> = [];
      try { const r = await fetch("/robots.txt"); items.push({ label: "robots.txt reachable", ok: r.ok, note: r.status.toString() }); } catch { items.push({ label: "robots.txt reachable", ok: false }); }
      try {
        const r = await fetch("/sitemap.xml");
        const txt = r.ok ? await r.text() : "";
        items.push({ label: "sitemap.xml reachable", ok: r.ok, note: `${txt.match(/<url>/g)?.length || 0} URLs` });
      } catch { items.push({ label: "sitemap.xml reachable", ok: false }); }
      items.push({ label: "Canonical URLs per route", ok: true, note: "SEOHead injects <link rel=canonical>" });
      items.push({ label: "Product JSON-LD (Product + Offer)", ok: true, note: "buildProductJsonLd" });
      items.push({ label: "Organization / WebSite / ClothingStore JSON-LD", ok: true, note: "index.html static graph" });
      items.push({ label: "SSR / Prerender", ok: false, note: "Classic Vite SPA — head mutated client-side. See note below." });
      setChecklist(items);
    })();
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-2">
            <Search className="w-7 h-7" /> SEO Debug
          </h1>
          <p className="text-muted-foreground">Route previews, structured data linter ও crawl checklist।</p>
        </div>

        <Tabs defaultValue="previews">
          <TabsList>
            <TabsTrigger value="previews">OG / Twitter Previews</TabsTrigger>
            <TabsTrigger value="schema">Product Schema Lint</TabsTrigger>
            <TabsTrigger value="checklist">Crawl Checklist</TabsTrigger>
          </TabsList>

          {/* ── OG/Twitter Previews ─────────────────────────────────── */}
          <TabsContent value="previews" className="space-y-4">
            <Alert>
              <AlertDescription>
                Homepage-এর static OG image সব route-এ default হিসেবে যাবে (SPA-তে social crawlers JS execute করে না)।
                Per-route accurate preview চাইলে SSR/Prerender দরকার — নিচের checklist দেখুন।
              </AlertDescription>
            </Alert>
            {STATIC_ROUTES.map(r => {
              const fullUrl = `${SITE_URL}${r.path}`;
              return (
                <Card key={r.path}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-mono flex items-center gap-2">
                      {r.path}
                      <div className="ml-auto flex gap-2">
                        <a href={fbDebuggerLink(fullUrl)} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline"><ExternalLink className="w-3 h-3 mr-1" /> FB Debugger</Button>
                        </a>
                        <a href={twitterCardLink(fullUrl)} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline"><ExternalLink className="w-3 h-3 mr-1" /> Twitter Card</Button>
                        </a>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid md:grid-cols-2 gap-4">
                    {/* Rendered OG card mock */}
                    <div className="border rounded-lg overflow-hidden bg-card">
                      <div className="aspect-[1.91/1] bg-muted flex items-center justify-center text-xs text-muted-foreground">1200×630 og:image</div>
                      <div className="p-3 space-y-1">
                        <div className="text-[10px] uppercase text-muted-foreground">dubaiborkahouse.com</div>
                        <div className="font-semibold text-sm line-clamp-2">{r.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">{r.desc}</div>
                      </div>
                    </div>
                    {/* Meta */}
                    <div className="text-xs space-y-1 font-mono">
                      <div><span className="text-muted-foreground">title:</span> {r.title} <Button size="sm" variant="ghost" onClick={() => copy(r.title)}><Copy className="w-3 h-3" /></Button></div>
                      <div><span className="text-muted-foreground">description:</span> {r.desc}</div>
                      <div><span className="text-muted-foreground">canonical:</span> {fullUrl}</div>
                      <div className="flex gap-1 mt-1">
                        <Badge variant="outline">title {r.title.length}c</Badge>
                        <Badge variant={r.title.length > 60 ? "destructive" : "outline"}>{r.title.length > 60 ? "title long" : "title ok"}</Badge>
                        <Badge variant={r.desc.length > 160 ? "destructive" : "outline"}>{r.desc.length > 160 ? "desc long" : "desc ok"}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* ── Product schema linter ───────────────────────────────── */}
          <TabsContent value="schema" className="space-y-4">
            {productChecks.length === 0 && <Alert><AlertDescription>Sample products লোড হচ্ছে…</AlertDescription></Alert>}
            {productChecks.map(({ label, product, meta, schema, lint }) => {
              const url = `${SITE_URL}${meta.canonical}`;
              return (
                <Card key={product.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      {lint.ok
                        ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                        : <XCircle className="w-5 h-5 text-destructive" />}
                      {label} — {product.name}
                      <a href={richResultsLink(url)} target="_blank" rel="noreferrer" className="ml-auto">
                        <Button size="sm"><ExternalLink className="w-3 h-3 mr-1" /> Google Rich Results Test</Button>
                      </a>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <Badge>{lint.errors.length} errors</Badge>
                      <Badge variant="outline">{lint.warnings.length} warnings</Badge>
                      <Badge variant="outline">price ৳{(schema.offers as any)?.price}</Badge>
                      <Badge variant="outline">{String((schema.offers as any)?.availability).replace("https://schema.org/", "")}</Badge>
                      {product.sale_price && <Badge>SALE</Badge>}
                    </div>
                    {lint.errors.length > 0 && (
                      <Alert variant="destructive"><AlertDescription>
                        <ul className="list-disc pl-5 text-xs">{lint.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                      </AlertDescription></Alert>
                    )}
                    {lint.warnings.length > 0 && (
                      <Alert><AlertTriangle className="w-4 h-4" /><AlertDescription>
                        <ul className="list-disc pl-5 text-xs">{lint.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                      </AlertDescription></Alert>
                    )}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">View JSON-LD</summary>
                      <pre className="mt-2 p-3 bg-muted rounded overflow-auto max-h-72">{JSON.stringify(schema, null, 2)}</pre>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* ── Crawl checklist ─────────────────────────────────────── */}
          <TabsContent value="checklist" className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Crawl & Render Checklist</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {checklist.map((c, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      {c.ok
                        ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600" />
                        : <XCircle className="w-4 h-4 mt-0.5 text-destructive" />}
                      <div className="flex-1">
                        <div>{c.label}</div>
                        {c.note && <div className="text-xs text-muted-foreground">{c.note}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Alert>
              <AlertDescription>
                <strong>SSR / Prerender সম্পর্কে সততার নোট:</strong> এই প্রজেক্ট classic Vite SPA। প্রতিটি
                route-এর title/description/canonical `SEOHead` client-side inject করে — Googlebot এটা
                render করে ধরে নেয়, কিন্তু Facebook / LinkedIn / WhatsApp / Slack-এর social crawlers
                JS execute করে না, তাই তারা শুধুমাত্র static `index.html`-এর homepage OG দেখে।
                সব route-এ accurate per-page social preview চাইলে TanStack Start SSR-এ migrate করতে হবে —
                সেটা আলাদা কাজ, আগে জানিয়ে confirm নিতে হবে।
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default SeoDebug;
