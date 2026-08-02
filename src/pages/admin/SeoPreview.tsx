import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Eye, Search } from "lucide-react";

import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  ALL_META,
  BASE_URL,
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  TITLE_MAX,
  DESC_MAX,
  DESC_MIN,
  type GeneratedMeta,
} from "@/lib/seo/metaGenerator";
import { fetchCanonicalOverrides, resolveCanonical, type CanonicalOverride } from "@/lib/seo/canonicalOverrides";
import IndexingRequestCard from "@/components/admin/seo/IndexingRequestCard";
import CanonicalBulkUpdater from "@/components/admin/seo/CanonicalBulkUpdater";

interface PreviewEntry {
  key: string;
  label: string;
  meta: GeneratedMeta;
  jsonLd: Record<string, unknown>[];
}

interface ProductRow {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  price: number;
  sale_price: number | null;
  image_url: string | null;
  category: string | null;
  meta_title: string | null;
  meta_description: string | null;
  tags: string[] | null;
}

const clampDesc = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, DESC_MAX);

/** Builds the exact meta + JSON-LD a product page will publish. */
const productEntry = (p: ProductRow): PreviewEntry => {
  const path = `/product/${p.slug || p.id}`;
  const title = p.meta_title || `${p.name} – ${SITE_NAME}`;
  const description = clampDesc(
    p.meta_description ||
      p.description ||
      `${p.name} — অরিজিনাল দুবাই কোয়ালিটি, ক্যাশ অন ডেলিভারি সহ সারা বাংলাদেশে ডেলিভারি।`,
  );
  const image = p.image_url || DEFAULT_OG_IMAGE;
  const price = p.sale_price ?? p.price;

  return {
    key: `product:${p.id}`,
    label: p.name,
    meta: {
      key: `product:${p.id}`,
      path,
      title,
      description,
      keywords: (p.tags ?? []).join(", "),
      h1: p.name,
      ogTitle: `${title} | ${SITE_NAME}`,
      ogDescription: description,
      ogType: "product",
      ogUrl: `${BASE_URL}${path}`,
      ogImage: image,
      twitterCard: "summary_large_image",
    },
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        description,
        image: [image],
        category: p.category ?? undefined,
        brand: { "@type": "Brand", name: SITE_NAME },
        offers: {
          "@type": "Offer",
          url: `${BASE_URL}${path}`,
          priceCurrency: "BDT",
          price,
          availability: "https://schema.org/InStock",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${BASE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Shop", item: `${BASE_URL}/shop` },
          { "@type": "ListItem", position: 3, name: p.name, item: `${BASE_URL}${path}` },
        ],
      },
    ],
  };
};

