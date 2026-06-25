/**
 * @file BrandLogo.tsx
 * @module components/layout/header/BrandLogo
 *
 * @description
 * Brand mark displayed in the site header.
 *
 * **Responsive behaviour:**
 * - **Mobile (<md):** Round thumbnail from `mobileLogoUrl` (CMS-managed) with
 *   a text lockup ("DUBAI BORKA HOUSE") rendered beside it.
 * - **Desktop (≥md):** Full horizontal logo image (`logo-2.jpg`), hidden text.
 *
 * The mobile logo URL is fetched from the `site_content` table via
 * {@link useMobileLogo} and passed in as a prop. When `null` (not set in CMS
 * or still loading) the bundled static asset `mobile-logo.png` is used as
 * a fallback.
 */

import { Link } from "react-router-dom";
import logoImage from "@/assets/logo-2.jpg";           // desktop full logo
import mobileLogoImage from "@/assets/mobile-logo.png"; // static fallback mobile logo

// ---------------------------------------------------------------------------
// Prop types
// ---------------------------------------------------------------------------

/**
 * Props accepted by {@link BrandLogo}.
 */
interface BrandLogoProps {
  /**
   * CMS-managed mobile logo URL from the `site_content` table.
   * `null` when the row is missing or not yet loaded — triggers static fallback.
   */
  mobileLogoUrl: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Clickable brand mark that navigates to the home route (`/`).
 *
 * @remarks
 * Two `<img>` elements are rendered simultaneously; Tailwind's `md:hidden` /
 * `hidden md:block` utilities toggle which is visible based on breakpoint.
 * This avoids a layout shift that would occur if the image were swapped via JS.
 *
 * The text lockup on mobile uses a multi-layer `textShadow` to achieve a
 * glowing gold outline effect that remains readable over any header background.
 *
 * @param props - See {@link BrandLogoProps}.
 * @returns A `<Link>` wrapping the logo image(s) and brand name text.
 */
const BrandLogo = ({ mobileLogoUrl }: BrandLogoProps) => (
  /* Clicking anywhere on the logo navigates to the home page */
  <Link to="/" className="flex items-center gap-3 group">

    {/*
     * Mobile round logo thumbnail — visible only below the `md` breakpoint.
     * Prefers the CMS URL; falls back to the bundled static PNG when null.
     * The border + rounded-full styling gives it the "avatar" look in the mobile header.
     */}
    <img
      src={mobileLogoUrl || mobileLogoImage}
      alt="Dubai Borka House Logo"
      className="h-11 w-11 rounded-full object-cover border-2 border-primary/30 md:hidden"
    />

    {/*
     * Desktop full logo — hidden on mobile, shown from the `md` breakpoint upward.
     * `dark:brightness-100 brightness-90 contrast-110` tweaks the logo appearance
     * in light mode while leaving it untouched in dark mode.
     */}
    <img
      src={logoImage}
      alt="Dubai Borka House Logo"
      className="hidden md:block h-14 w-auto object-contain dark:brightness-100 brightness-90 contrast-110"
    />

    {/*
     * Brand name text lockup — mobile only (md:hidden).
     * "DUBAI BORKA HOUSE" — brand name / ব্র্যান্ডের নাম
     * The multi-value `textShadow` creates:
     *   • A gold glow (hsl(--primary))
     *   • A 1-px black stroke on all four diagonals for legibility on any background.
     */}
    <span
      className="font-display text-lg font-black tracking-widest md:hidden uppercase leading-tight text-white dark:text-white"
      style={{
        textShadow:
          "0 0 8px hsl(var(--primary) / 0.6), 0 0 20px hsl(var(--primary) / 0.3), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
      }}
    >
      DUBAI BORKA HOUSE
    </span>
  </Link>
);

export default BrandLogo;
