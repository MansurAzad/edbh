/**
 * @file use-mobile.tsx
 * @module hooks/use-mobile
 *
 * @description
 * Provides a single boolean hook that reports whether the current browser
 * viewport is narrower than the defined mobile breakpoint (768 px).
 *
 * Mechanism:
 *  - Reads `window.innerWidth` on first render to set an immediate value.
 *  - Attaches a `MediaQueryList` "change" event listener so the value
 *    re-evaluates whenever the user resizes the window across the boundary —
 *    no polling interval is needed.
 *  - The listener is cleaned up on unmount (no memory leak).
 *
 * No network calls, no auth dependency, no external state.
 */

import * as React from "react";

/**
 * The pixel width below which the viewport is considered "mobile".
 * The media query targets `max-width: (MOBILE_BREAKPOINT - 1)px` so that
 * exactly 768 px is treated as non-mobile (tablet/desktop territory).
 */
const MOBILE_BREAKPOINT = 768;

/**
 * Returns `true` when the browser viewport is in mobile width (< 768 px).
 *
 * @example
 * ```tsx
 * const isMobile = useIsMobile();
 * return isMobile ? <MobileNav /> : <DesktopNav />;
 * ```
 *
 * @returns {boolean} `true` if `window.innerWidth < 768`, `false` otherwise.
 *   Starts as `false` (coerced from `undefined`) on the very first synchronous
 *   render, then resolves to the real value after the first effect flush —
 *   effectively immediate for end-users.
 *
 * @sideEffects
 *  - Registers a `MediaQueryList` "change" listener on mount.
 *  - Removes the listener on unmount via the effect cleanup function.
 */
export function useIsMobile() {
  // Initialise as `undefined` so we can distinguish "not yet measured" from
  // a known `false`. The `!!` cast at the return site converts it to boolean.
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    // Build a MediaQueryList that matches viewports narrower than the breakpoint.
    // Using `max-width: 767px` (BREAKPOINT - 1) means 768 px is non-mobile.
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    // Handler fired whenever the viewport crosses the breakpoint boundary.
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Subscribe to future changes.
    mql.addEventListener("change", onChange);

    // Set the initial value immediately (avoids a blank render).
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);

    // Cleanup: remove listener when the component unmounts or the effect re-runs.
    return () => mql.removeEventListener("change", onChange);
  }, []); // Empty deps — the listener only needs to be registered once.

  // Coerce `undefined` → `false` so callers always receive a plain boolean.
  return !!isMobile;
}
