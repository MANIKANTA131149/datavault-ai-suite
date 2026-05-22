import { useState } from "react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  Cable,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { canAccessAdmin } from "@/lib/plans";
import { AccountMenu } from "@/components/AccountMenu";

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin:   "bg-amber-500/10 text-amber-400",
  analyst: "bg-blue-500/10 text-blue-400",
  viewer:  "bg-muted/60 text-muted-foreground",
};

interface AppSidebarProps {
  className?: string;
  mobile?: boolean;
  onNavigate?: () => void;
}

export function AppSidebar({ className, mobile = false, onNavigate }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location                   = useLocation();
  const { user }                   = useAuthStore();

  const adminUser  = canAccessAdmin(user?.planTier, user?.isPlanOwner);
  const isCollapsed = mobile ? false : collapsed;

  const navItems = [
    { to: "/app/dashboard",   icon: LayoutDashboard, label: "Dashboard",   visible: true },
    { to: "/app/datasets",    icon: Database,         label: "Datasets",    visible: true },
    { to: "/app/connections", icon: Cable,            label: "Connections", visible: true },
    { to: "/app/query",       icon: MessageSquare,    label: "Query",       visible: true },
    { to: "/app/history",     icon: Clock,            label: "History",     visible: true },
    { to: "/app/insights",    icon: Bookmark,         label: "Insights",    visible: true },
    { to: "/app/admin",       icon: Shield,           label: "Admin",       visible: adminUser },
    { to: "/app/settings",    icon: Settings,         label: "Settings",    visible: true },
  ].filter((item) => item.visible);

  return (
    <aside
      className={cn(
        "relative min-h-0 flex flex-col border-r border-border/70 bg-background-secondary",
        mobile
          ? "h-full w-full max-w-xs"
          : cn(
              "sticky top-0 h-full shrink-0 overflow-hidden",
              "transition-[width] duration-200 ease-in-out",
              isCollapsed ? "w-[72px]" : "w-[248px]",
            ),
        className,
      )}
    >
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.1),_transparent_34%)]" />

      {/* Header */}
      <div
        className={cn(
          "relative flex min-h-16 items-center border-b border-border/70 px-3",
          isCollapsed ? "justify-center" : "justify-between",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Logo badge with pulsing glow */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground logo-pulse">
            DV
          </div>

          {/* Brand name — fades in/out on collapse */}
          {!isCollapsed && (
            <AnimatePresence initial={false}>
              <motion.div
                key="brand-name"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="min-w-0"
              >
                <span className="block truncate text-sm font-semibold text-foreground">DataVault Agent</span>
                {mobile && (
                  <span className="text-[11px] text-muted-foreground">Workspace navigation</span>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Collapse toggle — always visible on desktop */}
        {!mobile && (
          <motion.button
            type="button"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background-secondary text-muted-foreground shadow-sm transition-colors hover:text-foreground",
              isCollapsed && "absolute left-[52px] top-5 z-10",
            )}
          >
            <motion.span
              animate={{ rotate: isCollapsed ? 0 : 180 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
            </motion.span>
          </motion.button>
        )}
      </div>

      {/* Nav items */}
      <nav className="relative flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;

          const link = (
            <RouterNavLink
              key={item.to}
              to={item.to}
              onClick={() => onNavigate?.()}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-card/80 hover:text-foreground",
              )}
            >
              {/* Sliding active indicator using layoutId */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-indicator"
                  className="absolute left-1 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-primary/90"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}

              <item.icon size={18} className="shrink-0" />

              {/* Label fades in/out smoothly */}
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.span
                    key={`label-${item.to}`}
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.16 }}
                    className="truncate overflow-hidden whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
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

      {/* Account menu footer */}
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

              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    key="user-info"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.16 }}
                    className="min-w-0 flex-1 overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
                      <Badge
                        className={`${ROLE_BADGE_COLORS[user?.role || "viewer"]} border-0 px-1.5 py-0 text-[10px] capitalize`}
                      >
                        {user?.role || "viewer"}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          }
        />
      </div>
    </aside>
  );
}

