import { useMemo, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, ShoppingBag } from "lucide-react";

import SEOHead from "@/components/seo/SEOHead";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import StructuredData, { breadcrumbSchema } from "@/components/seo/StructuredData";
import KeywordLinksBlock from "@/components/seo/KeywordLinksBlock";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProductCard from "@/components/shop/ProductCard";
import QuickViewModal from "@/components/shop/QuickViewModal";
import { Button } from "@/components/ui/button";

import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { getLandingPage } from "@/lib/seo/keywordLandingPages";
import { type Product, getProductImage } from "@/types/product";

const BASE_URL = "https://dubaiborkahouse.com";
const LIMIT = 24;

const KeywordLanding = () => {
  const { slug } = useParams();
  const page = getLandingPage(slug);

  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["keyword-landing", page?.slug],
    enabled: !!page,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select(
          "id, name, price, sale_price, image_url, category, sizes, colors, description, stock, slug, material",
        );
      if (page!.category !== "All") query = query.ilike("category", page!.category);
      if (page!.maxPrice) query = query.lte("price", page!.maxPrice);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(LIMIT);
      if (error) throw error;
      return (data as Product[]) || [];
    },
  });

  const canonicalPath = page ? `/collections/${page.slug}` : "/";

  const schemas = useMemo(() => {
    if (!page) return [];
    const url = `${BASE_URL}${canonicalPath}`;
    const collection = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${url}#collection`,
      name: page.h1,
      headline: page.h1,
      description: page.description,
      url,
      inLanguage: "bn",
      isPartOf: { "@type": "WebSite", name: "Dubai Borka House", url: BASE_URL },
      about: [page.primaryKeyword, ...page.secondaryKeywords].map((k) => ({
        "@type": "Thing",
        name: k,
      })),
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: products.length,
        itemListElement: products.slice(0, 20).map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Product",
            name: p.name,
            url: `${BASE_URL}/product/${p.slug || p.id}`,
            image: getProductImage(p),
            category: p.category,
            brand: { "@type": "Brand", name: "Dubai Borka House" },
            offers: {
              "@type": "Offer",
              price: p.sale_price || p.price,
              priceCurrency: "BDT",
              availability:
                (p.stock ?? 0) > 0
                  ? "https://schema.org/InStock"
                  : "https://schema.org/PreOrder",
              url: `${BASE_URL}/product/${p.slug || p.id}`,
            },
          },
        })),
      },
    };
    const crumbs = breadcrumbSchema([
      { name: "Home", url: "/" },
      { name: "Collections", url: "/categories" },
      { name: page.primaryKeyword, url: canonicalPath },
    ]);
    return [collection, crumbs];
  }, [page, products, canonicalPath]);

  if (!page) return <Navigate to="/shop" replace />;

  const handleAddToCart = async (product: Product) => {
    await addToCart(product.id, 1, product.sizes?.[0] || undefined, product.colors?.[0] || undefined);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={page.title}
        fullTitle
        description={page.description}
        canonical={canonicalPath}
        keywords={[page.primaryKeyword, ...page.secondaryKeywords].join(", ")}
      />
      {schemas.map((s, i) => (
        <StructuredData key={i} data={s as Record<string, unknown>} />
      ))}
      <Header />
      <Breadcrumbs />

      <main className="pt-2 pb-16">
        <section className="bg-card border-b border-border py-8 md:py-12 mb-6">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="max-w-3xl"
            >
              {/* H1 comes from the same config object as <title>, so heading and
                  metadata can never drift apart. */}
              <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-3">
                <span className="text-gradient-gold">{page.h1}</span>
              </h1>
              <p className="text-muted-foreground text-sm md:text-base mb-4">{page.intro}</p>
              <ul className="space-y-1.5 mb-5">
                {page.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              <Button asChild>
                <Link to={`/shop${page.category !== "All" ? `?category=${page.category}` : ""}`}>
                  <ShoppingBag className="w-4 h-4 mr-2" /> সব প্রোডাক্ট দেখুন
                </Link>
              </Button>
            </motion.div>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <h2 className="text-xl md:text-2xl font-display font-bold mb-4">
            {page.primaryKeyword} — কালেকশন
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <p className="text-muted-foreground py-8">
              এই কালেকশনে এখন কোনো প্রোডাক্ট নেই — শীঘ্রই নতুন স্টক আসছে।
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {products.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={i}
                  gridView
                  isInWishlist={isInWishlist(product.id)}
                  isInCompare={false}
                  categoryBnName={product.category || ""}
                  onAddToCart={handleAddToCart}
                  onQuickView={(p) => {
                    setQuickViewProduct(p);
                    setQuickViewOpen(true);
                  }}
                  onToggleWishlist={toggleWishlist}
                  onToggleCompare={() => {}}
                />
              ))}
            </div>
          )}
        </section>

        <KeywordLinksBlock
          title="সম্পর্কিত কালেকশন"
          slugs={page.related}
          excludeSlug={page.slug}
          className="mt-12"
        />
        <KeywordLinksBlock title="সব কালেকশন ব্রাউজ করুন" excludeSlug={page.slug} className="bg-background" />
      </main>

      <QuickViewModal
        product={quickViewProduct}
        open={quickViewOpen}
        onOpenChange={setQuickViewOpen}
      />

      <Footer />
    </div>
  );
};

export default KeywordLanding;
