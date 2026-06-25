/**
 * @file DesktopHeader.tsx
 * @module components/layout/header/DesktopHeader
 *
 * @description
 * Desktop-only (`lg:flex`) header region containing:
 *   - Primary navigation links (Home, MegaMenu, additional nav links)
 *   - Utility action bar: ThemeToggle, Search, Wishlist, UserMenu, Cart, Shop CTA
 *
 * Hidden on mobile/tablet (`hidden lg:flex`) — the mobile equivalent is
 * {@link MobileMenu}.
 *
 * **Active-link detection:** uses `useLocation` to compare `pathname` against
 * each link's `path`, applying a gold underline + primary colour to the active item.
 *
 * **Badge overflow:** counts > 99 render as "99+" to keep the badge legible.
 */

import { Link, useLocation } from "react-router-dom";
import { Search, Heart, ShoppingBag } from "lucide-react";
import MegaMenu from "@/components/layout/MegaMenu";
import ThemeToggle from "@/components/layout/ThemeToggle";
import UserMenu from "./UserMenu";

// ---------------------------------------------------------------------------
// Prop types
// ---------------------------------------------------------------------------

/** A single navigation entry passed from the parent header. */
interface NavLink {
  /** Human-readable link label, e.g. "About". */
  name: string;
  /** Absolute path, e.g. "/about". */
  path: string;
}

/**
 * Props accepted by {@link DesktopHeader}.
 */
interface DesktopHeaderProps {
  /**
   * Full nav-link list. Home (`/`) and Shop (`/shop`) are handled separately
   * (Home is hard-coded first; Shop appears as the CTA button), so those are
   * filtered out of the dynamic link rendering.
   */
  navLinks: NavLink[];
  /** Number of items in the wishlist — drives the heart badge count. */
  wishlistCount: number;
  /** Number of items in the cart — drives the bag badge count. */
  cartCount: number;
  /** Opens the global search modal / command palette. */
  onOpenSearch: () => void;
  /** Opens the cart side-drawer. */
  onOpenCart: () => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Numeric count badge rendered over icon buttons.
 * Returns `null` when `count` is 0 to avoid rendering an empty badge.
 *
 * @param count     - Number to display (capped at 99 for display).
 * @param className - Tailwind positioning + colour classes.
 * @returns A `<span>` badge, or `null`.
 */
const Badge = ({ count, className }: { count: number; className: string }) =>
  count > 0 ? (
    // Show "99+" when count exceeds 2 digits to keep the badge width consistent
    <span className={className}>{count > 99 ? "99+" : count}</span>
  ) : null;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Desktop navigation and action bar.
 *
 * @remarks
 * Rendered as a React Fragment so the parent `<header>` flex container can
 * place the nav and actions on opposite ends with `justify-between`.
 *
 * Nav link filter: `"/"` is always rendered as the hard-coded "Home" link;
 * `"/shop"` is surfaced as the gold CTA button at the far right instead.
 * Both are excluded from the dynamic `navLinks.map()` to avoid duplicates.
 *
 * @param props - See {@link DesktopHeaderProps}.
 * @returns A fragment containing the `<nav>` and the utility action `<div>`.
 */
const DesktopHeader = ({
  navLinks,
  wishlistCount,
  cartCount,
  onOpenSearch,
  onOpenCart,
}: DesktopHeaderProps) => {
  // useLocation provides the current pathname for active-link detection
  const { pathname } = useLocation();

  /**
   * Builds the CSS class string for a nav link.
   * `gold-underline` is a project-level Tailwind utility that draws an
   * animated underline in the primary (gold) colour on hover/active.
   *
   * @param active - Whether this link matches the current route.
   * @returns Tailwind class string.
   */
  const linkClass = (active: boolean) =>
    `gold-underline text-sm font-medium tracking-wide uppercase transition-colors ${
      active ? "text-primary" : "text-foreground hover:text-primary"
    }`;

  return (
    <>
      {/* ── Primary navigation ────────────────────────────────────────────
          Hidden on all viewports below `lg` (1024 px).                     */}
      <nav className="hidden lg:flex items-center gap-8">

        {/* Home link — always first, active when on the root path */}
        <Link to="/" className={linkClass(pathname === "/")}>Home</Link>

        {/*
         * MegaMenu — shop/collections fly-out; handles the "/shop" path
         * internally, which is why "/shop" is excluded from the dynamic list.
         */}
        <MegaMenu />

        {/*
         * Dynamic nav links — filtered to remove "/" (Home, already above)
         * and "/shop" (handled by MegaMenu + CTA button).
         */}
        {navLinks
          .filter((l) => l.path !== "/" && l.path !== "/shop")
          .map((link) => (
            <Link key={link.path} to={link.path} className={linkClass(pathname === link.path)}>
              {link.name}
            </Link>
          ))}
      </nav>

      {/* ── Utility action bar ────────────────────────────────────────────
          Also hidden below `lg`.                                             */}
      <div className="hidden lg:flex items-center gap-4">

        {/* Light / dark mode toggle */}
        <ThemeToggle />

        {/* Search button — triggers the search modal / command palette */}
        <button
          onClick={onOpenSearch}
          aria-label="Search"
          className="p-2 hover:bg-muted rounded-full transition-colors"
        >
          <Search className="w-5 h-5 text-foreground" />
        </button>

        {/* Wishlist icon link with badge (secondary colour = gold tint) */}
        <Link to="/wishlist" aria-label="Wishlist" className="relative p-2 hover:bg-muted rounded-full transition-colors">
          <Heart className="w-5 h-5 text-foreground" />
          <Badge
            count={wishlistCount}
            className="absolute -top-1 -right-1 w-5 h-5 bg-secondary text-secondary-foreground text-xs flex items-center justify-center rounded-full"
          />
        </Link>

        {/* Authenticated user dropdown (sign-in link when logged out) */}
        <UserMenu />

        {/* Cart button — opens the side-drawer; badge uses primary colour */}
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

        {/* Gold CTA button — navigates to the full shop listing */}
        <Link to="/shop" className="btn-gold ml-4 text-sm !py-2 !px-6">Shop Now</Link>
      </div>
    </>
  );
};

export default DesktopHeader;
