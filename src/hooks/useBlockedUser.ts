/**
 * @file useBlockedUser.ts
 * @module hooks/useBlockedUser
 *
 * @description
 * Provides two utilities for checking whether a user account is blocked:
 *
 * 1. `useBlockedUser` – React hook for use inside components.  Watches the
 *    current session via `AuthContext` and fetches block status from Supabase
 *    whenever the user changes.  Automatically resets to "not blocked" when
 *    the user signs out (user becomes null).
 *
 * 2. `checkIfBlocked` – Async helper for use *outside* React (e.g. in login
 *    handlers, route loaders) that accepts an explicit `userId` and resolves
 *    with a `BlockedInfo` object.
 *
 * Supabase table: `blocked_users`
 *  Relevant columns: `user_id`, `is_active` (bool), `reason` (text).
 *  Only rows with `is_active = true` are treated as an active block.
 *
 * Caching: none — this data is intentionally NOT cached in React Query.
 *   A freshly executed query on each user change ensures a user cannot
 *   "wait out" a block by holding an old query cache entry.
 *
 * Auth requirement: `useBlockedUser` reads the user from `AuthContext`.
 *   No session = no query = returns `{ isBlocked: false, loading: false }`.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result shape returned by both `useBlockedUser` and `checkIfBlocked`.
 */
interface BlockedInfo {
  /** `true` if the user has at least one active block record. */
  isBlocked: boolean;
  /**
   * Human-readable reason string stored by an admin.
   * Empty string when `isBlocked` is `false`.
   * বাংলা: অ্যাডমিন কর্তৃক প্রদত্ত ব্লকের কারণ।
   */
  reason: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook that checks whether the currently authenticated user is blocked.
 *
 * Re-runs the check automatically whenever the `user` object from
 * `AuthContext` changes (sign-in, sign-out, session refresh with a new user).
 *
 * @example
 * ```tsx
 * const { isBlocked, reason, loading } = useBlockedUser();
 * if (isBlocked) return <BlockedScreen reason={reason} />;
 * ```
 *
 * @returns {object}
 *   - `isBlocked` – `true` if the user has an active block entry.
 *   - `reason`    – Admin-supplied reason text (empty string if not blocked).
 *   - `loading`   – `true` while the Supabase query is in-flight.
 *
 * @sideEffects
 *  - Executes a Supabase `.from("blocked_users")` query on mount and whenever
 *    `user` changes.
 *  - No subscriptions or intervals; relies solely on React effect re-runs.
 */
export const useBlockedUser = () => {
  const { user } = useAuth();

  // Initialise as "not blocked" to prevent accidental access gates during load.
  const [blockedInfo, setBlockedInfo] = useState<BlockedInfo>({ isBlocked: false, reason: "" });

  // True while the block check network request is in flight.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No authenticated user → no need to query; reset to safe defaults.
    if (!user) {
      setBlockedInfo({ isBlocked: false, reason: "" });
      setLoading(false);
      return;
    }

    // Async block check scoped to the current user's id.
    const check = async () => {
      // `.maybeSingle()` returns null (not an error) when no row is found.
      const { data } = await supabase
        .from("blocked_users")
        .select("reason")
        .eq("user_id", user.id)
        .eq("is_active", true) // Only consider active blocks.
        .maybeSingle();

      setBlockedInfo(data ? { isBlocked: true, reason: data.reason } : { isBlocked: false, reason: "" });
      setLoading(false);
    };

    check();
  }, [user]); // Re-run whenever the signed-in user changes.

  // Spread blockedInfo fields (isBlocked, reason) alongside loading.
  return { ...blockedInfo, loading };
};

// ---------------------------------------------------------------------------
// Static helper (usable outside React)
// ---------------------------------------------------------------------------

/**
 * Standalone async helper that checks the block status for a given `userId`.
 *
 * Intended for use at login time (before the user object is stored in context)
 * or inside non-component code such as form submission handlers.
 *
 * @example
 * ```ts
 * const { isBlocked, reason } = await checkIfBlocked(userId);
 * if (isBlocked) showError(`Your account has been blocked: ${reason}`);
 * ```
 *
 * @param userId - The Supabase auth `user.id` (UUID) to look up.
 * @returns {Promise<BlockedInfo>} Resolves with `{ isBlocked, reason }`.
 *
 * @sideEffects Executes a direct Supabase query (no caching layer).
 */
export const checkIfBlocked = async (userId: string): Promise<BlockedInfo> => {
  const { data } = await supabase
    .from("blocked_users")
    .select("reason")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  return data ? { isBlocked: true, reason: data.reason } : { isBlocked: false, reason: "" };
};
