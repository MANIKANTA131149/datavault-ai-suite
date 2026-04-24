import { useEffect } from "react";
import { useLocation, Outlet, Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuthStore } from "@/stores/auth-store";
import { useLLMStore, PROVIDER_LABELS } from "@/stores/llm-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useInsightsStore } from "@/stores/insights-store";
import { usePlanStore } from "@/stores/plan-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useNotificationsStore } from "@/stores/notifications-store";
import { Badge } from "@/components/ui/badge";
import { ProviderLogo } from "@/components/ProviderLogo";
import { Clock, Database, Layout, MessageSquare, Settings, Sparkles } from "lucide-react";

const BREADCRUMBS: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/datasets": "Datasets",
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
  const { brandName, brandTagline, presentationMode, showProviderBadge } = useWorkspaceStore();

  useEffect(() => {
    if (user) {
      fetchDatasets();
      fetchHistory();
      fetchSettings();
      fetchInsights();
      fetchNotifications();
      fetchPlan();
      hydrateRole();
    } else {
      applyTheme(theme);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-background shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{brandName}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">{BREADCRUMBS[location.pathname] || "Page"}</span>
            {presentationMode && (
              <Badge variant="outline" className="ml-2 gap-1 border-border bg-card text-[10px] text-muted-foreground">
                <Layout size={10} /> Presentation
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            {showProviderBadge && !presentationMode && (
              <Badge variant="outline" className="border-border text-xs text-muted-foreground font-mono gap-1.5 cursor-default">
                <ProviderLogo provider={activeProvider} size="sm" />
                {PROVIDER_LABELS[activeProvider]} · {activeModel}
              </Badge>
            )}
            {presentationMode && (
              <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted-foreground lg:flex">
                <Sparkles size={12} className="text-primary" />
                <span className="max-w-[200px] truncate">{brandTagline}</span>
              </div>
            )}
            <NotificationBell />
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold">
              {user.avatarInitials}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
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
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-border bg-background">
          {[
            { label: "Data", icon: Database, path: "/app/datasets" },
            { label: "Query", icon: MessageSquare, path: "/app/query" },
            { label: "History", icon: Clock, path: "/app/history" },
            { label: "Settings", icon: Settings, path: "/app/settings" },
          ].map(({ label, icon: Icon, path }) => (
            <button key={path} onClick={() => navigate(path)} className={`flex flex-col items-center gap-1 py-2 text-[10px] ${location.pathname === path ? "text-primary" : "text-muted-foreground"}`}>
              <Icon size={16} />{label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
