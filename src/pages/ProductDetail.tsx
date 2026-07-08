import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, ShoppingBag, Star, Truck, Shield, RotateCcw, Check, Bell, Smartphone } from "lucide-react";
import SocialShare from "@/components/shop/SocialShare";
import ProductGallery from "@/components/shop/ProductGallery";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import ProductReviews from "@/components/reviews/ProductReviews";
import SizeGuide from "@/components/shop/SizeGuide";
import SizeRecommendation from "@/components/shop/SizeRecommendation";
import PriceDropAlert from "@/components/shop/PriceDropAlert";
import RelatedProducts from "@/components/shop/RelatedProducts";
import RecentlyViewed from "@/components/shop/RecentlyViewed";
import BackInStockAlert from "@/components/shop/BackInStockAlert";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import StockCountdown from "@/components/marketing/StockCountdown";
import WhatsAppOrderButton from "@/components/marketing/WhatsAppOrderButton";
import FlashSaleTimer from "@/components/marketing/FlashSaleTimer";
import SEOHead from "@/components/seo/SEOHead";
import { buildProductSeo, buildProductJsonLd } from "@/lib/seo/config";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import StructuredData from "@/components/seo/StructuredData";
import { trackAddToCart, trackViewContent, trackContact } from "@/components/seo/AnalyticsTracker";
import PersonalizedRecommendations from "@/components/shop/PersonalizedRecommendations";
import { type Product, getProductImage as getProductImg, defaultFallbackImage } from "@/types/product";

interface ProductImage {
  id: string;
  image_url: string;
  alt_text: string | null;
}

