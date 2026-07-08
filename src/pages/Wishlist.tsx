import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Heart, ShoppingBag, Trash2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import productAbaya from "@/assets/product-abaya-1.jpg";
import productHijab from "@/assets/product-hijab-1.jpg";
import productBorka from "@/assets/product-borka-1.jpg";
import productKaftan from "@/assets/product-kaftan-1.jpg";
import productScarf from "@/assets/product-scarf-1.jpg";
import productFabric from "@/assets/product-fabric-1.jpg";
import SEOHead from "@/components/seo/SEOHead";

const categoryImages: Record<string, string> = {
  Abayas: productAbaya, Hijabs: productHijab, Borkas: productBorka,
  Kaftans: productKaftan, Scarves: productScarf, Fabrics: productFabric,
};

const Wishlist = () => {
  const { items, loading, removeFromWishlist } = useWishlist();
  const { addToCart } = useCart();
  const { user } = useAuth();

  const getProductImage = (product: { image_url: string | null; category: string }) => {
    if (product.image_url && product.image_url !== "/placeholder.svg") return product.image_url;
    return categoryImages[product.category] || productAbaya;
  };

  const handleAddToCart = async (item: typeof items[0]) => {
    await addToCart(item.product_id, 1);
    await removeFromWishlist(item.product_id);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <Breadcrumbs />
        <main className="pt-4 pb-20">
          <div className="container mx-auto px-4 text-center">
            <Heart className="w-16 h-16 mx-auto text-muted-foreground mb-6" />
            <h1 className="font-display text-3xl font-bold text-foreground mb-4">Sign in to view your wishlist</h1>
            <p className="text-muted-foreground mb-8">Sign in to save your favorite products.</p>
            <Link to="/auth" className="btn-gold">Sign In</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="My Wishlist – Saved Abaya & Borka Items" noIndex canonical="/wishlist" />
      <Header />
      <Breadcrumbs />
      <main className="pt-4 pb-20">
        <div className="container mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="font-display text-4xl font-bold">
              <span className="text-foreground">My </span>
              <span className="text-gradient-gold">Wishlist</span>
            </h1>
            <p className="text-muted-foreground mt-2">{items.length} saved products</p>
          </motion.div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[3/4] bg-muted rounded-xl mb-4" />
                  <div className="h-4 bg-muted rounded w-1/4 mb-2" />
                  <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-20">
              <Heart className="w-16 h-16 mx-auto text-muted-foreground mb-6" />
              <h2 className="font-display text-2xl font-semibold text-foreground mb-4">Your wishlist is empty</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">Click the heart icon while browsing to save your favorite products.</p>
              <Link to="/shop" className="btn-gold">Browse Products</Link>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {items.map((item, index) => (
                <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="group">
                  <div className="card-luxury">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl mb-4">
                      <Link to={`/product/${item.product_id}`}>
                        <img src={getProductImage(item.product)} alt={item.product.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      </Link>
                      <button onClick={() => removeFromWishlist(item.product_id)} className="absolute top-3 right-3 w-10 h-10 rounded-full bg-destructive/90 text-destructive-foreground flex items-center justify-center hover:bg-destructive transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground uppercase">{item.product.category}</span>
                      <Link to={`/product/${item.product_id}`}>
                        <h3 className="font-display text-lg font-semibold text-foreground mt-1 hover:text-primary transition-colors">{item.product.name}</h3>
                      </Link>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="font-display text-lg font-bold text-gradient-gold">৳{(item.product.sale_price || item.product.price).toLocaleString()}</span>
                        {item.product.sale_price && <span className="text-sm text-muted-foreground line-through">৳{item.product.price.toLocaleString()}</span>}
                      </div>
                      <button onClick={() => handleAddToCart(item)} className="w-full btn-gold mt-4 flex items-center justify-center gap-2">
                        <ShoppingBag className="w-4 h-4" />
                        Add to Cart
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Wishlist;
