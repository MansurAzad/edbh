/**
 * @file ProductCard.tsx
 * @module components/shop/ProductCard
 *
 * @description
 * Pure-presentational tile for a single product.
 * Rendered inside grid/list layouts on the Shop page, search results, etc.
 *
 * **Architecture note:** This component owns zero state and fires zero queries.
 * Every interactive action is delegated upward via callback props so that the
 * parent (e.g. ShopPage) can batch-update the cart / wishlist / compare context
 * without coupling those concerns to the card.
 *
 * **Animation:** Framer Motion entrance fade-in with a staggered delay capped at
 * 300 ms to avoid jarring delays for cards rendered far down the list.
 *
 * **Layout modes:**
 *  - `gridView = true`  → tall portrait card (3:4 aspect image above metadata)
 *  - `gridView = false` → horizontal list row (fixed thumbnail beside metadata)
 */

import { memo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Heart, ShoppingBag, Zap, GitCompareArrows } from "lucide-react";
import StockBadge from "@/components/shop/StockBadge";
import RatingStars from "@/components/shop/RatingStars";
import { type Product, type RatingSummary, getProductImage } from "@/types/product";

// ---------------------------------------------------------------------------
// Prop types
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link ProductCard}.
 */
interface ProductCardProps {
  /** Full product record from Supabase / React Query cache. */
  product: Product;
  /**
   * Zero-based render index used to stagger the entrance animation.
   * Defaults to `0` (no extra delay) when omitted.
   */
  index?: number;
  /**
   * When `true` the card renders in portrait-grid mode.
   * When `false` it renders in horizontal-list mode.
   * @default true
   */
  gridView?: boolean;
  /**
   * Pre-computed rating summary for this product.
   * `undefined` when no reviews exist — the {@link RatingStars} row is simply
   * omitted in that case.
   */
  rating?: RatingSummary;
  /** Whether this product already lives in the user's wishlist. Controls heart-fill styling. */
  isInWishlist: boolean;
  /** Whether this product is queued in the compare tray. Controls compare-icon styling. */
  isInCompare: boolean;
  /**
   * Bengali category name shown in the `alt` text for SEO.
   * Example: "আবায়া" — category label in Bengali / বাংলা
   */
  categoryBnName: string;
  /**
   * Called when the user clicks the bag icon overlay.
   * @param product - The full product object.
   */
  onAddToCart: (product: Product) => void;
  /**
   * Called when the user clicks the lightning-bolt (Quick View) overlay button.
   * @param product - The full product object.
   */
  onQuickView: (product: Product) => void;
  /**
   * Called when the user clicks the heart (Wishlist) overlay button.
   * @param productId - The UUID of the product to toggle.
   */
  onToggleWishlist: (productId: string) => void;
  /**
   * Called when the user clicks the compare overlay button.
   * @param product - The full product object (compare tray may need name/image).
   */
  onToggleCompare: (product: Product) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Single product tile used on Shop, Search results, and similar pages.
 *
 * @remarks
 * Purely presentational — receives all state and action handlers via props.
 * Renders either in **grid** (portrait) or **list** (horizontal) layout
 * depending on `gridView`.
 *
 * @param props - See {@link ProductCardProps}.
 * @returns An animated product card element.
 *
 * @example
 * ```tsx
 * <ProductCard
 *   product={product}
 *   index={i}
 *   gridView={isGrid}
 *   rating={ratings[product.id]}
 *   isInWishlist={wishlist.has(product.id)}
 *   isInCompare={compare.has(product.id)}
 *   categoryBnName={cat.name_bn ?? cat.name}
 *   onAddToCart={handleAddToCart}
 *   onQuickView={setQuickViewProduct}
 *   onToggleWishlist={toggleWishlist}
 *   onToggleCompare={toggleCompare}
 * />
 * ```
 */
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
  // Prefer sale_price when available; otherwise fall back to regular price.
  const price = product.sale_price || product.price;

  // Prefer the human-readable slug for canonical URLs; fall back to UUID.
  const productUrl = `/product/${product.slug || product.id}`;

