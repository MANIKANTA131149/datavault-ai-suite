import { useEffect, useRef, useState, Suspense } from "react";
import { useLocation, Outlet, Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  Cable,
  ChevronRight,
  Clock,
  Database,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/AppSidebar";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
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
import { useCommandStore } from "@/stores/command-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProviderLogo } from "@/components/ProviderLogo";
import { toast } from "@/lib/toast";

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
  // Insights — temporarily disabled, will release later
  // { label: "Insights", icon: Bookmark,        path: "/app/insights" },
  { label: "History",  icon: Clock,           path: "/app/history" },
  { label: "Settings", icon: Settings,        path: "/app/settings" },
];

// ─── Page Content Loader ──────────────────────────────────────────────────────
// Shown while a lazy-loaded page chunk is downloading, so navigation never
// leaves the content area blank.
function PageContentLoader() {
  return (
    <div className="flex min-h-full items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

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
        background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))",
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
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_hsl(var(--foreground)/0.12)] backdrop-blur-2xl md:hidden"
      aria-label="Mobile navigation"
    >
      <div
        className="relative grid"
        style={{ gridTemplateColumns: `repeat(${MOBILE_NAV_ITEMS.length}, minmax(0, 1fr))` }}
      >
        {/* Sliding top indicator */}
        {active && (
          <motion.div
            layoutId="mobile-tab-pill"
            className="pointer-events-none absolute top-0 left-0 h-[2px] rounded-b-full"
            style={{
              background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))",
              width: `${100 / MOBILE_NAV_ITEMS.length}%`,
              x: `${MOBILE_NAV_ITEMS.indexOf(active) * 100}%`,
            }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
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
              className="flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition-colors duration-150"
              style={{
                color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                opacity: isActive ? 1 : 0.65,
              }}
            >
              <motion.span
                animate={isActive ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-150",
                  isActive ? "bg-primary/10" : "",
                )}
              >
                <Icon size={17} strokeWidth={isActive ? 2.25 : 1.75} />
              </motion.span>
              <span className={cn("text-[10px]", isActive ? "font-semibold" : "font-medium")}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────
export default function AppLayout() {
  const { user, hasHydrated, hydrateRole, logout } = useAuthStore();
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
  const { setOpen: openCommand }       = useCommandStore();
  const [sidebarOpen, setSidebarOpen]  = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  useEffect(() => {
    if (user) {
      let cancelled = false;
      setBootstrapping(true);
      void (async () => {
        await Promise.allSettled([
          fetchDatasets(),
          fetchHistory(),
          fetchSettings(),
          fetchInsights(),
          fetchNotifications(),
          fetchConnections(),
          fetchPlan(),
          hydrateRole(),
        ]);
        if (!cancelled) setBootstrapping(false);
      })();
      return () => {
        cancelled = true;
      };
    } else {
      applyTheme(theme);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = () => {
      void (async () => {
        toast.error("Session expired. Please sign in again.");
        await logout();
        navigate("/auth", { replace: true });
      })();
    };

    window.addEventListener("datavault:unauthorized", handler, { once: true });
    return () => window.removeEventListener("datavault:unauthorized", handler);
  }, [logout, navigate]);

  if (!hasHydrated) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-11 w-11">
            <div className="absolute inset-0 rounded-full border-2 border-primary/8" />
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <div className="absolute inset-[5px] rounded-full border border-primary/15" />
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <p className="text-[13px] font-medium text-foreground">Loading</p>
            <p className="text-[11px] text-muted-foreground">Please wait…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (bootstrapping) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-11 w-11">
            <div className="absolute inset-0 rounded-full border-2 border-primary/8" />
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <div className="absolute inset-[5px] rounded-full border border-primary/15" />
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <p className="text-[13px] font-medium text-foreground">Setting up workspace</p>
            <p className="text-[11px] text-muted-foreground">Fetching your data…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <AppSidebar className="hidden md:flex" />

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-full max-w-xs border-r border-border bg-background-secondary p-0 md:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Browse Querify sections and account controls.</SheetDescription>
          </SheetHeader>
          <AppSidebar mobile onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.04),_transparent_30%)]" />

        <header className="relative shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-xl">
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
                <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <span className="shrink-0 rounded-md border border-primary/20 bg-primary/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary sm:text-[11px]">
                    Querify
                  </span>
                  <ChevronRight size={13} className="shrink-0 text-muted-foreground/40" />
                  <span className="truncate font-medium text-foreground">
                    {BREADCRUMBS[location.pathname] || "Page"}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:hidden">
                  {PROVIDER_LABELS[activeProvider]} · {activeModel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Cmd+K search trigger */}
              <button
                type="button"
                aria-label="Open command palette"
                onClick={() => openCommand(true)}
                className="hidden items-center gap-2 rounded-lg border border-border/45 bg-background/50 px-2.5 py-1.5 text-[12px] text-muted-foreground/70 transition-colors hover:border-border/70 hover:bg-background/80 hover:text-muted-foreground sm:flex"
              >
                <Search size={12} className="shrink-0" />
                <span className="hidden lg:inline">Search</span>
                <span className="flex items-center gap-0.5">
                  <kbd className="rounded border border-border/40 bg-muted/30 px-1 font-mono text-[10px] leading-4">⌘</kbd>
                  <kbd className="rounded border border-border/40 bg-muted/30 px-1 font-mono text-[10px] leading-4">K</kbd>
                </span>
              </button>

              <Badge
                variant="outline"
                className="hidden max-w-[20rem] items-center gap-1.5 rounded-lg border-border/60 bg-background/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground backdrop-blur-sm sm:inline-flex"
              >
                <ProviderLogo provider={activeProvider} size="sm" />
                <span className="truncate">
                  {PROVIDER_LABELS[activeProvider]} · {activeModel}
                </span>
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-card/80 hover:text-foreground"
                aria-label={theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "Switch to light mode" : "Switch to dark mode"}
                onClick={async () => {
                  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
                  setTheme(isDark ? "light" : "dark");
                  try { await saveSettings(); } catch { /* DOM already updated */ }
                }}
              >
                {(theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches))
                  ? <Sun size={15} />
                  : <Moon size={15} />}
              </Button>
              <NotificationBell />
              <AccountMenu
                trigger={
                  <button
                    type="button"
                    aria-label="Open account menu"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-xs font-semibold text-primary transition-all duration-150 hover:border-primary/40 hover:bg-primary/15 hover:shadow-[0_0_12px_-2px_hsl(var(--primary)/0.3)]"
                  >
                    {user.avatarInitials}
                  </button>
                }
              />
            </div>
          </div>
        </header>

        <main className="relative min-h-0 flex-1 overflow-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <RouteErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageContentLoader />}>
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
            </Suspense>
          </RouteErrorBoundary>
        </main>

        <MobileBottomNav />
      </div>
    </div>
  );
}