const staticEntry = (m: GeneratedMeta): PreviewEntry => ({
  key: m.key,
  label: m.h1,
  meta: m,
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: m.title,
      description: m.description,
      url: `${BASE_URL}${m.path}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: m.h1, item: `${BASE_URL}${m.path}` },
      ],
    },
  ],
});

const lengthBadge = (value: number, max: number, min = 0) => {
  const ok = value <= max && value >= min;
  return (
    <Badge variant={ok ? "secondary" : "destructive"} className="font-mono">
      {value}/{max}
    </Badge>
  );
};

const EntryCard = ({ entry, canonical }: { entry: PreviewEntry; canonical: string }) => {
  const { meta } = entry;
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("কপি হয়েছে");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="truncate">{entry.label}</span>
          <span className="font-mono text-xs text-muted-foreground">{meta.path}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Google-style SERP preview */}
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground truncate">{canonical}</p>
          <p className="text-[15px] text-primary leading-snug">{meta.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{meta.description}</p>
        </div>

        <dl className="grid gap-1.5 text-xs">
          <div className="flex items-center gap-2">
            <dt className="w-28 text-muted-foreground shrink-0">Title</dt>
            <dd className="flex-1 truncate">{meta.title}</dd>
            {lengthBadge(meta.title.length, TITLE_MAX)}
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-28 text-muted-foreground shrink-0">Description</dt>
            <dd className="flex-1 truncate">{meta.description}</dd>
            {lengthBadge(meta.description.length, DESC_MAX, DESC_MIN)}
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-28 text-muted-foreground shrink-0">Canonical</dt>
            <dd className="flex-1 truncate font-mono">{canonical}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-28 text-muted-foreground shrink-0">og:title</dt>
            <dd className="flex-1 truncate">{meta.ogTitle}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-28 text-muted-foreground shrink-0">og:image</dt>
            <dd className="flex-1 truncate font-mono">{meta.ogImage}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-28 text-muted-foreground shrink-0">og:type</dt>
            <dd className="flex-1">{meta.ogType}</dd>
          </div>
          {meta.keywords && (
            <div className="flex items-start gap-2">
              <dt className="w-28 text-muted-foreground shrink-0">Keywords</dt>
              <dd className="flex-1 break-words">{meta.keywords}</dd>
            </div>
          )}
        </dl>

        <details className="rounded-md border p-2">
          <summary className="cursor-pointer text-xs font-medium">
            JSON-LD ({entry.jsonLd.map((j) => j["@type"]).join(", ")})
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px]">
            {JSON.stringify(entry.jsonLd, null, 2)}
          </pre>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() => copy(JSON.stringify(entry.jsonLd, null, 2))}
          >
            <Copy className="w-3.5 h-3.5 mr-1" /> কপি
          </Button>
        </details>
      </CardContent>
    </Card>
  );
};

/**
 * One-stop pre-publish preview: meta title, description, OpenGraph, canonical
 * and JSON-LD for every category/section page and every product.
 */
const SeoPreview = () => {
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState<CanonicalOverride[]>([]);

  useEffect(() => {
    fetchCanonicalOverrides()
      .then(setOverrides)
      .catch(() => setOverrides([]));
  }, []);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["seo-preview-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, price, sale_price, image_url, category, meta_title, meta_description, tags")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const pageEntries = useMemo(() => ALL_META.map(staticEntry), []);
  const productEntries = useMemo(() => products.map(productEntry), [products]);

  const match = (e: PreviewEntry) =>
    !search ||
    `${e.label} ${e.meta.title} ${e.meta.path}`.toLowerCase().includes(search.toLowerCase());

  const filteredPages = pageEntries.filter(match);
  const filteredProducts = productEntries.filter(match);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Eye className="w-5 h-5" /> SEO Preview
            </h1>
            <p className="text-sm text-muted-foreground">
              প্রকাশের আগে প্রতিটি পেজ ও প্রোডাক্টের meta, OpenGraph, canonical এবং JSON-LD এক জায়গায় দেখুন।
            </p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="পেজ বা প্রোডাক্ট খুঁজুন..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Tabs defaultValue="pages">
          <TabsList>
            <TabsTrigger value="pages">পেজ ও ক্যাটাগরি ({filteredPages.length})</TabsTrigger>
            <TabsTrigger value="products">প্রোডাক্ট ({filteredProducts.length})</TabsTrigger>
            <TabsTrigger value="tools">Indexing ও Canonical</TabsTrigger>
          </TabsList>

          <TabsContent value="pages" className="mt-4 grid gap-3 lg:grid-cols-2">
            {filteredPages.map((e) => (
              <EntryCard key={e.key} entry={e} canonical={resolveCanonical(e.meta.path, overrides)} />
            ))}
          </TabsContent>

          <TabsContent value="products" className="mt-4 grid gap-3 lg:grid-cols-2">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">লোড হচ্ছে...</p>
            ) : filteredProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">কোনো প্রোডাক্ট পাওয়া যায়নি।</p>
            ) : (
              filteredProducts.map((e) => (
                <EntryCard key={e.key} entry={e} canonical={resolveCanonical(e.meta.path, overrides)} />
              ))
            )}
          </TabsContent>

          <TabsContent value="tools" className="mt-4 space-y-4">
            <IndexingRequestCard />
            <CanonicalBulkUpdater />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">নোট</CardTitle>
                <CardDescription>
                  Canonical override প্রয়োগ করলে উপরের প্রিভিউতে সাথে সাথেই নতুন canonical দেখা যাবে।
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default SeoPreview;
