import { useEffect, useRef, useState, Suspense } from "react";
import { useLocation, Outlet, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Bookmark,
  Cable,
  ChevronRight,
  Clock,
  CreditCard,
  Database,
  LayoutDashboard,
  LayoutPanelTop,
  Menu,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Search,
  Settings,
  Sun,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/AppSidebar";
import { GuidedTour } from "@/components/GuidedTour";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/stores/auth-store";
import { useLLMStore } from "@/stores/llm-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useInsightsStore } from "@/stores/insights-store";
import { usePlanStore } from "@/stores/plan-store";
import { useNotificationsStore } from "@/stores/notifications-store";
import { useConnectionStore } from "@/stores/connection-store";
import { useCommandStore } from "@/stores/command-store";
import { PlanBanner } from "@/components/PlanBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { getApiBaseUrl } from "@/lib/api-base";

const BREADCRUMBS: Record<string, string> = {
  "/app/get-started": "Get Started",
  "/app/dashboard": "Dashboard",
  "/app/datasets": "Datasets",
  "/app/connections": "Connections",
  "/app/query": "Query",
  "/app/history": "History",
  "/app/insights": "Insights",
  "/app/automations": "Automations",
  "/app/dashboards": "Reports",
  "/app/glossary": "Glossary",
  "/app/admin": "Admin",
  "/app/settings": "Settings",
};

// Primary tabs shown directly in the bottom bar (5 = comfortable mobile max).
const MOBILE_NAV_ITEMS = [
  { label: "Home",     icon: LayoutDashboard, path: "/app/dashboard" },
  { label: "Data",     icon: Database,        path: "/app/datasets" },
  { label: "Query",    icon: MessageSquare,   path: "/app/query" },
  { label: "History",  icon: Clock,           path: "/app/history" },
];

// Everything else lives in a neat "More" sheet so the bar stays uncluttered.
const MOBILE_MORE_ITEMS = [
  { label: "Connections", icon: Cable,          path: "/app/connections" },
  { label: "Reports",     icon: LayoutPanelTop, path: "/app/dashboards" },
  { label: "Automations", icon: Zap,            path: "/app/automations" },
  { label: "Glossary",    icon: BookOpen,       path: "/app/glossary" },
  { label: "Pricing",     icon: CreditCard,     path: "/app/pricing" },
  { label: "Settings",    icon: Settings,       path: "/app/settings" },
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
  const [moreOpen, setMoreOpen] = useState(false);

  // Map sub-routes/related pages onto the nearest primary tab so the indicator
  // still highlights sensibly when you're on a page that isn't its own tab.
  const active = MOBILE_NAV_ITEMS.find((item) => {
    if (location.pathname === item.path) return true;
    if (item.path === "/app/dashboard") return location.pathname === "/app/get-started";
    if (item.path === "/app/data") return false;
    return false;
  });

  // A "More" page is active when the current route lives in the More sheet.
  const moreActive = MOBILE_MORE_ITEMS.some((m) =>
    location.pathname === m.path || location.pathname.startsWith(m.path + "/"),
  ) || location.pathname.startsWith("/app/admin");

  // 5 columns: 4 primary tabs + the More button.
  const COLUMNS = MOBILE_NAV_ITEMS.length + 1;
  const activeIndex = active ? MOBILE_NAV_ITEMS.indexOf(active) : moreActive ? MOBILE_NAV_ITEMS.length : -1;

  const go = (path: string) => { setMoreOpen(false); navigate(path); };

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_hsl(var(--foreground)/0.12)] backdrop-blur-2xl md:hidden"
        aria-label="Mobile navigation"
      >
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
        >
          {/* Sliding top indicator */}
          {activeIndex >= 0 && (
            <motion.div
              layoutId="mobile-tab-pill"
              className="pointer-events-none absolute top-0 left-0 h-[2px] rounded-b-full"
              style={{
                background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))",
                width: `${100 / COLUMNS}%`,
                x: `${activeIndex * 100}%`,
              }}
              transition={{ type: "spring", stiffness: 420, damping: 38 }}
            />
          )}

          {MOBILE_NAV_ITEMS.map(({ label, icon: Icon, path }) => {
            const isActive = active?.path === path;
            return (
              <NavTab key={path} label={label} icon={Icon} isActive={isActive} tourKey={`nav:${path}`} onClick={() => go(path)} />
            );
          })}

          {/* More tab — opens a neat sheet with the remaining pages */}
          <NavTab
            label="More"
            icon={MoreHorizontal}
            isActive={moreActive || moreOpen}
            onClick={() => setMoreOpen(true)}
          />
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-border bg-background pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-base">More</SheetTitle>
            <SheetDescription className="sr-only">Additional navigation</SheetDescription>
          </SheetHeader>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {MOBILE_MORE_ITEMS.map(({ label, icon: Icon, path }) => {
              const isActive = location.pathname === path || location.pathname.startsWith(path + "/");
              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => go(path)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-xl border px-2 py-4 text-xs font-medium transition-colors",
                    isActive
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/60 bg-card/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  <span className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    isActive ? "bg-primary/15" : "bg-background-secondary",
                  )}>
                    <Icon size={19} strokeWidth={isActive ? 2.25 : 1.75} />
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// Single bottom-bar tab button.
function NavTab({
  label, icon: Icon, isActive, onClick, tourKey,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  isActive: boolean;
  onClick: () => void;
  tourKey?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      data-tour={tourKey}
      onClick={onClick}
      className={cn(
        "group/tab flex flex-col items-center gap-1 px-0.5 py-2.5 text-[10px] font-medium transition-colors duration-150 focus-ring rounded-lg",
        isActive ? "text-primary opacity-100" : "text-muted-foreground opacity-60",
      )}
    >
      <motion.span
        animate={isActive ? { scale: [1, 1.2, 1] } : { scale: 1 }}
        transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-150",
          isActive ? "bg-primary/10" : "bg-transparent group-hover/tab:bg-muted/40",
        )}
      >
        <Icon size={17} strokeWidth={isActive ? 2.25 : 1.75} />
      </motion.span>
      <span className={cn("max-w-full truncate text-[10px]", isActive ? "font-semibold" : "font-medium")}>{label}</span>
    </button>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────
export default function AppLayout() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { user, hasHydrated, hydrateRole, logout } = useAuthStore();
  const location                       = useLocation();
  const navigate                       = useNavigate();
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
  const [dailyTokens, setDailyTokens] = useState<{
    tokensUsed: number; limit: number; queriesUsed: number; queryLimit: number; percentage: number;
  } | null>(null);

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
        // Fetch daily token usage for free-tier users (used by PlanBanner)
        if (!cancelled && user?.planTier === "free") {
          try {
            const token = useAuthStore.getState().token;
            if (token) {
              const res = await fetch(`${getApiBaseUrl()}/llm/token-usage`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) setDailyTokens(await res.json());
            }
          } catch { /* non-fatal */ }
        }
      })();
      return () => { cancelled = true; };
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

  // Wait for both Clerk session check AND Zustand hydration before deciding auth state.
  // Without this, AppLayout redirects to /auth while ClerkAuthBridge is still fetching
  // /auth/me, causing a redirect loop (Clerk session exists but store isn't populated yet).
  if (!clerkLoaded || !hasHydrated || (isSignedIn && !user)) {
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
          <div className="flex min-h-14 items-center justify-between gap-2 sm:gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-lg md:hidden focus-ring"
                aria-label="Open navigation menu"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu size={17} />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 rounded-md border border-primary/20 bg-primary/8 px-2 py-0.5 type-caption font-semibold uppercase tracking-[0.16em] text-primary">
                    Querify
                  </span>
                  <ChevronRight size={12} className="shrink-0 text-muted-foreground/40" />
                  <span className="truncate type-body-sm font-medium text-foreground">
                    {BREADCRUMBS[location.pathname] || "Page"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {/* Cmd+K search trigger */}
              <button
                type="button"
                aria-label="Open command palette"
                onClick={() => openCommand(true)}
                className="focus-ring hidden items-center gap-2 rounded-lg border border-border/45 bg-background/50 px-2.5 py-1.5 text-[12px] text-muted-foreground/70 transition-colors hover:border-border/70 hover:bg-background/80 hover:text-muted-foreground sm:flex"
              >
                <Search size={12} className="shrink-0" />
                <span className="hidden lg:inline">Search</span>
                <span className="flex items-center gap-0.5">
                  <kbd className="rounded border border-border/40 bg-muted/30 px-1 font-mono text-[10px] leading-4">⌘</kbd>
                  <kbd className="rounded border border-border/40 bg-muted/30 px-1 font-mono text-[10px] leading-4">K</kbd>
                </span>
              </button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-card/80 hover:text-foreground focus-ring"
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
                    className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-xs font-semibold text-primary transition-all duration-150 hover:border-primary/40 hover:bg-primary/15 hover:shadow-[0_0_12px_-2px_hsl(var(--primary)/0.3)]"
                  >
                    {user.avatarInitials}
                  </button>
                }
              />
            </div>
          </div>
        </header>

        {/* Plan limit warning banner */}
        <PlanBanner dailyTokens={dailyTokens} />

        <main className="relative min-h-0 flex-1 overflow-hidden flex flex-col">
          <RouteErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageContentLoader />}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{
                    duration: 0.34,
                    ease: [0.22, 1, 0.36, 1],
                    exit: { duration: 0.18, ease: [0.4, 0, 1, 1] },
                  }}
                  className="flex-1 min-h-0 overflow-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 [&:has(>[data-page=query])]:overflow-hidden [&:has(>[data-page=query])]:pb-0"
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </Suspense>
          </RouteErrorBoundary>
        </main>

        <MobileBottomNav />
      </div>

      {/* First-login interactive walkthrough (spotlight + auto-navigate) */}
      <GuidedTour />

      {/* Global keyboard-shortcuts reference (opens with "?") */}
      <KeyboardShortcutsModal />
    </div>
  );
}

