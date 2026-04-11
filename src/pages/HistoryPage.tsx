import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Download, RotateCcw, ChevronDown, ChevronRight, Clock, Zap, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHistoryStore, type HistoryEntry } from "@/stores/history-store";
import { PROVIDER_LABELS } from "@/stores/llm-store";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

function ExpandedRow({ entry }: { entry: HistoryEntry }) {
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
      <div className="px-4 py-3 bg-card/50 border-t border-border space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Question</p>
          <p className="text-sm text-foreground">{entry.query}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Answer</p>
          <pre className="text-xs font-mono text-foreground bg-card rounded p-2 border border-border max-h-40 overflow-auto scrollbar-thin whitespace-pre-wrap">
            {typeof entry.finalResult === "string" ? entry.finalResult : JSON.stringify(entry.finalResult, null, 2)}
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
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (search && !e.query.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (providerFilter !== "all" && e.provider !== providerFilter) return false;
      return true;
    });
  }, [entries, search, statusFilter, providerFilter]);

  const exportCSV = () => {
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

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search queries..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-background-secondary border-border" />
        </div>
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
      </div>

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
              {filtered.map((entry) => (
                <motion.tbody key={entry.id}>
                  <tr className="border-t border-border hover:bg-card/50 cursor-pointer" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                    <td className="px-4 py-3 max-w-[250px] truncate text-foreground">{entry.query}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{entry.datasetName}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">{PROVIDER_LABELS[entry.provider]} · {entry.model}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{entry.turns}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{entry.totalTokens.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Badge className={`border-0 text-xs ${entry.status === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>{entry.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{new Date(entry.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/app/query?dataset=${entry.datasetName}`); }} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <RotateCcw size={10} /> Replay
                      </button>
                    </td>
                  </tr>
                  <AnimatePresence>
                    {expandedId === entry.id && (
                      <tr><td colSpan={8}><ExpandedRow entry={entry} /></td></tr>
                    )}
                  </AnimatePresence>
                </motion.tbody>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
