// ============= Full file contents =============

/**
 * @file MobileMenu.tsx
 * @module components/layout/header/MobileMenu
 *
 * @description
 * Animated slide-down navigation drawer shown on viewports **below** the `lg`
 * breakpoint (< 1024 px). It is the mobile/tablet counterpart of
 * {@link DesktopHeader}.
 *
 * ### Sections (top → bottom)
 * 1. **Nav links** — one row per link, full-width tap targets with active-route
 *    highlight (`bg-muted text-primary`).
 * 2. **Quick-action row** — ThemeToggle, Search shortcut, Cart shortcut.
 * 3. **Account section** — conditionally rendered based on auth state:
 *    - *Authenticated + staff:* Admin/Moderator Panel link.
 *    - *Authenticated:*        My Profile link + Sign Out button.
 *    - *Unauthenticated:*      Sign In link.
 * 4. **Shop CTA** — gold full-width button at the bottom.
 *
 * ### Animation
 * Entry/exit are driven by Framer Motion (`AnimatePresence` + `motion.div`).
 * Height animates from `0 → "auto"` on open and back to `0` on close, giving
 * a smooth accordion effect without needing a fixed pixel height.
 *
 * ### Closing behaviour
 * Every interactive element calls `onClose` before or after its own action so
 * the menu collapses immediately on navigation, preventing a stale-open state
 * on the new page.
 */

import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingBag, User, LogOut, LayoutDashboard } from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminAuth } from "@/hooks/useAdminAuth";

// ---------------------------------------------------------------------------
// Prop types
// ---------------------------------------------------------------------------

/** A single navigation entry passed from the parent header. */
interface NavLink {
  /** Human-readable label, e.g. "About". */
  name: string;
  /** Absolute path, e.g. "/about". */
  path: string;
}

/**
 * Props accepted by {@link MobileMenu}.
 */
