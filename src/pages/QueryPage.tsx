import { useState, useRef, useEffect, useMemo, useId, useCallback, type CSSProperties } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { List } from "react-window";
import {
  Send, ChevronDown, ChevronRight, Zap, Clock, Copy, Download, PanelRightClose, PanelRightOpen,
  Settings2, Search, Eye, X, Database, Table2, Bookmark, BookmarkPlus, Sparkles, Lightbulb,
  LayoutTemplate, Keyboard, RefreshCw, FileJson, FileText, Code2, TrendingUp,
  MessageSquarePlus, Trash2, BarChart3, FileDown, Layout, Maximize2, Minimize2, Star, Rows3, Palette,
} from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDatasetStore, type StoredDataset } from "@/stores/dataset-store";
import { useLLMStore, PROVIDER_MODELS, PROVIDER_LABELS } from "@/stores/llm-store";
import { useHistoryStore } from "@/stores/history-store";
import { useAuthStore } from "@/stores/auth-store";
import { useInsightsStore } from "@/stores/insights-store";
import { usePlanStore } from "@/stores/plan-store";
import { ProviderLogo } from "@/components/ProviderLogo";

import { runAgent, type AgentStep, type ConversationContext } from "@/lib/agent";
import type { Provider } from "@/lib/llm-client";
import type { ColumnInfo } from "@/lib/file-parser";
import { toast } from "sonner";
import { generatePDF } from "@/lib/pdf-report";
import html2canvas from "html2canvas";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend as RechartsLegend, LabelList,
} from "recharts";

// ─── Constants ────────────────────────────────────────────────────────────────
const COMMAND_COLORS: Record<string, string> = {
  GetSheetDescription: "bg-primary/10 text-primary",
  GetColumns: "bg-accent/10 text-accent",
  QuerySheet: "bg-warning/10 text-warning",
  ExecuteFinalQuery: "bg-success/10 text-success",
  FinalAnswer: "bg-success/10 text-success",
  NarrativeAnswer: "bg-purple-500/10 text-purple-400",
  Answer: "bg-success/10 text-success",
  Error: "bg-destructive/10 text-destructive",
};

const CHART_COLORS = [
  "hsl(217, 91%, 60%)", "hsl(263, 70%, 58%)", "hsl(160, 84%, 39%)",
  "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)",
];
const DEFAULT_CHART_ROWS = 50;
const CHART_RENDER_LIMIT = 1000;
const RESULT_TABLE_ROW_HEIGHT: Record<ResultDensity, number> = {
  compact: 30,
  comfortable: 38,
};

// ─── Query Templates ──────────────────────────────────────────────────────────
const QUERY_TEMPLATES = [
  {
    category: "📊 Sales & Revenue",
    templates: [
      "What is the total revenue?",
      "Show top 10 products by sales",
      "What is the revenue by region?",
      "Compare revenue month over month",
      "Which customer has the highest lifetime value?",
      "What is the average order value?",
      "Show sales trend over time",
    ],
  },
  {
    category: "👥 People & HR",
    templates: [
      "How many employees are there by department?",
      "What is the average salary by role?",
      "Show headcount growth over time",
      "Which department has the highest attrition?",
      "What is the salary distribution?",
    ],
  },
  {
    category: "💰 Finance",
    templates: [
      "What is the total expense by category?",
      "Show budget vs actual comparison",
      "What are the top cost drivers?",
      "Calculate the profit margin",
      "Show cash flow trend",
    ],
  },
  {
    category: "⚙️ Operations",
    templates: [
      "What is the on-time delivery rate?",
      "Show defect rate by category",
      "What are the top issues by frequency?",
      "Calculate average resolution time",
      "Which supplier has the lowest quality score?",
    ],
  },
  {
    category: "🔍 Exploration",
    templates: [
      "What is this dataset about?",
      "What can I ask about this data?",
      "Show me a summary of all columns",
      "Find any outliers in the data",
      "What are the unique values in each column?",
      "Which columns have missing data?",
    ],
  },
];

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
const SHORTCUTS = [
  { keys: ["Ctrl", "Enter"], label: "Run query" },
  { keys: ["Ctrl", "K"], label: "Command palette" },
  { keys: ["Ctrl", "Shift", "C"], label: "Clear conversation" },
  { keys: ["Ctrl", "Shift", "B"], label: "Bookmark result" },
  { keys: ["Ctrl", "Shift", "E"], label: "Export center" },
  { keys: ["Ctrl", "Shift", "T"], label: "Templates library" },
  { keys: ["Escape"], label: "Close panels" },
  { keys: ["?"], label: "Keyboard shortcuts" },
];

const FAVORITE_PROMPTS_KEY = "datavault-favorite-prompts";
type ResultDensity = "comfortable" | "compact";

