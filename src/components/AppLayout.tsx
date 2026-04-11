import { useEffect } from "react";
import { useLocation, Outlet, Navigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuthStore } from "@/stores/auth-store";
import { useLLMStore, PROVIDER_LABELS } from "@/stores/llm-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";

const BREADCRUMBS: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/datasets": "Datasets",
  "/app/query": "Query",
  "/app/history": "History",
  "/app/settings": "Settings",
};

export default function AppLayout() {
  const { user } = useAuthStore();
  const location = useLocation();
  const { activeProvider, activeModel } = useLLMStore();
  const { fetchDatasets } = useDatasetStore();
  const { fetchHistory } = useHistoryStore();
  const { fetchSettings, applyTheme, theme } = useSettingsStore();

  // Load all user data from MongoDB on mount, and apply saved theme immediately
  useEffect(() => {
    if (user) {
      fetchDatasets();
      fetchHistory();
      fetchSettings();
    } else {
      // Ensure default theme is applied even before settings load
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
            <span className="text-muted-foreground">DataVault</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">{BREADCRUMBS[location.pathname] || "Page"}</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-border text-xs text-muted-foreground font-mono gap-1.5 cursor-default">
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
              {PROVIDER_LABELS[activeProvider]} · {activeModel}
            </Badge>
            <button className="text-muted-foreground hover:text-foreground transition-colors relative">
              <Bell size={18} />
            </button>
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold">
              {user.avatarInitials}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
