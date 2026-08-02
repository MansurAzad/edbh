import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";

import SEOHead from "@/components/seo/SEOHead";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import StructuredData, { faqSchema, breadcrumbSchema } from "@/components/seo/StructuredData";
import KeywordLinksBlock from "@/components/seo/KeywordLinksBlock";
import { getCategoryMeta } from "@/lib/seo/metaGenerator";
import { getCategoryFaqs } from "@/lib/seo/faqs";


import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Input } from "@/components/ui/input";
import SizeGuide from "@/components/shop/SizeGuide";
import QuickViewModal from "@/components/shop/QuickViewModal";
import ProductCompare from "@/components/shop/ProductCompare";
import RecentlyViewed from "@/components/shop/RecentlyViewed";
import ProductCard from "@/components/shop/ProductCard";
import ShopToolbar from "@/components/shop/ShopToolbar";
import ShopFilters from "@/components/shop/ShopFilters";

import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useToast } from "@/hooks/use-toast";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { useShopMetadata } from "@/hooks/queries/useShopMetadata";
import { type Product, getProductImage } from "@/types/product";

const sortOptions = [
  { value: "newest", label: "Newest First" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "name", label: "Name" },
];

const PAGE_SIZE = 12;

const categoryBengaliNames: Record<string, string> = {
  Abaya: "আবায়া",
  Borka: "বোরকা",
  Hijab: "হিজাব",
  Kaftan: "কাফতান",
  Scarf: "স্কার্ফ",
  Fabric: "ফেব্রিক",
};

const getSortConfig = (sortBy: string) => {
  switch (sortBy) {
    case "price-low": return { column: "price" as const, ascending: true };
    case "price-high": return { column: "price" as const, ascending: false };
    case "name": return { column: "name" as const, ascending: true };
    default: return { column: "created_at" as const, ascending: false };
  }
};

