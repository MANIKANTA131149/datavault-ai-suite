import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  Cable,
  Clock,
  Compass,
  CreditCard,
  Database,
  FileText,
  Key,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Shield,
  Upload,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useHistoryStore } from "@/stores/history-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useConnectionStore } from "@/stores/connection-store";
import { useCommandStore } from "@/stores/command-store";
import { useAuthStore } from "@/stores/auth-store";
import { canAccessAdmin } from "@/lib/plans";
import { DbTypeIcon } from "@/components/DbTypeIcon";
import { cn } from "@/lib/utils";

export function CommandPalette() {
  const { open, setOpen } = useCommandStore();
  const navigate = useNavigate();
  const { entries } = useHistoryStore();
  const { datasets } = useDatasetStore();
  const { connections } = useConnectionStore();
  const { user } = useAuthStore();
  const isAdmin = canAccessAdmin(user?.planTier, user?.isPlanOwner);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) return;
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, setOpen]);

  const run = useCallback(
    (fn: () => void) => {
      setOpen(false);
      fn();
    },
    [setOpen],
  );

  const recentQueries = entries.slice(0, 6);
  const topDatasets   = datasets.slice(0, 5);
  const topConns      = connections.slice(0, 5);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, queries, datasets…" />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-3 py-10">
            <Search size={28} className="text-muted-foreground/25" />
            <p className="text-sm text-muted-foreground">No results found.</p>
          </div>
        </CommandEmpty>

        {/* Quick Actions — always rendered, stable slot */}
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => run(() => navigate("/app/query"))}>
            <CmdIcon><MessageSquare size={13} /></CmdIcon>
            New Query
            <CommandShortcut>⌘Q</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/app/datasets"))}>
            <CmdIcon><Upload size={13} /></CmdIcon>
            Upload Dataset
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/app/connections"))}>
            <CmdIcon><Plus size={13} /></CmdIcon>
            Add Connection
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/app/settings"))}>
            <CmdIcon><Key size={13} /></CmdIcon>
            Configure AI Provider
          </CommandItem>
          {datasets[0] && (
            <CommandItem
              value={`query-with-${datasets[0].displayName ?? datasets[0].fileName}`}
              onSelect={() => run(() => navigate(`/app/query?dataset=${datasets[0].id}`))}
            >
              <CmdIcon><Database size={13} /></CmdIcon>
              Query "{datasets[0].displayName ?? datasets[0].fileName}"
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        {/* Navigation — always rendered, stable slot */}
        <CommandGroup heading="Navigate">
          {[
            { label: "Dashboard",   Icon: LayoutDashboard, path: "/app/dashboard" },
            { label: "Query",       Icon: MessageSquare,   path: "/app/query" },
            { label: "History",     Icon: Clock,           path: "/app/history" },
            // Insights — temporarily disabled, will release later
            // { label: "Insights",    Icon: Bookmark,        path: "/app/insights" },
            { label: "Datasets",    Icon: Database,        path: "/app/datasets" },
            { label: "Connections", Icon: Cable,           path: "/app/connections" },
            { label: "Get Started", Icon: Compass,         path: "/app/get-started" },
            { label: "Pricing",     Icon: CreditCard,      path: "/app/pricing" },
            { label: "Settings",    Icon: Settings,        path: "/app/settings" },
            ...(isAdmin ? [{ label: "Admin Panel", Icon: Shield, path: "/app/admin" }] : []),
          ].map(({ label, Icon, path }) => (
            <CommandItem key={path} onSelect={() => run(() => navigate(path))}>
              <CmdIcon><Icon size={13} /></CmdIcon>
              {label}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Recent Queries */}
        <div hidden={recentQueries.length === 0}>
          <CommandSeparator />
          <CommandGroup heading="Recent Queries">
            {recentQueries.map((entry) => (
              <CommandItem
                key={entry.id}
                value={`recent-query-${entry.id}-${entry.query}`}
                onSelect={() => run(() => navigate("/app/history"))}
              >
                <CmdIcon><Clock size={12} /></CmdIcon>
                <span className="min-w-0 truncate">{entry.query}</span>
                <CommandShortcut
                  className={cn(
                    "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                    entry.status === "success"
                      ? "bg-success/12 text-success"
                      : "bg-destructive/12 text-destructive",
                  )}
                >
                  {entry.status}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </div>

        {/* Datasets */}
        <div hidden={topDatasets.length === 0}>
          <CommandSeparator />
          <CommandGroup heading="Datasets">
            {topDatasets.map((ds) => (
              <CommandItem
                key={ds.id}
                value={`dataset-${ds.id}-${ds.displayName ?? ds.fileName}`}
                onSelect={() => run(() => navigate(`/app/query?dataset=${ds.id}`))}
              >
                <CmdIcon><FileText size={12} /></CmdIcon>
                <span className="min-w-0 truncate">{ds.displayName ?? ds.fileName}</span>
                <CommandShortcut className="shrink-0 text-[10px]">
                  {Object.values(ds.rowCounts ?? {}).reduce((a, b) => a + b, 0).toLocaleString()} rows
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </div>

        {/* Connections */}
        <div hidden={topConns.length === 0}>
          <CommandSeparator />
          <CommandGroup heading="Connections">
            {topConns.map((conn) => (
              <CommandItem
                key={conn._id}
                value={`connection-${conn._id}-${conn.name}`}
                onSelect={() => run(() => navigate("/app/connections"))}
              >
                <CmdIcon>
                  <DbTypeIcon dbType={conn.dbType} size={12} className="text-muted-foreground" />
                </CmdIcon>
                <span className="min-w-0 truncate">{conn.name}</span>
                <CommandShortcut
                  className={cn(
                    "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                    conn.status === "connected"
                      ? "bg-success/12 text-success"
                      : "bg-muted/60 text-muted-foreground",
                  )}
                >
                  {conn.status}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </div>
      </CommandList>

      {/* Footer hint bar */}
      <div className="flex items-center justify-between border-t border-border/40 px-3 py-2">
        <div className="flex items-center gap-3.5 text-[11px] text-muted-foreground/55">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/40 bg-muted/30 px-1 font-mono text-[9px] leading-4">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/40 bg-muted/30 px-1 font-mono text-[9px] leading-4">↵</kbd>
            open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/40 bg-muted/30 px-1 font-mono text-[9px] leading-4">Esc</kbd>
            close
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground/35 font-medium">Querify Agent</span>
      </div>
    </CommandDialog>
  );
}

function CmdIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-2.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded border border-border/45 bg-background/50 text-muted-foreground">
      {children}
    </span>
  );
}
