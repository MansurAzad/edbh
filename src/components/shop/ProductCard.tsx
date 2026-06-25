import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Heart, ShoppingBag, Zap, GitCompareArrows } from "lucide-react";
import StockBadge from "@/components/shop/StockBadge";
import RatingStars from "@/components/shop/RatingStars";
import { type Product, type RatingSummary, getProductImage } from "@/types/product";

interface ProductCardProps {
  product: Product;
  index?: number;
  gridView?: boolean;
  rating?: RatingSummary;
  isInWishlist: boolean;
  isInCompare: boolean;
  categoryBnName: string;
  onAddToCart: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  onToggleCompare: (product: Product) => void;
}

/** Single product tile used on Shop, Search, etc. Pure presentational — receives all actions as callbacks. */
const ProductCard = ({
  product,
  index = 0,
  gridView = true,
  rating,
  isInWishlist,
  isInCompare,
  categoryBnName,
  onAddToCart,
  onQuickView,
  onToggleWishlist,
  onToggleCompare,
}: ProductCardProps) => {
  const price = product.sale_price || product.price;
  const productUrl = `/product/${product.slug || product.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
      className="group"
    >
      <div className={`card-luxury ${!gridView ? "flex gap-4 md:gap-6" : ""}`}>
        <div
          className={`relative overflow-hidden rounded-xl ${
            gridView ? "aspect-[3/4] mb-3 md:mb-4" : "w-28 h-28 md:w-48 md:h-48 flex-shrink-0"
          }`}
        >
          <img
            src={getProductImage(product)}
            alt={`${product.name} — ${categoryBnName} দুবাই বোরকা হাউস`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
          {product.sale_price && (
            <span className="absolute top-2 left-2 md:top-3 md:left-3 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-semibold bg-secondary text-secondary-foreground">
              Sale
            </span>
          )}
          <div className="absolute bottom-2 left-2 md:bottom-3 md:left-3">
            <StockBadge stock={product.stock} compact />
          </div>
          <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 md:gap-2">
            <button
              onClick={() => onToggleWishlist(product.id)}
              aria-label="Toggle wishlist"
              className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors ${
                isInWishlist
                  ? "bg-primary text-primary-foreground"
                  : "bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
              }`}
            >
              <Heart className={`w-3.5 h-3.5 md:w-4 md:h-4 ${isInWishlist ? "fill-current" : ""}`} />
            </button>
            <button
              onClick={() => onAddToCart(product)}
              aria-label="Add to cart"
              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <ShoppingBag className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
            <button
              onClick={() => onQuickView(product)}
              aria-label="Quick view"
              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <Zap className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
            <button
              onClick={() => onToggleCompare(product)}
              aria-label="Add to compare"
              className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors ${
                isInCompare
                  ? "bg-primary text-primary-foreground"
                  : "bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
              }`}
            >
              <GitCompareArrows className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          </div>
        </div>

        <div className={!gridView ? "flex-1" : ""}>
          <span className="text-primary text-[10px] md:text-xs uppercase tracking-wider font-medium">
            {product.category}
          </span>
          <Link to={productUrl}>
            <h3 className="font-medium text-foreground text-xs md:text-base mt-0.5 md:mt-1 hover:text-primary transition-colors line-clamp-2">
              {product.name}
            </h3>
          </Link>
          {rating && <RatingStars avg={rating.avg} count={rating.count} />}
          <div className="flex items-center gap-2 mt-1 md:mt-2">
            <span className="font-semibold text-sm md:text-lg text-gradient-gold">
              ৳{price.toLocaleString()}
            </span>
            {product.sale_price && (
              <span className="text-muted-foreground line-through text-[10px] md:text-sm">
                ৳{product.price.toLocaleString()}
              </span>
            )}
          </div>
          {!gridView && product.description && (
            <p className="text-muted-foreground text-sm mt-2 line-clamp-2">{product.description}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ProductCard;
