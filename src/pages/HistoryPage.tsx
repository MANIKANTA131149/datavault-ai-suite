import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bot,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Copy,
  Database,
  Download,
  FileText,
  Filter,
  GitCompare,
  MessageSquare,
  RotateCcw,
  Search,
  Square,
  Star,
  TerminalSquare,
  TrendingUp,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHistoryStore, type HistoryEntry, type HistoryStep } from "@/stores/history-store";
import { usePlanStore } from "@/stores/plan-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { PROVIDER_LABELS } from "@/stores/llm-store";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
};

function stringifyResult(value: unknown) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function isWithinDateFilter(date: string, filter: string) {
  if (filter === "all") return true;
  const value = new Date(date).getTime();
  const now = Date.now();
  const day = 86400000;
  if (filter === "today") return now - value < day;
  if (filter === "week") return now - value < day * 7;
  if (filter === "month") return now - value < day * 30;
  return true;
}

function getDateGroup(date: string) {
  const value = new Date(date).getTime();
  const now = Date.now();
  if (now - value < 86400000) return "Today";
  if (now - value < 86400000 * 7) return "This Week";
  if (now - value < 86400000 * 30) return "This Month";
  return "Older";
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getStoredAnswer(entry: HistoryEntry) {
  return entry.finalResult || "No saved answer is available for this history entry yet. Re-run it with Replay to store the answer and the full agent trace.";
}

function TinyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/55 px-3 py-2 backdrop-blur-sm">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function TraceSection({
  title,
  value,
  copyLabel,
}: {
  title: string;
  value: string | null;
  copyLabel: string;
}) {
  if (!value) return null;

  return (
    <div className="rounded-2xl border border-border/70 bg-card/75 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success(`${copyLabel} copied`);
          }}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Copy size={10} /> Copy
        </button>
      </div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs font-mono text-foreground scrollbar-thin [overflow-wrap:anywhere]">
        {value}
      </pre>
    </div>
  );
}

