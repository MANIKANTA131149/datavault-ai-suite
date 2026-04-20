import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, LayoutDashboard, Database, MessageSquare, Clock, Settings, Upload, FileText, Bookmark, Shield } from "lucide-react";
import { useDatasetStore } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";
import { useAuthStore } from "@/stores/auth-store";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  action: () => void;
  section: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const { datasets } = useDatasetStore();
  const { entries } = useHistoryStore();
  const { user } = useAuthStore();
  const role = user?.role;
  const adminUser = role === "admin";
  const analystOrAdmin = role === "admin" || role === "analyst";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((p) => !p);
        setQuery("");
        setSelectedIndex(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const items: CommandItem[] = [
    { id: "nav-dashboard", label: "Dashboard", icon: LayoutDashboard, action: () => navigate("/app/dashboard"), section: "Navigation" },
    { id: "nav-datasets", label: "Datasets", icon: Database, action: () => navigate("/app/datasets"), section: "Navigation" },
    ...(analystOrAdmin ? [{ id: "nav-query", label: "Query", icon: MessageSquare, action: () => navigate("/app/query"), section: "Navigation" }] : []),
    { id: "nav-history", label: "History", icon: Clock, action: () => navigate("/app/history"), section: "Navigation" },
    { id: "nav-insights", label: "Insights", icon: Bookmark, action: () => navigate("/app/insights"), section: "Navigation" },
    ...(adminUser ? [{ id: "nav-admin", label: "Admin Panel", icon: Shield, action: () => navigate("/app/admin"), section: "Navigation" }] : []),
    { id: "nav-settings", label: "Settings", icon: Settings, action: () => navigate("/app/settings"), section: "Navigation" },
    { id: "action-upload", label: "Upload file", icon: Upload, action: () => navigate("/app/datasets"), section: "Actions" },
    ...(analystOrAdmin ? [{ id: "action-query", label: "New query", icon: MessageSquare, action: () => navigate("/app/query"), section: "Actions" }] : []),
    ...datasets.map((d) => ({
      id: `ds-${d.id}`,
      label: d.fileName,
      description: `${Object.values(d.rowCounts).reduce((a, b) => a + b, 0)} rows`,
      icon: FileText,
      action: () => navigate(`/app/query?dataset=${d.id}`),
      section: "Datasets",
    })),
    ...entries.slice(0, 5).map((e) => ({
      id: `h-${e.id}`,
      label: e.query,
      description: e.datasetName,
      icon: Clock,
      action: () => navigate("/app/history"),
      section: "Recent Queries",
    })),
  ];

  const filtered = items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  const sections = [...new Set(filtered.map((i) => i.section))];

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((p) => Math.min(p + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((p) => Math.max(p - 1, 0)); }
    if (e.key === "Enter" && filtered[selectedIndex]) { filtered[selectedIndex].action(); setOpen(false); }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
        <motion.div className="relative w-full max-w-lg bg-background-secondary border border-border rounded-xl shadow-2xl overflow-hidden" initial={{ scale: 0.95, y: -10 }} animate={{ scale: 1, y: 0 }}>
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search commands, datasets, queries..."
              className="flex-1 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <kbd className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">ESC</kbd>
          </div>
          <div className="max-h-72 overflow-auto scrollbar-thin p-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No results found</p>
            ) : (
              sections.map((section) => (
                <div key={section}>
                  <p className="text-xs text-muted-foreground px-2 py-1.5 font-medium">{section}</p>
                  {filtered.filter((i) => i.section === section).map((item) => {
                    const globalIndex = filtered.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        onClick={() => { item.action(); setOpen(false); }}
                        className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors ${globalIndex === selectedIndex ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-card/50"}`}
                      >
                        <item.icon size={14} className="shrink-0" />
                        <span className="truncate">{item.label}</span>
                        {item.description && <span className="text-xs text-muted-foreground ml-auto">{item.description}</span>}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
