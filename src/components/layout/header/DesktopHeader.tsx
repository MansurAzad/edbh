import { Link, useLocation } from "react-router-dom";
import { Search, Heart, ShoppingBag } from "lucide-react";
import MegaMenu from "@/components/layout/MegaMenu";
import ThemeToggle from "@/components/layout/ThemeToggle";
import UserMenu from "./UserMenu";

interface NavLink {
  name: string;
  path: string;
}

interface DesktopHeaderProps {
  navLinks: NavLink[];
  wishlistCount: number;
  cartCount: number;
  onOpenSearch: () => void;
  onOpenCart: () => void;
}

const Badge = ({ count, className }: { count: number; className: string }) =>
  count > 0 ? (
    <span className={className}>{count > 99 ? "99+" : count}</span>
  ) : null;

/** Desktop-only header: nav links + utility actions (search, wishlist, user, cart). */
const DesktopHeader = ({
  navLinks,
  wishlistCount,
  cartCount,
  onOpenSearch,
  onOpenCart,
}: DesktopHeaderProps) => {
  const { pathname } = useLocation();
  const linkClass = (active: boolean) =>
    `gold-underline text-sm font-medium tracking-wide uppercase transition-colors ${
      active ? "text-primary" : "text-foreground hover:text-primary"
    }`;

  return (
    <>
      <nav className="hidden lg:flex items-center gap-8">
        <Link to="/" className={linkClass(pathname === "/")}>Home</Link>
        <MegaMenu />
        {navLinks
          .filter((l) => l.path !== "/" && l.path !== "/shop")
          .map((link) => (
            <Link key={link.path} to={link.path} className={linkClass(pathname === link.path)}>
              {link.name}
            </Link>
          ))}
      </nav>

      <div className="hidden lg:flex items-center gap-4">
        <ThemeToggle />
        <button
          onClick={onOpenSearch}
          aria-label="Search"
          className="p-2 hover:bg-muted rounded-full transition-colors"
        >
          <Search className="w-5 h-5 text-foreground" />
        </button>
        <Link to="/wishlist" aria-label="Wishlist" className="relative p-2 hover:bg-muted rounded-full transition-colors">
          <Heart className="w-5 h-5 text-foreground" />
          <Badge
            count={wishlistCount}
            className="absolute -top-1 -right-1 w-5 h-5 bg-secondary text-secondary-foreground text-xs flex items-center justify-center rounded-full"
          />
        </Link>
        <UserMenu />
        <button
          onClick={onOpenCart}
          aria-label="Cart"
          className="relative p-2 hover:bg-muted rounded-full transition-colors"
        >
          <ShoppingBag className="w-5 h-5 text-foreground" />
          <Badge
            count={cartCount}
            className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs flex items-center justify-center rounded-full"
          />
        </button>
        <Link to="/shop" className="btn-gold ml-4 text-sm !py-2 !px-6">Shop Now</Link>
      </div>
    </>
  );
};

export default DesktopHeader;
