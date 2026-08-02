import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";

import SEOHead from "@/components/seo/SEOHead";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import StructuredData from "@/components/seo/StructuredData";
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

  const {
    data: productPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loading,
  } = useInfiniteQuery({
    queryKey: ["shop-products", selectedCategory, searchQuery, priceRange, sortBy, selectedMaterial],
    queryFn: async ({ pageParam = 0 }) => {
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
    initialPageParam: 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const allProducts = useMemo(() => {
    const seen = new Set<string>();
    const flat = productPages?.pages.flatMap((p) => p.products) || [];
    return flat.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [productPages]);
  const totalCount = productPages?.pages[0]?.totalCount ?? 0;

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
  // Per-category unique titles to prevent SERP duplicates.
  const categoryTitleMap: Record<string, { title: string; desc: string; kw: string }> = {
    Abaya:   { title: "Dubai Imported Abaya Bangladesh – Custom Size Abaya",              desc: "Dubai imported abaya Bangladesh — Four part abaya Bangladesh, two part Farasha borka, Korean Nida borka price ও custom size abaya Bangladesh। Cash on delivery borka, সারা দেশে ডেলিভারি।",           kw: "Dubai Imported Abaya Bangladesh, Four Part Abaya Bangladesh, Custom Size Abaya Bangladesh, Two Part Farasha Borka, Korean Nida Borka Price, Online Borka Shopping in Bangladesh, Cash on Delivery Borka" },
    Borka:   { title: "Best Borka Shop in Bangladesh – Dubai Borka Price", desc: "Best borka shop in Bangladesh — original Dubai borka in Bangladesh, luxury borka Bangladesh, premium black borka, plus size borka Bangladesh, bridal borka price in Bangladesh ও party borka under 5000। Cash on delivery borka।",                          kw: "Dubai Borka Price in Bangladesh, Original Dubai Borka in Bangladesh, Best Borka Shop in Bangladesh, Luxury Borka Bangladesh, Premium Black Borka, Dubai Cherry Fabric Borka, Party Borka Under 5000, Bridal Borka Price in Bangladesh, Comfortable Borka for Summer, Plus Size Borka Bangladesh, Borka Shop in Dhaka, Wholesale Borka in Bangladesh" },
    Hijab:   { title: "Borka With Matching Hijab – Hijab Shop Bangladesh",                  desc: "Borka with matching hijab ও Hajj borka with hijab — দুবাই ইম্পোর্টেড হিজাব ও স্কার্ফ, সিল্ক, শিফন, জর্জেট। Online borka shopping in Bangladesh, cash on delivery।",                          kw: "Borka With Matching Hijab, Hajj Borka With Hijab, Online Borka Shopping in Bangladesh, Cash on Delivery Borka" },
    Kaftan:  { title: "Party Borka Under 5000 – Kaftan & Party Wear BD",              desc: "Party borka under 5000 ও bridal borka price in Bangladesh — প্রিমিয়াম দুবাই কাফতান ও পার্টি ওয়্যার, স্টোন, বিডস ও এমব্রয়ডারি ডিটেইল।",                                       kw: "Party Borka Under 5000, Bridal Borka Price in Bangladesh, Luxury Borka Bangladesh, Dubai Cherry Fabric Borka" },
  };
  const isAll = selectedCategory === "All";
  const seoTitle = isAll
    ? "Best Borka Shop in Bangladesh – Dubai Borka Price & Abaya"
    : (categoryTitleMap[catEn]?.title || `${catEn} Collection – Dubai Borka House`);
  const seoDescription = isAll
    ? "Best borka shop in Bangladesh — original Dubai borka in Bangladesh, Dubai imported abaya Bangladesh, luxury borka Bangladesh, plus size ও custom size abaya। Online borka shopping in Bangladesh, cash on delivery borka, borka shop in Dhaka ও wholesale borka in Bangladesh।"
    : (categoryTitleMap[catEn]?.desc || `${catBn} অনলাইনে কিনুন — Dubai Borka House।`);
  const seoKeywords = isAll
    ? "Dubai Borka Price in Bangladesh, Original Dubai Borka in Bangladesh, Best Borka Shop in Bangladesh, Luxury Borka Bangladesh, Premium Black Borka, Dubai Imported Abaya Bangladesh, Two Part Farasha Borka, Four Part Abaya Bangladesh, Borka With Matching Hijab, Korean Nida Borka Price, Dubai Cherry Fabric Borka, Party Borka Under 5000, Bridal Borka Price in Bangladesh, Comfortable Borka for Summer, Plus Size Borka Bangladesh, Custom Size Abaya Bangladesh, Hajj Borka With Hijab, Online Borka Shopping in Bangladesh, Cash on Delivery Borka, Borka Shop in Dhaka, Wholesale Borka in Bangladesh"
    : (categoryTitleMap[catEn]?.kw || `${catEn} bangladesh, buy ${catEn.toLowerCase()} online`);


  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: selectedCategory === "All"
      ? "সকল প্রোডাক্ট — দুবাই বোরকা হাউস"
      : `${catBn} কালেকশন — দুবাই বোরকা হাউস`,
    description: seoDescription,
    url: `https://dubaiborkahouse.com/shop${selectedCategory !== "All" ? `?category=${selectedCategory}` : ""}`,
    numberOfItems: totalCount,
    provider: { "@type": "Organization", name: "Dubai Borka House" },
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title={seoTitle} description={seoDescription} canonical="/shop" keywords={seoKeywords} />
      <StructuredData data={collectionSchema} />
      <Header />
      <Breadcrumbs />
      <main className="pt-4 pb-20">
        <div className="bg-card border-b border-border py-8 md:py-12 mb-6 md:mb-8">
          <div className="container mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-center">
              <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-2 md:mb-4">
                <span className="text-foreground">Borka &amp; Abaya Shop </span>
                <span className="text-gradient-gold">Bangladesh</span>
              </h1>
              <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-base">
                Premium borka Bangladesh ও premium abaya Bangladesh — Dubai imported abaya Bangladesh,
                Farasha abaya, Nida abaya, Karchupi borka, kaftan shop ও hijab shop Bangladesh এক জায়গায়।
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
            </>
          )}

          <RecentlyViewed productIds={recentlyViewed} />
        </div>
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
