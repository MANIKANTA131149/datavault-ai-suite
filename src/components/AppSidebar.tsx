import { useState } from "react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Database,
  MessageSquare,
  Clock,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Shield,
  Cable,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { canAccessAdmin } from "@/lib/plans";
import { AccountMenu } from "@/components/AccountMenu";

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: "bg-amber-500/10 text-amber-400",
  analyst: "bg-blue-500/10 text-blue-400",
  viewer: "bg-muted/60 text-muted-foreground",
};

interface AppSidebarProps {
  className?: string;
  mobile?: boolean;
  onNavigate?: () => void;
}

export function AppSidebar({ className, mobile = false, onNavigate }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user } = useAuthStore();

  const adminUser = canAccessAdmin(user?.planTier, user?.isPlanOwner);
  const isCollapsed = mobile ? false : collapsed;

  const navItems = [
    { to: "/app/dashboard", icon: LayoutDashboard, label: "Dashboard", visible: true },
    { to: "/app/datasets", icon: Database, label: "Datasets", visible: true },
    { to: "/app/connections", icon: Cable, label: "Connections", visible: true },
    { to: "/app/query", icon: MessageSquare, label: "Query", visible: true },
    { to: "/app/history", icon: Clock, label: "History", visible: true },
    { to: "/app/insights", icon: Bookmark, label: "Insights", visible: true },
    { to: "/app/admin", icon: Shield, label: "Admin", visible: adminUser },
    { to: "/app/settings", icon: Settings, label: "Settings", visible: true },
  ].filter((item) => item.visible);

  return (
    <aside
      className={cn(
        "relative min-h-0 flex flex-col border-r border-border/70 bg-background-secondary",
        mobile
          ? "h-full w-full max-w-xs"
          : cn(
              "sticky top-0 h-full shrink-0 overflow-hidden transition-all duration-200",
              isCollapsed ? "w-[72px]" : "w-[248px]",
            ),
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.1),_transparent_34%)]" />

      <div
        className={cn(
          "relative flex min-h-16 items-center border-b border-border/70 px-3",
          isCollapsed ? "justify-center" : "justify-between",
        )}
      >
        {!isCollapsed ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-[0_18px_34px_-18px_hsl(var(--primary)/0.95)]">
              DV
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">DataVault Agent</span>
              {mobile && <span className="text-[11px] text-muted-foreground">Workspace navigation</span>}
            </div>
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-[0_18px_34px_-18px_hsl(var(--primary)/0.95)]">
            DV
          </div>
        )}

        {!mobile && (
          <button
            type="button"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
            className={cn(
              "text-muted-foreground transition-colors hover:text-foreground",
              isCollapsed &&
                "absolute left-[60px] top-4 z-10 rounded-full border border-border/70 bg-background-secondary p-0.5 shadow-sm",
            )}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        )}
      </div>

      <nav className="relative flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          const link = (
            <RouterNavLink
              key={item.to}
              to={item.to}
              onClick={() => onNavigate?.()}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-[background-color,color,transform] duration-200",
                isActive
                  ? "bg-primary/10 text-primary shadow-[0_14px_28px_-24px_hsl(var(--primary)/0.95)]"
                  : "text-muted-foreground hover:bg-card/80 hover:text-foreground",
              )}
            >
              {isActive && (
                <div className="absolute left-1 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-primary/90" />
              )}
              <item.icon size={18} className="shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </RouterNavLink>
          );

          if (isCollapsed) {
            return (
              <Tooltip key={item.to} delayDuration={0}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return link;
        })}
      </nav>

      <div className="relative border-t border-border/70 p-2">
        <AccountMenu
          side={isCollapsed ? "right" : "top"}
          onNavigate={onNavigate}
          trigger={
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-[20px] border border-transparent bg-card/60 px-3 py-2.5 text-left transition-colors hover:border-border/70 hover:bg-card/90",
                isCollapsed && "justify-center",
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/20 text-xs font-semibold text-primary">
                {user?.avatarInitials || "U"}
              </div>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
                    <Badge
                      className={`${ROLE_BADGE_COLORS[user?.role || "viewer"]} border-0 px-1.5 py-0 text-[10px] capitalize`}
                    >
                      {user?.role || "viewer"}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
              )}
            </button>
          }
        />
      </div>
    </aside>
  );
}
