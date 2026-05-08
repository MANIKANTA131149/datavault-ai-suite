import { useEffect, useState } from "react";
import { useLocation, Outlet, Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clock,
  Database,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Settings,
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
  "/app/dashboard": "Dashboard",
  "/app/datasets": "Datasets",
  "/app/connections": "Connections",
  "/app/query": "Query",
  "/app/history": "History",
  "/app/insights": "Insights",
  "/app/admin": "Admin",
  "/app/settings": "Settings",
};

export default function AppLayout() {
  const { user, hydrateRole } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const { activeProvider, activeModel } = useLLMStore();
  const { fetchDatasets } = useDatasetStore();
  const { fetchHistory } = useHistoryStore();
  const { fetchSettings, applyTheme, theme } = useSettingsStore();
  const { fetchInsights } = useInsightsStore();
  const { fetchPlan } = usePlanStore();
  const { fetchNotifications } = useNotificationsStore();
  const { fetchConnections } = useConnectionStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

        <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-22px_hsl(var(--foreground)/0.85)] backdrop-blur-xl md:hidden">
          {[
            { label: "Home", icon: LayoutDashboard, path: "/app/dashboard" },
            { label: "Data", icon: Database, path: "/app/datasets" },
            { label: "Query", icon: MessageSquare, path: "/app/query" },
            { label: "History", icon: Clock, path: "/app/history" },
            { label: "Settings", icon: Settings, path: "/app/settings" },
          ].map(({ label, icon: Icon, path }) => (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-1 py-2 text-[10px] transition-colors ${
                location.pathname === path ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