  return (
    /*
     * Framer Motion entrance animation.
     * `delay` is capped at 0.3 s so that the 10th+ card doesn't feel
     * unresponsive. `index * 0.03` gives a gentle stagger per card.
     */
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
      className="group" // `group` enables CSS `group-hover:` utilities on descendants
    >
      {/*
       * card-luxury — project-level Tailwind component class.
       * In list mode we add flex + gap so the thumbnail sits beside the text.
       */}
      <div className={`card-luxury ${!gridView ? "flex gap-4 md:gap-6" : ""}`}>

        {/* ── Image container ─────────────────────────────────────────────── */}
        <div
          className={`relative overflow-hidden rounded-xl ${
            // Grid: tall portrait ratio. List: fixed square thumbnail.
            gridView ? "aspect-[3/4] mb-3 md:mb-4" : "w-28 h-28 md:w-48 md:h-48 flex-shrink-0"
          }`}
        >
          {/* Clicking the image opens the Product Detail Page (which has full zoom viewer + gallery) */}
          <Link to={productUrl} aria-label={`View ${product.name}`} className="block w-full h-full">
            <img
              src={getProductImage(product)}
              alt={`${product.name} — ${categoryBnName} দুবাই বোরকা হাউস`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-zoom-in"
              loading="lazy"
              decoding="async"
            />
          </Link>

          {/* Sale badge — only rendered when sale_price exists (conditional rendering) */}
          {product.sale_price && (
            <span className="absolute top-2 left-2 md:top-3 md:left-3 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-semibold bg-secondary text-secondary-foreground">
              Sale
            </span>
          )}

          {/* Stock badge — always visible, positioned bottom-left over the image */}
          <div className="absolute bottom-2 left-2 md:bottom-3 md:left-3">
            <StockBadge stock={product.stock} compact />
          </div>

          {/*
           * Hover overlay with action buttons.
           * opacity-0 → opacity-100 driven by Tailwind's `group-hover:` modifier.
           * The semi-transparent bg allows the image to show through.
           */}
          <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 md:gap-2">

            {/* ── Wishlist toggle ─────────────────────────────────────────── */}
            <button
              onClick={() => onToggleWishlist(product.id)}
              aria-label="Toggle wishlist"
              className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors ${
                // Active (already in wishlist) → primary colour; inactive → neutral
                isInWishlist
                  ? "bg-primary text-primary-foreground"
                  : "bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
              }`}
            >
              {/* fill-current fills the SVG when the product is wishlisted */}
              <Heart className={`w-3.5 h-3.5 md:w-4 md:h-4 ${isInWishlist ? "fill-current" : ""}`} />
            </button>

            {/* ── Add to cart ─────────────────────────────────────────────── */}
            <button
              onClick={() => onAddToCart(product)}
              aria-label="Add to cart"
              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <ShoppingBag className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>

            {/* ── Quick-view (lightning bolt) ──────────────────────────────── */}
            <button
              onClick={() => onQuickView(product)}
              aria-label="Quick view"
              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <Zap className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>

            {/* ── Compare toggle ─────────────────────────────────────────── */}
            <button
              onClick={() => onToggleCompare(product)}
              aria-label="Add to compare"
              className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors ${
                // Active (already in compare tray) → primary colour; inactive → neutral
                isInCompare
                  ? "bg-primary text-primary-foreground"
                  : "bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
              }`}
            >
              <GitCompareArrows className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          </div>
        </div>

        {/* ── Text metadata ───────────────────────────────────────────────── */}
        {/* In list mode this div grows to fill remaining horizontal space. */}
        <div className={!gridView ? "flex-1" : ""}>

          {/* Category label in primary colour — small uppercase tracking */}
          <span className="text-primary text-[10px] md:text-xs uppercase tracking-wider font-medium">
            {product.category}
          </span>

          {/* Product name links to the PDP (product detail page) */}
          <Link to={productUrl}>
            <h3 className="font-medium text-foreground text-xs md:text-base mt-0.5 md:mt-1 hover:text-primary transition-colors line-clamp-2">
              {product.name}
            </h3>
          </Link>

          {/* Rating row — omitted entirely when `rating` is undefined (no reviews yet) */}
          {rating && <RatingStars avg={rating.avg} count={rating.count} />}

          {/* Price row — shows sale price with original struck-through when on sale */}
          <div className="flex items-center gap-2 mt-1 md:mt-2">
            {/*
             * ৳ is the Bangladeshi Taka currency symbol.
             * text-gradient-gold — custom Tailwind utility for the gold gradient.
             */}
            <span className="font-semibold text-sm md:text-lg text-gradient-gold">
              ৳{price.toLocaleString()}
            </span>
            {/* Original price shown struck-through only when a sale_price overrides it */}
            {product.sale_price && (
              <span className="text-muted-foreground line-through text-[10px] md:text-sm">
                ৳{product.price.toLocaleString()}
              </span>
            )}
          </div>

          {/*
           * Short description — rendered only in list view (`!gridView`) when the
           * product has a description field. Hidden in grid mode to keep cards compact.
           */}
          {!gridView && product.description && (
            <p className="text-muted-foreground text-sm mt-2 line-clamp-2">{product.description}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

/**
 * Memoised export — product tiles re-render only when their `product` or
 * callback identities change. With React Query providing stable data refs and
 * useCallback-wrapped parent handlers, a grid of 50+ cards skips most renders
 * triggered by unrelated parent state (filters, sort, etc.).
 */
export default memo(ProductCard);
