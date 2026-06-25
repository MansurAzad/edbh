// ============= Full file contents =============

/**
 * @file useSearchHotkey.ts
 * @module hooks/useSearchHotkey
 *
 * @description
 * Registers a **global keyboard shortcut** (`Cmd+K` on macOS / `Ctrl+K` on
 * Windows & Linux) that opens the site's search modal / command palette.
 *
 * This is the standard "universal search" hotkey pattern popularised by tools
 * like VS Code, Linear, and Vercel's dashboard.
 *
 * ### Behaviour
 * - Listens on `document` (not a specific element) so the shortcut works
 *   regardless of which element currently has focus.
 * - Calls `e.preventDefault()` to suppress the browser's default
 *   `Ctrl+K` behaviour (focus the address bar in some browsers / create a
 *   hyperlink in rich-text editors).
 * - Listener is cleaned up in the `useEffect` teardown to prevent duplicate
 *   handlers if the consuming component re-mounts.
 * - `onTrigger` is listed as an effect dependency; callers should wrap the
 *   callback in `useCallback` if it is defined inline to avoid unnecessary
 *   re-registrations on every render.
 */

import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Attaches a `keydown` listener to `document` that fires `onTrigger` when
 * the user presses **Cmd+K** (macOS) or **Ctrl+K** (Windows / Linux).
 *
 * @param onTrigger - Callback invoked when the hotkey is pressed.
 *   Typically opens the search modal or command palette.
 *   Wrap in `useCallback` when defined inline to stabilise the reference
 *   and prevent the effect from re-running on every parent render.
 *
 * @returns `void` — side-effect only; no return value.
 *
 * @example
 * // In a layout component or header
 * const [searchOpen, setSearchOpen] = useState(false);
 *
 * // Stable callback reference — effect only re-registers if setSearchOpen changes
 * const openSearch = useCallback(() => setSearchOpen(true), []);
 * useSearchHotkey(openSearch);
 */
export const useSearchHotkey = (onTrigger: () => void) => {
  useEffect(() => {
    /**
     * `keydown` handler that checks for the Cmd/Ctrl+K combination.
     *
     * `e.metaKey`  — true on macOS when the Command (⌘) key is held.
     * `e.ctrlKey`  — true on Windows/Linux when the Control key is held.
     * Both are checked with OR (`||`) so the shortcut works cross-platform.
     *
     * @param e - The native KeyboardEvent from the document listener.
     */
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        // Prevent the browser's native Cmd/Ctrl+K action (e.g. address-bar
        // focus in Firefox, link-creation in some rich-text editors)
        e.preventDefault();
        onTrigger();
      }
    };

    // Attach to document so the hotkey fires regardless of focused element
    document.addEventListener("keydown", handler);

    // Teardown: deregister when the component unmounts or onTrigger changes
    // to avoid stale closures and duplicate handler registrations.
    return () => document.removeEventListener("keydown", handler);
  }, [onTrigger]); // re-register only when the callback reference changes
};
