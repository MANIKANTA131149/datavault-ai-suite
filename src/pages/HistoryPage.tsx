import { Fragment, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Download, RotateCcw, ChevronLeft, ChevronRight, MessageSquare, Copy, Star, GitCompare, CheckSquare, Square, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHistoryStore, type HistoryEntry } from "@/stores/history-store";
import { usePlanStore } from "@/stores/plan-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { PROVIDER_LABELS } from "@/stores/llm-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

function stringifyResult(value: unknown) {
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

function ExpandedRow({ entry }: { entry: HistoryEntry }) {
  const copyResult = async () => {
    await navigator.clipboard.writeText(stringifyResult(entry.finalResult) || "");
    toast.success("Result copied");
  };

  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
      <div className="px-4 py-3 bg-card/50 border-t border-border space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Question</p>
          <p className="text-sm text-foreground">{entry.query}</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">Answer</p>
            <button onClick={copyResult} className="text-xs text-primary hover:underline flex items-center gap-1">
              <Copy size={10} /> Copy result
            </button>
          </div>
          <pre className="text-xs font-mono text-foreground bg-card rounded p-2 border border-border max-h-40 overflow-auto scrollbar-thin whitespace-pre-wrap">
            {entry.finalResult === null ? "Result details are available for queries run in this session." : stringifyResult(entry.finalResult)}
          </pre>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Steps ({entry.steps.length})</p>
          <div className="flex flex-wrap gap-1">
            {entry.steps.map((step, i) => (
              <Badge key={i} variant="outline" className="border-border text-xs font-mono">{step.command} ({step.durationMs}ms)</Badge>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function HistoryPage() {
  const { entries } = useHistoryStore();
  const { checkExport } = usePlanStore();
  const { datasets } = useDatasetStore();
  const { pinnedHistoryIds, togglePinnedHistory, compareHistoryIds, setCompareHistoryIds, savedSessions } = useWorkspaceStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [datasetFilter, setDatasetFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const datasetNames = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => entry.datasetName).filter(Boolean))).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const q = search.toLowerCase();
      if (q && ![e.query, e.datasetName, e.model].some((value) => value?.toLowerCase().includes(q))) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (providerFilter !== "all" && e.provider !== providerFilter) return false;
      if (datasetFilter !== "all" && e.datasetName !== datasetFilter) return false;
      if (favoritesOnly && !pinnedHistoryIds.includes(e.id)) return false;
      if (!isWithinDateFilter(e.date, dateFilter)) return false;
      return true;
    });
  }, [entries, search, statusFilter, providerFilter, datasetFilter, dateFilter, favoritesOnly, pinnedHistoryIds]);

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
    }, null, 2));
    toast.success("History entry copied");
  };

  const toggleCompare = (id: string) => {
    const next = compareHistoryIds.includes(id)
      ? compareHistoryIds.filter((item) => item !== id)
      : [...compareHistoryIds, id].slice(-2);
    setCompareHistoryIds(next);
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
      toast.error(err.message || "History export requires Enterprise plan");
      return;
    }
    const headers = ["Query", "Dataset", "Provider", "Model", "Turns", "Tokens", "Duration (ms)", "Status", "Date"];
    const rows = entries.map((e) => [e.query, e.datasetName, e.provider, e.model, e.turns, e.totalTokens, e.durationMs, e.status, e.date]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => JSON.stringify(v)).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "query-history.csv"; a.click();
    toast.success("History exported");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Query History</h1>
          <p className="text-sm text-muted-foreground mt-1">{entries.length} queries total</p>
        </div>
        <Button variant="outline" className="border-border" onClick={exportCSV} disabled={entries.length === 0}>
          <Download size={14} className="mr-2" /> Export
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-background-secondary p-4">
          <p className="text-xs text-muted-foreground">Pinned queries</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{pinnedHistoryIds.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-background-secondary p-4">
          <p className="text-xs text-muted-foreground">Compare tray</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{compareHistoryIds.length}/2</p>
        </div>
        <div className="rounded-lg border border-border bg-background-secondary p-4">
          <p className="text-xs text-muted-foreground">Saved sessions</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{savedSessions.length}</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search queries, datasets, or models..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-background-secondary border-border" />
        </div>
        <Select value={datasetFilter} onValueChange={setDatasetFilter}>
          <SelectTrigger className="w-[170px] bg-background-secondary border-border">
            <Filter size={12} className="mr-1" /><SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All datasets</SelectItem>
            {datasetNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[140px] bg-background-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] bg-background-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-[150px] bg-background-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All providers</SelectItem>
            {Object.entries(PROVIDER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={favoritesOnly ? "default" : "outline"} className="border-border" onClick={() => setFavoritesOnly((prev) => !prev)}>
          <Star size={14} className="mr-2" /> {favoritesOnly ? "Pinned only" : "Show pinned"}
        </Button>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-background-secondary px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {pageStart + 1}-{Math.min(pageStart + pageEntries.length, filtered.length)} of {filtered.length} quer{filtered.length === 1 ? "y" : "ies"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger className="h-8 w-[110px] bg-card border-border text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
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
      )}

      {pinnedHistoryIds.length > 0 && (
        <div className="rounded-md border border-border bg-background-secondary p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <Star size={14} /> Pinned queries
          </div>
          <div className="flex flex-wrap gap-2">
            {entries.filter((entry) => pinnedHistoryIds.includes(entry.id)).slice(0, 6).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => replayQuery(entry)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              >
                {entry.query}
              </button>
            ))}
          </div>
        </div>
      )}

      {compareHistoryIds.length > 0 && (
        <div className="rounded-md border border-border bg-background-secondary p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <GitCompare size={14} /> Compare queries
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {compareHistoryIds.map((id) => {
              const entry = entries.find((item) => item.id === id);
              if (!entry) return null;
              return (
                <div key={id} className="rounded-md border border-border bg-card p-3 text-xs">
                  <p className="truncate font-medium text-foreground">{entry.query}</p>
                  <p className="mt-1 text-muted-foreground">{entry.datasetName} / {PROVIDER_LABELS[entry.provider]}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Badge variant="outline" className="justify-center border-border">{entry.durationMs}ms</Badge>
                    <Badge variant="outline" className="justify-center border-border">{entry.totalTokens.toLocaleString()} tokens</Badge>
                    <Badge className={`justify-center border-0 ${entry.status === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>{entry.status}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare size={48} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">{entries.length === 0 ? "No queries yet" : "No matching queries"}</p>
          {entries.length === 0 && (
            <Button variant="link" className="text-primary mt-1" onClick={() => navigate("/app/query")}>Go to Query to get started</Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background-secondary">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Query</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Dataset</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Provider</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Turns</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Tokens</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Status</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([group, groupEntries]) => (
                <Fragment key={group}>
                  <tr key={group} className="border-t border-border bg-background-secondary/70">
                    <td colSpan={8} className="px-4 py-2 text-xs font-medium text-muted-foreground">{group}</td>
                  </tr>
                  {groupEntries.map((entry) => (
                    <motion.tr key={entry.id} className="border-t border-border hover:bg-card/50 cursor-pointer" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                    <td className="px-4 py-3 max-w-[250px] truncate text-foreground">{entry.query}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{entry.datasetName}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">{PROVIDER_LABELS[entry.provider]} / {entry.model}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{entry.turns}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{entry.totalTokens.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Badge className={`border-0 text-xs ${entry.status === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>{entry.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{new Date(entry.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label="Favorite query"
                          title="Favorite query"
                          onClick={(e) => { e.stopPropagation(); togglePinnedHistory(entry.id); }}
                          className={`p-1 rounded hover:bg-background-secondary ${pinnedHistoryIds.includes(entry.id) ? "text-warning" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          <Star size={13} fill={pinnedHistoryIds.includes(entry.id) ? "currentColor" : "none"} />
                        </button>
                        <button
                          type="button"
                          aria-label="Compare query"
                          title="Compare query"
                          onClick={(e) => { e.stopPropagation(); toggleCompare(entry.id); }}
                          className={`p-1 rounded hover:bg-background-secondary ${compareHistoryIds.includes(entry.id) ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          {compareHistoryIds.includes(entry.id) ? <CheckSquare size={13} /> : <Square size={13} />}
                        </button>
                        <button
                          type="button"
                          aria-label="Copy question"
                          title="Copy question"
                          onClick={(e) => { e.stopPropagation(); copyQuestion(entry.query); }}
                          className="p-1 rounded hover:bg-background-secondary text-muted-foreground hover:text-foreground"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label="Copy entry"
                          title="Copy full entry"
                          onClick={(e) => { e.stopPropagation(); copyEntry(entry); }}
                          className="p-1 rounded hover:bg-background-secondary text-muted-foreground hover:text-foreground"
                        >
                          <FileText size={13} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); replayQuery(entry); }} className="text-xs text-primary hover:underline flex items-center gap-1">
                          <RotateCcw size={10} /> Replay
                        </button>
                      </div>
                    </td>
                    </motion.tr>
                  ))}
                  {groupEntries.map((entry) => (
                    <AnimatePresence key={`${entry.id}-expanded`}>
                      {expandedId === entry.id && (
                        <tr><td colSpan={8}><ExpandedRow entry={entry} /></td></tr>
                      )}
                    </AnimatePresence>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
