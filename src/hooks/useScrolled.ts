// ============= Full file contents =============

/**
 * @file useScrolled.ts
 * @module hooks/useScrolled
 *
 * @description
 * Lightweight hook that tracks whether the page has scrolled past a given
 * pixel threshold. Primarily used by the site `<Header>` to toggle a
 * background/shadow style once the user scrolls away from the very top of the
 * page (making the header visually "stick" in a styled state).
 *
 * ### Implementation notes
 * - The scroll listener is registered with `{ passive: true }` so the browser
 *   can optimise scroll performance — we never call `preventDefault()` here.
 * - The handler is invoked **once on mount** (before any scroll event fires)
 *   so the initial state is correct even if the page loads mid-scroll (e.g.
 *   after a browser back-navigation that restores scroll position).
 * - The listener is cleaned up in the `useEffect` teardown to prevent memory
 *   leaks when the consuming component unmounts.
 * - `threshold` is included in the effect dependency array so changing the
 *   threshold at runtime correctly re-registers the listener.
 */

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `window.scrollY` exceeds `threshold` pixels.
 *
 * @param threshold - Pixel offset from the top of the page that must be
 *   exceeded before the hook returns `true`. Defaults to `50` px.
 *
 * @returns `boolean` — `true` once the user has scrolled past `threshold`,
 *   `false` while at or above it.
 *
 * @example
 * // Header changes background after scrolling 50 px (default threshold)
 * const scrolled = useScrolled();
 *
 * <header className={scrolled ? "bg-background shadow-md" : "bg-transparent"}>
 *   …
 * </header>
 *
 * @example
 * // Custom threshold — trigger at 100 px
 * const scrolled = useScrolled(100);
 */
export const useScrolled = (threshold = 50) => {
  // Internal boolean state — only one bit of information needed
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    /**
     * Scroll event handler.
     * Compares the current vertical scroll position against `threshold` and
     * updates state only when the boolean result changes (React bails out of
     * a re-render if `setState` is called with the same value).
     */
    const onScroll = () => setScrolled(window.scrollY > threshold);

    // Run immediately on mount to capture any pre-existing scroll position
    // (e.g. page loaded with a URL hash or restored by the browser).
    onScroll();

    // Passive listener: tells the browser we won't block scrolling, enabling
    // compositor-thread optimisations for smoother scroll performance.
    window.addEventListener("scroll", onScroll, { passive: true });

    // Teardown: remove listener when component unmounts or threshold changes
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]); // re-register if threshold changes (supports dynamic use)

  return scrolled;
};