interface Variant {
  id: string;
  size: string | null;
  color: string | null;
  stock: number;
  image_url: string | null;
  price_adjustment: number | null;
  sku: string | null;
}

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [showStockAlert, setShowStockAlert] = useState(false);
  const [reviewStats, setReviewStats] = useState<{ count: number; avg: number }>({ count: 0, avg: 0 });
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { toast } = useToast();
  const { recentlyViewed, addToRecentlyViewed } = useRecentlyViewed();

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;
      try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const query = isUUID 
          ? supabase.from("products").select("*").eq("id", id).maybeSingle()
          : supabase.from("products").select("*").eq("slug", id).maybeSingle();
        const { data, error } = await query;
        if (error) throw error;
        setProduct(data);
        if (data) {
          const [imgsRes, variantsRes, reviewsRes] = await Promise.all([
            supabase.from("product_images").select("id, image_url, alt_text").eq("product_id", data.id).order("display_order"),
            supabase.from("product_variants").select("id, size, color, stock, image_url, price_adjustment, sku").eq("product_id", data.id),
            supabase.from("product_reviews").select("rating").eq("product_id", data.id),
          ]);
          setProductImages(imgsRes.data || []);
          setVariants(variantsRes.data || []);
          
          const reviews = reviewsRes.data || [];
          if (reviews.length > 0) {
            const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
            setReviewStats({ count: reviews.length, avg });
          }
          
          addToRecentlyViewed(data.id);
          trackViewContent({ id: data.id, name: data.name, price: data.sale_price || data.price, category: data.category });
        }
      } catch (error) {
        console.error("Error fetching product:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  // Get the currently selected variant
  const getSelectedVariant = (): Variant | undefined => {
    if (variants.length === 0) return undefined;
    return variants.find(v => 
      (selectedColor ? v.color === selectedColor : true) && 
      (selectedSize ? v.size === selectedSize : true) &&
      (selectedColor || selectedSize) // at least one must be selected
    );
  };

  // Get current price including variant price adjustment
  const getCurrentPrice = (): number => {
    if (!product) return 0;
    const basePrice = product.sale_price || product.price;
    const variant = getSelectedVariant();
    if (variant?.price_adjustment) {
      return basePrice + variant.price_adjustment;
    }
    return basePrice;
  };

  // Get variant-specific stock
  const getVariantStock = (): number | null => {
    const variant = getSelectedVariant();
    if (variant) return variant.stock;
    if (selectedColor && !selectedSize) {
      // Sum stock for all sizes of this color
      const colorVariants = variants.filter(v => v.color === selectedColor);
      if (colorVariants.length > 0) return colorVariants.reduce((sum, v) => sum + v.stock, 0);
    }
    return product?.stock ?? null;
  };

  // Get SKU for selected variant
  const getVariantSKU = (): string | null => {
    const variant = getSelectedVariant();
    return variant?.sku || null;
  };

  const handleAddToCart = async () => {
    if (!product) return;
    const sizes = getAvailableSizes();
    const colors = getAvailableColors();
    if (sizes.length > 0 && !selectedSize) {
      toast({ title: "সাইজ সিলেক্ট করুন", description: "কার্টে যোগ করার আগে একটি সাইজ বেছে নিন", variant: "destructive" });
      return;
    }
    if (colors.length > 0 && !selectedColor) {
      toast({ title: "কালার সিলেক্ট করুন", description: "কার্টে যোগ করার আগে একটি কালার বেছে নিন", variant: "destructive" });
      return;
    }
    // Check variant stock
    const vStock = getVariantStock();
    if (vStock !== null && vStock < quantity) {
      toast({ title: "স্টক অপর্যাপ্ত", description: `এই ভেরিয়েন্টে মাত্র ${vStock}টি আছে`, variant: "destructive" });
      return;
    }
    await addToCart(product.id, quantity, selectedSize || undefined, selectedColor || undefined);
    // trackAddToCart is fired inside CartContext.addToCart now (covers all callers)
  };

  const getProductImage = () => {
    return getProductImg(product || { image_url: null, category: "" });
  };

  // ALL colors from variants
  const getAllColors = () => {
    if (variants.length > 0) {
      return [...new Set(variants.filter(v => v.color).map(v => v.color!))];
    }
    return product?.colors || [];
  };

  const isColorInStock = (color: string) => {
    if (variants.length === 0) return true;
    return variants.some(v => v.color === color && v.stock > 0);
  };

  // Get stock count for a specific color
  const getColorStock = (color: string) => {
    if (variants.length === 0) return null;
    const colorVariants = variants.filter(v => v.color === color);
    return colorVariants.reduce((sum, v) => sum + v.stock, 0);
  };

  // ALL sizes, filtered by selected color
  const getAllSizes = () => {
    if (variants.length === 0) return product?.sizes?.filter(Boolean) || [];
    if (selectedColor) {
      return [...new Set(variants.filter(v => v.color === selectedColor && v.size).map(v => v.size!))];
    }
    return [...new Set(variants.filter(v => v.size).map(v => v.size!))];
  };

  const isSizeInStock = (size: string) => {
    if (variants.length === 0) return true;
    if (selectedColor) {
      return variants.some(v => v.size === size && v.color === selectedColor && v.stock > 0);
    }
    return variants.some(v => v.size === size && v.stock > 0);
  };

  // Get stock count for a specific size (with color filter)
  const getSizeStock = (size: string) => {
    if (variants.length === 0) return null;
    if (selectedColor) {
      const v = variants.find(v => v.size === size && v.color === selectedColor);
      return v?.stock ?? 0;
    }
    return variants.filter(v => v.size === size).reduce((sum, v) => sum + v.stock, 0);
  };

  // Get price adjustment for a specific size
  const getSizePriceAdjustment = (size: string) => {
    if (variants.length === 0) return 0;
    if (selectedColor) {
      const v = variants.find(v => v.size === size && v.color === selectedColor);
      return v?.price_adjustment || 0;
    }
    const sizeVariants = variants.filter(v => v.size === size && v.price_adjustment);
    if (sizeVariants.length > 0) return sizeVariants[0].price_adjustment || 0;
    return 0;
  };

  const getAvailableSizes = () => getAllSizes().filter(isSizeInStock);
  const getAvailableColors = () => getAllColors().filter(isColorInStock);

  const handleColorClick = (color: string) => {
    if (!isColorInStock(color)) return;
    setSelectedColor(color);
    setSelectedSize(null);
  };

  const getActiveMainImage = () => {
    if (selectedColor) {
      const variant = variants.find(v => v.color === selectedColor && v.image_url);
      if (variant?.image_url) return variant.image_url;
    }
    return getProductImage();
  };

  const getGalleryImages = (): ProductImage[] => {
    const images: ProductImage[] = [];
    const seenUrls = new Set<string>();
    variants.forEach(v => {
      if (v.color && v.image_url && !seenUrls.has(v.image_url)) {
        seenUrls.add(v.image_url);
        images.push({ id: v.id, image_url: v.image_url, alt_text: v.color });
      }
    });
    productImages.forEach(img => {
      if (!seenUrls.has(img.image_url)) {
        seenUrls.add(img.image_url);
        images.push(img);
      }
    });
    return images;
  };

  const inWishlist = product ? isInWishlist(product.id) : false;
  const isOutOfStock = product?.stock !== null && product?.stock !== undefined && product.stock <= 0;
  const allSizesForDisplay = product ? getAllSizes() : [];
  const allColorsForDisplay = product ? getAllColors() : [];
  const galleryImages = getGalleryImages();
  const currentPrice = product ? getCurrentPrice() : 0;
  const variantStock = product ? getVariantStock() : null;
  const variantSKU = product ? getVariantSKU() : null;
  const discount = product?.sale_price ? Math.round((1 - product.sale_price / product.price) * 100) : 0;

  // Build available sizes for size guide
  const sizesForGuide = variants.length > 0
    ? [...new Set(variants.filter(v => v.size).map(v => v.size!))]
    : product?.sizes?.filter(Boolean) || [];

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-20">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 animate-pulse">
              <div className="aspect-[3/4] bg-muted rounded-2xl" />
              <div className="space-y-4">
                <div className="h-6 bg-muted rounded w-1/4" />
                <div className="h-10 bg-muted rounded w-3/4" />
                <div className="h-8 bg-muted rounded w-1/3" />
                <div className="h-24 bg-muted rounded" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="font-display text-3xl font-bold text-foreground mb-4">Product Not Found</h1>
            <p className="text-muted-foreground mb-8">The product you're looking for is currently unavailable.</p>
            <Link to="/shop" className="btn-gold">Back to Shop</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEOHead {...buildProductSeo({ id: product.id, name: product.name, description: product.description, price: product.price, salePrice: product.sale_price, category: product.category, image: getProductImage(), slug: product.slug })} />
      <StructuredData data={buildProductJsonLd({ id: product.id, name: product.name, description: product.description, price: product.price, salePrice: product.sale_price, image: getProductImage(), category: product.category, slug: product.slug, stock: product.stock, reviewCount: reviewStats.count, averageRating: reviewStats.avg, sizes: (product as any).sizes, colors: (product as any).colors, material: (product as any).material, sku: (product as any).sku })} />
      <Header />
      <Breadcrumbs />
      <main className="pt-4 pb-16 md:pb-20">
        <div className="container mx-auto px-4">
          <Link to="/shop" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-4 md:mb-8 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to Shop
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-12">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="relative">
              <ProductGallery mainImage={getActiveMainImage()} images={galleryImages} videoUrl={product.video_url} productName={product.name} discount={discount}>
                <button onClick={() => toggleWishlist(product.id)} className={`absolute top-4 right-4 w-12 h-12 rounded-full border flex items-center justify-center transition-colors z-10 ${inWishlist ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border hover:bg-muted"}`}>
                  <Heart className={`w-5 h-5 ${inWishlist ? "fill-current" : "text-foreground"}`} />
                </button>
              </ProductGallery>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} className="space-y-4 md:space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-primary text-xs md:text-sm uppercase tracking-widest font-medium">{product.category}</span>
                  <h1 className="font-display text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mt-1 md:mt-2">{product.name}</h1>
                  {/* SKU & Material */}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {variantSKU && <span>SKU: <span className="font-mono">{variantSKU}</span></span>}
                    {product.material && <span>Material: {product.material}</span>}
                  </div>
                </div>
                <SocialShare url={`/product/${product.slug || product.id}`} title={product.name} description={product.description || undefined} />
              </div>

              {/* Dynamic Price */}
              <div className="flex items-center gap-3 md:gap-4">
                <span className="font-display text-2xl md:text-3xl font-bold text-gradient-gold">৳{currentPrice.toLocaleString()}</span>
                {product.sale_price && <span className="text-lg md:text-xl text-muted-foreground line-through">৳{product.price.toLocaleString()}</span>}
                {getSelectedVariant()?.price_adjustment && getSelectedVariant()!.price_adjustment! !== 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getSelectedVariant()!.price_adjustment! > 0 ? "bg-secondary/10 text-secondary" : "bg-primary/10 text-primary"}`}>
                    {getSelectedVariant()!.price_adjustment! > 0 ? "+" : ""}৳{getSelectedVariant()!.price_adjustment!.toLocaleString()}
                  </span>
                )}
              </div>

              <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
                {product.description || "This premium product from our Dubai collection is crafted with the finest materials."}
              </p>

              {/* Colors with stock count */}
              {allColorsForDisplay.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    কালার: <span className="text-primary">{selectedColor || "বেছে নিন"}</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {allColorsForDisplay.map((color) => {
                      const inStock = isColorInStock(color);
                      const stock = getColorStock(color);
                      return (
                        <Button
                          key={color}
                          variant="outline"
                          size="sm"
                          onClick={() => handleColorClick(color)}
                          disabled={!inStock}
                          className={`flex items-center gap-1 relative ${
                            !inStock
                              ? "line-through text-muted-foreground/50 cursor-not-allowed"
                              : selectedColor === color
                                ? "bg-primary text-primary-foreground border-primary"
                                : ""
                          }`}
                        >
                          {selectedColor === color && <Check className="w-3 h-3" />}
                          {color}
                          {stock !== null && inStock && stock <= 5 && (
                            <span className="text-[10px] ml-1 text-secondary">({stock})</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sizes with stock & price adjustment */}
              {allSizesForDisplay.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-foreground">
                      সাইজ: <span className="text-primary">{selectedSize || "বেছে নিন"}</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <SizeRecommendation productCategory={product.category} />
                      <SizeGuide sizes={sizesForGuide} category={product.category} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allSizesForDisplay.map((size) => {
                      const inStock = isSizeInStock(size);
                      const stock = getSizeStock(size);
                      const priceAdj = getSizePriceAdjustment(size);
                      return (
                        <Button
                          key={size}
                          variant="outline"
                          size="sm"
                          onClick={() => inStock && setSelectedSize(size)}
                          disabled={!inStock}
                          className={`relative ${
                            !inStock
                              ? "line-through text-muted-foreground/50 cursor-not-allowed"
                              : selectedSize === size
                                ? "bg-primary text-primary-foreground border-primary"
                                : ""
                          }`}
                        >
                          {size}
                          {priceAdj !== 0 && inStock && (
                            <span className="text-[10px] ml-1">{priceAdj > 0 ? "+" : ""}৳{priceAdj}</span>
                          )}
                          {stock !== null && inStock && stock <= 3 && (
                            <span className="text-[10px] ml-1 text-secondary">({stock})</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quantity & Variant Stock */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">পরিমাণ</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center border border-border rounded-lg">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-12 h-12 flex items-center justify-center hover:bg-muted transition-colors">-</button>
                    <span className="w-12 text-center font-medium">{quantity}</span>
                    <button onClick={() => {
                      const maxStock = variantStock ?? product.stock ?? 999;
                      if (quantity < maxStock) setQuantity(quantity + 1);
                    }} className="w-12 h-12 flex items-center justify-center hover:bg-muted transition-colors">+</button>
                  </div>
                  {variantStock !== null ? (
                    <span className={`text-sm ${variantStock <= 5 ? "text-secondary font-medium" : "text-muted-foreground"}`}>
                      {variantStock > 0 ? `${variantStock}টি স্টকে আছে` : "স্টক আউট"}
                    </span>
                  ) : product.stock !== null && (
                    <span className="text-sm text-muted-foreground">
                      {product.stock > 0 ? `${product.stock} স্টকে আছে` : "স্টক আউট"}
                    </span>
                  )}
                </div>
              </div>

              <StockCountdown stock={variantStock ?? product.stock} />
              {product.sale_price && <FlashSaleTimer variant="card" />}

              <div className="flex gap-4">
                {isOutOfStock && variantStock === null ? (
                  <div className="flex-1 space-y-2">
                    <Button onClick={() => setShowStockAlert(true)} className="w-full h-14 text-lg bg-muted hover:bg-muted/80 text-foreground">
                      <Bell className="w-5 h-5 mr-2" />
                      স্টকে আসলে জানাবো
                    </Button>
                    <a
                      href={`https://wa.me/8801845853634?text=${encodeURIComponent(`প্রি-অর্ডার করতে চাই:\n${product.name}\nমূল্য: ৳${currentPrice.toLocaleString()}\n৫০% অগ্রিম: ৳${Math.ceil(currentPrice * 0.5).toLocaleString()}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackContact("whatsapp_preorder")}
                      className="flex items-center justify-center gap-2 w-full h-12 rounded-lg border-2 border-primary text-primary hover:bg-primary/10 transition-colors font-medium text-sm"
                    >
                      <Smartphone className="w-4 h-4" />
                      প্রি-অর্ডার করুন (৫০% অগ্রিম)
                    </a>
                  </div>
                ) : variantStock !== null && variantStock <= 0 ? (
                  <div className="flex-1 space-y-2">
                    <Button onClick={() => setShowStockAlert(true)} className="w-full h-14 text-lg bg-muted hover:bg-muted/80 text-foreground">
                      <Bell className="w-5 h-5 mr-2" />
                      এই ভেরিয়েন্ট স্টক আউট
                    </Button>
                    <a
                      href={`https://wa.me/8801845853634?text=${encodeURIComponent(`প্রি-অর্ডার করতে চাই:\n${product.name}${selectedColor ? ` (${selectedColor})` : ''}${selectedSize ? ` - ${selectedSize}` : ''}\nমূল্য: ৳${currentPrice.toLocaleString()}\n৫০% অগ্রিম: ৳${Math.ceil(currentPrice * 0.5).toLocaleString()}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full h-12 rounded-lg border-2 border-primary text-primary hover:bg-primary/10 transition-colors font-medium text-sm"
                    >
                      <Smartphone className="w-4 h-4" />
                      প্রি-অর্ডার করুন (৫০% অগ্রিম)
                    </a>
                  </div>
                ) : (
                  <Button onClick={handleAddToCart} className="btn-gold flex-1 h-14 text-lg">
                    <ShoppingBag className="w-5 h-5 mr-2" />
                    কার্টে যোগ করুন
                  </Button>
                )}
                <button onClick={() => toggleWishlist(product.id)} className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center transition-colors ${inWishlist ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary hover:text-primary"}`}>
                  <Heart className={`w-5 h-5 ${inWishlist ? "fill-current" : ""}`} />
                </button>
              </div>

              <PriceDropAlert productId={product.id} currentPrice={currentPrice} />
              <WhatsAppOrderButton productName={product.name} price={currentPrice} size={selectedSize} color={selectedColor} />

              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-border">
                <div className="text-center">
                  <Truck className="w-6 h-6 mx-auto text-primary mb-2" />
                  <span className="text-xs text-muted-foreground">ফ্রি শিপিং</span>
                </div>
                <div className="text-center">
                  <Shield className="w-6 h-6 mx-auto text-primary mb-2" />
                  <span className="text-xs text-muted-foreground">নিরাপদ পেমেন্ট</span>
                </div>
                <div className="text-center">
                  <RotateCcw className="w-6 h-6 mx-auto text-primary mb-2" />
                  <span className="text-xs text-muted-foreground">সহজ রিটার্ন</span>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="mt-16 pt-16 border-t border-border">
            <ProductReviews productId={product.id} />
          </div>
          <RelatedProducts currentProductId={product.id} category={product.category} />
          <PersonalizedRecommendations />
          <RecentlyViewed productIds={recentlyViewed} currentProductId={product.id} />
        </div>
      </main>

      {/* Sticky Add to Cart on Mobile */}
      {!(isOutOfStock && variantStock === null) && !(variantStock !== null && variantStock <= 0) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border p-3 flex items-center gap-3 md:hidden">
          <div className="flex-1">
            <span className="font-display text-lg font-bold text-gradient-gold">৳{currentPrice.toLocaleString()}</span>
            {product.sale_price && <span className="text-xs text-muted-foreground line-through ml-2">৳{product.price.toLocaleString()}</span>}
          </div>
          <Button onClick={handleAddToCart} className="btn-gold h-12 px-6">
            <ShoppingBag className="w-4 h-4 mr-2" />
            কার্টে যোগ করুন
          </Button>
        </div>
      )}

      <Footer />
      <BackInStockAlert productName={product.name} productId={product.id} open={showStockAlert} onOpenChange={setShowStockAlert} />
    </div>
  );
};

export default ProductDetail;