function HistoryTraceStepCard({ step, index }: { step: HistoryStep; index: number }) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-background/65 p-4 shadow-[0_18px_34px_-30px_hsl(var(--foreground)/0.72)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-border text-xs font-mono">
              Step {index + 1}
            </Badge>
            <Badge className="border-0 bg-primary/10 text-primary">
              {step.command}
            </Badge>
            {step.isFinal && (
              <Badge className="border-0 bg-success/10 text-success">Final</Badge>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Saved execution trace for turn {step.turn || index + 1}.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto">
          <TinyStat label="Duration" value={formatDuration(step.durationMs)} />
          <TinyStat label="Input" value={step.tokens.input.toLocaleString()} />
          <TinyStat label="Output" value={step.tokens.output.toLocaleString()} />
          <TinyStat label="Tokens" value={(step.tokens.input + step.tokens.output).toLocaleString()} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <TraceSection title="Arguments" value={step.argsText} copyLabel="Arguments" />
        <TraceSection title="SQL" value={step.sql} copyLabel="SQL" />
      </div>

      <div className="mt-3">
        <TraceSection title="Result" value={step.resultText} copyLabel="Step result" />
      </div>
    </div>
  );
}

function ExpandedEntry({ entry }: { entry: HistoryEntry }) {
  const copyResult = async () => {
    if (!entry.finalResult) {
      toast.info("This older history entry does not have a saved answer yet. Re-run it to capture one.");
      return;
    }

    await navigator.clipboard.writeText(stringifyResult(entry.finalResult));
    toast.success("Result copied");
  };

  const copyTrace = async () => {
    if (!entry.steps.length) {
      toast.info("No saved trace is available for this entry yet. Re-run it to capture one.");
      return;
    }

    await navigator.clipboard.writeText(JSON.stringify(entry.steps, null, 2));
    toast.success("Agent trace copied");
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
        <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
          <div className="rounded-[24px] border border-border/70 bg-background/55 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Question</p>
            <p className="mt-2 text-base font-medium text-foreground">{entry.query}</p>
          </div>

          <div className="rounded-[24px] border border-border/70 bg-background/55 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Answer</p>
              <button onClick={copyResult} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Copy size={10} /> Copy result
              </button>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-card/80 p-3 text-xs font-mono text-foreground scrollbar-thin [overflow-wrap:anywhere]">
              {getStoredAnswer(entry)}
            </pre>
          </div>
        </div>

        <div className="rounded-[24px] border border-border/70 bg-background/55 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Agent Trace</p>
              <p className="mt-1 text-sm text-foreground">
                {entry.steps.length > 0
                  ? `Showing the saved step-by-step execution flow used for this answer.`
                  : "This entry was saved before full trace persistence was added. Replay it once to capture the richer trace."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-border bg-card text-xs text-foreground">
                {entry.steps.length} step{entry.steps.length === 1 ? "" : "s"}
              </Badge>
              <Button variant="outline" size="sm" className="border-border" onClick={copyTrace}>
                <Copy size={12} className="mr-1" /> Copy trace
              </Button>
            </div>
          </div>

          {entry.steps.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-card/45 px-4 py-5 text-sm text-muted-foreground">
              No saved step timeline is available for this entry yet. Replay this query once and the next saved version will include the fuller agent trace.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {entry.steps.map((step, index) => (
                <HistoryTraceStepCard key={`${entry.id}-step-${index}-${step.command}`} step={step} index={index} />
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ComparePanel({ entries, compareIds }: { entries: HistoryEntry[]; compareIds: string[] }) {
  if (compareIds.length === 0) return null;

  return (
    <div className="toolbar-panel">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <GitCompare size={14} /> Compare queries
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {compareIds.map((id) => {
          const entry = entries.find((item) => item.id === id);
          if (!entry) return null;

          return (
            <div key={id} className="rounded-[22px] border border-border/70 bg-card/80 p-4">
              <p className="line-clamp-2 text-sm font-medium text-foreground">{entry.query}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {entry.datasetName} - {PROVIDER_LABELS[entry.provider]}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <TinyStat label="Status" value={entry.status} />
                <TinyStat label="Duration" value={formatDuration(entry.durationMs)} />
                <TinyStat label="Tokens" value={entry.totalTokens.toLocaleString()} />
                <TinyStat label="Trace" value={String(entry.steps.length)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryEntryCard({
  entry,
  expanded,
  isFavorite,
  isCompared,
  onToggleExpand,
  onToggleFavorite,
  onToggleCompare,
  onCopyQuestion,
  onCopyEntry,
  onReplay,
  onDatasetClick,
}: {
  entry: HistoryEntry;
  expanded: boolean;
  isFavorite: boolean;
  isCompared: boolean;
  onToggleExpand: () => void;
  onToggleFavorite: () => void;
  onToggleCompare: () => void;
  onCopyQuestion: () => void;
  onCopyEntry: () => void;
  onReplay: () => void;
  onDatasetClick: () => void;
}) {
  const statusClass = entry.status === "success"
    ? "bg-success/10 text-success"
    : "bg-destructive/10 text-destructive";

  const hasSavedTrace = entry.steps.length > 0;

  return (
    <motion.div variants={fadeUp} whileHover={{ y: -1 }} transition={{ duration: 0.15 }}>
    <Card className="overflow-hidden rounded-[22px] border-border/55 bg-card/80 p-4 shadow-[0_2px_10px_-4px_hsl(var(--foreground)/0.06)] backdrop-blur-sm transition-shadow hover:shadow-[0_4px_20px_-8px_hsl(var(--primary)/0.18)] sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`border-0 text-xs ${statusClass}`}>
                {entry.status === "success" ? <CheckCircle2 size={10} className="mr-1" /> : <XCircle size={10} className="mr-1" />}
                {entry.status}
              </Badge>
              <Badge variant="outline" className="border-border text-xs">
                {hasSavedTrace ? "Trace saved" : "Replay to save trace"}
              </Badge>
              {isFavorite && <Badge className="border-0 bg-warning/10 text-warning">Favorite</Badge>}
            </div>

            <h3 className="mt-3 break-words text-lg font-semibold leading-7 text-foreground">
              {entry.query}
            </h3>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDatasetClick(); }}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/55 px-3 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                <Database size={12} /> {entry.datasetName || "Unknown dataset"}
              </button>
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/55 px-3 py-1 text-muted-foreground">
                <Bot size={12} /> {PROVIDER_LABELS[entry.provider]} - {entry.model}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            <TinyStat label="Turns" value={String(entry.turns)} />
            <TinyStat label="Tokens" value={entry.totalTokens.toLocaleString()} />
            <TinyStat label="Duration" value={formatDuration(entry.durationMs)} />
            <TinyStat label="Trace" value={`${entry.steps.length} step${entry.steps.length === 1 ? "" : "s"}`} />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[auto_auto_auto_auto_auto_1fr_auto] xl:items-center">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-background/55 px-3 py-2 text-xs text-muted-foreground">
            <CalendarDays size={12} />
            {new Date(entry.date).toLocaleDateString()}
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-background/55 px-3 py-2 text-xs text-muted-foreground">
            <Clock3 size={12} />
            {formatDuration(entry.durationMs)}
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-background/55 px-3 py-2 text-xs text-muted-foreground">
            <Zap size={12} />
            {entry.totalTokens.toLocaleString()} tokens
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-background/55 px-3 py-2 text-xs text-muted-foreground">
            <TerminalSquare size={12} />
            {entry.steps.length > 0 ? "Detailed trace saved" : "Older saved entry"}
          </div>

          <div className="flex flex-wrap gap-1 sm:col-span-2 xl:col-span-2 xl:justify-end">
            <button
              type="button"
              aria-label="Favorite query"
              title="Favorite query"
              onClick={onToggleFavorite}
              className={`rounded-xl p-2 transition-colors hover:bg-background-secondary ${isFavorite ? "text-warning" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Star size={14} fill={isFavorite ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              aria-label="Compare query"
              title="Compare query"
              onClick={onToggleCompare}
              className={`rounded-xl p-2 transition-colors hover:bg-background-secondary ${isCompared ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {isCompared ? <CheckSquare size={14} /> : <Square size={14} />}
            </button>
            <button
              type="button"
              aria-label="Copy question"
              title="Copy question"
              onClick={onCopyQuestion}
              className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground"
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              aria-label="Copy full entry"
              title="Copy full entry"
              onClick={onCopyEntry}
              className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground"
            >
              <FileText size={14} />
            </button>
            <Button variant="outline" size="sm" className="border-border" onClick={onReplay}>
              <RotateCcw size={12} className="mr-1" /> Replay
            </Button>
          </div>

          <Button variant={expanded ? "default" : "outline"} className="w-full xl:w-auto" onClick={onToggleExpand}>
            {expanded ? <ChevronUp size={14} className="mr-2" /> : <ChevronDown size={14} className="mr-2" />}
            {expanded ? "Hide details" : "Show details"}
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {expanded && <ExpandedEntry entry={entry} />}
        </AnimatePresence>
      </div>
    </Card>
    </motion.div>
  );
}

export default function HistoryPage() {
  const { entries } = useHistoryStore();
  const { checkExport } = usePlanStore();
  const { datasets } = useDatasetStore();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [datasetFilter, setDatasetFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    try {
      setFavoriteIds(JSON.parse(localStorage.getItem("datavault-favorite-history") || "[]"));
    } catch {
      setFavoriteIds([]);
    }
  }, []);

  const datasetNames = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => entry.datasetName).filter(Boolean))).sort();
  }, [entries]);

  const stats = useMemo(() => {
    const successCount = entries.filter((e) => e.status === "success").length;
    const totalMs = entries.reduce((s, e) => s + (e.durationMs || 0), 0);
    const totalTokensAll = entries.reduce((s, e) => s + (e.totalTokens || 0), 0);
    const avgMs = entries.length > 0 ? Math.round(totalMs / entries.length) : 0;
    return {
      total: entries.length,
      successRate: entries.length ? Math.round((successCount / entries.length) * 100) : 0,
      avgDuration: entries.length > 0 ? formatDuration(avgMs) : "—",
      totalTokens: totalTokensAll,
      successCount,
      errorCount: entries.length - successCount,
    };
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      const q = search.toLowerCase();
      if (q && ![entry.query, entry.datasetName, entry.model].some((value) => value?.toLowerCase().includes(q))) return false;
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (providerFilter !== "all" && entry.provider !== providerFilter) return false;
      if (datasetFilter !== "all" && entry.datasetName !== datasetFilter) return false;
      if (favoritesOnly && !favoriteIds.includes(entry.id)) return false;
      if (!isWithinDateFilter(entry.date, dateFilter)) return false;
      return true;
    });
  }, [entries, search, statusFilter, providerFilter, datasetFilter, dateFilter, favoritesOnly, favoriteIds]);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [search, statusFilter, providerFilter, datasetFilter, dateFilter, favoritesOnly, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEntries = useMemo(() => filtered.slice(pageStart, pageStart + pageSize), [filtered, pageStart, pageSize]);

  const grouped = useMemo(() => {
    return pageEntries.reduce<Record<string, HistoryEntry[]>>((acc, entry) => {
      const group = getDateGroup(entry.date);
      acc[group] = acc[group] || [];
      acc[group].push(entry);
      return acc;
    }, {});
  }, [pageEntries]);

  const hasActiveFilters = search || statusFilter !== "all" || providerFilter !== "all" || datasetFilter !== "all" || dateFilter !== "all" || favoritesOnly;

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setProviderFilter("all");
    setDatasetFilter("all");
    setDateFilter("all");
    setFavoritesOnly(false);
  };

  const toggleFavorite = (id: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [id, ...prev];
      localStorage.setItem("datavault-favorite-history", JSON.stringify(next));
      return next;
    });
  };

  const copyQuestion = async (query: string) => {
    await navigator.clipboard.writeText(query);
    toast.success("Question copied");
  };

  const copyEntry = async (entry: HistoryEntry) => {
    await navigator.clipboard.writeText(JSON.stringify({
      query: entry.query,
      dataset: entry.datasetName,
      provider: entry.provider,
      model: entry.model,
      status: entry.status,
      durationMs: entry.durationMs,
      tokens: entry.totalTokens,
      date: entry.date,
      answer: entry.finalResult,
      steps: entry.steps,
    }, null, 2));
    toast.success("History entry copied");
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id].slice(-2));
  };

  const replayQuery = (entry: HistoryEntry) => {
    const dataset = datasets.find((item) => item.fileName === entry.datasetName);
    const params = new URLSearchParams();
    if (dataset) params.set("dataset", dataset.id);
    params.set("q", entry.query);
    navigate(`/app/query?${params.toString()}`);
  };

  const exportCSV = async () => {
    try {
      await checkExport("history");
    } catch (err: any) {
      toast.error(err.message || "History export requires Enterprise plan", {
        action: {
          label: "View Plans",
          onClick: () => navigate("/app/pricing"),
        },
      });
      return;
    }

    const headers = ["Query", "Dataset", "Provider", "Model", "Turns", "Tokens", "Duration (ms)", "Status", "Date"];
    const rows = entries.map((entry) => [
      entry.query,
      entry.datasetName,
      entry.provider,
      entry.model,
      entry.turns,
      entry.totalTokens,
      entry.durationMs,
      entry.status,
      entry.date,
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.map((value) => JSON.stringify(value)).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "query-history.csv";
    link.click();
    toast.success("History exported");
  };

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        title="Query history"
        titleIcon={Clock3}
        info="Search, compare, replay, and inspect the saved execution trace for past queries in a layout that fits smaller laptops as well as wider workstations."
        stats={[
          { label: "Queries", value: entries.length },
          { label: "Favorites", value: favoriteIds.length, tone: "warning" },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full gap-1.5 border-border/70 bg-background/70 hover:bg-background/90 sm:w-auto"
            onClick={exportCSV}
            disabled={entries.length === 0}
          >
            <Download size={14} /> Export CSV
          </Button>
        }
      />

      {entries.length > 0 && (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-4"
        >
          {[
            {
              label: "Total Queries",
              value: stats.total.toLocaleString(),
              icon: Activity,
              onClick: undefined,
              active: false,
            },
            {
              label: "Success Rate",
              value: `${stats.successRate}%`,
              icon: TrendingUp,
              sub: `${stats.successCount} passed`,
              onClick: () => setStatusFilter(statusFilter === "success" ? "all" : "success"),
              active: statusFilter === "success",
            },
            {
              label: "Avg Duration",
              value: stats.avgDuration,
              icon: Clock3,
              onClick: undefined,
              active: false,
            },
            {
              label: "Total Tokens",
              value: stats.totalTokens >= 1_000_000
                ? `${(stats.totalTokens / 1_000_000).toFixed(1)}M`
                : stats.totalTokens >= 1000
                ? `${(stats.totalTokens / 1000).toFixed(1)}K`
                : stats.totalTokens.toLocaleString(),
              icon: Zap,
              sub: `${stats.errorCount} error${stats.errorCount === 1 ? "" : "s"}`,
              onClick: () => setStatusFilter(statusFilter === "error" ? "all" : "error"),
              active: statusFilter === "error",
            },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <motion.div key={kpi.label} variants={fadeUp} className="h-full">
                <Card
                  className={cn(
                    "flex h-full flex-col rounded-[18px] border-border/55 bg-card/80 p-4 backdrop-blur-sm transition-all",
                    kpi.onClick && "cursor-pointer hover:border-primary/30 hover:shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.2)]",
                    kpi.active && "border-primary/40 bg-primary/5 shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.25)]",
                  )}
                  onClick={kpi.onClick}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{kpi.label}</p>
                    <Icon size={14} className={cn("mt-0.5 shrink-0", kpi.active ? "text-primary" : "text-muted-foreground/50")} />
                  </div>
                  <p className={cn("mt-2 text-2xl font-bold tracking-tight", kpi.active ? "text-primary" : "text-foreground")}>{kpi.value}</p>
                  <p className="mt-0.5 min-h-[1rem] text-xs text-muted-foreground">{kpi.sub ?? ""}</p>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <div className="toolbar-panel space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search queries, datasets, or models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-border bg-background-secondary pl-9"
            />
          </div>

          <Select value={datasetFilter} onValueChange={setDatasetFilter}>
            <SelectTrigger className="w-full border-border bg-background-secondary sm:w-[180px]">
              <Filter size={12} className="mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="all">All datasets</SelectItem>
              {datasetNames.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-full border-border bg-background-secondary sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="all">All providers</SelectItem>
              {Object.entries(PROVIDER_LABELS).map(([key, value]) => (
                <SelectItem key={key} value={key}>{value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          {(["all", "success", "error"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                statusFilter === s
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {s === "all" ? "All" : s === "success" ? `Success${entries.length > 0 ? ` · ${stats.successCount}` : ""}` : `Error${entries.length > 0 ? ` · ${stats.errorCount}` : ""}`}
            </button>
          ))}

          <span className="ml-3 mr-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Date</span>
          {([
            { value: "all", label: "All time" },
            { value: "today", label: "Today" },
            { value: "week", label: "Last 7d" },
            { value: "month", label: "Last 30d" },
          ] as const).map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDateFilter(d.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                dateFilter === d.value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {d.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setFavoritesOnly((c) => !c)}
            className={cn(
              "ml-3 rounded-full border px-3 py-1 text-xs transition-colors",
              favoritesOnly
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-border/60 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <Star size={10} className="mr-1 inline-block" />
            Favorites
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
            >
              <X size={10} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="toolbar-panel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {pageStart + 1}-{Math.min(pageStart + pageEntries.length, filtered.length)} of {filtered.length} quer{filtered.length === 1 ? "y" : "ies"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger className="h-8 w-[110px] border-border bg-card text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  {[10, 25, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>{size} / page</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-border"
                  disabled={safePage <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  <ChevronLeft size={13} />
                </Button>
                <span className="min-w-[80px] text-center text-xs text-muted-foreground">
                  Page {safePage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-border"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  <ChevronRight size={13} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ComparePanel entries={entries} compareIds={compareIds} />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-border/60 bg-card/40 px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background/60">
            <MessageSquare size={24} className="text-muted-foreground/50" />
          </div>
          <p className="text-base font-semibold text-foreground">
            {entries.length === 0 ? "No queries yet" : "No matching queries"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {entries.length === 0
              ? "Run your first natural language query and it will appear here with the full agent trace."
              : "Try adjusting your filters or search term to find what you're looking for."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {entries.length === 0 ? (
              <Button size="sm" onClick={() => navigate("/app/query")}>
                Go to Query
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={clearAllFilters}>
                <X size={12} className="mr-1" /> Clear all filters
              </Button>
            )}
          </div>
        </div>
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {Object.entries(grouped).map(([group, groupEntries]) => (
            <section key={group} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{group}</p>
                  <p className="text-xs text-muted-foreground">
                    {groupEntries.length} quer{groupEntries.length === 1 ? "y" : "ies"} on this page
                  </p>
                </div>
                <Badge variant="outline" className="border-border bg-card text-xs text-foreground">
                  {groupEntries.length}
                </Badge>
              </div>

              <div className="space-y-3">
                {groupEntries.map((entry) => (
                  <HistoryEntryCard
                    key={entry.id}
                    entry={entry}
                    expanded={expandedId === entry.id}
                    isFavorite={favoriteIds.includes(entry.id)}
                    isCompared={compareIds.includes(entry.id)}
                    onToggleExpand={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    onToggleFavorite={() => toggleFavorite(entry.id)}
                    onToggleCompare={() => toggleCompare(entry.id)}
                    onCopyQuestion={() => copyQuestion(entry.query)}
                    onCopyEntry={() => copyEntry(entry)}
                    onReplay={() => replayQuery(entry)}
                    onDatasetClick={() => setDatasetFilter(entry.datasetName || "all")}
                  />
                ))}
              </div>
            </section>
          ))}
        </motion.div>
      )}
    </div>
  );
}
