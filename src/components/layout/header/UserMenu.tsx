// ============= Full file contents =============

/**
 * @file UserMenu.tsx
 * @module components/layout/header/UserMenu
 *
 * @description
 * Desktop user account dropdown rendered in the {@link DesktopHeader} action bar.
 *
 * ### Render branches
 * | Auth state        | Output                                              |
 * |-------------------|-----------------------------------------------------|
 * | No session        | Plain icon `<Link>` → `/auth` (sign-in page)        |
 * | Authenticated     | Shadcn `DropdownMenu` with profile, admin, sign-out |
 *
 * ### Dropdown items (authenticated)
 * 1. **My Profile** — navigates to `/profile`.
 * 2. **Admin / Moderator Panel** *(staff only, after role check resolves)* —
 *    navigates to `/admin`; label switches based on highest privilege level.
 * 3. **Email display** — read-only item showing the signed-in user's email.
 * 4. **Sign Out** — calls `signOut()` from {@link AuthContext}.
 *
 * ### Staff label logic
 * - `isModerator && !isAdmin` → `"Moderator Panel"`
 * - otherwise (full admin or higher) → `"Admin Panel"`
 *
 * The admin link is intentionally hidden while `staffLoading` is `true` to
 * prevent a flash of privilege for non-staff users whose role resolves async.
 */

import { Link } from "react-router-dom";
import { User, LogOut, LayoutDashboard } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminAuth } from "@/hooks/useAdminAuth";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Desktop user account control.
 *
 * Renders a plain sign-in icon link when there is no active session, or a
 * fully featured dropdown menu when a user is authenticated.
 *
 * @returns A `<Link>` (unauthenticated) or a Shadcn `<DropdownMenu>` (authenticated).
 *
 * @example
 * // Drop-in usage inside the desktop action bar — no props required
 * <UserMenu />
 */
const UserMenu = () => {
  // user: the Supabase auth user object (null when logged out)
  // signOut: async action to invalidate the session and clear auth state
  const { user, signOut } = useAuth();

  // isStaff: true for any privileged role (admin, moderator, etc.)
  // isAdmin / isModerator: granular role flags for label differentiation
  // staffLoading: true until the role query resolves — gate the admin link on this
  const { isStaff, isAdmin, isModerator, loading: staffLoading } = useAdminAuth();

  // ── Unauthenticated branch ──────────────────────────────────────────────
  // No session: render a minimal icon link to the auth page.
  // Using a Link (not a button) so it gets native anchor semantics & prefetch.
  if (!user) {
    return (
      <Link
        to="/auth"
        aria-label="Sign in"
        className="p-2 hover:bg-muted rounded-full transition-colors"
      >
        {/* User icon in neutral foreground — not tinted until authenticated */}
        <User className="w-5 h-5 text-foreground" />
      </Link>
    );
  }

  // ── Derive admin panel label ────────────────────────────────────────────
  // Show the more specific "Moderator Panel" label for moderators who do NOT
  // also hold the full admin role, keeping the label honest about access level.
  const adminLabel = isModerator && !isAdmin ? "Moderator Panel" : "Admin Panel";

  // ── Authenticated branch ────────────────────────────────────────────────
  return (
    <DropdownMenu>
      {/* Trigger: user icon button tinted with primary colour when authenticated */}
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account"
          className="p-2 hover:bg-muted rounded-full transition-colors"
        >
          {/* Primary-tinted icon signals an active/authenticated session */}
          <User className="w-5 h-5 text-primary" />
        </button>
      </DropdownMenuTrigger>

      {/* Dropdown panel — right-aligned to stay within the viewport edge */}
      <DropdownMenuContent align="end" className="w-48">

        {/* My Profile — primary account management destination */}
        <DropdownMenuItem asChild>
          <Link to="/profile" className="cursor-pointer">
            <User className="w-4 h-4 mr-2" />
            My Profile
          </Link>
        </DropdownMenuItem>

        {/*
         * Admin / Moderator Panel — conditionally rendered.
         * Guard: staffLoading must be false (roles resolved) AND user must be
         * staff to prevent any flash of the link for non-privileged users.
         */}
        {!staffLoading && isStaff && (
          <DropdownMenuItem asChild>
            {/* Primary colour text to visually distinguish the privileged action */}
            <Link to="/admin" className="cursor-pointer text-primary">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              {adminLabel}
            </Link>
          </DropdownMenuItem>
        )}

        {/* Email display — read-only, muted styling; links to profile for editing */}
        <DropdownMenuItem asChild>
          <Link to="/profile" className="cursor-pointer text-muted-foreground text-xs">
            {/* Shows the authenticated user's email address as a passive reminder */}
            {user.email}
          </Link>
        </DropdownMenuItem>

        {/* Sign Out — destructive text colour signals a session-ending action */}
        <DropdownMenuItem
          onClick={() => signOut()}
          className="text-destructive cursor-pointer"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
