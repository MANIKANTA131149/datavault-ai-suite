import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { CreditCard, LogOut, Shield, User } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { canAccessAdmin } from "@/lib/plans";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: "bg-amber-500/10 text-amber-400",
  analyst: "bg-blue-500/10 text-blue-400",
  viewer: "bg-muted/60 text-muted-foreground",
};

interface AccountMenuProps {
  trigger: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  onNavigate?: () => void;
}

export function AccountMenu({
  trigger,
  side = "bottom",
  align = "end",
  onNavigate,
}: AccountMenuProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { logout: auth0Logout, isAuthenticated: auth0Authenticated } = useAuth0();
  const adminUser = canAccessAdmin(user?.planTier, user?.isPlanOwner);

  const handleRoute = (to: string) => {
    onNavigate?.();
    navigate(to);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        className="w-60 rounded-2xl border border-border/70 bg-popover/95 p-2 shadow-[0_20px_44px_-30px_hsl(var(--foreground)/0.8)] backdrop-blur-sm"
      >
        <DropdownMenuLabel className="px-2 pb-2 pt-1">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/15 text-xs font-semibold text-primary">
              {user?.avatarInitials || "U"}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
                <Badge
                  className={`${ROLE_BADGE_COLORS[user?.role || "viewer"]} border-0 px-1.5 py-0 text-[10px] capitalize`}
                >
                  {user?.role || "viewer"}
                </Badge>
              </div>
              <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => handleRoute("/app/settings")}>
          <User size={14} className="mr-2" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleRoute("/app/pricing")}>
          <CreditCard size={14} className="mr-2" /> Plans & Billing
        </DropdownMenuItem>

        {adminUser && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleRoute("/app/admin")}>
              <Shield size={14} className="mr-2" /> Admin Panel
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={async () => {
            await logout();
            onNavigate?.();
            // If the user signed in via Auth0, clear that session too
            if (auth0Authenticated) {
              auth0Logout({ logoutParams: { returnTo: window.location.origin + "/auth" } });
            } else {
              navigate("/auth");
            }
          }}
          className="text-destructive focus:text-destructive"
        >
          <LogOut size={14} className="mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
