import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Crown, ArrowRight } from "lucide-react";
import { type Product, getProductImage } from "@/types/product";
import {
  useImageRotationTick,
  useShuffleSeed,
  useProductAlternateImages,
  seededShuffle,
} from "@/hooks/useProductRotation";

/**
 * PremiumDubaiCollection
 * Curated high-tier products (top price range) presented as the flagship
 * "Dubai premium" showcase on the homepage. Uses the same product-card
 * pattern as NewArrivals/TrendingProducts for visual consistency.
 */
const PREMIUM_MIN_PRICE = 7000;

const PremiumDubaiCollection = () => {
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["premium-dubai-collection"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select(
          "id, name, price, sale_price, image_url, category, slug, sizes, colors, stock, material, description, video_url"
        )
        .gte("price", PREMIUM_MIN_PRICE)
        .order("price", { ascending: false })
        .limit(16);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const tick = useImageRotationTick();
  const shuffleSeed = useShuffleSeed();
  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const { data: altImages } = useProductAlternateImages(productIds);

  const displayProducts = useMemo(
    () => seededShuffle(products, shuffleSeed + 7).slice(0, 8),
    [products, shuffleSeed]
  );

  const pickImage = (product: Product) => {
    const main = getProductImage(product);
    const alts = altImages?.[product.id] || [];
    const all = [main, ...alts.filter((u) => u && u !== main)];
    if (all.length <= 1) return main;
    let hash = 0;
    for (let i = 0; i < product.id.length; i++)
      hash = (hash * 31 + product.id.charCodeAt(i)) | 0;
    return all[Math.abs(hash + tick) % all.length];
  };

  if (displayProducts.length === 0) return null;

  return (
    <section className="py-12 md:py-16 bg-gradient-to-b from-muted/40 to-background">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
          <div>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold mb-3">
              <Crown className="w-4 h-4" /> Premium Dubai Collection
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
              Dubai abaya collection Bangladesh — প্রিমিয়াম বোরকা বাংলাদেশ
            </h2>
            <p className="text-muted-foreground mt-1 text-sm md:text-base max-w-2xl">
              Dubai imported abaya Bangladesh — Farasha abaya Bangladesh, 2 part Farasha abaya,
              Dubai imported Nida abaya ও Dubai imported black abaya। Karchupi borka Bangladesh সহ
              premium abaya Bangladesh কালেকশন।
            </p>
          </div>
          <Link
            to="/shop?sort=price-desc"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            সব দেখুন <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {displayProducts.map((product) => (
            <Link
              key={product.id}
              to={`/product/${product.slug || product.id}`}
              className="group relative rounded-xl overflow-hidden bg-card border border-border hover:shadow-lg transition-all duration-300"
            >
              <div className="aspect-[3/4] overflow-hidden">
                <img
                  src={pickImage(product)}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              </div>
              <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs inline-flex items-center gap-1">
                <Crown className="w-3 h-3" /> Premium
              </Badge>
              <div className="p-3">
                <h3 className="text-sm font-medium text-foreground truncate">
                  {product.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  {product.sale_price ? (
                    <>
                      <span className="text-primary font-bold text-sm">
                        ৳{product.sale_price.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground line-through text-xs">
                        ৳{product.price.toLocaleString()}
                      </span>
                    </>
                  ) : (
                    <span className="text-primary font-bold text-sm">
                      ৳{product.price.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PremiumDubaiCollection;