interface MobileMenuProps {
  /** Whether the menu is currently visible. Controls `AnimatePresence`. */
  open: boolean;
  /**
   * Full list of nav links to render.
   * Unlike DesktopHeader, **all** links are rendered here (including Home and
   * Shop) because the CTA button provides a separate Shop entry at the bottom.
   */
  navLinks: NavLink[];
  /**
   * Total number of items in the cart, shown inline in the Cart button label
   * as "Cart (n)" so the user never needs to open the drawer to check the count.
   */
  itemCount: number;
  /**
   * Callback to close the menu.
   * Called by every interactive item after its own action so the menu
   * collapses immediately on navigation or action.
   */
  onClose: () => void;
  /** Opens the global search modal / command palette, then closes the menu. */
  onOpenSearch: () => void;
  /** Opens the cart side-drawer, then closes the menu. */
  onOpenCart: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Mobile/tablet navigation drawer with animation, auth-aware account section,
 * quick-action shortcuts, and a Shop CTA.
 *
 * @remarks
 * The component intentionally avoids portal rendering — it sits in the normal
 * document flow directly beneath the `<header>` so it pushes page content down
 * rather than overlaying it. This prevents z-index conflicts with sticky
 * elements inside page content.
 *
 * @param props - See {@link MobileMenuProps}.
 * @returns An animated `<motion.div>` wrapped in `AnimatePresence`, or nothing
 *          when `open` is `false` (after the exit animation completes).
 */
const MobileMenu = ({
  open,
  navLinks,
  itemCount,
  onClose,
  onOpenSearch,
  onOpenCart,
}: MobileMenuProps) => {
  // Track current route for active-link highlight
  const { pathname } = useLocation();

  // Auth state: user object + signOut action
  const { user, signOut } = useAuth();

  // Staff/role flags: isStaff = any privileged role; isAdmin > isModerator
  // `staffLoading` prevents a flash of the admin link before roles resolve
  const { isStaff, isAdmin, isModerator, loading: staffLoading } = useAdminAuth();

  return (
    // AnimatePresence enables the exit animation when `open` becomes false.
    // Without it, the component would unmount instantly with no transition.
    <AnimatePresence>
      {open && (
        <motion.div
          // Slide in: fade + expand height from 0 to natural content height
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          // Slide out: reverse — collapse height then fade
          exit={{ opacity: 0, height: 0 }}
          // Hidden on lg+ viewports; DesktopHeader renders there instead
          className="lg:hidden bg-background border-t border-border"
        >
          <nav className="container mx-auto px-4 py-6 flex flex-col gap-4">

            {/* ── 1. Nav links ──────────────────────────────────────────────
                Full-width tap targets with generous vertical padding (py-3)
                for comfortable touch interaction.
                Active route gets `bg-muted text-primary`; inactive gets a
                `hover:bg-muted` hover state.                                 */}
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                // Close the menu as soon as the user taps a link
                onClick={onClose}
                className={`py-3 px-4 rounded-lg text-lg font-medium transition-colors ${
                  pathname === link.path
                    ? "bg-muted text-primary"       // active route
                    : "text-foreground hover:bg-muted" // inactive route
                }`}
              >
                {link.name}
              </Link>
            ))}

            {/* ── 2. Quick-action row ───────────────────────────────────────
                ThemeToggle sits on the left; Search and Cart are flex-1 so
                they share the remaining width equally.                        */}
            <div className="flex items-center gap-4 pt-4 border-t border-border mt-2">
              {/* Light / dark mode toggle */}
              <ThemeToggle />

              {/* Search shortcut — closes menu first, then opens the modal */}
              <button
                onClick={() => { onClose(); onOpenSearch(); }}
                className="flex-1 py-3 flex items-center justify-center gap-2 bg-muted rounded-lg"
              >
                <Search className="w-5 h-5" />
                <span>Search</span>
              </button>

              {/* Cart shortcut — shows inline count so user can see total
                  without opening the drawer; closes menu then opens drawer */}
              <button
                onClick={() => { onClose(); onOpenCart(); }}
                className="flex-1 py-3 flex items-center justify-center gap-2 bg-muted rounded-lg"
              >
                <ShoppingBag className="w-5 h-5" />
                {/* itemCount displayed inline: "Cart (3)" */}
                <span>Cart ({itemCount})</span>
              </button>
            </div>

            {/* ── 3. Account section ────────────────────────────────────────
                Renders different UI depending on authentication state.        */}
            {user ? (
              <>
                {/*
                 * Admin / Moderator Panel link — only shown once staffLoading
                 * resolves to avoid a flash of the link before roles are known.
                 * Label switches between "Moderator Panel" and "Admin Panel"
                 * based on the user's highest privilege level.
                 */}
                {!staffLoading && isStaff && (
                  <Link
                    to="/admin"
                    onClick={onClose}
                    className="w-full py-3 flex items-center justify-center gap-2 bg-primary/20 text-primary rounded-lg mt-2 font-semibold"
                  >
                    <LayoutDashboard className="w-5 h-5" />
                    {/* Show "Moderator Panel" for moderators who are NOT full admins */}
                    <span>{isModerator && !isAdmin ? "Moderator Panel" : "Admin Panel"}</span>
                  </Link>
                )}

                {/* My Profile link — lighter primary tint, non-destructive */}
                <Link
                  to="/profile"
                  onClick={onClose}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-primary/10 text-primary rounded-lg mt-2"
                >
                  <User className="w-5 h-5" />
                  <span>My Profile</span>
                </Link>

                {/* Sign Out — destructive tint; signs out then closes menu */}
                <button
                  onClick={() => { signOut(); onClose(); }}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-destructive/10 text-destructive rounded-lg mt-2"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              /* Unauthenticated — single Sign In link pointing to the auth page */
              <Link
                to="/auth"
                onClick={onClose}
                className="w-full py-3 flex items-center justify-center gap-2 bg-muted rounded-lg mt-2"
              >
                <User className="w-5 h-5" />
                <span>Sign In</span>
              </Link>
            )}

            {/* ── 4. Shop CTA ───────────────────────────────────────────────
                Full-width gold button at the bottom of the menu — highest
                visual weight so it acts as a clear conversion entry point.    */}
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
