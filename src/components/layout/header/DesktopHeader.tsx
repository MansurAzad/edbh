// ============= Full file contents =============

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
 *
 * **Layout contract:** the component returns a React Fragment (`<>…</>`).
 * The parent `<header>` is expected to be a flex container with
 * `justify-between` so that `<nav>` sits on the left and the action bar sits
 * on the right without any extra wrapper div.
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
   * filtered out of the dynamic link rendering to avoid duplicate entries.
   */
  navLinks: NavLink[];
  /** Number of items in the wishlist — drives the heart badge count. */
  wishlistCount: number;
  /** Number of items in the cart — drives the shopping-bag badge count. */
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
 * Returns `null` when `count` is 0 to avoid rendering an empty badge element.
 *
 * @param count     - Raw numeric count (capped visually at 99).
 * @param className - Tailwind positioning + colour classes supplied by the
 *                    caller so the badge can be reused across different icons.
 * @returns A `<span>` badge with the formatted count, or `null`.
 *
 * @example
 * // Renders "3" badge in primary colour
 * <Badge count={3} className="absolute -top-1 -right-1 … bg-primary" />
 *
 * @example
 * // Renders "99+" when count exceeds two digits
 * <Badge count={150} className="…" /> // → "99+"
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
 * ### Nav link filter
 * - `"/"` is always rendered as the hard-coded **Home** link at the far left.
 * - `"/shop"` is surfaced as the gold CTA button at the far right AND handled
 *   internally by {@link MegaMenu}, so it is excluded from the dynamic
 *   `navLinks.map()` to avoid duplicates.
 *
 * ### Accessibility
 * All icon-only buttons carry an `aria-label` so screen readers can announce
 * their purpose without needing visible text.
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
  // useLocation provides the current pathname for active-link detection.
  // We only need pathname; destructuring avoids holding the full location object.
  const { pathname } = useLocation();

  /**
   * Builds the CSS class string for a nav link.
   *
   * `gold-underline` is a project-level Tailwind utility that draws an
   * animated underline in the primary (gold) colour on hover/active states.
   *
   * @param active - Whether this link matches the current route.
   * @returns Tailwind class string including active/inactive colour variant.
   */
  const linkClass = (active: boolean) =>
    `gold-underline text-sm font-medium tracking-wide uppercase transition-colors ${
      active ? "text-primary" : "text-foreground hover:text-primary"
    }`;

  return (
    <>
      {/* ── Primary navigation ────────────────────────────────────────────
          The `hidden lg:flex` combo hides this bar on all viewports below
          1024 px (lg breakpoint) — MobileMenu takes over below that.        */}
      <nav className="hidden lg:flex items-center gap-8">

        {/* Home link — always first in the nav; active when on the root path */}
        <Link to="/" className={linkClass(pathname === "/")}>Home</Link>

        {/*
         * MegaMenu — shop/collections fly-out mega-dropdown.
         * It owns the "/shop" route internally, which is why "/shop" is
         * excluded from the dynamic list rendered below.
         */}
        <MegaMenu />

        {/*
         * Dynamic nav links — sourced from the CMS / site settings.
         * Filter removes:
         *   "/"     → already rendered as the hard-coded Home link above.
         *   "/shop" → owned by MegaMenu and the CTA button; duplicating it
         *             here would create two active-state conflicts.
         */}
        {navLinks
          .filter((l) => l.path !== "/" && l.path !== "/shop")
          .map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={linkClass(pathname === link.path)}
            >
              {link.name}
            </Link>
          ))}
      </nav>

      {/* ── Utility action bar ────────────────────────────────────────────
          Also hidden below the `lg` breakpoint (1024 px).
          Items are ordered left-to-right: ThemeToggle → Search → Wishlist
          → UserMenu → Cart → Shop CTA.                                       */}
      <div className="hidden lg:flex items-center gap-4">

        {/* Light / dark mode toggle — no count badge needed */}
        <ThemeToggle />

        {/* Search button — triggers the global search modal / command palette.
            The same action is also available via the Cmd/Ctrl+K hotkey
            (registered in useSearchHotkey at the header level). */}
        <button
          onClick={onOpenSearch}
          aria-label="Search"
          className="p-2 hover:bg-muted rounded-full transition-colors"
        >
          <Search className="w-5 h-5 text-foreground" />
        </button>

        {/* Wishlist icon with count badge.
            Uses secondary colour (gold tint) to visually distinguish it from
            the cart badge which uses the primary (gold) colour. */}
        <Link
          to="/wishlist"
          aria-label="Wishlist"
          className="relative p-2 hover:bg-muted rounded-full transition-colors"
        >
          <Heart className="w-5 h-5 text-foreground" />
          <Badge
            count={wishlistCount}
            // Secondary colour = lighter gold tint, distinct from cart badge
            className="absolute -top-1 -right-1 w-5 h-5 bg-secondary text-secondary-foreground text-xs flex items-center justify-center rounded-full"
          />
        </Link>

        {/* Authenticated user dropdown.
            Renders a sign-in link when no session is present (handled inside
            UserMenu itself — no conditional here needed). */}
        <UserMenu />

        {/* Cart button — opens the slide-in side-drawer.
            Badge uses primary (gold) colour to make it the most prominent
            count indicator in the action bar. */}
        <button
          onClick={onOpenCart}
          aria-label="Cart"
          className="relative p-2 hover:bg-muted rounded-full transition-colors"
        >
          <ShoppingBag className="w-5 h-5 text-foreground" />
          <Badge
            count={cartCount}
            // Primary colour badge — most visually prominent count indicator
            className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs flex items-center justify-center rounded-full"
          />
        </button>

        {/* Gold CTA button — navigates to the full shop listing page.
            `btn-gold` is a global Tailwind utility class; `!py-2 !px-6`
            overrides the default button padding with `!important` to keep
            this button slightly smaller than standalone CTAs on content pages. */}
        <Link to="/shop" className="btn-gold ml-4 text-sm !py-2 !px-6">
          Shop Now
        </Link>
      </div>
    </>
  );
};

export default DesktopHeader;
