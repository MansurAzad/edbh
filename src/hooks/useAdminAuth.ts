/**
 * @file useAdminAuth.ts
 * @module hooks/useAdminAuth
 *
 * @description
 * Determines whether the currently signed-in user has admin/moderator
 * privileges and exposes their granular staff permissions.
 *
 * Data sources (Supabase):
 *  - `user_roles`       – rows contain `role` ("admin" | "moderator")
 *  - `staff_permissions`– rows contain individual `permission` strings
 *
 * Caching strategy (React Query):
 *  - `staleTime: 0`  — every mount treats cached data as stale and refetches.
 *  - `gcTime: 0`     — cached data is garbage-collected immediately after the
 *                      last consumer unmounts (no lingering stale permissions).
 *  - `refetchOnMount: "always"` + `refetchOnWindowFocus: true`
 *    + `refetchOnReconnect: true` — aggressive refresh ensures the UI always
 *    reflects the latest role assignment, important for security-sensitive gates.
 *
 * Query key: `["staff-role", user?.id]`
 *  - Scoped to the logged-in user's id so that switching accounts never
 *    accidentally returns a previous user's roles.
 *
 * Auth event listener:
 *  A `supabase.auth.onAuthStateChange` subscription is registered in a
 *  `useEffect`.  On SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED /
 *  INITIAL_SESSION the `["staff-role"]` query family is invalidated, forcing a
 *  fresh role lookup.  On SIGNED_OUT the cached data is removed entirely.
 *  The subscription is cleaned up on unmount.
 *
 * Auth requirement: user must be signed in.  If `user` is null, the hook
 *   returns safe defaults (`isAdmin: false`, empty permissions) without
 *   making any network requests.
 */

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * Hook that resolves admin/moderator status and staff permissions for the
 * currently authenticated user.
 *
 * Intended usage: guard admin routes, conditionally render management UI,
 * or gate individual actions with `hasPermission()`.
 *
 * @example
 * ```tsx
 * const { isAdmin, hasPermission, loading } = useAdminAuth();
 * if (loading) return <Spinner />;
 * if (!isAdmin) return <Navigate to="/" />;
 * ```
 *
 * @returns {object}
 *   - `isAdmin`       – `true` if the user has the "admin" role.
 *   - `isModerator`   – `true` if the user has the "moderator" role.
 *   - `isStaff`       – `true` if the user is either admin or moderator.
 *   - `permissions`   – array of granular permission strings from
 *                       `staff_permissions` (e.g. `"manage_orders"`).
 *   - `hasPermission` – `(perm: string) => boolean` — returns `true` if the
 *                       user is an admin (full access) OR has the specific perm.
 *   - `loading`       – `true` while either the auth context or the role query
 *                       is still resolving.
 *   - `user`          – the raw Supabase `User` object (or `null` if signed out).
 *
 * @sideEffects
 *  - Registers a Supabase auth state change listener on mount.
 *  - Invalidates / removes the `["staff-role"]` query cache on relevant auth
 *    events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.).
 *  - Unsubscribes the auth listener on unmount.
 */
export const useAdminAuth = () => {
  // Consume base auth state (user identity + loading flag) from context.
  const { user, loading: authLoading } = useAuth();

  // queryClient is used to imperatively invalidate/remove role cache on auth events.
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // Auth event subscription
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Listen for auth state transitions so role data stays fresh after
    // sign-in, token refresh, or sign-out without requiring a page reload.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "INITIAL_SESSION"].includes(event)) {
        // Force a fresh role lookup for the new session.
        queryClient.invalidateQueries({ queryKey: ["staff-role"] });
      }
      if (event === "SIGNED_OUT") {
        // Remove stale role data so the next sign-in starts clean.
        queryClient.removeQueries({ queryKey: ["staff-role"] });
      }
    });

    // Cleanup: unsubscribe when the component using this hook unmounts.
    return () => subscription.unsubscribe();
  }, [queryClient]); // queryClient is stable; effect only runs once.

  // -------------------------------------------------------------------------
  // Role + permissions query
  // -------------------------------------------------------------------------
  const { data: roleInfo, isLoading } = useQuery({
    /**
     * Cache key scoped to the user's id.
     * Different users on the same device never share cached role data.
     */
    queryKey: ["staff-role", user?.id],

    queryFn: async () => {
      // If no user is present, return safe "no access" defaults immediately.
      if (!user) return { isAdmin: false, isModerator: false, permissions: [] as string[] };

      // Fetch roles and permissions in parallel to minimise latency.
      const [rolesRes, permsRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("staff_permissions").select("permission").eq("user_id", user.id),
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (permsRes.error) throw permsRes.error;

      const roles = (rolesRes.data || []).map((r) => r.role as string);
      return {
        isAdmin: roles.includes("admin"),
        isModerator: roles.includes("moderator"),
        permissions: (permsRes.data || []).map((p) => p.permission),
      };
    },

    // Only run when auth has finished loading AND a user is present.
    enabled: !authLoading && !!user,

    // Always re-fetch on mount/focus/reconnect — role changes must be reflected
    // immediately without needing the user to hard-refresh.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Destructure with safe defaults so callers never receive `undefined`.
  const isAdmin = roleInfo?.isAdmin ?? false;
  const isModerator = roleInfo?.isModerator ?? false;
  const permissions = roleInfo?.permissions ?? [];

  return {
    isAdmin,
    isModerator,
    /** Convenience flag: true if the user holds any staff role. */
    isStaff: isAdmin || isModerator,
    permissions,
    /**
     * Returns `true` if the user is an admin (bypasses all checks) OR if their
     * `staff_permissions` list explicitly includes `perm`.
     *
     * @param perm - Permission string to test (e.g. `"manage_orders"`).
     */
    hasPermission: (perm: string) => isAdmin || permissions.includes(perm),
    /** `true` while either the auth context or the role query is in-flight. */
    loading: isLoading || authLoading,
    user,
  };
};
