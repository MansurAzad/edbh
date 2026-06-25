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

/** Desktop user dropdown: profile, admin (if staff), sign out. Falls back to a sign-in link. */
const UserMenu = () => {
  const { user, signOut } = useAuth();
  const { isStaff, isAdmin, isModerator, loading: staffLoading } = useAdminAuth();

  if (!user) {
    return (
      <Link to="/auth" aria-label="Sign in" className="p-2 hover:bg-muted rounded-full transition-colors">
        <User className="w-5 h-5 text-foreground" />
      </Link>
    );
  }

  const adminLabel = isModerator && !isAdmin ? "Moderator Panel" : "Admin Panel";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="Account" className="p-2 hover:bg-muted rounded-full transition-colors">
          <User className="w-5 h-5 text-primary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link to="/profile" className="cursor-pointer">
            <User className="w-4 h-4 mr-2" />
            My Profile
          </Link>
        </DropdownMenuItem>
        {!staffLoading && isStaff && (
          <DropdownMenuItem asChild>
            <Link to="/admin" className="cursor-pointer text-primary">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              {adminLabel}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/profile" className="cursor-pointer text-muted-foreground text-xs">
            {user.email}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => signOut()} className="text-destructive cursor-pointer">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
