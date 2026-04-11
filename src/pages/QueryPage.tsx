import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ChevronDown, ChevronRight, Zap, Clock, Copy, Download, PanelRightClose, PanelRightOpen, Settings2, Search, Eye, X, Database, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useDatasetStore } from "@/stores/dataset-store";
import { useLLMStore, PROVIDER_MODELS, PROVIDER_LABELS } from "@/stores/llm-store";
import { useHistoryStore } from "@/stores/history-store";
import { useAuthStore } from "@/stores/auth-store";
import { runAgent, type AgentStep } from "@/lib/agent";
import type { Provider } from "@/lib/llm-client";
import { toast } from "sonner";
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

const COMMAND_COLORS: Record<string, string> = {
  GetSheetDescription: "bg-primary/10 text-primary",
  GetColumns: "bg-accent/10 text-accent",
  QuerySheet: "bg-warning/10 text-warning",
  ExecuteFinalQuery: "bg-success/10 text-success",
  FinalAnswer: "bg-success/10 text-success",
  Error: "bg-destructive/10 text-destructive",
};

const CHART_COLORS = ["hsl(217, 91%, 60%)", "hsl(263, 70%, 58%)", "hsl(160, 84%, 39%)", "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)"];

const SUGGESTED_PROMPTS = [
  "What is the total revenue?",
  "Show top 10 by sales",
  "What are the unique categories?",
  "Find rows where value > 1000",
  "What is the average order value?",
];

