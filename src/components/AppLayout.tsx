import { useEffect, useRef, useState } from "react";
import { useLocation, Outlet, Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  Cable,
  Clock,
  Database,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/stores/auth-store";
import { useLLMStore, PROVIDER_LABELS } from "@/stores/llm-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useInsightsStore } from "@/stores/insights-store";
import { usePlanStore } from "@/stores/plan-store";
import { useNotificationsStore } from "@/stores/notifications-store";
import { useConnectionStore } from "@/stores/connection-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProviderLogo } from "@/components/ProviderLogo";

const BREADCRUMBS: Record<string, string> = {
  "/app/get-started": "Get Started",
  "/app/dashboard": "Dashboard",
  "/app/datasets": "Datasets",
  "/app/connections": "Connections",
  "/app/query": "Query",
  "/app/history": "History",
  "/app/insights": "Insights",
  "/app/admin": "Admin",
  "/app/settings": "Settings",
};

const MOBILE_NAV_ITEMS = [
  { label: "Home",     icon: LayoutDashboard, path: "/app/dashboard" },
  { label: "Query",    icon: MessageSquare,   path: "/app/query" },
  { label: "Insights", icon: Bookmark,        path: "/app/insights" },
  { label: "Settings", icon: Settings,        path: "/app/settings" },
];

// ─── Page Progress Bar ────────────────────────────────────────────────────────
function PageProgressBar({ locationKey }: { locationKey: string }) {
  const [visible, setVisible] = useState(false);
  const [width, setWidth]     = useState(0);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVisible(true);
    setWidth(0);

    // Rapid ramp to 80%, then freeze until page finishes
    const t1 = setTimeout(() => setWidth(30),  30);
    const t2 = setTimeout(() => setWidth(65),  120);
    const t3 = setTimeout(() => setWidth(82),  260);

    // Complete and hide
    const t4 = setTimeout(() => setWidth(100), 380);
    const t5 = setTimeout(() => setVisible(false), 640);

    timerRef.current = t5;
    return () => {
      [t1, t2, t3, t4, t5].forEach(clearTimeout);
    };
  }, [locationKey]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 h-[2.5px] z-50 progress-bar-glow rounded-r-full"
      style={{
        width: `${width}%`,
        background: "linear-gradient(90deg, hsl(217 91% 60%), hsl(263 70% 58%))",
        transition: width === 100
          ? "width 0.18s ease-out"
          : "width 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    />
  );
}

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────
function MobileBottomNav() {
  const location = useLocation();
  const navigate  = useNavigate();
  
  // Smart route mapper to align adjacent pages and sub-routes with bottom navigation tabs
  const active = MOBILE_NAV_ITEMS.find((item) => {
    if (location.pathname === item.path) return true;
    
    // Align sub-routes and similar modules functionality-wise
    if (item.path === "/app/dashboard") {
      return location.pathname === "/app/get-started";
    }
    if (item.path === "/app/query") {
      return (
        location.pathname === "/app/history" ||
        location.pathname === "/app/datasets" ||
        location.pathname === "/app/connections"
      );
    }
    if (item.path === "/app/settings") {
      return (
        location.pathname === "/app/pricing" ||
        location.pathname.startsWith("/app/admin")
      );
    }
    return false;
  });

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-background/96 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-22px_hsl(var(--foreground)/0.85)] backdrop-blur-xl md:hidden"
      aria-label="Mobile navigation"
    >
      <div 
        className="relative grid"
        style={{ gridTemplateColumns: `repeat(${MOBILE_NAV_ITEMS.length}, minmax(0, 1fr))` }}
      >
        {/* Sliding pill indicator */}
        {active && (
          <motion.div
            layoutId="mobile-tab-pill"
            className="pointer-events-none absolute top-0 left-0 h-[2px] rounded-full"
            style={{
              background: "linear-gradient(90deg, hsl(217 91% 60%), hsl(263 70% 58%))",
              width: `${100 / MOBILE_NAV_ITEMS.length}%`,
              x: `${MOBILE_NAV_ITEMS.indexOf(active) * 100}%`,
            }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          />
        )}

        {MOBILE_NAV_ITEMS.map(({ label, icon: Icon, path }) => {
          const isActive = active?.path === path;
          return (
            <button
              key={path}
              type="button"
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => navigate(path)}
              className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors duration-150"
              style={{ color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))", opacity: isActive ? 1 : 0.6 }}
            >
              <motion.span
                animate={isActive ? { scale: [1, 1.22, 1] } : { scale: 1 }}
                transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
                className="flex items-center justify-center"
              >
                <Icon size={18} strokeWidth={isActive ? 2.2 : 1.7} />
              </motion.span>
              <span className={isActive ? "font-semibold" : ""}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────
export default function AppLayout() {
  const { user, hydrateRole }         = useAuthStore();
  const location                       = useLocation();
  const navigate                       = useNavigate();
  const { activeProvider, activeModel } = useLLMStore();
  const { fetchDatasets }              = useDatasetStore();
  const { fetchHistory }               = useHistoryStore();
  const { fetchSettings, applyTheme, theme, setTheme, saveSettings } = useSettingsStore();
  const { fetchInsights }              = useInsightsStore();
  const { fetchPlan }                  = usePlanStore();
  const { fetchNotifications }         = useNotificationsStore();
  const { fetchConnections }           = useConnectionStore();
  const [sidebarOpen, setSidebarOpen]  = useState(false);

  useEffect(() => {
    if (user) {
      fetchDatasets();
      fetchHistory();
      fetchSettings();
      fetchInsights();
      fetchNotifications();
      fetchConnections();
      fetchPlan();
      hydrateRole();
    } else {
      applyTheme(theme);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <AppSidebar className="hidden md:flex" />

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-full max-w-xs border-r border-border bg-background-secondary p-0 md:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Browse DataVault sections and account controls.</SheetDescription>
          </SheetHeader>
          <AppSidebar mobile onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.08),_transparent_34%)]" />

        <header className="relative shrink-0 border-b border-border/70 bg-background/70 backdrop-blur-xl">
          <PageProgressBar locationKey={location.pathname} />
          <div className="flex min-h-14 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation menu"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu size={18} />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <span className="shrink-0 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-primary sm:text-[11px]">
                    DataVault
                  </span>
                  <span className="truncate font-medium text-foreground">
                    {BREADCRUMBS[location.pathname] || "Page"}
                  </span>
                </div>
                <p className="truncate text-[11px] text-muted-foreground sm:hidden">
                  {PROVIDER_LABELS[activeProvider]} | {activeModel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Badge
                variant="outline"
                className="hidden max-w-[18rem] items-center gap-1.5 font-mono text-xs text-muted-foreground sm:inline-flex"
              >
                <ProviderLogo provider={activeProvider} size="sm" />
                <span className="truncate">
                  {PROVIDER_LABELS[activeProvider]} | {activeModel}
                </span>
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label={theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "Switch to light mode" : "Switch to dark mode"}
                onClick={async () => {
                  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
                  setTheme(isDark ? "light" : "dark");
                  try { await saveSettings(); } catch { /* DOM already updated */ }
                }}
              >
                {(theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches))
                  ? <Sun size={16} />
                  : <Moon size={16} />}
              </Button>
              <NotificationBell />
              <AccountMenu
                trigger={
                  <button
                    type="button"
                    aria-label="Open account menu"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-semibold text-primary shadow-[0_10px_24px_-18px_hsl(var(--primary)/0.95)] transition-colors hover:bg-primary/15"
                  >
                    {user.avatarInitials}
                  </button>
                }
              />
            </div>
          </div>
        </header>

        <main className="relative min-h-0 flex-1 overflow-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16 }}
              className="min-h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        <MobileBottomNav />
      </div>
    </div>
  );
}

