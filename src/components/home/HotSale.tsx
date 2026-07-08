/**
 * HotSale — homepage best-seller / hot-deal grid.
 *
 * Sourcing:
 *   - `mode:"manual"` → fetches products listed in `manual_ids` (preserves admin order).
 *   - `mode:"auto"` → 3-tier fallback:
 *       1) sale_price NOT NULL + stock > 0
 *       2) featured=true + stock > 0
 *       3) newest in-stock
 *   - If all tiers return nothing, section hides itself.
 *
 * A/B: variant assigned deterministically per client_id (variant A default).
 * Telemetry: impression (IntersectionObserver, once per mount), product_click,
 * add_to_cart, and downstream checkout attribution via sessionStorage.
 */
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Flame, Heart, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type Product, getProductImage } from "@/types/product";
import StockBadge from "@/components/shop/StockBadge";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import {
  parseHotSaleConfig, pickVariant, trackHotSale, markHotSaleClick,
} from "@/lib/hotSaleTracking";

interface HotSaleProps {
  sectionData?: { title?: string | null; subtitle?: string | null; content?: string | null };
}

const SELECT = "id, name, price, sale_price, image_url, category, sizes, colors, slug, stock, featured";

interface HotSaleQueryResult { products: Product[]; source: "manual" | "sale" | "featured" | "newest" | "empty"; }