function StepCard({ step }: { step: AgentStep }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = COMMAND_COLORS[step.command] || "bg-muted text-muted-foreground";
  const [showFull, setShowFull] = useState(false);
  const resultStr = JSON.stringify(step.result, null, 2);

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${colorClass}`}>
          {step.turn}
        </div>
        <div className="w-px flex-1 bg-border mt-1" />
      </div>
      <div className="flex-1 pb-4 min-w-0">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 w-full text-left">
          <Badge className={`${colorClass} border-0 font-mono text-xs`}>{step.command}</Badge>
          <span className="text-xs text-muted-foreground">{step.durationMs}ms</span>
          {step.tokens.input + step.tokens.output > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Zap size={10} />{step.tokens.input + step.tokens.output}</span>
          )}
          {expanded ? <ChevronDown size={14} className="text-muted-foreground ml-auto" /> : <ChevronRight size={14} className="text-muted-foreground ml-auto" />}
        </button>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="mt-2 space-y-2 overflow-hidden">
            {Object.keys(step.args).length > 0 && (
              <div className="bg-card rounded-md p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1 font-medium">Arguments</p>
                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">{JSON.stringify(step.args, null, 2)}</pre>
              </div>
            )}
            <div className="bg-card rounded-md p-3 border border-border">
              <p className="text-xs text-muted-foreground mb-1 font-medium">Result</p>
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap max-h-40 overflow-auto scrollbar-thin">
                {showFull ? resultStr : resultStr.slice(0, 500)}{resultStr.length > 500 && !showFull && "..."}
              </pre>
              {resultStr.length > 500 && (
                <button onClick={() => setShowFull(!showFull)} className="text-xs text-primary mt-1 hover:underline">
                  {showFull ? "Show less" : "Show full"}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function ResultPanel({ result, onClose }: { result: any; onClose: () => void }) {
  const isArray = Array.isArray(result);
  const isSingleValue = !isArray && typeof result === "object" && result?.result !== undefined;
  const keys = isArray && result.length > 0 ? Object.keys(result[0]) : [];
  const numericKeys = keys.filter((k) => typeof result?.[0]?.[k] === "number");
  const dateKeys = keys.filter((k) => !isNaN(Date.parse(String(result?.[0]?.[k]))) && String(result?.[0]?.[k]).length > 4);
  const isChartable = isArray && result.length > 0 && keys.length >= 2;
  const isLineable = isChartable && dateKeys.length > 0 && numericKeys.length > 0;
  const defaultChart = isLineable ? "line" : "bar";
  const [chartType, setChartType] = useState<"bar" | "pie" | "line" | "area">(defaultChart);
  const [showJson, setShowJson] = useState(false);

  const valueKey = numericKeys[0] || keys[1];
  const labelKey = keys.find((k) => k !== valueKey) || keys[0];

  const downloadCSV = () => {
    if (!isArray) return;
    const headers = Object.keys(result[0]);
    const csv = [headers.join(","), ...result.map((r: any) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "result.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Result</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><PanelRightClose size={16} /></button>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {isSingleValue && (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Result</p>
            <p className="text-4xl font-semibold text-foreground font-mono">{typeof result.result === "number" ? result.result.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(result.result)}</p>
          </div>
        )}

        {isChartable && (
          <div>
            <div className="flex gap-1 mb-3">
              {(["bar", "line", "area", "pie"] as const).map((t) => (
                <button key={t} onClick={() => setChartType(t)} className={`text-xs px-2 py-1 rounded capitalize ${chartType === t ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "pie" ? (
                  <PieChart>
                    <Pie data={result.slice(0, 10)} dataKey={valueKey} nameKey={labelKey} cx="50%" cy="50%" outerRadius={80}>
                      {result.slice(0, 10).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                  </PieChart>
                ) : chartType === "line" ? (
                  <LineChart data={result.slice(0, 50)}>
                    <XAxis dataKey={labelKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                    <Line type="monotone" dataKey={valueKey} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                ) : chartType === "area" ? (
                  <AreaChart data={result.slice(0, 50)}>
                    <defs>
                      <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey={labelKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                    <Area type="monotone" dataKey={valueKey} stroke="hsl(var(--primary))" fill="url(#rg)" strokeWidth={2} dot={false} />
                  </AreaChart>
                ) : (
                  <BarChart data={result.slice(0, 20)}>
                    <XAxis dataKey={labelKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                    <Bar dataKey={valueKey} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {isArray && !isChartable && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-card">
                <tr>
                  {Object.keys(result[0] || {}).map((k) => (
                    <th key={k} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.slice(0, 20).map((row: any, i: number) => (
                  <tr key={i} className="border-t border-border/50">
                    {Object.values(row).map((v: any, j) => (
                      <td key={j} className="px-3 py-1.5 text-foreground max-w-[120px] truncate">{String(v ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {typeof result === "string" && (
          <div className="bg-card rounded-md p-4 border border-border">
            <p className="text-sm text-foreground whitespace-pre-wrap">{result}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-border text-xs" onClick={() => { navigator.clipboard.writeText(JSON.stringify(result, null, 2)); toast.success("Copied"); }}>
            <Copy size={12} className="mr-1" /> Copy
          </Button>
          {isArray && (
            <Button variant="outline" size="sm" className="border-border text-xs" onClick={downloadCSV}>
              <Download size={12} className="mr-1" /> CSV
            </Button>
          )}
        </div>

        <Collapsible open={showJson} onOpenChange={setShowJson}>
          <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            {showJson ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Result as JSON
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 bg-card rounded-md p-3 border border-border text-xs font-mono text-foreground overflow-auto max-h-60 scrollbar-thin">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

// ─── Data Preview Panel ───────────────────────────────────────────────────────
function DataPreviewPanel({
  dataset,
  sheet,
  onClose,
}: {
  dataset: ReturnType<typeof useDatasetStore>["datasets"][0];
  sheet: string;
  onClose: () => void;
}) {
  const { loadDatasetData } = useDatasetStore();
  const [sheetData, setSheetData] = useState<{ columns: any[]; rows: any[] } | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;

  useEffect(() => {
    const inMem = dataset.data?.sheets[sheet];
    if (inMem) { setSheetData(inMem); return; }
    setLoadingData(true);
    loadDatasetData(dataset.id).then((fileData) => {
      setSheetData(fileData?.sheets[sheet] || null);
      setLoadingData(false);
    });
  }, [dataset.id, sheet]);

  const filtered = useMemo(() => {
    if (!sheetData) return [];
    if (!search.trim()) return sheetData.rows;
    const q = search.toLowerCase();
    return sheetData.rows.filter((row) =>
      Object.values(row).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [sheetData, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <motion.div
      className="absolute inset-0 z-50 bg-background flex flex-col"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.18 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-12 border-b border-border bg-background-secondary shrink-0">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-primary" />
          <span className="font-medium text-sm text-foreground">{dataset.fileName}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-sm text-muted-foreground">{sheet}</span>
          {sheetData && (
            <>
              <span className="text-xs text-muted-foreground bg-card border border-border px-2 py-0.5 rounded">{sheetData.rows.length.toLocaleString()} rows</span>
              <span className="text-xs text-muted-foreground bg-card border border-border px-2 py-0.5 rounded">{sheetData.columns.length} cols</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="pl-7 pr-3 h-7 text-xs bg-card border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-44"
              placeholder="Search rows..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Column type badges */}
      {sheetData && (
        <div className="flex gap-4 px-5 py-2 border-b border-border bg-card/40 overflow-x-auto shrink-0">
          {sheetData.columns.map((col: any) => (
            <div key={col.name} className="flex flex-col gap-0.5 shrink-0">
              <span className="text-xs font-medium text-foreground">{col.name}</span>
              <span className={["text-xs px-1.5 py-0.5 rounded font-mono", col.dtype === "number" ? "bg-blue-500/10 text-blue-400" : col.dtype === "date" ? "bg-purple-500/10 text-purple-400" : col.dtype === "boolean" ? "bg-amber-500/10 text-amber-400" : "bg-muted/60 text-muted-foreground"].join(" ")}>{col.dtype}</span>
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      {loadingData ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading dataset from storage...</p>
          </div>
        </div>
      ) : !sheetData ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">No data available for this sheet</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto scrollbar-thin">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-background-secondary z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left text-muted-foreground font-medium border-b border-border">#</th>
                  {sheetData.columns.map((col: any) => (
                    <th key={col.name} className="px-4 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap border-b border-border">
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-card/50 transition-colors">
                    <td className="px-4 py-2 text-muted-foreground border-b border-border/40">{page * PAGE_SIZE + i + 1}</td>
                    {sheetData.columns.map((col: any) => (
                      <td key={col.name} className="px-4 py-2 text-foreground max-w-[240px] truncate border-b border-border/40">
                        {String(row[col.name] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-2.5 border-t border-border bg-background-secondary shrink-0">
              <span className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} rows
              </span>
              <div className="flex gap-1.5">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 h-7 text-xs border border-border rounded hover:bg-card disabled:opacity-40 text-foreground">
                  Previous
                </button>
                <span className="px-2 h-7 text-xs flex items-center text-muted-foreground">{page + 1} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 h-7 text-xs border border-border rounded hover:bg-card disabled:opacity-40 text-foreground">
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

export default function QueryPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { datasets, getDataset } = useDatasetStore();
  const { activeProvider, activeModel, temperature, maxTokens, systemPrompt, setActiveProvider, setActiveModel, setTemperature, setMaxTokens, setSystemPrompt, getApiKey, providerConfigs, setProviderConfig } = useLLMStore();
  const { addEntry } = useHistoryStore();

  const [selectedDatasetId, setSelectedDatasetId] = useState(searchParams.get("dataset") || "");
  const [selectedSheet, setSelectedSheet] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "agent"; content: string; steps?: AgentStep[] }[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<AgentStep[]>([]);
  const [finalResult, setFinalResult] = useState<any>(null);
  const [showResult, setShowResult] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use getDataset so we get the in-memory parsed data (not just persisted metadata)
  const selectedDataset = getDataset(selectedDatasetId) ?? datasets.find((d) => d.id === selectedDatasetId);

  useEffect(() => {
    if (selectedDataset && !selectedSheet) setSelectedSheet(selectedDataset.sheetNames[0]);
  }, [selectedDataset, selectedSheet]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, currentSteps]);

  const handleSend = async () => {
    if (!input.trim() || isRunning) return;
    if (!selectedDatasetId) { toast.error("Select a dataset first"); return; }
    const apiKey = getApiKey(activeProvider);
    if (!apiKey && activeProvider !== "ollama") { toast.error("Configure API key for " + PROVIDER_LABELS[activeProvider]); return; }

    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setIsRunning(true);
    setCurrentSteps([]);
    setFinalResult(null);

    let sheetData = selectedDataset?.data?.sheets[selectedSheet];
    if (!sheetData) {
      // Data not in memory — try fetching from MongoDB (happens after re-login)
      toast.info("Loading dataset from storage…");
      const { loadDatasetData } = useDatasetStore.getState();
      const fetched = await loadDatasetData(selectedDatasetId);
      sheetData = fetched?.sheets[selectedSheet];
    }
    if (!sheetData) {
      toast.error("Dataset data unavailable. Please re-upload the file.");
      setIsRunning(false);
      return;
    }
    const steps: AgentStep[] = [];
    const startTime = Date.now();

    try {
      for await (const step of runAgent(question, sheetData, activeProvider, activeModel, apiKey, temperature, maxTokens, systemPrompt || undefined)) {
        steps.push(step);
        setCurrentSteps([...steps]);
        if (step.isFinal) {
          setFinalResult(step.result);
          setShowResult(true);
        }
      }

      const totalTokens = steps.reduce((s, st) => s + st.tokens.input + st.tokens.output, 0);
      setMessages((prev) => [...prev, { role: "agent", content: "", steps: [...steps] }]);
      setCurrentSteps([]);

      addEntry({
        query: question,
        datasetName: selectedDataset!.fileName,
        provider: activeProvider,
        model: activeModel,
        turns: steps.length,
        totalTokens,
        durationMs: Date.now() - startTime,
        status: steps.some((s) => s.command === "Error") ? "error" : "success",
        steps: [...steps],
        finalResult: steps[steps.length - 1]?.result,
      });
    } catch (err: any) {
      toast.error(err.message);
      setMessages((prev) => [...prev, { role: "agent", content: err.message, steps: [] }]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const apiKeyForProvider = providerConfigs[activeProvider]?.apiKey || "";

  return (
    <div className="flex h-[calc(100vh-56px)] relative">
      <AnimatePresence>
        {showPreview && selectedDataset && (
          <DataPreviewPanel
            dataset={selectedDataset}
            sheet={selectedSheet}
            onClose={() => setShowPreview(false)}
          />
        )}
      </AnimatePresence>
      {/* Left: Context Panel */}
      <div className="w-[280px] border-r border-border bg-background-secondary flex flex-col shrink-0 overflow-auto hidden lg:flex">
        <div className="p-4 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Dataset</Label>
            <Select value={selectedDatasetId} onValueChange={(v) => { setSelectedDatasetId(v); setSelectedSheet(""); }}>
              <SelectTrigger className="mt-1.5 bg-card border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.fileName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selectedDataset && selectedDataset.sheetNames.length > 1 && (
            <div>
              <Label className="text-xs text-muted-foreground">Sheet</Label>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {selectedDataset.sheetNames.map((s) => (
                  <button key={s} onClick={() => setSelectedSheet(s)} className={`text-xs px-2 py-1 rounded ${s === selectedSheet ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground bg-card"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedDataset && selectedSheet && (
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="border-border text-xs">{selectedDataset.rowCounts[selectedSheet]} rows</Badge>
              <Badge variant="outline" className="border-border text-xs">{selectedDataset.columnCounts[selectedSheet]} cols</Badge>
            </div>
          )}

          {selectedDataset && (
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 w-full text-xs px-3 py-2 rounded-md border border-border bg-card hover:bg-card/80 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all"
            >
              <Table2 size={12} />
              Preview data
              <Eye size={11} className="ml-auto" />
            </button>
          )}

          <Separator className="bg-border" />

          <div>
            <Label className="text-xs text-muted-foreground">LLM Provider</Label>
            <Select value={activeProvider} onValueChange={(v) => setActiveProvider(v as Provider)}>
              <SelectTrigger className="mt-1.5 bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${p.length * 37 % 360}, 70%, 50%)` }} />
                      {PROVIDER_LABELS[p]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <Input type="password" placeholder="Enter API key" value={apiKeyForProvider} onChange={(e) => setProviderConfig(activeProvider, { apiKey: e.target.value })} className="mt-1.5 bg-card border-border text-xs font-mono" />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Model</Label>
            <Select value={activeModel} onValueChange={setActiveModel}>
              <SelectTrigger className="mt-1.5 bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {PROVIDER_MODELS[activeProvider]?.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex justify-between">
              <Label className="text-xs text-muted-foreground">Temperature</Label>
              <span className="text-xs font-mono text-muted-foreground">{temperature.toFixed(1)}</span>
            </div>
            <Slider value={[temperature]} onValueChange={([v]) => setTemperature(v)} min={0} max={1} step={0.1} className="mt-2" />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Max Tokens</Label>
            <Select value={String(maxTokens)} onValueChange={(v) => setMaxTokens(Number(v))}>
              <SelectTrigger className="mt-1.5 bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {[256, 512, 1024, 2048].map((t) => <SelectItem key={t} value={String(t)}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Settings2 size={12} /> Advanced {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Textarea placeholder="System prompt override..." value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="bg-card border-border text-xs min-h-[80px]" />
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Center: Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-auto p-4 space-y-4 scrollbar-thin">
          {messages.length === 0 && !isRunning && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Search size={24} className="text-primary" />
              </div>
              <p className="text-muted-foreground text-sm">Ask a question about your data</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button key={p} onClick={() => { setInput(p); textareaRef.current?.focus(); }} className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-card rounded-lg px-4 py-2.5 max-w-md border border-border">
                    <p className="text-sm text-foreground">{msg.content}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {msg.steps && msg.steps.length > 0 ? (
                    msg.steps.map((step, j) => <StepCard key={j} step={step} />)
                  ) : (
                    <div className="bg-destructive/10 rounded-lg px-4 py-2.5 border border-destructive/20">
                      <p className="text-sm text-destructive">{msg.content}</p>
                    </div>
                  )}
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="flex gap-3 text-xs text-muted-foreground pl-10 pt-1">
                      <span className="flex items-center gap-1"><Clock size={10} /> {msg.steps.reduce((s, st) => s + st.durationMs, 0).toLocaleString()}ms</span>
                      <span className="flex items-center gap-1"><Zap size={10} /> {msg.steps.reduce((s, st) => s + st.tokens.input + st.tokens.output, 0).toLocaleString()} tokens</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isRunning && (
            <div className="space-y-1">
              {currentSteps.map((step, j) => <StepCard key={j} step={step} />)}
              <div className="flex items-center gap-2 pl-10">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" style={{ animationDelay: "0s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" style={{ animationDelay: "0.2s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" style={{ animationDelay: "0.4s" }} />
                </div>
                <span className="text-xs text-muted-foreground">Agent is thinking...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t border-border bg-background">
          <div className="flex gap-2 items-end max-w-3xl mx-auto">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your data..."
              className="bg-background-secondary border-border resize-none min-h-[44px] max-h-[120px]"
              rows={1}
            />
            <Button onClick={handleSend} disabled={isRunning || !input.trim()} size="icon" className="shrink-0 h-[44px] w-[44px]">
              <Send size={16} />
            </Button>
          </div>
          {input.length > 0 && <p className="text-xs text-muted-foreground text-center mt-1">~{Math.ceil(input.length / 4)} tokens</p>}
        </div>
      </div>

      {/* Right: Result Panel */}
      {finalResult !== null && showResult && (
        <div className="w-[320px] border-l border-border bg-background-secondary shrink-0 hidden xl:block">
          <ResultPanel result={finalResult} onClose={() => setShowResult(false)} />
        </div>
      )}

      {finalResult !== null && !showResult && (
        <button onClick={() => setShowResult(true)} className="fixed right-4 bottom-20 bg-primary text-primary-foreground p-2 rounded-full shadow-lg hover:bg-primary/90 hidden xl:block">
          <PanelRightOpen size={16} />
        </button>
      )}
    </div>
  );
}
