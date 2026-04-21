import { useState } from "react";
import { NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Database, MessageSquare, Clock, Settings, ChevronLeft, ChevronRight, LogOut, User, CreditCard, Bookmark, Shield } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { canAccessAdmin, getPlanDefinition } from "@/lib/plans";

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: "bg-amber-500/10 text-amber-400",
  analyst: "bg-blue-500/10 text-blue-400",
  viewer: "bg-muted/60 text-muted-foreground",
};

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  // Read role directly from user object so Zustand re-renders when role changes
  const adminUser = canAccessAdmin(user?.planTier, user?.isPlanOwner);
  const plan = getPlanDefinition(user?.planTier);

  // Build nav items dynamically based on role
  const NAV_ITEMS = [
    { to: "/app/dashboard", icon: LayoutDashboard, label: "Dashboard", visible: true },
    { to: "/app/datasets", icon: Database, label: "Datasets", visible: true },
    { to: "/app/query", icon: MessageSquare, label: "Query", visible: true },
    { to: "/app/history", icon: Clock, label: "History", visible: true },
    { to: "/app/insights", icon: Bookmark, label: "Insights", visible: true },
    { to: "/app/admin", icon: Shield, label: "Admin", visible: adminUser },
    { to: "/app/settings", icon: Settings, label: "Settings", visible: true },
  ].filter((item) => item.visible);

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 flex flex-col bg-background-secondary border-r border-border transition-all duration-200 shrink-0",
        collapsed ? "w-[60px]" : "w-[240px]"
      )}
    >
      <div className={cn("flex items-center h-14 px-3 border-b border-border", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-sm font-semibold text-primary-foreground shrink-0">
              DV
            </div>
            <span className="text-sm font-semibold text-foreground truncate">DataVault Agent</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-sm font-semibold text-primary-foreground">
            DV
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn("text-muted-foreground hover:text-foreground transition-colors", collapsed && "absolute -right-3 top-4 bg-background-secondary border border-border rounded-full p-0.5 z-10")}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.to;
          const link = (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors relative",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-card"
              )}
            >
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r" />}
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </RouterNavLink>
          );

          if (collapsed) {
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

      <div className="border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn("flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-card transition-colors", collapsed && "justify-center")}>
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                {user?.avatarInitials || "U"}
              </div>
              {!collapsed && (
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                    <Badge className={`${ROLE_BADGE_COLORS[user?.role || "viewer"]} border-0 text-[10px] px-1.5 py-0 capitalize`}>
                      {user?.role || "viewer"}
                    </Badge>
                    <Badge className="bg-primary/10 text-primary border-0 text-[10px] px-1.5 py-0">
                      {plan.name}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side={collapsed ? "right" : "top"} className="w-56">
            <DropdownMenuItem onClick={() => navigate("/app/settings")}>
              <User size={14} className="mr-2" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/app/settings")}>
              <CreditCard size={14} className="mr-2" /> Billing
            </DropdownMenuItem>
            {adminUser && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/app/admin")}>
                  <Shield size={14} className="mr-2" /> Admin Panel
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={async () => { await logout(); navigate("/auth"); }} className="text-destructive focus:text-destructive">
              <LogOut size={14} className="mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