const fetchHotSale = async (manualIds: string[], mode: "auto" | "manual"): Promise<HotSaleQueryResult> => {
  if (mode === "manual" && manualIds.length > 0) {
    const { data } = await supabase.from("products").select(SELECT).in("id", manualIds);
    // Preserve admin-defined order
    const map = new Map<string, Product>((data || []).map((p: any) => [p.id, p as Product]));
    const ordered = manualIds.map(id => map.get(id)).filter(Boolean) as Product[];
    if (ordered.length > 0) return { products: ordered.slice(0, 12), source: "manual" };
  }
  const { data: sale } = await supabase.from("products").select(SELECT)
    .not("sale_price", "is", null).gt("stock", 0).order("created_at", { ascending: false }).limit(12);
  if (sale && sale.length >= 4) return { products: sale as Product[], source: "sale" };

  const { data: feat } = await supabase.from("products").select(SELECT)
    .eq("featured", true).gt("stock", 0).order("created_at", { ascending: false }).limit(12);
  const combined = [...(sale || []), ...(feat || [])];
  const seen = new Set<string>();
  const uniq = combined.filter((p: any) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  if (uniq.length >= 4) return { products: uniq.slice(0, 12) as Product[], source: "featured" };

  const { data: newest } = await supabase.from("products").select(SELECT)
    .gt("stock", 0).order("created_at", { ascending: false }).limit(12);
  return { products: (newest || []) as Product[], source: newest && newest.length ? "newest" : "empty" };
};

const HotSale = ({ sectionData }: HotSaleProps) => {
  const config = useMemo(() => parseHotSaleConfig(sectionData?.content), [sectionData?.content]);
  const variant = useMemo(() => pickVariant(config.ab_test), [config.ab_test]);
  const vcfg = variant === "B" ? config.variant_b : config.variant_a;
  // Admin overrides via site_content title/subtitle still win when set
  const heading = sectionData?.title || vcfg.title;
  const sub = sectionData?.subtitle || vcfg.subtitle;

  const { data, isLoading } = useQuery({
    queryKey: ["home-hot-sale", config.mode, config.manual_ids.join(",")],
    queryFn: () => fetchHotSale(config.manual_ids, config.mode),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
  const products = data?.products ?? [];
  const source = data?.source ?? "empty";

  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const navigate = useNavigate();

  const sectionRef = useRef<HTMLElement | null>(null);
  const firedImpressionRef = useRef(false);
  useEffect(() => {
    if (firedImpressionRef.current || products.length === 0) return;
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !firedImpressionRef.current) {
          firedImpressionRef.current = true;
          trackHotSale("hot_sale_impression", {
            variant, source, count: products.length,
            product_ids: products.map(p => p.id),
          });
          io.disconnect();
        }
      });
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [products, variant, source]);

  if (!isLoading && products.length === 0) return null;

  const handleClick = (product: Product, position: number) => {
    trackHotSale("hot_sale_product_click", { variant, source, position, product_id: product.id, product_name: product.name });
    markHotSaleClick(variant, product.id);
  };
  const handleAdd = async (product: Product, position: number) => {
    trackHotSale("hot_sale_add_to_cart", {
      variant, source, position, product_id: product.id, product_name: product.name,
      value: product.sale_price || product.price,
    });
    markHotSaleClick(variant, product.id);
    await addToCart(product.id, 1, product.sizes?.[0] || undefined, product.colors?.[0] || undefined);
  };

  const gridCols = vcfg.grid_cols === 3
    ? "grid-cols-2 md:grid-cols-3"
    : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  const badgeCls = vcfg.badge_style === "outline"
    ? "border border-destructive text-destructive bg-background/90"
    : "bg-destructive text-destructive-foreground";

  return (
    <section ref={sectionRef} data-hot-sale-variant={variant} className="py-10 md:py-14 bg-gradient-to-br from-destructive/5 via-background to-primary/5">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-6 md:mb-10">
          <div>
            <div className="inline-flex items-center gap-2 bg-destructive/10 text-destructive px-3 py-1 rounded-full text-xs font-bold mb-2">
              <Flame className="w-3.5 h-3.5" /> Limited Time
            </div>
            <h2 className="font-display text-2xl md:text-4xl font-bold text-foreground">{heading}</h2>
            <p className="text-sm text-muted-foreground mt-1">{sub}</p>
          </div>
          <Link
            to="/shop?sale=true"
            onClick={() => trackHotSale("hot_sale_view_products", { variant, source })}
            className="text-primary font-medium text-sm md:text-base gold-underline"
          >
            {vcfg.cta}
          </Link>
        </div>

        {isLoading ? (
          <div className={`grid ${gridCols} gap-3 md:gap-5`}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[3/4] bg-muted rounded-xl mb-2" />
                <div className="h-3 bg-muted rounded w-3/4 mb-1" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className={`grid ${gridCols} gap-3 md:gap-5`}>
            {products.map((product, index) => {
              const discount = product.sale_price
                ? Math.round(((product.price - product.sale_price) / product.price) * 100)
                : 0;
              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24) }}
                  className="group"
                >
                  <div className="card-luxury overflow-hidden">
                    <div
                      className="relative aspect-[3/4] overflow-hidden rounded-xl mb-2 md:mb-3 cursor-pointer"
                      onClick={() => { handleClick(product, index); navigate(`/product/${product.slug || product.id}`); }}
                    >
                      <img
                        src={getProductImage(product)}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy" decoding="async"
                      />
                      {discount > 0 && (
                        <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold shadow ${badgeCls}`}>
                          -{discount}%
                        </span>
                      )}
                      <div className="absolute bottom-2 left-2">
                        <StockBadge stock={product.stock} compact />
                      </div>
                      <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleWishlist(product.id); }}
                          className={`w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-colors ${
                            isInWishlist(product.id) ? "bg-primary text-primary-foreground" : "bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
                          }`}
                          aria-label="Wishlist"
                        >
                          <Heart className={`w-4 h-4 ${isInWishlist(product.id) ? "fill-current" : ""}`} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAdd(product, index); }}
                          className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-accent transition-colors"
                          aria-label="Add to cart"
                        >
                          <ShoppingBag className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-0.5 md:space-y-1">
                      <span className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider">{product.category}</span>
                      <Link
                        to={`/product/${product.slug || product.id}`}
                        onClick={() => handleClick(product, index)}
                      >
                        <h3 className="font-display text-xs md:text-base font-semibold text-foreground hover:text-primary transition-colors line-clamp-2">
                          {product.name}
                        </h3>
                      </Link>
                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="font-display text-sm md:text-lg font-bold text-gradient-gold">
                          ৳{(product.sale_price || product.price).toLocaleString()}
                        </span>
                        {product.sale_price && (
                          <span className="text-[10px] md:text-sm text-muted-foreground line-through">
                            ৳{product.price.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default HotSale;
