import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useClerk, useUser } from "@clerk/react";
import { CreditCard, LogOut, Settings, Shield, ShieldCheck, Zap } from "lucide-react";
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
import { ClerkUserProfileModal } from "@/components/ClerkUserProfileModal";
import { cn } from "@/lib/utils";

const PLAN_COLORS: Record<string, string> = {
  free:         "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700/50",
  standard:     "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700/50",
  professional: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700/50",
  enterprise:   "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700/50",
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin:   "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  analyst: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  viewer:  "bg-muted text-muted-foreground",
};

interface AccountMenuProps {
  trigger: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  onNavigate?: () => void;
}

export function AccountMenu({ trigger, side = "bottom", align = "end", onNavigate }: AccountMenuProps) {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { user: clerkUser } = useUser();
  const { user, token, logout } = useAuthStore();
  const adminUser = canAccessAdmin(user?.planTier, user?.isPlanOwner);
  const [profileOpen, setProfileOpen] = useState(false);

  const [dailyTokens, setDailyTokens] = useState<{
    tokensUsed: number;
    limit: number;
    percentage: number;
  } | null>(null);

  const fetchDailyTokens = useCallback(async () => {
    if (user?.planTier !== "free" || !token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/llm/token-usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDailyTokens(await res.json());
    } catch { /* ignore */ }
  }, [user?.planTier, token]);

  useEffect(() => { fetchDailyTokens(); }, [fetchDailyTokens]);

  const handleRoute = (to: string) => { onNavigate?.(); navigate(to); };

  const handleSignOut = async () => {
    onNavigate?.();
    // Clear local store first, then let Clerk redirect — ClerkAuthBridge
    // will also call logout() when it detects isSignedIn=false, but clearing
    // here prevents any flash of authenticated UI during the redirect.
    logout();
    await signOut({ redirectUrl: "/auth" });
  };

  // Clerk profile image or initials avatar
  const clerkAvatar = clerkUser?.imageUrl;
  const hasMfa = (clerkUser?.twoFactorEnabled) ?? false;
  const planColor = PLAN_COLORS[user?.planTier ?? "free"];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          side={side}
          className="w-64 rounded-2xl border border-border bg-popover p-2 shadow-lg"
        >
          {/* ── User identity block ─────────────────────────────────────── */}
          <DropdownMenuLabel className="px-2 pb-2 pt-1">
            <div className="flex items-center gap-3">
              {/* Avatar: Clerk profile photo or initials */}
              <div className="relative h-10 w-10 shrink-0">
                {clerkAvatar ? (
                  <img
                    src={clerkAvatar}
                    alt={user?.name || ""}
                    className="h-10 w-10 rounded-full border border-primary/20 object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/15 text-xs font-bold text-primary">
                    {user?.avatarInitials || "U"}
                  </div>
                )}
                {hasMfa && (
                  <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-emerald-500">
                    <ShieldCheck size={9} className="text-white" strokeWidth={2.5} />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-foreground">{user?.name}</p>
                  <Badge className={cn("border px-1.5 py-0 text-[10px] capitalize", ROLE_BADGE_COLORS[user?.role || "viewer"])}>
                    {user?.role || "viewer"}
                  </Badge>
                </div>
                <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
                {/* Plan badge */}
                <span className={cn("mt-1 inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-semibold capitalize", planColor)}>
                  {user?.planTier || "free"} plan
                </span>
              </div>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          {/* ── Daily usage bar (free tier only) ───────────────────────── */}
          {user?.planTier === "free" && dailyTokens && (
            <>
              <div className="px-2.5 py-2 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-medium">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Zap size={11} className="text-primary fill-primary animate-pulse" />
                    Daily Free Limits
                  </span>
                  <span className={cn(
                    "font-semibold tabular-nums",
                    dailyTokens.percentage >= 95 ? "text-destructive" : dailyTokens.percentage >= 75 ? "text-amber-400" : "text-primary",
                  )}>
                    {dailyTokens.percentage}%
                  </span>
                </div>

                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary/80">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500 ease-out",
                      dailyTokens.percentage >= 95
                        ? "bg-gradient-to-r from-red-500 to-rose-600 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                        : dailyTokens.percentage >= 75
                          ? "bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                          : "bg-gradient-to-r from-blue-400 to-primary shadow-[0_0_8px_rgba(59,130,246,0.5)]",
                    )}
                    style={{ width: `${Math.max(2, dailyTokens.percentage)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                  <span>{dailyTokens.tokensUsed.toLocaleString()} / {dailyTokens.limit.toLocaleString()} tokens</span>
                  <span>Resets 00:00 UTC</span>
                </div>
              </div>
              <DropdownMenuSeparator />
            </>
          )}

          {/* ── Navigation items (order: Settings → Manage Account → Plans) ── */}
          <DropdownMenuItem onClick={() => handleRoute("/app/settings")}>
            <Settings size={14} className="mr-2" /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setProfileOpen(true); onNavigate?.(); }}>
            <Shield size={14} className="mr-2" /> Manage Account
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

          <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
            <LogOut size={14} className="mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clerk account management modal */}
      <ClerkUserProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
