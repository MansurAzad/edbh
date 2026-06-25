import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingBag, User, LogOut, LayoutDashboard } from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminAuth } from "@/hooks/useAdminAuth";

interface NavLink {
  name: string;
  path: string;
}

interface MobileMenuProps {
  open: boolean;
  navLinks: NavLink[];
  itemCount: number;
  onClose: () => void;
  onOpenSearch: () => void;
  onOpenCart: () => void;
}

/** Mobile slide-down menu: nav links, search/cart shortcuts, account section. */
const MobileMenu = ({
  open,
  navLinks,
  itemCount,
  onClose,
  onOpenSearch,
  onOpenCart,
}: MobileMenuProps) => {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const { isStaff, isAdmin, isModerator, loading: staffLoading } = useAdminAuth();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="lg:hidden bg-background border-t border-border"
        >
          <nav className="container mx-auto px-4 py-6 flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={onClose}
                className={`py-3 px-4 rounded-lg text-lg font-medium transition-colors ${
                  pathname === link.path
                    ? "bg-muted text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {link.name}
              </Link>
            ))}

            <div className="flex items-center gap-4 pt-4 border-t border-border mt-2">
              <ThemeToggle />
              <button
                onClick={() => { onClose(); onOpenSearch(); }}
                className="flex-1 py-3 flex items-center justify-center gap-2 bg-muted rounded-lg"
              >
                <Search className="w-5 h-5" />
                <span>Search</span>
              </button>
              <button
                onClick={() => { onClose(); onOpenCart(); }}
                className="flex-1 py-3 flex items-center justify-center gap-2 bg-muted rounded-lg"
              >
                <ShoppingBag className="w-5 h-5" />
                <span>Cart ({itemCount})</span>
              </button>
            </div>

            {user ? (
              <>
                {!staffLoading && isStaff && (
                  <Link
                    to="/admin"
                    onClick={onClose}
                    className="w-full py-3 flex items-center justify-center gap-2 bg-primary/20 text-primary rounded-lg mt-2 font-semibold"
                  >
                    <LayoutDashboard className="w-5 h-5" />
                    <span>{isModerator && !isAdmin ? "Moderator Panel" : "Admin Panel"}</span>
                  </Link>
                )}
                <Link
                  to="/profile"
                  onClick={onClose}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-primary/10 text-primary rounded-lg mt-2"
                >
                  <User className="w-5 h-5" />
                  <span>My Profile</span>
                </Link>
                <button
                  onClick={() => { signOut(); onClose(); }}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-destructive/10 text-destructive rounded-lg mt-2"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                onClick={onClose}
                className="w-full py-3 flex items-center justify-center gap-2 bg-muted rounded-lg mt-2"
              >
                <User className="w-5 h-5" />
                <span>Sign In</span>
              </Link>
            )}

            <Link to="/shop" onClick={onClose} className="btn-gold text-center mt-2">
              Shop Now
            </Link>
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileMenu;