const Shop = () => {
  const [searchParams] = useSearchParams();
  const urlCategory = searchParams.get("category") || "All";
  const urlMaxPrice = Number(searchParams.get("maxPrice")) || 0;

  const [selectedCategory, setSelectedCategory] = useState(urlCategory);
  const [showFilters, setShowFilters] = useState(false);
  const [gridView, setGridView] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [priceRange, setPriceRange] = useState([0, urlMaxPrice > 0 ? urlMaxPrice : 50000]);
  const [sortBy, setSortBy] = useState("newest");
  const [selectedMaterial, setSelectedMaterial] = useState("All");

  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [compareList, setCompareList] = useState<Product[]>([]);

  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { toast } = useToast();
  const { recentlyViewed } = useRecentlyViewed();
  const { categories, ratings, materials, maxPrice } = useShopMetadata();

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedCategory(urlCategory);
  }, [urlCategory]);

  useEffect(() => {
    if (urlMaxPrice > 0) {
      setPriceRange([0, urlMaxPrice]);
    }
  }, [urlMaxPrice]);

  // Crawler-friendly pagination: ?page=N is a real entry point into the list.
  const initialPage = Math.max(1, Number(searchParams.get("page")) || 1);

  const {
    data: productPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loading,
  } = useInfiniteQuery({
    queryKey: ["shop-products", selectedCategory, searchQuery, priceRange, sortBy, selectedMaterial, initialPage],
    queryFn: async ({ pageParam = initialPage - 1 }) => {
      const { column, ascending } = getSortConfig(sortBy);
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("products")
        .select(
          "id, name, price, sale_price, image_url, category, sizes, colors, description, stock, slug, material",
          { count: "exact" }
        );

      if (selectedCategory !== "All") query = query.ilike("category", selectedCategory);
      if (searchQuery.trim()) query = query.ilike("name", `%${searchQuery.trim()}%`);
      if (selectedMaterial !== "All") query = query.eq("material", selectedMaterial);

      query = query.or(`price.gte.${priceRange[0]},sale_price.gte.${priceRange[0]}`);
      query = query.or(`price.lte.${priceRange[1]},sale_price.lte.${priceRange[1]}`);

      query = query.order(column, { ascending }).range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { products: (data as Product[]) || [], totalCount: count || 0, page: pageParam };
    },
    getNextPageParam: (lastPage) => {
      const nextPage = lastPage.page + 1;
      if (nextPage * PAGE_SIZE >= lastPage.totalCount) return undefined;
      return nextPage;
    },
    initialPageParam: initialPage - 1,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const allProducts = useMemo(() => {
    const seen = new Set<string>();
    const flat = productPages?.pages.flatMap((p) => p.products) || [];
    return flat.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [productPages]);
  const totalCount = productPages?.pages[0]?.totalCount ?? 0;

  // --- Pagination metadata for canonical / rel=prev|next / JSON-LD ---
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(
    totalPages,
    initialPage + Math.max(0, (productPages?.pages.length ?? 1) - 1)
  );
  const pageQuery = useMemo(
    () => ({ category: urlCategory !== "All" ? urlCategory : undefined }),
    [urlCategory]
  );
  const pageUrl = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      if (pageQuery.category) params.set("category", pageQuery.category);
      if (p > 1) params.set("page", String(p));
      const qs = params.toString();
      return `/shop${qs ? `?${qs}` : ""}`;
    },
    [pageQuery]
  );


  // Infinite scroll observer
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, { rootMargin: "200px" });
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [handleObserver]);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("All");
    setPriceRange([0, maxPrice]);
    setSortBy("newest");
    setSelectedMaterial("All");
  };

  const hasActiveFilters =
    !!searchQuery ||
    selectedCategory !== "All" ||
    priceRange[0] > 0 ||
    priceRange[1] < maxPrice ||
    selectedMaterial !== "All";

  const handleAddToCart = async (product: Product) => {
    const defaultSize = product.sizes?.[0] || undefined;
    const defaultColor = product.colors?.[0] || undefined;
    await addToCart(product.id, 1, defaultSize, defaultColor);
  };

  const handleQuickView = (product: Product) => {
    setQuickViewProduct(product);
    setQuickViewOpen(true);
  };

  const toggleCompare = (product: Product) => {
    setCompareList((prev) => {
      if (prev.find((p) => p.id === product.id)) return prev.filter((p) => p.id !== product.id);
      if (prev.length >= 4) {
        toast({ title: "Maximum 4 products can be compared", variant: "destructive" });
        return prev;
      }
      return [...prev, product];
    });
  };

  const getCategoryBnName = (name: string) => {
    const found = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    return found?.name_bn || categoryBengaliNames[name] || name;
  };

  const catBn = getCategoryBnName(selectedCategory);
  const catEn = selectedCategory;
  const isAll = selectedCategory === "All";
  // Titles/descriptions/keywords come from the central generator so every
  // category stays unique and keeps the evergreen brand keywords.
  const categoryMeta = getCategoryMeta(catEn);
  const seoTitle = categoryMeta.title;
  const seoDescription = categoryMeta.description;
  const seoKeywords = categoryMeta.keywords;



  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: selectedCategory === "All"
      ? "সকল প্রোডাক্ট — দুবাই বোরকা হাউস"
      : `${catBn} কালেকশন — দুবাই বোরকা হাউস`,
    description: seoDescription,
    url: `https://dubaiborkahouse.com/shop${selectedCategory !== "All" ? `?category=${selectedCategory}` : ""}`,
    numberOfItems: totalCount,
    inLanguage: "bn",
    provider: { "@type": "Organization", name: "Dubai Borka House" },
    // Product-level rich-snippet data for the visible grid.
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: allProducts.length,
      itemListElement: allProducts.slice(0, 20).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Product",
          name: p.name,
          url: `https://dubaiborkahouse.com/product/${p.slug || p.id}`,
          image: getProductImage(p),
          category: p.category,
          brand: { "@type": "Brand", name: "Dubai Borka House" },
          offers: {
            "@type": "Offer",
            price: p.sale_price || p.price,
            priceCurrency: "BDT",
            availability:
              (p.stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
            url: `https://dubaiborkahouse.com/product/${p.slug || p.id}`,
          },
        },
      })),
    },
  };


  return (
    <div className="min-h-screen bg-background">
      <SEOHead title={seoTitle} fullTitle description={seoDescription} canonical="/shop" keywords={seoKeywords} />
      <StructuredData data={collectionSchema} />
      <StructuredData
        data={breadcrumbSchema(
          isAll
            ? [{ name: "Home", url: "/" }, { name: "Shop", url: "/shop" }]
            : [
                { name: "Home", url: "/" },
                { name: "Shop", url: "/shop" },
                { name: catEn, url: `/shop?category=${catEn}` },
              ]
        )}
      />
      <StructuredData data={faqSchema(getCategoryFaqs(catEn))} />

      <Header />
      <Breadcrumbs />
      <main className="pt-4 pb-20">
        <div className="bg-card border-b border-border py-8 md:py-12 mb-6 md:mb-8">
          <div className="container mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-center">
              <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-2 md:mb-4">
                <span className="text-foreground">Best Borka Shop in </span>
                <span className="text-gradient-gold">Bangladesh</span>
              </h1>
              <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-base">
                Original Dubai borka in Bangladesh — luxury borka Bangladesh, premium black borka,
                two part Farasha borka, four part abaya, Korean Nida borka, plus size ও custom size abaya।
                Online borka shopping in Bangladesh, cash on delivery borka।
              </p>

            </motion.div>
          </div>
        </div>

        <div className="container mx-auto px-4">
          {/* Search Bar + Size Guide */}
          <div className="mb-4 md:mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 h-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <SizeGuide />
          </div>

          <ShopToolbar
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            sortBy={sortBy}
            onSortChange={setSortBy}
            sortOptions={sortOptions}
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters((v) => !v)}
            gridView={gridView}
            onSetGridView={setGridView}
          />

          {showFilters && (
            <ShopFilters
              priceRange={priceRange}
              onPriceRangeChange={setPriceRange}
              maxPrice={maxPrice}
              materials={materials}
              selectedMaterial={selectedMaterial}
              onMaterialChange={setSelectedMaterial}
              hasActiveFilters={hasActiveFilters}
              onClear={clearFilters}
            />
          )}

          {/* Results Count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-muted-foreground">
              Showing <span className="text-foreground font-medium">{allProducts.length}</span> of{" "}
              <span className="text-foreground font-medium">{totalCount}</span> products
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-sm text-primary hover:underline">
                Clear All Filters
              </button>
            )}
          </div>

          {/* Products Grid */}
          {loading ? (
            <div className="grid gap-3 md:gap-6 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[3/4] bg-muted rounded-xl mb-3" />
                  <div className="h-3 bg-muted rounded w-1/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : allProducts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground text-lg mb-4">No products found.</p>
              <button onClick={clearFilters} className="btn-gold">Clear Filters</button>
            </div>
          ) : (
            <>
              <div
                className={`grid ${
                  gridView
                    ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6"
                    : "grid-cols-1 gap-4"
                }`}
              >
                {allProducts.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    index={index}
                    gridView={gridView}
                    rating={ratings[product.id]}
                    isInWishlist={isInWishlist(product.id)}
                    isInCompare={compareList.some((p) => p.id === product.id)}
                    categoryBnName={getCategoryBnName(product.category)}
                    onAddToCart={handleAddToCart}
                    onQuickView={handleQuickView}
                    onToggleWishlist={toggleWishlist}
                    onToggleCompare={toggleCompare}
                  />
                ))}
              </div>

              {hasNextPage && (
                <div ref={loadMoreRef} className="py-8 flex justify-center">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* Crawler-friendly pagination links (also usable without JS) */}
              {totalPages > 1 && (
                <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-4 text-sm">
                  {currentPage > 1 ? (
                    <a href={pageUrl(currentPage - 1)} rel="prev" className="text-primary hover:underline">
                      ← আগের পৃষ্ঠা
                    </a>
                  ) : <span />}
                  <span className="text-muted-foreground">
                    পৃষ্ঠা {currentPage} / {totalPages}
                  </span>
                  {currentPage < totalPages ? (
                    <a href={pageUrl(currentPage + 1)} rel="next" className="text-primary hover:underline">
                      পরের পৃষ্ঠা →
                    </a>
                  ) : <span />}
                </nav>
              )}
            </>
          )}


          <RecentlyViewed productIds={recentlyViewed} />
        </div>
        {/* Visible FAQ backing the FAQPage JSON-LD */}
        <section className="container mx-auto px-4 mt-12" aria-labelledby="shop-faq-heading">
          <h2 id="shop-faq-heading" className="font-display text-xl md:text-2xl font-bold mb-4">
            সাধারণ জিজ্ঞাসা
          </h2>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {getCategoryFaqs(catEn).map((faq) => (
              <details key={faq.question} className="group p-4">
                <summary className="cursor-pointer font-medium text-foreground list-none">{faq.question}</summary>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <KeywordLinksBlock title="কীওয়ার্ড অনুযায়ী কালেকশন" className="mt-10" />

      </main>

      <Footer />

      {quickViewProduct && (
        <QuickViewModal product={quickViewProduct} open={quickViewOpen} onOpenChange={setQuickViewOpen} />
      )}
      {compareList.length > 0 && (
        <ProductCompare
          compareList={compareList}
          onRemove={(id) => setCompareList((prev) => prev.filter((p) => p.id !== id))}
          onClear={() => setCompareList([])}
          getProductImage={getProductImage}
        />
      )}
    </div>
  );
};

export default Shop;
