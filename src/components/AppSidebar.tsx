import { useState } from "react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  Cable,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  CreditCard,
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
  admin:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  analyst: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  viewer:  "bg-muted/60 text-muted-foreground border-muted-foreground/20",
};

interface NavItem {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

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

  const navSections: NavSection[] = [
    {
      label: "Overview",
      items: [
        { to: "/app/get-started", icon: Compass,        label: "Get Started" },
        { to: "/app/dashboard",   icon: LayoutDashboard, label: "Dashboard"   },
      ],
    },
    {
      label: "Data",
      items: [
        { to: "/app/datasets",    icon: Database, label: "Datasets"    },
        { to: "/app/connections", icon: Cable,    label: "Connections" },
      ],
    },
    {
      label: "Analyze",
      items: [
        { to: "/app/query",    icon: MessageSquare, label: "Query"    },
        { to: "/app/history",  icon: Clock,         label: "History"  },
        { to: "/app/insights", icon: Bookmark,      label: "Insights" },
      ],
    },
    {
      label: "Account",
      items: [
        { to: "/app/pricing",  icon: CreditCard, label: "Pricing"  },
        ...(adminUser ? [{ to: "/app/admin", icon: Shield, label: "Admin" }] : []),
        { to: "/app/settings", icon: Settings,   label: "Settings" },
      ],
    },
  ];

  return (
    <aside
      className={cn(
        "relative flex min-h-0 flex-col",
        "border-r border-border/45 bg-background-secondary",
        mobile
          ? "h-full w-full max-w-xs"
          : cn(
              "sticky top-0 h-full shrink-0 overflow-hidden",
              "transition-[width] duration-200 ease-in-out",
              isCollapsed ? "w-[72px]" : "w-[256px]",
            ),
        className,
      )}
    >
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_hsl(var(--primary)/0.04),_transparent_45%)]" />

      {/* Header / Logo */}
      <div
        className={cn(
          "relative flex min-h-[60px] items-center border-b border-border/60 px-3",
          isCollapsed ? "justify-center" : "justify-between",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Logo badge */}
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 logo-pulse overflow-hidden p-1.5">
            <img src="/logo.png" alt="Querify Agent Logo" className="h-full w-full object-contain" />
          </div>

          {!isCollapsed && (
            <AnimatePresence initial={false}>
              <motion.div
                key="brand-name"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.15 }}
                className="min-w-0"
              >
                <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                  Querify Agent
                </p>
                {mobile && (
                  <p className="text-[11px] text-muted-foreground">Workspace</p>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Collapse toggle */}
        {!mobile && (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <motion.button
                type="button"
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={() => setCollapsed((v) => !v)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-lg",
                  "border border-border/70 bg-background-secondary",
                  "text-muted-foreground shadow-sm",
                  "transition-all duration-150 hover:border-border hover:bg-card hover:text-foreground",
                  isCollapsed && "absolute -right-3 top-[18px] z-10 bg-background shadow-[0_2px_10px_-2px_hsl(var(--foreground)/0.18)]",
                )}
              >
                <motion.span
                  animate={{ rotate: isCollapsed ? 0 : 180 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
                </motion.span>
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isCollapsed ? "Expand" : "Collapse"} sidebar
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Navigation */}
      <nav
        className="relative flex-1 overflow-y-auto px-2 py-2"
        aria-label="Main navigation"
      >
        {navSections.map((section, sectionIndex) => (
          <div key={section.label} className={cn(sectionIndex > 0 && "mt-1")}>
            {/* Section divider / label */}
            {sectionIndex > 0 && (
              isCollapsed ? (
                <div className="mx-auto my-2 h-px w-8 rounded-full bg-border/40" />
              ) : (
                <AnimatePresence initial={false}>
                  <motion.p
                    key={`section-${section.label}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="px-3 pb-1 pt-2.5 section-label"
                  >
                    {section.label}
                  </motion.p>
                </AnimatePresence>
              )
            )}

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = location.pathname === item.to;

                const link = (
                  <RouterNavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => onNavigate?.()}
                    className={cn(
                      "group relative flex items-center rounded-xl px-2 py-1.5 text-[13px] font-medium",
                      "transition-colors duration-150",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-card/80 hover:text-foreground",
                      isCollapsed && "justify-center",
                    )}
                  >
                    {/* Sliding active indicator */}
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active-indicator"
                        className="absolute left-1 top-2 bottom-2 w-[3px] rounded-full bg-primary"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}

                    {/* Icon container */}
                    <span
                      className={cn(
                        "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg",
                        "transition-colors duration-150",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground group-hover:bg-card/60 group-hover:text-foreground",
                      )}
                    >
                      <item.icon size={16} />
                    </span>

                    {/* Label */}
                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                        <motion.span
                          key={`label-${item.to}`}
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "auto" }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ duration: 0.15 }}
                          className="ml-2 truncate overflow-hidden whitespace-nowrap"
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
                      <TooltipContent side="right" className="font-medium">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return link;
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Account menu footer */}
      <div className="relative border-t border-border/60 p-2">
        <AccountMenu
          side={isCollapsed ? "right" : "top"}
          onNavigate={onNavigate}
          trigger={
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2",
                "border border-transparent",
                "transition-all duration-150",
                "hover:border-border/60 hover:bg-card/70",
                isCollapsed && "justify-center px-2",
              )}
            >
              {/* Avatar with online dot */}
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/15 text-xs font-semibold text-primary">
                {user?.avatarInitials || "U"}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background-secondary bg-success" />
              </div>

              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    key="user-info"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="min-w-0 flex-1 overflow-hidden text-left"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-[13px] font-medium leading-tight text-foreground">
                        {user?.name}
                      </p>
                      <Badge
                        className={cn(
                          "shrink-0 border px-1.5 py-0 text-[9px] font-semibold capitalize leading-none",
                          ROLE_BADGE_COLORS[user?.role || "viewer"],
                        )}
                      >
                        {user?.role || "viewer"}
                      </Badge>
                    </div>
                    <p className="truncate text-[11px] leading-snug text-muted-foreground">
                      {user?.email}
                    </p>
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
