import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import SearchDialog from "@/components/layout/SearchDialog";
import BrandLogo from "@/components/layout/header/BrandLogo";
import DesktopHeader from "@/components/layout/header/DesktopHeader";
import MobileMenu from "@/components/layout/header/MobileMenu";
import { useScrolled } from "@/hooks/useScrolled";
import { useSearchHotkey } from "@/hooks/useSearchHotkey";
import { useMobileLogo } from "@/hooks/queries/useMobileLogo";

const navLinks = [
  { name: "Home", path: "/" },
  { name: "Shop", path: "/shop" },
  { name: "Categories", path: "/categories" },
  { name: "About", path: "/about" },
  { name: "Contact", path: "/contact" },
];

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const scrolled = useScrolled(50);
  const { itemCount, openCart } = useCart();
  const { itemCount: wishlistCount } = useWishlist();
  const { data: mobileLogo } = useMobileLogo();
  // Pull auth so the hook subscribes for re-renders if needed by descendants.
  useAuth();
  useSearchHotkey(() => setSearchOpen(true));

  const openSearch = () => setSearchOpen(true);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background/95 backdrop-blur-md border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          <BrandLogo mobileLogoUrl={mobileLogo ?? null} />
          <DesktopHeader
            navLinks={navLinks}
            wishlistCount={wishlistCount}
            cartCount={itemCount}
            onOpenSearch={openSearch}
            onOpenCart={openCart}
          />
          <button
            onClick={() => setIsOpen((v) => !v)}
            aria-label={isOpen ? "Close menu" : "Open menu"}
            className="lg:hidden p-2 hover:bg-muted rounded-full transition-colors"
          >
            {isOpen ? <X className="w-6 h-6 text-foreground" /> : <Menu className="w-6 h-6 text-foreground" />}
          </button>
        </div>
      </div>

      <MobileMenu
        open={isOpen}
        navLinks={navLinks}
        itemCount={itemCount}
        onClose={() => setIsOpen(false)}
        onOpenSearch={openSearch}
        onOpenCart={openCart}
      />

      {searchOpen && <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />}
    </header>
  );
};

export default Header;
