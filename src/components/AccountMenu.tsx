import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { CreditCard, LogOut, Shield, User, Zap } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { canAccessAdmin } from "@/lib/plans";
import { getApiBaseUrl } from "@/lib/api-base";
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
  const { user, token, logout } = useAuthStore();
  const { logout: auth0Logout, isAuthenticated: auth0Authenticated } = useAuth0();
  const adminUser = canAccessAdmin(user?.planTier, user?.isPlanOwner);

  const [dailyTokens, setDailyTokens] = useState<{
    tokensUsed: number;
    limit: number;
    queriesUsed: number;
    queryLimit: number;
    percentage: number;
  } | null>(null);

  const fetchDailyTokens = useCallback(async () => {
    if (user?.planTier !== "free" || !token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/llm/token-usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDailyTokens(data);
      }
    } catch (e) {
      console.error("Failed to fetch daily token usage:", e);
    }
  }, [user?.planTier, token]);

  useEffect(() => {
    console.log("[Daily Token Tracker] Current User Plan Tier:", user?.planTier, "| Has Token:", !!token, "| Daily Tokens Data:", dailyTokens);
    fetchDailyTokens();
  }, [fetchDailyTokens, user?.planTier, token]);

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

        {user?.planTier === "free" && dailyTokens && (
          <>
            <div className="px-2.5 py-2 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Zap size={11} className="text-primary fill-primary animate-pulse" />
                  Daily Free Bedrock Limits
                </span>
                <span className={`font-semibold ${
                  dailyTokens.percentage >= 95
                    ? "text-destructive"
                    : dailyTokens.percentage >= 75
                      ? "text-warning"
                      : "text-primary"
                }`}>
                  {dailyTokens.percentage}%
                </span>
              </div>

              {/* Sleek dynamic gradient progress bar */}
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary/80">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    dailyTokens.percentage >= 95
                      ? "bg-gradient-to-r from-red-500 to-rose-600 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                      : dailyTokens.percentage >= 75
                        ? "bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                        : "bg-gradient-to-r from-blue-400 to-primary shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                  }`}
                  style={{ width: `${dailyTokens.percentage}%` }}
                />
              </div>

              <div className="flex flex-col gap-1 text-[9px] text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>{dailyTokens.tokensUsed.toLocaleString()} / {dailyTokens.limit.toLocaleString()} tokens</span>
                  <span>{(dailyTokens.queriesUsed || 0).toLocaleString()} / {(dailyTokens.queryLimit || 25).toLocaleString()} queries</span>
                </div>
                <div className="text-[8px] text-right text-muted-foreground/80">Resets 00:00 UTC</div>
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

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