function readStoredList(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

// ─── Smart Suggestion Generator ──────────────────────────────────────────────
function generateSmartSuggestions(columns: ColumnInfo[]): string[] {
  const suggestions: string[] = [];
  const numericCols = columns.filter((c) => c.dtype === "number").map((c) => c.name);
  const stringCols = columns.filter((c) => c.dtype === "string").map((c) => c.name);
  const dateCols = columns.filter((c) => c.dtype === "date").map((c) => c.name);

  if (numericCols.length > 0) {
    suggestions.push(`What is the total ${numericCols[0]}?`);
    suggestions.push(`What is the average ${numericCols[0]}?`);
    if (numericCols.length > 1) suggestions.push(`Show the correlation between ${numericCols[0]} and ${numericCols[1]}`);
    suggestions.push(`Find outliers in ${numericCols[0]}`);
    suggestions.push(`What are the percentiles (p25, p50, p75, p95) of ${numericCols[0]}?`);
  }
  if (stringCols.length > 0) {
    suggestions.push(`What are the unique ${stringCols[0]} values?`);
    if (numericCols.length > 0) suggestions.push(`What is the total ${numericCols[0]} by ${stringCols[0]}?`);
    if (numericCols.length > 0) suggestions.push(`Which ${stringCols[0]} has the highest ${numericCols[0]}?`);
  }
  if (dateCols.length > 0 && numericCols.length > 0) {
    suggestions.push(`Show ${numericCols[0]} trend by month`);
    suggestions.push(`What is the ${numericCols[0]} by quarter?`);
  }
  suggestions.push("What is this dataset about?");
  suggestions.push("Show me a summary of all columns");

  return suggestions.slice(0, 8);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
type ChartType = "bar" | "pie" | "line" | "area";

function toChartNumber(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getChartMeta(result: any) {
  // Unwrap common wrapper formats: {data: [...]}, {rows: [...]}, {result: [...]}
  let rawData = result;
  if (!Array.isArray(rawData) && typeof rawData === "object" && rawData !== null) {
    if (Array.isArray(rawData.data)) rawData = rawData.data;
    else if (Array.isArray(rawData.rows)) rawData = rawData.rows;
    else if (Array.isArray(rawData.result)) rawData = rawData.result;
  }

  const rows: Record<string, any>[] = Array.isArray(rawData)
    ? rawData.filter((row: any) => row && typeof row === "object" && !Array.isArray(row))
    : [];
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const numericKeys = keys.filter((k) => rows.some((row) => toChartNumber(row[k]) !== null));
  const nonNumericKeys = keys.filter((k) => !numericKeys.includes(k));
  const valueKey = numericKeys[0] || "";
  // Prefer a non-numeric key as label; fallback to the second key or first key
  const labelKey = nonNumericKeys[0] || (keys.length > 1 ? keys.find((k) => k !== valueKey) : keys[0]) || "";
  const dateKeys = keys.filter((k) =>
    rows.some((row) => {
      const value = String(row[k] ?? "");
      return value.length > 4 && !Number.isNaN(Date.parse(value));
    })
  );
  const chartRows = valueKey
    ? rows
        .map((row) => {
          const numeric = toChartNumber(row[valueKey]);
          if (numeric === null) return null;
          return { ...row, [valueKey]: numeric };
        })
        .filter((row): row is Record<string, any> => row !== null)
    : [];
  // Chartable = at least 2 data points, a valid numeric key, and ideally a label key
  const isChartable = chartRows.length >= 2 && Boolean(valueKey) && Boolean(labelKey) && labelKey !== valueKey;
  const defaultChart: ChartType = dateKeys.includes(labelKey) ? "line" : "bar";
  return { rows, keys, chartRows, valueKey, labelKey, isChartable, defaultChart };
}

function getFinalStep(steps?: AgentStep[]) {
  if (!steps || steps.length === 0) return null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.isFinal || step.command === "ExecuteFinalQuery" || step.command === "Answer" ||
        step.command === "FinalAnswer" || step.command === "NarrativeAnswer") {
      return step;
    }
  }
  return null;
}

// ─── Export Utilities ─────────────────────────────────────────────────────────
function exportJSON(result: any, filename = "result.json") {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportMarkdown(result: any, query: string, filename = "result.md") {
  let md = `# Query Result\n\n**Query:** ${query}\n\n**Date:** ${new Date().toLocaleString()}\n\n`;
  if (Array.isArray(result) && result.length > 0 && typeof result[0] === "object") {
    const headers = Object.keys(result[0]);
    md += `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`;
    for (const row of result) {
      md += `| ${headers.map((h) => String(row[h] ?? "")).join(" | ")} |\n`;
    }
  } else if (result?.narrative) {
    md += result.narrative;
  } else {
    md += "```json\n" + JSON.stringify(result, null, 2) + "\n```";
  }
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportHTML(result: any, query: string, filename = "result.html") {
  let tableHtml = "";
  if (Array.isArray(result) && result.length > 0 && typeof result[0] === "object") {
    const headers = Object.keys(result[0]);
    tableHtml = `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
      <thead style="background:#f0f0f0"><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${result.map((row: any) => `<tr>${headers.map((h) => `<td>${row[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;
  } else {
    tableHtml = `<pre style="font-family:monospace">${JSON.stringify(result, null, 2)}</pre>`;
  }
  const html = `<!DOCTYPE html><html><head><title>DataVault Export</title></head><body>
    <h2 style="font-family:sans-serif">Query: ${query}</h2>
    <p style="font-family:sans-serif;color:#888">${new Date().toLocaleString()}</p>
    ${tableHtml}</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(result: any, filename = "result.csv") {
  const rows: Record<string, any>[] = Array.isArray(result) ? result : [];
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function rowsToCSV(rows: Record<string, any>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? "")).join(","))].join("\n");
}

async function copyRows(rows: Record<string, any>[]) {
  const csv = rowsToCSV(rows);
  if (!csv) {
    toast.info("No table rows to copy");
    return;
  }
  await navigator.clipboard.writeText(csv);
  toast.success("Table copied");
}

interface VirtualizedResultTableProps {
  rows: Record<string, any>[];
  headers: string[];
  density: ResultDensity;
  maxHeight?: number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
}

interface ResultRowProps {
  rows: Record<string, any>[];
  headers: string[];
  gridTemplateColumns: string;
  density: ResultDensity;
}

function ResultTableRow({
  index,
  style,
  ariaAttributes,
  rows,
  headers,
  gridTemplateColumns,
  density,
}: {
  index: number;
  style: CSSProperties;
  ariaAttributes: Record<string, any>;
} & ResultRowProps) {
  const row = rows[index];
  return (
    <div
      {...ariaAttributes}
      style={{ ...style, display: "grid", gridTemplateColumns }}
      className={`border-t border-border/50 ${index % 2 === 0 ? "bg-background-secondary/30" : "bg-card"}`}
    >
      {headers.map((header) => {
        const value = String(row?.[header] ?? "");
        return (
          <div
            key={header}
            title={value}
            className={`${density === "compact" ? "px-2 py-1.5" : "px-3 py-2"} min-w-0 truncate text-xs text-foreground`}
          >
            {value}
          </div>
        );
      })}
    </div>
  );
}

function VirtualizedResultTable({
  rows,
  headers,
  density,
  maxHeight = 360,
  sortKey,
  sortDir = "asc",
  onSort,
}: VirtualizedResultTableProps) {
  const rowHeight = RESULT_TABLE_ROW_HEIGHT[density];
  const minColWidth = density === "compact" ? 116 : 140;
  const minWidth = Math.max(420, headers.length * minColWidth);
  const gridTemplateColumns = `repeat(${headers.length}, minmax(${minColWidth}px, 1fr))`;
  const listHeight = Math.min(maxHeight, Math.max(rowHeight, rows.length * rowHeight));

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card px-3 py-4 text-center text-xs text-muted-foreground">
        No matching rows
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <div style={{ minWidth }}>
        <div
          className="grid border-b border-border bg-background-secondary text-xs font-medium text-muted-foreground"
          style={{ gridTemplateColumns }}
        >
          {headers.map((header) => (
            <button
              key={header}
              type="button"
              disabled={!onSort}
              onClick={() => onSort?.(header)}
              className={`${density === "compact" ? "px-2 py-2" : "px-3 py-2.5"} min-w-0 truncate text-left hover:text-foreground disabled:hover:text-muted-foreground`}
              title={header}
            >
              {header}{sortKey === header ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
        </div>
        <List<ResultRowProps>
          className="scrollbar-thin"
          defaultHeight={listHeight}
          overscanCount={8}
          rowComponent={ResultTableRow}
          rowCount={rows.length}
          rowHeight={rowHeight}
          rowProps={{ rows, headers, gridTemplateColumns, density }}
          style={{ height: listHeight, width: "100%" }}
        />
      </div>
    </div>
  );
}

// ─── NarrativeResult Component ────────────────────────────────────────────────
function NarrativeResult({ result }: { result: { narrative: string; highlights?: { label: string; value: string }[] } }) {
  return (
    <div className="ml-10 mt-1 mb-3 rounded-md border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={13} className="text-purple-400" />
        <span className="text-xs text-purple-400 font-medium">AI Analysis</span>
      </div>
      {result.highlights && result.highlights.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
          {result.highlights.map((h, i) => (
            <div key={i} className="bg-card rounded-md p-2.5 border border-border">
              <p className="text-xs text-muted-foreground">{h.label}</p>
              <p className="text-sm font-semibold text-foreground font-mono">{h.value}</p>
            </div>
          ))}
        </div>
      )}
      <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{result.narrative}</div>
    </div>
  );
}

// ─── StepCard Component ───────────────────────────────────────────────────────
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
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Arguments</p>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(JSON.stringify(step.args, null, 2)); toast.success("Query command copied"); }}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Copy size={10} /> Copy command
                  </button>
                </div>
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

// ─── ResultPanel (Right Sidebar) ─────────────────────────────────────────────
function ResultPanel({
  result, query, onClose, onBookmark,
}: {
  result: any; query: string; onClose: () => void; onBookmark: () => void;
  datasetName: string;
}) {
  const isArray = Array.isArray(result);
  const isSingleValue = !isArray && typeof result === "object" && result?.result !== undefined;
  const isPrimitiveValue = !isArray && (typeof result === "number" || typeof result === "boolean");
  const isNarrative = !isArray && typeof result === "object" && result?.narrative !== undefined;
  const { rows, chartRows, valueKey, labelKey, isChartable, defaultChart } = getChartMeta(result);
  const [chartType, setChartType] = useState<ChartType>(defaultChart);
  const [showExport, setShowExport] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const [resultSearch, setResultSearch] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [density, setDensity] = useState<ResultDensity>("comfortable");
  const [fullscreen, setFullscreen] = useState(false);
  const [chartColor, setChartColor] = useState("hsl(var(--primary))");
  const [chartTitle, setChartTitle] = useState("");
  const [xAxisLabel, setXAxisLabel] = useState("");
  const [yAxisLabel, setYAxisLabel] = useState("");
  const [showLegend, setShowLegend] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [chartSort, setChartSort] = useState<"none" | "asc" | "desc">("none");
  const [topN, setTopN] = useState(DEFAULT_CHART_ROWS);
  const [chartNotes, setChartNotes] = useState("");
  const { checkExport } = usePlanStore();
  const isEmptyArray = isArray && rows.length === 0;
  const isEmptyObject = !isArray && !isSingleValue && !isPrimitiveValue && !isNarrative && result && typeof result === "object" && Object.keys(result).length === 0;
  const isBlankString = typeof result === "string" && !result.trim();

  const areaGradientId = useId().replace(/:/g, "");

  useEffect(() => { setChartType(defaultChart); }, [defaultChart]);
  useEffect(() => {
    setChartTitle(query ? query.slice(0, 80) : "Chart");
    setXAxisLabel(labelKey);
    setYAxisLabel(valueKey);
  }, [query, labelKey, valueKey]);

  const sortedChartRows = useMemo(() => {
    let next = [...chartRows];
    if (chartSort !== "none" && valueKey) {
      next.sort((a, b) => chartSort === "asc" ? Number(a[valueKey]) - Number(b[valueKey]) : Number(b[valueKey]) - Number(a[valueKey]));
    }
    return next;
  }, [chartRows, chartSort, valueKey]);
  const visibleChartRows = useMemo(() => {
    const selected = topN > 0 ? sortedChartRows.slice(0, topN) : sortedChartRows;
    return selected.length > CHART_RENDER_LIMIT ? selected.slice(0, CHART_RENDER_LIMIT) : selected;
  }, [sortedChartRows, topN]);
  const chartRenderLimited = topN === 0 && sortedChartRows.length > CHART_RENDER_LIMIT;

  const displayedRows = useMemo(() => {
    const q = resultSearch.trim().toLowerCase();
    let next = rows.filter((row) => !q || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(q)));
    if (sortKey) {
      next = [...next].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const an = Number(av);
        const bn = Number(bv);
        const result = Number.isFinite(an) && Number.isFinite(bn)
          ? an - bn
          : String(av ?? "").localeCompare(String(bv ?? ""));
        return sortDir === "asc" ? result : -result;
      });
    }
    return next;
  }, [rows, resultSearch, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => prev === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const downloadChartImage = async () => {
    if (!chartRef.current) return;
    const canvas = await html2canvas(chartRef.current, { backgroundColor: null, scale: 2 });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "datavault-chart.png";
    a.click();
    toast.success("Chart image downloaded");
  };

  const runExport = async (format: "csv" | "json" | "markdown" | "html", action: () => void, label: string) => {
    try {
      await checkExport(format);
      action();
      toast.success(`${label} downloaded`);
    } catch (err: any) {
      toast.error(err.message || `${label} export is not available on your plan`);
    }
  };

  return (
    <div className={fullscreen ? "fixed inset-4 z-[60] rounded-lg border border-border bg-background-secondary shadow-2xl flex flex-col" : "h-full flex flex-col"}>
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Result</h3>
          {isArray && <p className="text-xs text-muted-foreground">{displayedRows.length.toLocaleString()} of {rows.length.toLocaleString()} rows</p>}
        </div>
        <div className="flex gap-1">

          <button onClick={onBookmark} title="Save as Insight" className="p-1.5 rounded hover:bg-card text-muted-foreground hover:text-primary transition-colors">
            <BookmarkPlus size={14} />
          </button>
          <button onClick={() => setShowExport(!showExport)} title="Export" className="p-1.5 rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors">
            <Download size={14} />
          </button>
          <button onClick={() => setFullscreen((prev) => !prev)} title={fullscreen ? "Exit fullscreen" : "Fullscreen"} className="p-1.5 rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors">
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors">
            <PanelRightClose size={14} />
          </button>
        </div>
      </div>

      {showExport && (
        <div className="p-3 border-b border-border bg-card/40 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Export As</p>
          <div className="flex flex-wrap gap-1.5">
            {isArray && (
              <button onClick={() => runExport("csv", () => exportCSV(result), "CSV")} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-card border border-border text-muted-foreground hover:text-foreground">
                <BarChart3 size={10} /> CSV
              </button>
            )}
            <button onClick={() => runExport("json", () => exportJSON(result), "JSON")} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-card border border-border text-muted-foreground hover:text-foreground">
              <FileJson size={10} /> JSON
            </button>
            <button onClick={() => runExport("markdown", () => exportMarkdown(result, query), "Markdown")} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-card border border-border text-muted-foreground hover:text-foreground">
              <FileText size={10} /> Markdown
            </button>
            <button onClick={() => runExport("html", () => exportHTML(result, query), "HTML")} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-card border border-border text-muted-foreground hover:text-foreground">
              <Code2 size={10} /> HTML
            </button>
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4">
        {isNarrative && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-purple-400" />
              <span className="text-xs text-purple-400 font-medium">AI Analysis</span>
            </div>
            {result.highlights?.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {result.highlights.map((h: any, i: number) => (
                  <div key={i} className="bg-card rounded-md p-2.5 border border-border">
                    <p className="text-xs text-muted-foreground">{h.label}</p>
                    <p className="text-sm font-semibold text-foreground">{h.value}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{result.narrative}</p>
          </div>
        )}

        {isSingleValue && (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Result</p>
            <p className="text-4xl font-semibold text-foreground font-mono">
              {typeof result.result === "number" ? result.result.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(result.result)}
            </p>
          </div>
        )}
        {isPrimitiveValue && (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Result</p>
            <p className="text-4xl font-semibold text-foreground font-mono">{String(result)}</p>
          </div>
        )}

        {isChartable && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex gap-1">
                {(["bar", "line", "area", "pie"] as const).map((t) => (
                  <button key={t} onClick={() => setChartType(t)} title={`${t} chart`} className={`text-xs px-2 py-1 rounded capitalize ${chartType === t ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                    <BarChart3 size={12} />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Palette size={12} className="text-muted-foreground" />
                {["hsl(var(--primary))", "hsl(160, 84%, 39%)", "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)"].map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label="Chart color"
                    onClick={() => setChartColor(color)}
                    className={`h-4 w-4 rounded-full border ${chartColor === color ? "border-foreground" : "border-border"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Input value={chartTitle} onChange={(e) => setChartTitle(e.target.value)} placeholder="Chart title" className="h-8 bg-card border-border text-xs col-span-2" />
              <Input value={xAxisLabel} onChange={(e) => setXAxisLabel(e.target.value)} placeholder="X axis" className="h-8 bg-card border-border text-xs" />
              <Input value={yAxisLabel} onChange={(e) => setYAxisLabel(e.target.value)} placeholder="Y axis" className="h-8 bg-card border-border text-xs" />
              <Select value={chartSort} onValueChange={(v) => setChartSort(v as "none" | "asc" | "desc")}>
                <SelectTrigger className="h-8 bg-card border-border text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="none">Original order</SelectItem>
                  <SelectItem value="asc">Sort ascending</SelectItem>
                  <SelectItem value="desc">Sort descending</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(topN)} onValueChange={(v) => setTopN(Number(v))}>
                <SelectTrigger className="h-8 bg-card border-border text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value={String(DEFAULT_CHART_ROWS)}>Top {DEFAULT_CHART_ROWS}</SelectItem>
                  <SelectItem value="0">All rows</SelectItem>
                  {[5, 10, 20, 100, 250].map((n) => <SelectItem key={n} value={String(n)}>Top {n}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => setShowLegend((prev) => !prev)}>
                {showLegend ? "Legend on" : "Legend off"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => setShowLabels((prev) => !prev)}>
                {showLabels ? "Labels on" : "Labels off"}
              </Button>
              <Textarea value={chartNotes} onChange={(e) => setChartNotes(e.target.value)} placeholder="Chart notes..." className="col-span-2 min-h-[56px] bg-card border-border text-xs" />
              <Button variant="outline" size="sm" className="col-span-2 h-8 border-border text-xs" onClick={onBookmark}>
                <BookmarkPlus size={12} className="mr-1" /> Save chart as insight
              </Button>
            </div>
            {chartRenderLimited && (
              <div className="mb-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                Chart preview is capped at {CHART_RENDER_LIMIT.toLocaleString()} points for performance. The table and exports still include all rows.
              </div>
            )}
            <div ref={chartRef} className={fullscreen ? "h-[50vh] rounded-md bg-background-secondary/30 p-2" : "h-52 rounded-md bg-background-secondary/30 p-2"}>
              <p className="mb-1 truncate text-center text-xs font-medium text-foreground">{chartTitle || "Chart"}</p>
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "pie" ? (
                  <PieChart>
                    <Pie data={visibleChartRows} dataKey={valueKey} nameKey={labelKey} cx="50%" cy="50%" outerRadius={80} label={showLabels}>
                      {visibleChartRows.map((_: any, i: number) => <Cell key={i} fill={i === 0 ? chartColor : CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    {showLegend && <RechartsLegend />}
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  </PieChart>
                ) : chartType === "line" ? (
                  <LineChart data={visibleChartRows}>
                    <XAxis dataKey={labelKey} label={{ value: xAxisLabel, position: "insideBottom", offset: -2, fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis label={{ value: yAxisLabel, angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    {showLegend && <RechartsLegend />}
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Line type="monotone" dataKey={valueKey} stroke={chartColor} strokeWidth={2} dot={false} />
                  </LineChart>
                ) : chartType === "area" ? (
                  <AreaChart data={visibleChartRows}>
                    <defs>
                      <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey={labelKey} label={{ value: xAxisLabel, position: "insideBottom", offset: -2, fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis label={{ value: yAxisLabel, angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    {showLegend && <RechartsLegend />}
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Area type="monotone" dataKey={valueKey} stroke={chartColor} fill={`url(#${areaGradientId})`} strokeWidth={2} dot={false} />
                  </AreaChart>
                ) : (
                  <BarChart data={visibleChartRows}>
                    <XAxis dataKey={labelKey} label={{ value: xAxisLabel, position: "insideBottom", offset: -2, fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis label={{ value: yAxisLabel, angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    {showLegend && <RechartsLegend />}
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey={valueKey} fill={chartColor} radius={[4, 4, 0, 0]}>
                      {showLabels && <LabelList dataKey={valueKey} position="top" fill="hsl(var(--muted-foreground))" fontSize={10} />}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            {chartNotes && <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{chartNotes}</p>}
          </div>
        )}

        {false && isChartable && (
          <div>
            <div className="flex gap-1 mb-3">
              {(["bar", "line", "area", "pie"] as const).map((t) => (
                <button key={t} onClick={() => setChartType(t)} className={`text-xs px-2 py-1 rounded capitalize ${chartType === t ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                  {t}
                </button>
              ))}
            </div>
            <div ref={chartRef} className="h-52 rounded-md bg-background-secondary/30 p-2">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "pie" ? (
                  <PieChart>
                    <Pie data={chartRows.slice(0, 10)} dataKey={valueKey} nameKey={labelKey} cx="50%" cy="50%" outerRadius={80}>
                      {chartRows.slice(0, 10).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  </PieChart>
                ) : chartType === "line" ? (
                  <LineChart data={chartRows.slice(0, 50)}>
                    <XAxis dataKey={labelKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Line type="monotone" dataKey={valueKey} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                ) : chartType === "area" ? (
                  <AreaChart data={chartRows.slice(0, 50)}>
                    <defs>
                      <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey={labelKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Area type="monotone" dataKey={valueKey} stroke="hsl(var(--primary))" fill={`url(#${areaGradientId})`} strokeWidth={2} dot={false} />
                  </AreaChart>
                ) : (
                  <BarChart data={chartRows.slice(0, 20)}>
                    <XAxis dataKey={labelKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey={valueKey} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {isArray && rows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={resultSearch} onChange={(e) => setResultSearch(e.target.value)} placeholder="Search result rows..." className="h-8 bg-card border-border pl-8 text-xs" />
              </div>
              <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => setDensity((prev) => prev === "compact" ? "comfortable" : "compact")}>
                <Rows3 size={12} className="mr-1" /> {density === "compact" ? "Compact" : "Roomy"}
              </Button>
            </div>
            {displayedRows.length > 200 && (
              <VirtualizedResultTable
                rows={displayedRows}
                headers={Object.keys(rows[0] || {})}
                density={density}
                maxHeight={fullscreen ? 560 : 360}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
            )}
            <div className={displayedRows.length > 200 ? "hidden" : "max-h-[50vh] overflow-auto rounded-md border border-border"}>
            <table className="w-full text-xs">
              <thead className="bg-card">
                <tr>
                  {Object.keys(rows[0] || {}).map((k) => (
                    <th key={k} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">
                      <button type="button" onClick={() => handleSort(k)} className="hover:text-foreground">
                        {k}{sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(displayedRows.length > 200 ? [] : displayedRows).map((row: any, i: number) => (
                  <tr key={i} className="border-t border-border/50">
                    {Object.values(row).map((v: any, j) => (
                      <td key={j} className={`${density === "compact" ? "px-2 py-1" : "px-3 py-1.5"} text-foreground max-w-[160px] truncate`}>{String(v ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {displayedRows.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matching rows</p>}
            </div>
          </div>
        )}

        {isEmptyArray && (
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            No rows returned for this query.
          </div>
        )}
        {isEmptyObject && (
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            Query returned an empty object.
          </div>
        )}
        {isBlankString && (
          <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
            No answer returned from the model.
          </div>
        )}
        {typeof result === "string" && !isBlankString && (
          <div className="bg-card rounded-md p-4 border border-border">
            <p className="text-sm text-foreground whitespace-pre-wrap">{result}</p>
          </div>
        )}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-1 rounded-md border border-border bg-background-secondary/70 p-1">
          <Button variant="ghost" size="sm" className="result-action-button h-8 min-w-0 justify-center gap-1.5 rounded border border-transparent px-1.5 text-xs" onClick={() => { navigator.clipboard.writeText(JSON.stringify(result, null, 2)); toast.success("Copied"); }}>
            <Copy size={12} className="shrink-0" /> <span className="truncate">Copy</span>
          </Button>
          {isArray && rows.length > 0 && (
            <>
              <Button variant="ghost" size="sm" className="result-action-button h-8 min-w-0 justify-center gap-1.5 rounded border border-transparent px-1.5 text-xs" onClick={() => copyRows(displayedRows)}>
                <Table2 size={12} className="shrink-0" /> <span className="truncate">Copy table</span>
              </Button>
              <Button variant="ghost" size="sm" className="result-action-button h-8 min-w-0 justify-center gap-1.5 rounded border border-transparent px-1.5 text-xs" onClick={() => runExport("csv", () => exportCSV(displayedRows), "CSV")}>
                <Download size={12} className="shrink-0" /> <span className="truncate">CSV</span>
              </Button>
            </>
          )}
          {isChartable && (
            <Button variant="ghost" size="sm" className="result-action-button h-8 min-w-0 justify-center gap-1.5 rounded border border-transparent px-1.5 text-xs" onClick={downloadChartImage}>
              <BarChart3 size={12} className="shrink-0" /> <span className="truncate">Chart</span>
            </Button>
          )}
        </div>
      </div>


    </div>
  );
}

// ─── InlineFinalResult ────────────────────────────────────────────────────────
function InlineFinalResult({ result }: { result: any }) {
  const isArray = Array.isArray(result);
  const isSingleValue = !isArray && typeof result === "object" && result?.result !== undefined;
  const isPrimitiveValue = !isArray && (typeof result === "number" || typeof result === "boolean");
  const isNarrative = !isArray && typeof result === "object" && result?.narrative !== undefined;
  const { rows, chartRows, valueKey, labelKey, isChartable, defaultChart } = getChartMeta(result);
  const [chartType, setChartType] = useState<ChartType>(defaultChart);
  const areaGradientId = useId().replace(/:/g, "");
  const isEmptyArray = isArray && rows.length === 0;
  const isEmptyObject = !isArray && !isSingleValue && !isPrimitiveValue && !isNarrative && result && typeof result === "object" && Object.keys(result).length === 0;
  const isBlankString = typeof result === "string" && !result.trim();
  const inlineChartRows = useMemo(() => chartRows.slice(0, Math.min(DEFAULT_CHART_ROWS, CHART_RENDER_LIMIT)), [chartRows]);
  const inlineChartLimited = chartRows.length > inlineChartRows.length;

  useEffect(() => { setChartType(defaultChart); }, [defaultChart]);

  if (isNarrative) {
    return <NarrativeResult result={result} />;
  }

  return (
    <div className="ml-10 mt-1 mb-3 rounded-md border border-border bg-card p-3 space-y-3">
      <p className="text-xs text-muted-foreground font-medium">Result</p>

      {isSingleValue && (
        <p className="text-2xl font-semibold text-foreground font-mono">
          {typeof result.result === "number" ? result.result.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(result.result)}
        </p>
      )}
      {isPrimitiveValue && <p className="text-2xl font-semibold text-foreground font-mono">{String(result)}</p>}

      {isChartable && (
        <div>
          <div className="flex gap-1 mb-2">
            {(["bar", "line", "area", "pie"] as const).map((t) => (
              <button key={t} onClick={() => setChartType(t)} className={`text-xs px-2 py-1 rounded capitalize ${chartType === t ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "pie" ? (
                <PieChart>
                  <Pie data={inlineChartRows} dataKey={valueKey} nameKey={labelKey} cx="50%" cy="50%" outerRadius={68}>
                    {inlineChartRows.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                </PieChart>
              ) : chartType === "line" ? (
                <LineChart data={inlineChartRows}>
                  <XAxis dataKey={labelKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Line type="monotone" dataKey={valueKey} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              ) : chartType === "area" ? (
                <AreaChart data={inlineChartRows}>
                  <defs>
                    <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey={labelKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Area type="monotone" dataKey={valueKey} stroke="hsl(var(--primary))" fill={`url(#${areaGradientId})`} strokeWidth={2} dot={false} />
                </AreaChart>
              ) : (
                <BarChart data={inlineChartRows}>
                  <XAxis dataKey={labelKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey={valueKey} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          {inlineChartLimited && (
            <p className="mt-1 text-xs text-muted-foreground">
              Chart preview shows the first {inlineChartRows.length.toLocaleString()} points. Open the result panel for chart controls.
            </p>
          )}
        </div>
      )}

      {isArray && rows.length > 0 && (
        <>
        {rows.length > 200 && (
          <VirtualizedResultTable
            rows={rows}
            headers={Object.keys(rows[0] || {})}
            density="compact"
            maxHeight={320}
          />
        )}
        <div className={rows.length > 200 ? "hidden" : "max-h-80 overflow-auto rounded-md border border-border"}>
          <table className="w-full text-xs">
            <thead className="bg-background-secondary">
              <tr>{Object.keys(rows[0] || {}).map((k) => <th key={k} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{k}</th>)}</tr>
            </thead>
            <tbody>
              {(rows.length > 200 ? [] : rows).map((row: any, i: number) => (
                <tr key={i} className="border-t border-border/50">
                  {Object.values(row).map((v: any, j) => <td key={j} className="px-3 py-1.5 text-foreground max-w-[140px] truncate">{String(v ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {isBlankString && (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          No answer returned from the model.
        </div>
      )}
      {!isBlankString && typeof result === "string" && <p className="text-sm text-foreground whitespace-pre-wrap">{result}</p>}
      {!isArray && !isSingleValue && typeof result === "object" && result !== null && !isNarrative && (
        <pre className="bg-background-secondary rounded-md p-2 border border-border text-xs font-mono text-foreground overflow-auto max-h-52 scrollbar-thin">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── DataPreviewPanel ─────────────────────────────────────────────────────────
function DataPreviewPanel({ dataset, sheet, onClose }: {
  dataset: StoredDataset;
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
    return sheetData.rows.filter((row) => Object.values(row).some((v) => String(v).toLowerCase().includes(q)));
  }, [sheetData, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <motion.div className="absolute inset-0 z-50 bg-background flex flex-col" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.18 }}>
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
                    <th key={col.name} className="px-4 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap border-b border-border">{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-card/50 transition-colors">
                    <td className="px-4 py-2 text-muted-foreground border-b border-border/40">{page * PAGE_SIZE + i + 1}</td>
                    {sheetData.columns.map((col: any) => (
                      <td key={col.name} className="px-4 py-2 text-foreground max-w-[240px] truncate border-b border-border/40">{String(row[col.name] ?? "")}</td>
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
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 h-7 text-xs border border-border rounded hover:bg-card disabled:opacity-40 text-foreground">Previous</button>
                <span className="px-2 h-7 text-xs flex items-center text-muted-foreground">{page + 1} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 h-7 text-xs border border-border rounded hover:bg-card disabled:opacity-40 text-foreground">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

// ─── Save Insight Dialog ──────────────────────────────────────────────────────
function SaveInsightDialog({
  open, onClose, query, result, datasetName,
}: {
  open: boolean; onClose: () => void; query: string; result: any; datasetName: string;
}) {
  const { addInsight } = useInsightsStore();
  const [label, setLabel] = useState(query.slice(0, 60));
  const [notes, setNotes] = useState("");
  const [color, setColor] = useState<"blue" | "purple" | "green" | "amber" | "red" | "pink">("blue");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  const COLOR_DOTS: Record<string, string> = {
    blue: "bg-blue-400", purple: "bg-purple-400", green: "bg-green-400",
    amber: "bg-amber-400", red: "bg-red-400", pink: "bg-pink-400",
  };

  const handleSave = async () => {
    if (!label.trim()) { toast.error("Please add a label"); return; }
    setSaving(true);
    try {
      await addInsight({
        query, datasetName, result,
        label: label.trim(), notes, color,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      toast.success("Saved to Insights");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Insight limit reached for your plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-background-secondary border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bookmark size={16} className="text-primary" /> Save as Insight</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">Label *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 bg-card border-border" placeholder="e.g. Total Revenue Q4" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 bg-card border-border min-h-[60px]" placeholder="Add context or observations..." />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Color</Label>
            <div className="flex gap-2 mt-1.5">
              {(Object.keys(COLOR_DOTS) as typeof color[]).map((c) => (
                <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full ${COLOR_DOTS[c]} border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent opacity-60"}`} />
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} className="mt-1 bg-card border-border" placeholder="revenue, q4, important" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} className="border-border">Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Insight"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main QueryPage ───────────────────────────────────────────────────────────
export default function QueryPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { datasets, getDataset } = useDatasetStore();
  const { activeProvider, activeModel, temperature, maxTokens, systemPrompt, setActiveProvider, setActiveModel, setTemperature, setMaxTokens, setSystemPrompt, getApiKey, providerConfigs, setProviderConfig } = useLLMStore();
  const { addEntry, entries } = useHistoryStore();
  const { checkMetric, checkExport, fetchPlan } = usePlanStore();

  const [selectedDatasetId, setSelectedDatasetId] = useState(searchParams.get("dataset") || "");
  const [selectedSheet, setSelectedSheet] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{
    role: "user" | "agent";
    content: string;
    steps?: AgentStep[];
    query?: string;
  }[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<AgentStep[]>([]);
  const [finalResult, setFinalResult] = useState<any>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [showResult, setShowResult] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSaveInsight, setShowSaveInsight] = useState(false);
  const [favoritePrompts, setFavoritePrompts] = useState<string[]>(() => readStoredList(FAVORITE_PROMPTS_KEY));
  const [queryExpanded, setQueryExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastFailedQuery, setLastFailedQuery] = useState("");
  const [apiWarning, setApiWarning] = useState("");

  // Multi-turn conversation memory
  const [conversationContext, setConversationContext] = useState<ConversationContext[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelRequestedRef = useRef(false);
  const queryStartRef = useRef(0);

  const selectedDataset = getDataset(selectedDatasetId) ?? datasets.find((d) => d.id === selectedDatasetId);

  useEffect(() => {
    if (selectedDataset && !selectedSheet) setSelectedSheet(selectedDataset.sheetNames[0]);
  }, [selectedDataset, selectedSheet]);

  useEffect(() => {
    const replayQuestion = searchParams.get("q");
    if (replayQuestion) setInput(replayQuestion);
  }, [searchParams]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, currentSteps]);
  useEffect(() => {
    if (!isRunning) {
      setElapsedMs(0);
      return;
    }
    const timer = window.setInterval(() => setElapsedMs(Date.now() - queryStartRef.current), 500);
    return () => window.clearInterval(timer);
  }, [isRunning]);
  const currentFinalStep = getFinalStep(currentSteps);
  const recentPrompts = useMemo(() => Array.from(new Set(entries.map((entry) => entry.query))).slice(0, 5), [entries]);

  useEffect(() => {
    localStorage.setItem(FAVORITE_PROMPTS_KEY, JSON.stringify(favoritePrompts));
  }, [favoritePrompts]);

  const toggleFavoritePrompt = (prompt: string) => {
    if (!prompt.trim()) return;
    setFavoritePrompts((prev) => prev.includes(prompt) ? prev.filter((item) => item !== prompt) : [prompt, ...prev].slice(0, 20));
  };

  // Smart suggestions based on dataset columns
  const smartSuggestions = useMemo(() => {
    const sheet = selectedDataset?.data?.sheets[selectedSheet];
    if (sheet) return generateSmartSuggestions(sheet.columns);
    return [
      "What is the total revenue?",
      "Show top 10 by sales",
      "What are the unique categories?",
      "Find rows where value > 1000",
      "What is the average order value?",
    ];
  }, [selectedDataset, selectedSheet]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?") { setShowShortcuts(true); }
      if (e.ctrlKey && e.shiftKey && e.key === "C") { e.preventDefault(); handleClearContext(); }
      if (e.ctrlKey && e.shiftKey && e.key === "B") { e.preventDefault(); if (finalResult !== null) setShowSaveInsight(true); }
      if (e.ctrlKey && e.shiftKey && e.key === "T") { e.preventDefault(); setShowTemplates(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [finalResult]);

  const handleClearContext = () => {
    setConversationContext([]);
    toast.success("Conversation context cleared");
  };

  const handleSend = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? input).trim();
    if (!question || isRunning) return;
    if (!selectedDatasetId) { toast.error("Select a dataset first"); return; }
    const apiKey = getApiKey(activeProvider);
    if (!apiKey && activeProvider !== "ollama") {
      const message = `${PROVIDER_LABELS[activeProvider]} API key is missing. Add it in Settings or paste it in the left API key field.`;
      setApiWarning(message);
      toast.error(message);
      return;
    }
    try {
      await checkMetric("monthlyQueries", 1);
      await checkMetric("monthlyTokens", maxTokens);
    } catch (err: any) {
      toast.error(err.message || "Query limit reached for your plan");
      return;
    }

    setInput(overrideQuestion ? input : "");
    setApiWarning("");
    setLastFailedQuery("");
    cancelRequestedRef.current = false;
    queryStartRef.current = Date.now();
    setMessages((prev) => [...prev, { role: "user", content: question, query: question }]);
    setIsRunning(true);
    setCurrentSteps([]);
    setFinalResult(null);
    setLastQuery(question);

    let sheetData = selectedDataset?.data?.sheets[selectedSheet];
    if (!sheetData) {
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
      for await (const step of runAgent(
        question, sheetData, activeProvider, activeModel, apiKey, temperature, maxTokens,
        systemPrompt || undefined, conversationContext
      )) {
        if (cancelRequestedRef.current) {
          steps.push({
            turn: steps.length + 1,
            command: "Error",
            args: {},
            result: "Query stopped by user",
            durationMs: Date.now() - startTime,
            tokens: { input: 0, output: 0 },
            isFinal: true,
          });
          break;
        }
        steps.push(step);
        setCurrentSteps([...steps]);
        if (step.isFinal) {
          setFinalResult(step.result);
          setShowResult(true);
        }
      }

      const totalTokens = steps.reduce((s, st) => s + st.tokens.input + st.tokens.output, 0);
      const finalStep = getFinalStep(steps);

      // Store in conversation context for multi-turn memory
      if (finalStep) {
        setConversationContext((prev) => [...prev, { question, answer: finalStep.result }]);
      }

      setMessages((prev) => [...prev, { role: "agent", content: "", steps: [...steps], query: question }]);
      setCurrentSteps([]);

      try {
        await addEntry({
          query: question,
          datasetName: selectedDataset?.fileName || "Unknown dataset",
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
        toast.error(err.message || "Query usage could not be saved for your plan");
      } finally {
        fetchPlan();
      }
    } catch (err: any) {
      toast.error(err.message);
      setLastFailedQuery(question);
      setMessages((prev) => [...prev, { role: "agent", content: err.message, steps: [] }]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleStopQuery = () => {
    cancelRequestedRef.current = true;
    setIsRunning(false);
    setMessages((prev) => [...prev, { role: "agent", content: "Query stopped by user.", steps: [] }]);
    setCurrentSteps([]);
    toast.info("Query stopped");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (!e.shiftKey || e.ctrlKey)) { e.preventDefault(); handleSend(); }
  };

  const handlePdfReport = async (query: string, result: any) => {
    try {
      await checkExport("pdf");
      generatePDF({
        title: query || "Query Result",
        query: query || "",
        rows: Array.isArray(result) ? result : undefined,
        narrative: result?.narrative || undefined,
      });
    } catch (err: any) {
      toast.error(err.message || "PDF export is not available on your plan");
    }
  };

  const apiKeyForProvider = providerConfigs[activeProvider]?.apiKey || "";

  return (
    <div className="flex h-[calc(100vh-56px)] relative">
      <AnimatePresence>
        {showPreview && selectedDataset && (
          <DataPreviewPanel dataset={selectedDataset} sheet={selectedSheet} onClose={() => setShowPreview(false)} />
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
                  <button key={s} onClick={() => setSelectedSheet(s)} className={`text-xs px-2 py-1 rounded ${s === selectedSheet ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground bg-card"}`}>{s}</button>
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
            <button onClick={() => setShowPreview(true)} className="flex items-center gap-2 w-full text-xs px-3 py-2 rounded-md border border-border bg-card hover:bg-card/80 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all">
              <Table2 size={12} /> Preview data <Eye size={11} className="ml-auto" />
            </button>
          )}

          <Separator className="bg-border" />

          {/* Conversation Context Indicator */}
          {conversationContext.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={12} className="text-primary" />
                <span className="text-xs text-primary">{conversationContext.length} context turn{conversationContext.length !== 1 ? "s" : ""}</span>
              </div>
              <button onClick={handleClearContext} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 size={11} />
              </button>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">LLM Provider</Label>
            <Select value={activeProvider} onValueChange={(v) => setActiveProvider(v as Provider)}>
              <SelectTrigger className="mt-1.5 bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className="flex items-center gap-2">
                      <ProviderLogo provider={p} size="sm" />
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
                {[256, 512, 1024, 2048, 4096].map((t) => <SelectItem key={t} value={String(t)}>{t}</SelectItem>)}
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

          {/* Quick tools */}
          <div className="flex gap-1.5">
            <button onClick={() => setShowTemplates(true)} className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded border border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all">
              <LayoutTemplate size={11} /> Templates
            </button>
            <button onClick={() => setShowShortcuts(true)} className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded border border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all">
              <Keyboard size={11} /> Shortcuts
            </button>
          </div>
        </div>
      </div>

      {/* Center: Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="lg:hidden border-b border-border bg-background-secondary p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Select value={selectedDatasetId} onValueChange={(v) => { setSelectedDatasetId(v); setSelectedSheet(""); }}>
              <SelectTrigger className="bg-card border-border text-xs"><SelectValue placeholder="Dataset" /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.displayName || d.fileName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={activeProvider} onValueChange={(v) => setActiveProvider(v as Provider)}>
              <SelectTrigger className="bg-card border-border text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className="flex items-center gap-2"><ProviderLogo provider={p} size="sm" />{PROVIDER_LABELS[p]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedDataset && selectedDataset.sheetNames.length > 1 && (
            <div className="flex gap-1 overflow-x-auto">
              {selectedDataset.sheetNames.map((s) => (
                <button key={s} onClick={() => setSelectedSheet(s)} className={`shrink-0 rounded px-2 py-1 text-xs ${s === selectedSheet ? "bg-primary/10 text-primary" : "bg-card text-muted-foreground"}`}>{s}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4 scrollbar-thin">
          {messages.length === 0 && !isRunning && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles size={24} className="text-primary" />
              </div>
              <p className="text-muted-foreground text-sm">Ask anything about your data</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {smartSuggestions.map((p) => (
                  <button key={p} onClick={() => { setInput(p); textareaRef.current?.focus(); }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                    {p}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowTemplates(true)} className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1">
                <LayoutTemplate size={12} /> Browse template library
              </button>
            </div>
          )}

          {messages.map((msg, i) => {
            const finalStep = getFinalStep(msg.steps);
            return (
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
                        {finalStep && (
                          <>
                            <button
                              onClick={() => {
                                setFinalResult(finalStep.result);
                                setLastQuery(msg.query || "");
                                setShowSaveInsight(true);
                              }}
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              <BookmarkPlus size={10} /> Save insight
                            </button>
                            <button
                              onClick={() => handlePdfReport(msg.query || "", finalStep.result)}
                              className="flex items-center gap-1 text-muted-foreground hover:text-primary hover:underline"
                            >
                              <FileDown size={10} /> PDF report
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {finalStep && <InlineFinalResult result={finalStep.result} />}
                  </div>
                )}
              </div>
            );
          })}

          {isRunning && (
            <div className="space-y-1">
              {currentSteps.map((step, j) => <StepCard key={j} step={step} />)}
              {currentFinalStep && <InlineFinalResult result={currentFinalStep.result} />}
              <div className="flex flex-wrap items-center gap-2 pl-10">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" style={{ animationDelay: "0s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" style={{ animationDelay: "0.2s" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" style={{ animationDelay: "0.4s" }} />
                </div>
                <span className="text-xs text-muted-foreground">
                  Agent is thinking... {Math.floor(elapsedMs / 1000)}s
                  {elapsedMs > 30000 ? " - taking longer than usual" : ""}
                </span>
                <Button variant="outline" size="sm" className="h-7 border-border text-xs" onClick={handleStopQuery}>
                  <X size={12} className="mr-1" /> Stop
                </Button>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t border-border bg-background">
          {apiWarning && (
            <div className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <span>{apiWarning}</span>
              <Button variant="outline" size="sm" className="h-7 border-warning/30 text-xs" onClick={() => navigate("/app/settings")}>Settings</Button>
            </div>
          )}
          {lastFailedQuery && !isRunning && (
            <div className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-2 rounded-md border border-border bg-background-secondary px-3 py-2 text-xs text-muted-foreground">
              <span>Last query failed.</span>
              <Button variant="outline" size="sm" className="h-7 border-border text-xs" onClick={() => handleSend(lastFailedQuery)}>
                <RefreshCw size={12} className="mr-1" /> Retry
              </Button>
            </div>
          )}
          <div className="flex gap-2 items-end max-w-3xl mx-auto">
            <div className="relative flex-1">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your data... (Shift+Enter for new line)"
                className={`bg-background-secondary border-border resize-none min-h-[44px] ${queryExpanded ? "min-h-[140px] max-h-[260px]" : "max-h-[120px]"} pr-10`}
                rows={queryExpanded ? 5 : 1}
              />
              {input && (
                <button
                  type="button"
                  aria-label="Clear query"
                  title="Clear query"
                  onClick={() => { setInput(""); textareaRef.current?.focus(); }}
                  className="absolute right-2 top-2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-card"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setQueryExpanded((prev) => !prev)}
              size="icon"
              title={queryExpanded ? "Collapse query box" : "Expand query box"}
              className="shrink-0 h-[44px] w-[44px] border-border"
            >
              {queryExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </Button>
            <Button onClick={isRunning ? handleStopQuery : () => handleSend()} disabled={!isRunning && !input.trim()} size="icon" className="shrink-0 h-[44px] w-[44px]">
              {isRunning ? <X size={16} /> : <Send size={16} />}
            </Button>
          </div>
          {input.length > 0 && <p className="text-xs text-muted-foreground text-center mt-1">~{Math.ceil(input.length / 4)} tokens · Ctrl+Enter to send</p>}
          {input.length > 0 && <p className="text-xs text-muted-foreground text-center mt-0.5">{input.length.toLocaleString()} characters</p>}
        </div>
      </div>

      {/* Right: Result Panel */}
      {finalResult !== null && showResult && (
        <div className="w-[320px] border-l border-border bg-background-secondary shrink-0 hidden xl:block">
          <ResultPanel
            result={finalResult}
            query={lastQuery}
            onClose={() => setShowResult(false)}
            onBookmark={() => setShowSaveInsight(true)}
            datasetName={selectedDataset?.fileName || "Unknown dataset"}
          />
        </div>
      )}

      {finalResult !== null && !showResult && (
        <button onClick={() => setShowResult(true)} className="fixed right-4 bottom-20 bg-primary text-primary-foreground p-2 rounded-full shadow-lg hover:bg-primary/90 hidden xl:block">
          <PanelRightOpen size={16} />
        </button>
      )}

      {/* Templates Library Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="bg-background-secondary border-border max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LayoutTemplate size={16} className="text-primary" /> Query Template Library</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto pr-1 space-y-5 mt-2">
            {QUERY_TEMPLATES.map((cat) => (
              <div key={cat.category}>
                <h3 className="text-sm font-semibold text-foreground mb-2">{cat.category}</h3>
                <div className="flex flex-wrap gap-2">
                  {cat.templates.map((t) => (
                    <button
                      key={t}
                      onClick={() => { setInput(t); setShowTemplates(false); textareaRef.current?.focus(); }}
                      className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="bg-background-secondary border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Keyboard size={16} className="text-primary" /> Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {SHORTCUTS.map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <div className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd key={k} className="text-xs bg-card border border-border rounded px-1.5 py-0.5 text-foreground font-mono">{k}</kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Insight Dialog */}
      <SaveInsightDialog
        open={showSaveInsight}
        onClose={() => setShowSaveInsight(false)}
        query={lastQuery}
        result={finalResult}
        datasetName={selectedDataset?.fileName || ""}
      />
    </div>
  );
}
