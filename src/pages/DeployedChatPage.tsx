import React, {
  memo,
  useState,
  useRef,
  useEffect,
  useMemo,
  useId,
  Fragment,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { List, type RowComponentProps } from "react-window";
import {
  Send, Loader2, ChevronDown, ChevronRight, Zap, Clock, BookmarkPlus, Bookmark, Sparkles,
  Search, Eye, X, Database, Table2, LayoutTemplate, Keyboard, RefreshCw, FileJson,
  FileText, Code2, TrendingUp, Trash2, BarChart3, FileDown, Layout, Maximize2,
  Minimize2, Star, Rows3, Palette, Share2, Mic, CheckCircle2, AlertTriangle, HelpCircle,
  Sun, Moon, PanelLeftClose, PanelLeftOpen, Info, Activity, Globe,
  ClipboardCheck, Clipboard, MessageSquareText, RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HitlPanel, HitlQuickChoices } from "@/components/HitlPanel";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getApiBaseUrl } from "@/lib/api-base";
import { runDatabaseAgent, runLegacyAgent, type AgentStep, type ConversationContext } from "@/lib/agent";
import { parseOptionsFromText, cleanPromptText } from "@/lib/clarification-options";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { generatePDF } from "@/lib/pdf-report";
import html2canvas from "html2canvas";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, CartesianGrid,
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend as RechartsLegend, LabelList,
} from "recharts";

// ─── Constants & Styling ──────────────────────────────────────────────────────
const COMMAND_COLORS: Record<string, string> = {
  GetSchema: "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700",
  GetSheetDescription: "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700",
  GetColumns: "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700",
  QuerySQL: "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700",
  QueryTable: "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700",
  QuerySheet: "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700",
  ExecuteSQL: "bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900",
  ExecuteFinalQuery: "bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900",
  FinalAnswer: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900",
  NarrativeAnswer: "bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-900",
  Answer: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900",
  HumanClarification: "bg-sky-100 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-900",
  HumanApproval: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900",
  MaxTurnsReached: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900",
  Error: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900",
};

const CHART_COLORS = [
  "hsl(222, 8%, 18%)", "hsl(222, 7%, 34%)", "hsl(222, 6%, 50%)",
  "hsl(222, 6%, 68%)", "hsl(222, 6%, 86%)",
];

const DEFAULT_CHART_ROWS = 50;
const CHART_RENDER_LIMIT = 1000;
const CHART_META_SAMPLE_LIMIT = 2000;
const CHART_VALUE_LABEL_LIMIT = 12;
const CHART_PIE_LABEL_LIMIT = 6;
const CHART_PIE_SLICE_LIMIT = 8;
const STEP_RESULT_PREVIEW_ROWS = 5;
const STEP_RESULT_PREVIEW_LIMIT = 1200;

type ResultDensity = "comfortable" | "compact";
type ChartType = "bar" | "pie" | "line" | "area";

// ─── Query Templates ──────────────────────────────────────────────────────────
const QUERY_TEMPLATES = [
  {
    category: "Sales & Metrics",
    templates: [
      "What is the total revenue?",
      "Show top 10 products by sales",
      "What is the revenue breakdown by category?",
      "Show overall performance trend over time",
      "Which category has the highest sales value?",
    ],
  },
  {
    category: "Groupings & Summaries",
    templates: [
      "How many items are there by status?",
      "Show category distribution",
      "Calculate average rating by group",
      "What are the distinct types available?",
    ],
  },
  {
    category: "Data Exploration",
    templates: [
      "What is this dataset about?",
      "Show me a preview of the columns",
      "Find any outliers in the numeric values",
      "Which fields contain missing or empty data?",
    ],
  },
];

const CHART_VALUE_KEY_PATTERN = /(count|total|sum|amount|revenue|sales|price|cost|qty|quantity|volume|score|rate|ratio|percent|percentage|avg|average|mean|median|min|max|value|profit|loss|margin|duration|age|size|weight|distance|time|hours?|minutes?|seconds?|power|horsepower|hp|torque|displacement|cc)/i;
const CHART_LABEL_KEY_PATTERN = /(name|title|label|category|type|group|bucket|segment|brand|manufacturer|company|country|city|state|region|department|team|player|actor|director|genre|cast|date|day|week|month|quarter|year|time|period|hour)/i;
const CHART_TEMPORAL_KEY_PATTERN = /(date|day|week|month|quarter|year|time|period|hour)/i;
const CHART_ID_KEY_PATTERN = /(^id$|_id$|^id_|identifier|index|serial|code)/i;

// Long questions collapse to a few lines with a Show more toggle (Claude/ChatGPT style).
const USER_MSG_COLLAPSE_CHARS = 280;

function CollapsibleUserText({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > USER_MSG_COLLAPSE_CHARS;
  const shown = !isLong || expanded ? content : `${content.slice(0, USER_MSG_COLLAPSE_CHARS).trimEnd()}…`;

  return (
    <>
      <p className="text-xs sm:text-sm text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{shown}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? <>Show less <ChevronDown size={12} className="rotate-180" /></> : <>Show more <ChevronDown size={12} /></>}
        </button>
      )}
    </>
  );
}

// Plain cell display: numbers exactly as the data has them (max 2 decimals,
// no locale grouping), JSON-style wrapping quotes stripped from strings.
function formatCellDisplay(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  if (typeof value === "string" && value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return String(value);
}

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

function isChartDateLike(value: any) {
  const text = String(value ?? "").trim();
  return text.length > 4 && !Number.isNaN(Date.parse(text));
}

function isLikelyYearNumber(value: number) {
  return Number.isInteger(value) && value >= 1800 && value <= 2200;
}

function isMonotonic(values: number[]) {
  if (values.length < 2) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < values[i - 1]) ascending = false;
    if (values[i] > values[i - 1]) descending = false;
  }
  return ascending || descending;
}

function getChartKeyStats(rows: Record<string, any>[], key: string) {
  const rawValues = rows
    .map((row) => row?.[key])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== "");
  const numericValues = rawValues
    .map((value) => toChartNumber(value))
    .filter((value): value is number => value !== null);
  const uniqueCount = new Set(rawValues.map((value) => String(value))).size;
  const min = numericValues.length > 0 ? Math.min(...numericValues) : 0;
  const max = numericValues.length > 0 ? Math.max(...numericValues) : 0;
  const lowerKey = key.toLowerCase();

  return {
    sampleCount: rawValues.length,
    numericCount: numericValues.length,
    dateCount: rawValues.filter((value) => isChartDateLike(value)).length,
    uniqueCount,
    numericRange: numericValues.length > 0 ? max - min : 0,
    isMostlyNumeric: numericValues.length >= Math.max(2, Math.ceil(rawValues.length * 0.6)),
    isMostlyDate: rawValues.length > 0 && rawValues.filter((value) => isChartDateLike(value)).length >= Math.max(2, Math.ceil(rawValues.length * 0.6)),
    isMostlyYearLike: numericValues.length >= Math.max(2, Math.ceil(rawValues.length * 0.6)) && numericValues.every((value) => isLikelyYearNumber(value)),
    isSequentialNumeric: numericValues.length >= 2 && numericValues.every((value) => Number.isInteger(value)) && isMonotonic(numericValues),
    isIntegerOnly: numericValues.length > 0 && numericValues.every((value) => Number.isInteger(value)),
    lowerKey,
  };
}

function scoreChartValueKey(key: string, stats: ReturnType<typeof getChartKeyStats>) {
  if (stats.numericCount === 0) return Number.NEGATIVE_INFINITY;
  let score = 0;
  if (CHART_VALUE_KEY_PATTERN.test(stats.lowerKey)) score += 8;
  if (CHART_LABEL_KEY_PATTERN.test(stats.lowerKey)) score -= 5;
  if (CHART_TEMPORAL_KEY_PATTERN.test(stats.lowerKey)) score -= 7;
  if (CHART_ID_KEY_PATTERN.test(stats.lowerKey)) score -= 8;
  if (stats.isMostlyYearLike) score -= 8;
  if (stats.uniqueCount <= 1) score -= 4;
  if (!stats.isIntegerOnly) score += 1;
  if (stats.numericRange > 0) score += 2;
  return score;
}

function scoreChartLabelKey(key: string, stats: ReturnType<typeof getChartKeyStats>, valueKey: string) {
  if (key === valueKey || stats.sampleCount === 0) return Number.NEGATIVE_INFINITY;
  let score = 0;
  if (!stats.isMostlyNumeric) score += 7;
  if (stats.isMostlyDate) score += 8;
  if (stats.isMostlyYearLike) score += 8;
  if (CHART_LABEL_KEY_PATTERN.test(stats.lowerKey)) score += 6;
  if (CHART_TEMPORAL_KEY_PATTERN.test(stats.lowerKey)) score += 6;
  if (CHART_VALUE_KEY_PATTERN.test(stats.lowerKey)) score -= 4;
  if (CHART_ID_KEY_PATTERN.test(stats.lowerKey)) score -= 7;
  if (stats.isSequentialNumeric) score += 3;
  if (stats.uniqueCount <= 1) score -= 4;
  return score;
}

function pickBestChartKey(keys: string[], scorer: (key: string) => number) {
  return keys
    .map((key, index) => ({ key, index, score: scorer(key) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))[0]?.key || "";
}

function getChartMeta(result: any) {
  let rawData = result;
  if (!Array.isArray(rawData) && typeof rawData === "object" && rawData !== null) {
    if (Array.isArray(rawData.data)) rawData = rawData.data;
    else if (Array.isArray(rawData.rows)) rawData = rawData.rows;
    else if (Array.isArray(rawData.result)) rawData = rawData.result;
  }

  // Wrap a single object (that isn't a wrapper or multi-table or narrative) in an array
  if (!Array.isArray(rawData) && typeof rawData === "object" && rawData !== null) {
    const keys = Object.keys(rawData);
    const isMultiTable = keys.length > 0 && keys.every(k => {
      const v = rawData[k];
      return Array.isArray(v) || (v && typeof v === "object");
    }) && keys.some(k => Array.isArray(rawData[k]));

    const isNarrative = rawData.narrative !== undefined;
    const isSingleValueWrapper = rawData.result !== undefined;

    if (!isMultiTable && !isNarrative && !isSingleValueWrapper && keys.length > 0) {
      rawData = [rawData];
    }
  }

  const rows: Record<string, any>[] = Array.isArray(rawData)
    ? rawData.filter((row: any) => row && typeof row === "object" && !Array.isArray(row))
    : [];
  const chartSourceRows = rows.length > CHART_META_SAMPLE_LIMIT ? rows.slice(0, CHART_META_SAMPLE_LIMIT) : rows;
  const keys = chartSourceRows.length > 0 ? Object.keys(chartSourceRows[0]) : [];
  const keyStats = Object.fromEntries(keys.map((key) => [key, getChartKeyStats(chartSourceRows, key)])) as Record<string, ReturnType<typeof getChartKeyStats>>;
  const numericKeys = keys.filter((key) => keyStats[key].numericCount > 0);
  const valueKey = pickBestChartKey(numericKeys, (key) => scoreChartValueKey(key, keyStats[key]));
  const labelKey = pickBestChartKey(
    keys.filter((key) => key !== valueKey),
    (key) => scoreChartLabelKey(key, keyStats[key], valueKey),
  );
  const dateKeys = keys.filter((key) => keyStats[key].isMostlyDate || keyStats[key].isMostlyYearLike || CHART_TEMPORAL_KEY_PATTERN.test(keyStats[key].lowerKey));
  const chartRows = valueKey
    ? chartSourceRows
      .map((row) => {
        const numeric = toChartNumber(row[valueKey]);
        if (numeric === null) return null;
        return { ...row, [valueKey]: numeric };
      })
      .filter((row): row is Record<string, any> => row !== null)
    : [];
  const isChartable = chartRows.length >= 2 && Boolean(valueKey) && Boolean(labelKey) && labelKey !== valueKey;
  const defaultChart: ChartType = dateKeys.includes(labelKey) ? "line" : "bar";
  return { rows, keys, chartRows, valueKey, labelKey, isChartable, defaultChart };
}

function buildStepResultPreview(result: any) {
  if (Array.isArray(result)) {
    const previewRows = result.slice(0, STEP_RESULT_PREVIEW_ROWS);
    const previewJson = JSON.stringify(previewRows, null, 2);
    return `${result.length.toLocaleString()} row(s)\n${previewJson}${result.length > previewRows.length ? "\n..." : ""}`;
  }
  if (typeof result === "string") {
    return result.length > STEP_RESULT_PREVIEW_LIMIT ? `${result.slice(0, STEP_RESULT_PREVIEW_LIMIT)}...` : result;
  }
  const resultJson = JSON.stringify(result, null, 2);
  return resultJson.length > STEP_RESULT_PREVIEW_LIMIT ? `${resultJson.slice(0, STEP_RESULT_PREVIEW_LIMIT)}...` : resultJson;
}

function truncateChartLabel(value: any, maxLength = 18) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, Math.max(1, maxLength - 1))}…` : text;
}

function formatChartValue(value: any) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? "");
  if (Math.abs(numeric) >= 1000) {
    return new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(numeric);
  }
  return numeric.toLocaleString(undefined, { maximumFractionDigits: numeric % 1 === 0 ? 0 : 2 });
}

function buildPieChartRows(rows: Record<string, any>[], labelKey: string, valueKey: string, maxSlices = CHART_PIE_SLICE_LIMIT) {
  if (!labelKey || !valueKey || rows.length <= maxSlices) return rows;
  const head = rows.slice(0, maxSlices);
  const tail = rows.slice(maxSlices);
  const otherValue = tail.reduce((sum, row) => sum + (toChartNumber(row?.[valueKey]) ?? 0), 0);
  if (!Number.isFinite(otherValue) || otherValue <= 0) return head;
  return [...head, { [labelKey]: `Other (${tail.length})`, [valueKey]: otherValue, __isOther: true }];
}

function describeAgentStep(step: AgentStep) {
  const args = (step.args || {}) as Record<string, any>;
  const sheetName = typeof args.sheet_name === "string" && args.sheet_name.trim() ? args.sheet_name.trim() : "";
  const tableName = typeof args.table_name === "string" && args.table_name.trim() ? args.table_name.trim() : "";
  const targetName = tableName || sheetName;
  const targetLabel = tableName ? "table" : "sheet";
  const operation = typeof args.operation === "string" && args.operation.trim() ? args.operation.trim().replace(/_/g, " ") : "";

  switch (step.command) {
    case "GetSchema": return "Checked tables in database catalog.";
    case "GetSheetDescription": return "Inspected spreadsheet worksheet indices.";
    case "GetColumns": return `Queried columns layout${targetName ? ` for ${targetLabel} "${targetName}"` : ""}.`;
    case "QuerySQL": return "Computed an intermediate SQL filter set.";
    case "QueryTable":
    case "QuerySheet": return `Processed analytical ${operation || "step"}${targetName ? ` on "${targetName}"` : ""}.`;
    case "ExecuteSQL": return "Parsed final analytical SQL query.";
    case "ExecuteFinalQuery": return `Evaluated final dataset ${operation || "operation"}${targetName ? ` on "${targetName}"` : ""}.`;
    case "Answer":
    case "FinalAnswer": return "Formulated direct reply.";
    case "NarrativeAnswer": return "Compiled structural text insight.";
    case "PARSE_ERROR": return "Recovered JSON payload anomalies.";
    case "MaxTurnsReached": return "Reached limit budget steps.";
    case "Error": return "Terminated due to internal step error.";
    default: return "";
  }
}

function getFinalStep(steps?: AgentStep[]) {
  if (!steps || steps.length === 0) return null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.isFinal || step.command === "ExecuteSQL" || step.command === "ExecuteFinalQuery" || step.command === "Answer" ||
      step.command === "FinalAnswer" || step.command === "NarrativeAnswer") {
      return step;
    }
  }
  return null;
}

// ─── Lightweight Markdown Parser ─────────────────────────────────────────────
function renderMarkdown(text: string) {
  if (typeof text !== "string") return String(text);
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let inList = false;
  let listItems: string[] = [];

  const parseInline = (line: string): ReactNode[] => {
    const tokens: ReactNode[] = [];
    let currentText = line;
    let keyIndex = 0;

    while (currentText) {
      const boldMatch = currentText.match(/\*\*(.*?)\*\*/);
      const italicMatch = currentText.match(/\*(.*?)\*/);
      const codeMatch = currentText.match(/`(.*?)`/);

      const matches = [
        { type: "bold", index: boldMatch?.index ?? -1, text: boldMatch?.[0], content: boldMatch?.[1] },
        { type: "italic", index: italicMatch?.index ?? -1, text: italicMatch?.[0], content: italicMatch?.[1] },
        { type: "code", index: codeMatch?.index ?? -1, text: codeMatch?.[0], content: codeMatch?.[1] },
      ].filter((m) => m.index !== -1);

      if (matches.length === 0) {
        tokens.push(<Fragment key={keyIndex++}>{currentText}</Fragment>);
        break;
      }

      matches.sort((a, b) => a.index! - b.index!);
      const firstMatch = matches[0];

      if (firstMatch.index! > 0) {
        tokens.push(<Fragment key={keyIndex++}>{currentText.slice(0, firstMatch.index)}</Fragment>);
      }

      if (firstMatch.type === "bold") {
        tokens.push(<strong key={keyIndex++} className="font-semibold text-foreground dark:text-zinc-50">{firstMatch.content}</strong>);
      } else if (firstMatch.type === "italic") {
        tokens.push(<em key={keyIndex++} className="italic text-muted-foreground">{firstMatch.content}</em>);
      } else if (firstMatch.type === "code") {
        tokens.push(<code key={keyIndex++} className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-1.5 py-0.5 rounded font-mono text-xs border border-zinc-200/50 dark:border-zinc-700/50">{firstMatch.content}</code>);
      }

      currentText = currentText.slice(firstMatch.index! + firstMatch.text!.length);
    }
    return tokens;
  };

  const flushList = (key: number) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${key}`} className="list-disc pl-5 my-2 space-y-1">
          {listItems.map((item, idx) => (
            <li key={idx} className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {parseInline(item)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      inList = true;
      listItems.push(line.trim().slice(2));
      continue;
    } else if (inList) {
      flushList(i);
      inList = false;
    }

    if (line.startsWith("### ")) {
      elements.push(<h4 key={i} className="text-sm font-semibold text-foreground dark:text-zinc-100 mt-4 mb-2">{parseInline(line.slice(4))}</h4>);
    } else if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-base font-semibold text-foreground dark:text-zinc-100 mt-4 mb-2">{parseInline(line.slice(3))}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="text-lg font-bold text-foreground dark:text-zinc-50 mt-4 mb-2">{parseInline(line.slice(2))}</h2>);
    } else if (line.trim()) {
      elements.push(<p key={i} className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mb-2">{parseInline(line)}</p>);
    } else {
      elements.push(<div key={i} className="h-2" />);
    }
  }
  if (inList) flushList(lines.length);
  return <div className="space-y-1">{elements}</div>;
}

// ─── Virtualized Data Grid Component ───────────────────────────────────────────
interface VirtualizedResultTableProps {
  rows: Record<string, any>[];
  headers: string[];
  density: ResultDensity;
  maxHeight?: number;
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
}: RowComponentProps<ResultRowProps>) {
  const row = rows[index];
  return (
    <div
      {...ariaAttributes}
      style={{ ...style, display: "grid", gridTemplateColumns }}
      className={`border-t border-zinc-200/50 dark:border-zinc-800/50 ${index % 2 === 0 ? "bg-zinc-50/30 dark:bg-zinc-900/30" : "bg-card"}`}
    >
      {headers.map((header) => {
        const value = formatCellDisplay(row?.[header]);
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

const VirtualizedResultTable = memo(function VirtualizedResultTable({
  rows,
  headers,
  density,
  maxHeight = 240,
}: VirtualizedResultTableProps) {
  const rowHeight = density === "compact" ? 30 : 38;
  const minColWidth = 120;
  const minWidth = Math.max(380, headers.length * minColWidth);
  const gridTemplateColumns = `repeat(${headers.length}, minmax(${minColWidth}px, 1fr))`;
  const listHeight = Math.min(maxHeight, Math.max(rowHeight, rows.length * rowHeight));

  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-card shadow-sm">
      <div style={{ minWidth }}>
        <div
          className="grid border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs font-semibold text-zinc-500 dark:text-zinc-400"
          style={{ gridTemplateColumns }}
        >
          {headers.map((header) => (
            <div
              key={header}
              className={`${density === "compact" ? "px-2 py-2" : "px-3 py-2.5"} min-w-0 truncate text-left`}
              title={header}
            >
              {header}
            </div>
          ))}
        </div>
        <List<ResultRowProps>
          className="scrollbar-thin"
          defaultHeight={listHeight}
          overscanCount={6}
          rowComponent={ResultTableRow}
          rowCount={rows.length}
          rowHeight={rowHeight}
          rowProps={{ rows, headers, gridTemplateColumns, density }}
          style={{ height: listHeight, width: "100%" }}
        />
      </div>
    </div>
  );
});

// ─── StepsTimeline ───────────────────────────────────────────────────────────
const StepCard = memo(function StepCard({ step, defaultExpanded = false, showConnector = true }: any) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const colorClass = COMMAND_COLORS[step.command] || "bg-zinc-100 dark:bg-zinc-800 text-zinc-500";
  const [showFull, setShowFull] = useState(false);
  const argsStr = useMemo(() => JSON.stringify(step.args, null, 2), [step.args]);
  const resultPreview = useMemo(() => buildStepResultPreview(step.result), [step.result]);
  const summary = useMemo(() => describeAgentStep(step), [step]);
  const fullResultStr = useMemo(() => (expanded ? JSON.stringify(step.result, null, 2) : ""), [expanded, step.result]);
  const canShowFull = expanded && fullResultStr.length > resultPreview.length;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${colorClass}`}>
          {step.turn}
        </div>
        {showConnector && <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800 mt-1" />}
      </div>
      <div className="flex-1 pb-3 min-w-0">
        <button type="button" onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 w-full text-left font-mono">
          <Badge className={`${colorClass} rounded px-1.5 py-0.5 border-0 text-[10px] font-medium uppercase tracking-wider`}>{step.command}</Badge>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-sans">{step.durationMs}ms</span>
          {expanded ? <ChevronDown size={12} className="text-zinc-400 dark:text-zinc-500 ml-auto" /> : <ChevronRight size={12} className="text-zinc-400 dark:text-zinc-500 ml-auto" />}
        </button>
        {summary && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 font-sans leading-relaxed">{summary}</p>}
        {expanded && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 space-y-2 overflow-hidden font-sans">
            {Object.keys(step.args).length > 0 && (
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-2.5 border border-zinc-200/50 dark:border-zinc-800/50">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mb-1 uppercase tracking-wider">Arguments</p>
                <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words text-[11px] font-mono text-foreground [overflow-wrap:anywhere]">{argsStr}</pre>
              </div>
            )}
            {step.sql && (
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-2.5 border border-zinc-200/50 dark:border-zinc-800/50">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mb-1 uppercase tracking-wider">Dialect SQL</p>
                <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words text-[11px] font-mono text-zinc-900 dark:text-zinc-100 [overflow-wrap:anywhere]">{step.sql}</pre>
              </div>
            )}
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-2.5 border border-zinc-200/50 dark:border-zinc-800/50">
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-1 font-medium uppercase tracking-wider">Terminal Output</p>
              <pre className="max-h-36 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words text-[11px] font-mono text-foreground scrollbar-thin [overflow-wrap:anywhere]">{showFull ? fullResultStr : resultPreview}</pre>
              {canShowFull && (
                <button type="button" onClick={() => setShowFull(!showFull)} className="text-[10px] text-zinc-900 dark:text-zinc-50 font-semibold mt-1.5 hover:underline">
                  {showFull ? "Show Compact" : "View Raw JSON Payload"}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
});

const StepsTimeline = memo(function StepsTimeline({ steps, live = false }: any) {
  if (!steps?.length) return null;
  const [open, setOpen] = useState(live);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="ml-0 sm:ml-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 backdrop-blur-sm shadow-sm overflow-hidden">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-100/30 dark:hover:bg-zinc-800/20">
          <div>
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Activity size={12} className={live ? "animate-pulse text-zinc-900 dark:text-zinc-50" : "text-zinc-400"} />
              {live ? "AI Agent Reasoning Flow (Active)" : "AI Agent Reasoning Timeline"}
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{open ? "Showing granular internal operations scan steps." : "Click to review detailed step trace paths."}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-zinc-200 dark:border-zinc-700 bg-card text-[10px] text-foreground font-mono">{steps.length} loop{steps.length === 1 ? "" : "s"}</Badge>
            {open ? <ChevronDown size={14} className="text-zinc-400" /> : <ChevronRight size={14} className="text-zinc-400" />}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-3 border-t border-zinc-200/50 dark:border-zinc-800/50">
        <div className="mt-3">
          {steps.map((step: any, index: number) => (
            <StepCard key={index} step={step} defaultExpanded={false} showConnector={index < steps.length - 1} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

const MultiTableMiniChart = memo(function MultiTableMiniChart({ data }: { data: Record<string, any>[] }) {
  const { chartRows, valueKey, labelKey, isChartable, defaultChart } = useMemo(() => getChartMeta(data), [data]);
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">(defaultChart === "line" ? "line" : "bar");
  const [showChart, setShowChart] = useState(true);

  if (!isChartable) return null;

  const displayRows = chartRows.slice(0, 20);
  const color = "hsl(var(--primary))";

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <button onClick={() => setShowChart((p) => !p)} className="text-[10px] text-primary hover:underline flex items-center gap-1">
          <BarChart3 size={11} />
          {showChart ? "Hide chart" : "Show chart"}
        </button>
        {showChart && (
          <div className="flex gap-1">
            {(["bar", "line", "pie"] as const).map((t) => (
              <button key={t} onClick={() => setChartType(t)} className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${chartType === t ? "bg-primary/10 text-primary" : "text-zinc-400 hover:text-foreground"}`}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      {showChart && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card/40 p-2">
          <ResponsiveContainer width="100%" height={180}>
            {chartType === "pie" ? (
              <PieChart>
                <Pie data={displayRows} dataKey={valueKey} nameKey={labelKey} cx="50%" cy="50%" outerRadius={65} fill={color} label={({ name, percent }) => `${String(name).slice(0, 12)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {displayRows.map((_: any, i: number) => (
                    <Cell key={i} fill={`hsl(${(215 + i * 37) % 360}, 65%, 54%)`} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(v: any) => [typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v, valueKey]} />
              </PieChart>
            ) : chartType === "line" ? (
              <LineChart data={displayRows} margin={{ top: 4, right: 12, left: 0, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey={labelKey} tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <RechartsTooltip formatter={(v: any) => [typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v, valueKey]} />
                <Line type="monotone" dataKey={valueKey} stroke={color} dot={displayRows.length <= 15} strokeWidth={2} />
              </LineChart>
            ) : (
              <BarChart data={displayRows} margin={{ top: 4, right: 12, left: 0, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey={labelKey} tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <RechartsTooltip formatter={(v: any) => [typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v, valueKey]} />
                <Bar dataKey={valueKey} fill={color} radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
});

const MultiTableResult = memo(function MultiTableResult({ result }: { result: any }) {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null;

  const keys = Object.keys(result);

  return (
    <div className="space-y-4 font-sans">
      {keys.map((key) => {
        const val = result[key];
        const formattedKey = key
          .split(/_|\s+/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");

        let content = null;

        if (Array.isArray(val)) {
          if (val.length === 0) {
            content = (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card p-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
                No records found.
              </div>
            );
          } else {
            const headers = Object.keys(val[0] || {});
            content = (
              <div className="space-y-2">
                <div className="max-h-60 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card shadow-sm">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                      <tr>
                        {headers.map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-zinc-500 dark:text-zinc-400 font-semibold whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {val.map((row: any, i: number) => (
                        <tr key={i} className="border-t border-zinc-200/50 dark:border-zinc-800/50">
                          {headers.map((h, j) => (
                            <td key={j} className="px-3 py-2 text-zinc-700 dark:text-zinc-300 min-w-[80px] max-w-[140px] truncate">
                              {formatCellDisplay(row[h])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <MultiTableMiniChart data={val} />
              </div>
            );
          }
        } else if (val && typeof val === "object") {
          if (val.result !== undefined) {
            content = (
              <div className="bg-zinc-50/50 dark:bg-zinc-900/30 rounded-xl p-3 border border-zinc-200/50 dark:border-zinc-800/50 flex items-baseline gap-2">
                <span className="text-lg font-bold text-foreground font-mono">
                  {typeof val.result === "number" ? val.result.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(val.result)}
                </span>
              </div>
            );
          } else if (val.narrative !== undefined) {
            content = (
              <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {String(val.narrative)}
              </div>
            );
          } else {
            const headers = Object.keys(val);
            content = (
              <div className="max-h-60 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card shadow-sm">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-zinc-500 dark:text-zinc-400 font-semibold whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-zinc-200/50 dark:border-zinc-800/50">
                      {headers.map((h, j) => (
                        <td key={j} className="px-3 py-2 text-zinc-700 dark:text-zinc-300 min-w-[80px] max-w-[140px] truncate">
                          {formatCellDisplay(val[h])}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          }
        } else {
          content = (
            <div className="bg-zinc-50/50 dark:bg-zinc-900/30 rounded-xl p-3 border border-zinc-200/50 dark:border-zinc-800/50">
              <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300">{String(val ?? "")}</span>
            </div>
          );
        }

        return (
          <div key={key} className="space-y-1.5">
            <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 dark:bg-zinc-400" />
              {formattedKey}
            </h4>
            {content}
          </div>
        );
      })}
    </div>
  );
});

// ─── InlineFinalResult ────────────────────────────────────────────────────────
const InlineFinalResult = memo(function InlineFinalResult({ result }: any) {
  const isArray = Array.isArray(result);
  const isSingleValue = !isArray && typeof result === "object" && result?.result !== undefined;
  const isPrimitiveValue = !isArray && (typeof result === "number" || typeof result === "boolean");
  const isNarrative = !isArray && typeof result === "object" && result?.narrative !== undefined;
  const isMultiTable = useMemo(() => {
    if (typeof result !== "object" || result === null || Array.isArray(result)) return false;
    const keys = Object.keys(result);
    return keys.length > 0 && keys.every(k => {
      const val = result[k];
      return Array.isArray(val) || (val && typeof val === "object");
    }) && keys.some(k => Array.isArray(result[k]));
  }, [result]);
  const { rows, chartRows, valueKey, labelKey, isChartable, defaultChart } = useMemo(() => getChartMeta(result), [result]);
  const [chartType, setChartType] = useState<ChartType>(defaultChart);
  const areaGradientId = useId().replace(/:/g, "");
  const inlineChartRows = useMemo(() => chartRows.slice(0, Math.min(DEFAULT_CHART_ROWS, CHART_RENDER_LIMIT)), [chartRows]);
  const inlinePieChartRows = useMemo(() => buildPieChartRows(inlineChartRows, labelKey, valueKey), [inlineChartRows, labelKey, valueKey]);
  const inlineChartLimited = chartRows.length > inlineChartRows.length;

  const isBlankString = typeof result === "string" && !result.trim();
  const options = useMemo(() => {
    if (typeof result !== "string") return [];
    const lower = (result || "").toLowerCase();
    if (!lower.includes("suggested") && !lower.includes("follow-up") && !lower.includes("try asking")) return [];
    return parseOptionsFromText(result);
  }, [result]);
  const cleanBody = useMemo(() => {
    if (typeof result !== "string") return "";
    const cleaned = cleanPromptText(result, options);
    return cleaned.trim() ? cleaned : result;
  }, [result, options]);

  useEffect(() => { setChartType(defaultChart); }, [defaultChart]);

  if (isNarrative) {
    return (
      <div className="ml-0 sm:ml-10 mt-1 mb-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 mb-1 border-b border-zinc-100 dark:border-zinc-800 pb-2">
          <Sparkles size={14} className="text-zinc-900 dark:text-zinc-100" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">Executive Insight Summary</span>
        </div>
        {result.highlights && result.highlights.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {result.highlights.map((h: any, i: number) => (
              <div key={i} className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200/50 dark:border-zinc-800/50">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wider">{h.label}</p>
                <p className="text-sm font-bold text-foreground font-mono mt-0.5">{h.value}</p>
              </div>
            ))}
          </div>
        )}
        <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans">{renderMarkdown(options.length > 0 ? cleanBody : result.narrative)}</div>
      </div>
    );
  }

  return (
    <div className="ml-0 sm:ml-10 mt-1 mb-3 min-w-0 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card p-4 space-y-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
        <p className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">Query Output</p>
      </div>

      {isSingleValue && <p className="text-3xl font-extrabold text-foreground font-mono">{typeof result.result === "number" ? result.result.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(result.result)}</p>}
      {isPrimitiveValue && <p className="text-3xl font-extrabold text-foreground font-mono">{String(result)}</p>}

      {isChartable && (
        <div className="space-y-3 bg-zinc-50/50 dark:bg-zinc-900/20 rounded-xl p-3 border border-zinc-200/50 dark:border-zinc-800/50">
          <div className="flex gap-1.5 items-center">
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider mr-2">Visualizer:</span>
            {(["bar", "line", "area", "pie"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setChartType(t)}
                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border tracking-wider transition-all ${chartType === t ? "bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100" : "bg-card border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="h-48 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "pie" ? (
                <PieChart>
                  <Pie data={inlinePieChartRows} dataKey={valueKey} nameKey={labelKey} cx="50%" cy="50%" outerRadius={70}>
                    {inlinePieChartRows.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              ) : chartType === "line" ? (
                <LineChart data={inlineChartRows}>
                  <XAxis dataKey={labelKey} tick={{ fill: "currentColor", fontSize: 9 }} stroke="currentColor" className="text-zinc-400" />
                  <YAxis tick={{ fill: "currentColor", fontSize: 9 }} stroke="currentColor" className="text-zinc-400" />
                  <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                  <Line type="monotone" dataKey={valueKey} stroke="hsl(var(--foreground))" strokeWidth={2.2} dot={false} />
                </LineChart>
              ) : chartType === "area" ? (
                <AreaChart data={inlineChartRows}>
                  <defs>
                    <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="currentColor" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey={labelKey} tick={{ fill: "currentColor", fontSize: 9 }} stroke="currentColor" className="text-zinc-400" />
                  <YAxis tick={{ fill: "currentColor", fontSize: 9 }} stroke="currentColor" className="text-zinc-400" />
                  <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                  <Area type="monotone" dataKey={valueKey} stroke="hsl(var(--foreground))" fill={`url(#${areaGradientId})`} strokeWidth={2.2} dot={false} className="text-zinc-400 dark:text-zinc-500" />
                </AreaChart>
              ) : (
                <BarChart data={inlineChartRows}>
                  <XAxis dataKey={labelKey} tick={{ fill: "currentColor", fontSize: 9 }} stroke="currentColor" className="text-zinc-400" />
                  <YAxis tick={{ fill: "currentColor", fontSize: 9 }} stroke="currentColor" className="text-zinc-400" />
                  <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey={valueKey} fill="currentColor" radius={[3, 3, 0, 0]} className="text-zinc-900 dark:text-zinc-100" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {isMultiTable && (
        <MultiTableResult result={result} />
      )}

      {rows.length > 0 && (
        <div className="space-y-1.5">
          <VirtualizedResultTable rows={rows} headers={Object.keys(rows[0] || {})} density="comfortable" />
          {rows.length > 100 && (
            <p className="text-[10px] text-zinc-400 text-right italic">Showing first 100 rows virtualized framework preview</p>
          )}
        </div>
      )}

      {!isArray && !isSingleValue && typeof result === "object" && result !== null && !isNarrative && !isMultiTable && rows.length === 0 && (
        <pre className="max-h-52 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 text-xs font-mono text-zinc-700 dark:text-zinc-300 scrollbar-thin">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      {!isBlankString && typeof result === "string" && (
        <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans mt-2">{renderMarkdown(options.length > 0 ? cleanBody : result)}</div>
      )}
    </div>
  );
});

// ─── Main DeployedChatPage Component ──────────────────────────────────────────
export default function DeployedChatPage() {
  const { deployId } = useParams<{ deployId: string }>();
  const [deployment, setDeployment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [conversationContext, setConversationContext] = useState<ConversationContext[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<AgentStep[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const queryStartRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const cancelRequestedRef = useRef(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Layout parameters
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [selectedSchemaTable, setSelectedSchemaTable] = useState<string>("");
  const [tableSearchQuery, setTableSearchQuery] = useState("");

  useEffect(() => {
    const handleResize = () => setSidebarOpen(window.innerWidth >= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Human-in-the-loop state references
  const [hitlState, setHitlState] = useState<any>(null);
  const hitlResolverRef = useRef<((value: string) => void) | null>(null);

  const handleStopQuery = () => {
    cancelRequestedRef.current = true;
    if (hitlResolverRef.current) {
      hitlResolverRef.current("cancel");
      hitlResolverRef.current = null;
    }
    setHitlState(null);
    setIsRunning(false);
  };

  const clearConversation = () => {
    setMessages([]);
    setConversationContext([]);
    setCurrentSteps([]);
    setInput("");
  };

  const handleHitlSubmit = (val: string) => {
    if (hitlResolverRef.current) {
      hitlResolverRef.current(val);
      hitlResolverRef.current = null;
      setHitlState(null);
    }
  };

  // ── Memory-loss warning ────────────────────────────────────────────────────
  const hasMemory = messages.length > 0 || conversationContext.length > 0;
  const hasMemoryRef = useRef(hasMemory);
  hasMemoryRef.current = hasMemory;

  const [navBlocked, setNavBlocked] = useState<string | null>(null);
  const pendingNavRef = useRef<(() => void) | null>(null);

  // Case 1: In-app route navigation — intercept pushState / popstate.
  useEffect(() => {
    const origPush = window.history.pushState.bind(window.history);
    window.history.pushState = function (state, title, url) {
      const next = url ? String(url) : "";
      if (hasMemoryRef.current && next && !next.includes(window.location.pathname)) {
        pendingNavRef.current = () => origPush(state, title, url);
        setNavBlocked(next);
        return;
      }
      origPush(state, title, url);
    };
    const handlePop = (e: PopStateEvent) => {
      if (hasMemoryRef.current) {
        e.preventDefault();
        window.history.pushState(null, "", window.location.href);
        pendingNavRef.current = () => window.history.back();
        setNavBlocked("back");
      }
    };
    window.addEventListener("popstate", handlePop);
    return () => {
      window.history.pushState = origPush;
      window.removeEventListener("popstate", handlePop);
    };
  }, []);

  // Case 2: Page refresh or browser tab close.
  useEffect(() => {
    if (!hasMemory) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasMemory]);

  // Multi-turn conversation memory
  const [workbookSheets, setWorkbookSheets] = useState<any>(null);
  const [sheetsLoading, setSheetsLoading] = useState(false);

  const BASE_URL = getApiBaseUrl();

  // Load and apply theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem("querify-deployed-theme") as "light" | "dark";
    const initialTheme = savedTheme || "light";
    setTheme(initialTheme);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(initialTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("querify-deployed-theme", nextTheme);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(nextTheme);
  };

  // Load public details of the deployed chatbot
  useEffect(() => {
    setLoading(true);
    fetch(`${BASE_URL}/deployments/public/${deployId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text() || "Failed to load deployment");
        return res.json();
      })
      .then((data) => {
        setDeployment(data);
        setError("");
        
        // Auto-select first schema table if database
        if (data.snapshot?.sourceType === "connection" && data.snapshot?.databaseTables?.length) {
          setSelectedSchemaTable(data.snapshot.databaseTables[0].name);
        }

        // Hydrate dataset sheet data asynchronously if it's a dataset
        if (data.snapshot?.sourceType === "dataset" && data.snapshot?.selectedDatasetId) {
          setSheetsLoading(true);
          fetch(`${BASE_URL}/deployments/public/${deployId}/dataset-data/${data.snapshot.selectedDatasetId}`)
            .then((r) => r.json())
            .then((sheets) => {
              setWorkbookSheets(sheets?.sheets || null);
              if (sheets?.sheets) {
                const sheetNames = Object.keys(sheets.sheets);
                if (sheetNames.length > 0) setSelectedSchemaTable(sheetNames[0]);
              }
            })
            .catch((e) => console.error("Lazy dataset fetch error:", e))
            .finally(() => setSheetsLoading(false));
        }
      })
      .catch((err) => setError(err.message || "Failed to load deployed chatbot"))
      .finally(() => setLoading(false));
  }, [deployId]);

  // Hijack fetch globally so callLLM securely proxies calls through deployments route
  useEffect(() => {
    if (!deployId) return;

    const originalFetch = window.fetch;
    window.fetch = async (inputVal, init) => {
      const url = typeof inputVal === "string" ? inputVal : (inputVal as Request).url;
      if (
        url.includes("api.groq.com") ||
        url.includes("api.openai.com") ||
        url.includes("generativelanguage.googleapis.com") ||
        url.includes("api.mistral.ai") ||
        url.includes("api.together.xyz") ||
        url.includes("api.anthropic.com") ||
        url.includes("api.cohere.ai") ||
        url.includes("/llm/huggingface/chat") ||
        url.includes("/llm/alibaba/chat") ||
        url.includes("/llm/bedrock/chat")
      ) {
        const bodyObj = JSON.parse(init?.body as string || "{}");
        const proxyRes = await originalFetch(`${BASE_URL}/deployments/public/${deployId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
        });
        return proxyRes;
      }
      return originalFetch(inputVal, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [deployId]);

  // Handle autoscroll
  useEffect(() => {
    const scroller = chatScrollRef.current;
    if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [messages, currentSteps]);

  // Thinking timer
  useEffect(() => {
    if (!isRunning) {
      setElapsedMs(0);
      return;
    }
    const timer = window.setInterval(() => setElapsedMs(Date.now() - queryStartRef.current), 500);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const handleSpeech = () => {
    const SpeechRecognition = typeof window !== "undefined" ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.onstart = () => setIsListening(true);
      rec.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        if (text) {
          setInput((prev) => prev ? prev + " " + text : text);
          toast.success("Speech recognized!");
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  const executeDirectTemplate = (prompt: string) => {
    if (isRunning) return;
    setInput(prompt);
    setTimeout(() => {
      // Trigger execution directly
      setInput("");
      handleSend(prompt);
    }, 100);
  };

  const handleSend = async (forcedInput?: string) => {
    const question = (forcedInput || input).trim();
    if (!question || isRunning) return;

    setIsRunning(true);
    cancelRequestedRef.current = false;
    setInput("");
    queryStartRef.current = Date.now();
    setMessages((prev) => [...prev, { role: "user", content: question, query: question, ts: Date.now() }]);
    setCurrentSteps([]);

    const steps: AgentStep[] = [];
    const startTime = Date.now();
    const snapshot = deployment.snapshot;

    const hitlController = {
      waitForHuman: (
        prompt: string,
        kind: "clarification" | "approval",
        details?: { rowCount?: number; operation?: string; sql?: string; options?: string[] }
      ) => {
        return new Promise<string>((resolve) => {
          setHitlState({ kind, prompt, options: details?.options, details });
          hitlResolverRef.current = resolve;
        });
      },
    };

    let runner;

    if (snapshot.sourceType === "connection") {
      const dbType = snapshot.connectionSnapshot?.dbType;
      const databaseTables = snapshot.databaseTables || [];
      const selectedTable = snapshot.selectedTable || databaseTables[0]?.name || "";

      runner = runDatabaseAgent(
        question,
        databaseTables,
        selectedTable,
        dbType,
        snapshot.activeProvider,
        snapshot.activeModel,
        "snapshotted-proxy-keys",
        snapshot.temperature,
        snapshot.maxTokens,
        snapshot.systemPrompt || undefined,
        conversationContext,
        {},
        {
          loadTableSchema: (tableName) => {
            const table = databaseTables.find((t: any) => t.name === tableName);
            return Promise.resolve(table || null);
          },
          executeSql: async ({ sql }) => {
            const res = await fetch(`${BASE_URL}/deployments/public/${deployId}/execute`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sql }),
            });
            if (!res.ok) throw new Error(await res.text());
            return await res.json();
          },
          executeTableOperation: async ({ tableName, operation, params }) => {
            const res = await fetch(`${BASE_URL}/deployments/public/${deployId}/execute`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ operation, params: { ...params, tableName } }),
            });
            if (!res.ok) throw new Error(await res.text());
            return await res.json();
          },
        },
        hitlController
      );
    } else {
      const selectedSheet = snapshot.selectedSheet;
      if (!workbookSheets || !workbookSheets[selectedSheet]) {
        toast.error("Dataset data unavailable.");
        setIsRunning(false);
        return;
      }

      runner = runLegacyAgent(
        question,
        workbookSheets,
        selectedSheet,
        snapshot.activeProvider,
        snapshot.activeModel,
        "snapshotted-proxy-keys",
        snapshot.temperature,
        snapshot.maxTokens,
        snapshot.systemPrompt || undefined,
        conversationContext,
        {},
        hitlController
      );
    }

    try {
      for await (const step of runner) {
        if (cancelRequestedRef.current) {
          steps.push({
            turn: steps.length + 1,
            command: "Error",
            args: {},
            result: "Query stopped",
            durationMs: Date.now() - startTime,
            tokens: { input: 0, output: 0 },
            isFinal: true,
          });
          break;
        }
        steps.push(step);
        setCurrentSteps([...steps]);
      }

      const finalStep = getFinalStep(steps);
      if (finalStep) {
        setConversationContext((prev) => [...prev, { question, answer: finalStep.result }]);
      }
      setMessages((prev) => [...prev, { role: "agent", content: "", steps: [...steps], query: question, ts: Date.now() }]);
      setCurrentSteps([]);
    } catch (err: any) {
      toast.error(err.message || "Failed to execute chatbot reasoning");
      setMessages((prev) => [...prev, { role: "agent", content: err.message, steps: [] }]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-500">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-900 dark:border-zinc-100 border-t-transparent" />
          <p className="text-xs font-semibold uppercase tracking-wider">Securing Connection...</p>
        </div>
      </div>
    );
  }

  if (error || !deployment) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 text-center text-zinc-500">
        <AlertTriangle size={40} className="text-zinc-900 dark:text-zinc-50 mb-3" />
        <h2 className="text-md font-bold text-foreground">Deployment Terminated</h2>
        <p className="max-w-md text-xs mt-1 leading-normal">{error || "This chatbot link is broken, expired, or has been revoked by the workspace administrator."}</p>
      </div>
    );
  }

  const isBroken = deployment.status === "broken" || deployment.status === "deleted";
  const sourceName = deployment.snapshot?.datasetSnapshot?.fileName || deployment.snapshot?.connectionSnapshot?.name || "Target Connection";
  const isDB = deployment.snapshot?.sourceType === "connection";

  // Sidebar dynamic logic
  const tablesOrSheetsList = isDB 
    ? (deployment.snapshot?.databaseTables || []) 
    : (workbookSheets ? Object.keys(workbookSheets).map((k) => ({ name: k })) : []);

  const activeTableSchema = isDB 
    ? (deployment.snapshot?.databaseTables || []).find((t: any) => t.name === selectedSchemaTable)
    : (workbookSheets && workbookSheets[selectedSchemaTable] ? {
        columns: workbookSheets[selectedSchemaTable].columns.map((c: any) => ({ name: c.name, dtype: c.dtype, sampleValues: c.sampleValues || [], uniqueCount: c.uniqueCount || 0 })),
        rowCount: workbookSheets[selectedSchemaTable].rows?.length || 0
      } : null);

  const filteredColumns = activeTableSchema?.columns?.filter((col: any) => 
    col.name.toLowerCase().includes(tableSearchQuery.toLowerCase())
  ) || [];

  return (
    <div className="relative h-screen flex flex-col md:flex-row w-full overflow-hidden overflow-x-hidden bg-background text-foreground font-sans antialiased transition-colors duration-200">

      {/* ── Memory-loss warning dialog (route navigation) ── */}
      <AlertDialog open={navBlocked !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-warning" /> Leave page?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-sm">
              <p>Your agent conversation memory will be permanently deleted if you leave this page. This includes:</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
                <li><strong>Chat history</strong> — all messages in this session</li>
                <li><strong>Conversation context</strong> — {conversationContext.length} turn{conversationContext.length !== 1 ? "s" : ""} the agent is using to answer follow-up questions</li>
                <li><strong>Agent memory</strong> — the agent will start completely fresh on the next question</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { pendingNavRef.current = null; setNavBlocked(null); }}>Stay on page</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const go = pendingNavRef.current; pendingNavRef.current = null; setNavBlocked(null); go?.(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Leave & clear memory
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Premium Minimalist Left Panel */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -320, width: 0, opacity: 0 }}
            animate={{ x: 0, width: 310, opacity: 1 }}
            exit={{ x: -320, width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="relative z-20 flex h-full flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/95 backdrop-blur-xl shrink-0 overflow-hidden w-full max-w-sm md:w-[310px] md:max-w-none md:relative md:block fixed inset-y-0 left-0"
          >
            {/* Sidebar Branding */}
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-zinc-50 dark:bg-zinc-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 font-bold text-xs">
                D
              </span>
              <div>
                <h1 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-50">DataVault AI</h1>
                <p className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono tracking-widest leading-none mt-0.5">ENTERPRISE CHATBOT</p>
              </div>
            </div>

            {/* Sidebar Scroll Container */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 scrollbar-thin">
              
              {/* Endpoint Card */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card p-3 shadow-sm space-y-2">
                <div className="flex items-center gap-1.5">
                  <Database size={12} className="text-zinc-400" />
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Secure Target</span>
                </div>
                <div className="truncate text-xs font-bold text-zinc-950 dark:text-zinc-50 flex items-center gap-1.5">
                  {sourceName}
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1 text-[10px]">
                  <Badge variant="outline" className="border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-400 capitalize py-0 px-1 font-mono text-[9px]">
                    {deployment.snapshot?.sourceType || "database"}
                  </Badge>
                  <Badge variant="outline" className="border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-400 py-0 px-1 font-mono text-[9px]">
                    {deployment.snapshot?.activeModel || "LLM"}
                  </Badge>
                </div>
              </div>

              {/* Table / Sheet Inspector Select Dropdown */}
              {sheetsLoading ? (
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                    <Table2 size={11} /> Loading sheets...
                  </Label>
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card p-4 shadow-sm flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <div>
                      <p className="font-semibold text-[11px] text-foreground">Fetching workbook sheets</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Please wait while the deployed workbook data is prepared.</p>
                    </div>
                  </div>
                </div>
              ) : tablesOrSheetsList.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                    <Table2 size={11} /> {isDB ? "Explore Tables" : "Explore Sheets"}
                  </Label>
                  <div className="relative">
                    <select
                      value={selectedSchemaTable}
                      onChange={(e) => setSelectedSchemaTable(e.target.value)}
                      className="w-full bg-card border border-zinc-200 dark:border-zinc-800 text-xs rounded-xl px-3 py-2 font-medium appearance-none outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-all cursor-pointer"
                    >
                      {tablesOrSheetsList.map((t: any) => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-2.5 text-zinc-400 pointer-events-none" />
                  </div>

                  {/* Schema fields panel */}
                  {activeTableSchema && (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card p-3 space-y-2.5 shadow-sm">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-mono text-zinc-400 dark:text-zinc-500">{activeTableSchema.rowCount?.toLocaleString() || "0"} rows</span>
                        <span className="font-mono text-zinc-400 dark:text-zinc-500">{activeTableSchema.columns?.length || "0"} fields</span>
                      </div>
                      
                      <div className="relative">
                        <Input
                          value={tableSearchQuery}
                          onChange={(e) => setTableSearchQuery(e.target.value)}
                          placeholder="Filter schema fields..."
                          className="h-7 text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-lg pl-7"
                        />
                        <Search size={11} className="absolute left-2.5 top-2.5 text-zinc-400" />
                      </div>

                      <div className="max-h-[140px] overflow-y-auto scrollbar-thin space-y-1.5 pr-0.5">
                        {filteredColumns.map((col: any) => (
                          <div key={col.name} className="flex items-center justify-between text-xs py-0.5 border-b border-zinc-50 dark:border-zinc-900/50">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate mr-2" title={col.name}>{col.name}</span>
                            <Badge variant="outline" className="border-0 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 text-[8px] font-mono py-0 px-1 rounded-sm shrink-0">
                              {col.dtype}
                            </Badge>
                          </div>
                        ))}
                        {filteredColumns.length === 0 && (
                          <p className="text-[10px] text-zinc-400 italic text-center py-2">No matching columns</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}


            </div>

            {/* Sidebar Security Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0 bg-zinc-50 dark:bg-zinc-900 text-center">
              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400 dark:text-zinc-500">
                <span className="flex items-center gap-1"><Globe size={9} /> Sandbox Secure Mode</span>
                {conversationContext.length > 0 && (
                  <span className="flex items-center gap-1"><MessageSquareText size={9} /> {conversationContext.length} turns</span>
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Conversation & Dashboard Panel */}
      <main className="relative flex-1 flex flex-col h-full overflow-hidden bg-background transition-all duration-300 ease-out">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--foreground)/0.035),_transparent_38%)] pointer-events-none" />

        {/* Global Minimalist Chat Header */}
        <header className="relative z-10 shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-background/80 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen((prev) => !prev)}
                type="button"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0 border border-zinc-200 dark:border-zinc-800 bg-card transition-all"
                title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              >
                {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded bg-zinc-900 dark:bg-zinc-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-zinc-50 dark:text-zinc-900 leading-none">
                    Shared
                  </span>
                  <h2 className="truncate text-xs sm:text-sm font-bold text-foreground">{deployment.name}</h2>
                </div>
                {deployment.description && <p className="truncate text-[10px] text-zinc-400 mt-0.5 hidden sm:block">{deployment.description}</p>}
              </div>
            </div>

            {/* Quick Actions & Themes */}
            <div className="flex items-center gap-2 shrink-0">
              {messages.length > 0 && (
                <button
                  onClick={clearConversation}
                  type="button"
                  className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0 border border-zinc-200 dark:border-zinc-800 bg-card transition-all font-medium"
                  title="Clear conversation"
                >
                  <RotateCcw size={12} />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              )}
              {messages.length > 0 && (
                <span className="hidden sm:flex h-7 items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-card px-2 text-[10px] font-mono text-zinc-400">
                  <MessageSquareText size={9} /> {messages.length}
                </span>
              )}
              <button
                onClick={toggleTheme}
                type="button"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0 border border-zinc-200 dark:border-zinc-800 bg-card transition-all"
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>

              {isBroken ? (
                <Badge variant="outline" className="border-red-500/20 bg-red-500/5 text-red-500 dark:text-red-400 text-[10px] py-0 px-2 h-7 font-semibold gap-1 shrink-0"><AlertTriangle size={10} /> Disconnected</Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 text-[10px] py-0 px-2 h-7 font-semibold gap-1 shrink-0">
                  <CheckCircle2 size={10} /> Operational
                </Badge>
              )}
            </div>
          </div>
        </header>

        {/* Chat Feed */}
        <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-5 pb-28 space-y-6 scrollbar-thin w-full max-w-5xl mx-auto relative z-10">
          {isBroken && (
            <div className="rounded-xl border border-red-200/50 dark:border-red-950/50 bg-red-500/5 p-4 text-center text-xs space-y-2 max-w-md mx-auto">
              <AlertTriangle size={20} className="text-red-500 mx-auto" />
              <p className="font-bold text-foreground">Chatbot experience is offline</p>
              <p className="text-zinc-400 leading-relaxed">
                Reason: {deployment.statusReason || "One of the mapped data dependencies or server pings is offline."}
              </p>
            </div>
          )}

          {isRunning && (
            <div className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 rounded-2xl border border-zinc-200/80 bg-zinc-50/90 px-4 py-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-300 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <div>
                <p className="font-medium">Processing your query</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">This may take a few seconds while the AI reasons over your data.</p>
              </div>
            </div>
          )}

          {messages.length === 0 && !isRunning && !isBroken && (
            <div className="flex flex-col items-center gap-6 py-10 max-w-xl mx-auto w-full">
              <div className="text-center space-y-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 mx-auto mb-2">
                  <Sparkles size={22} className="text-foreground" />
                </div>
                <h3 className="text-base font-bold text-foreground">Ask anything about {sourceName}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
                  Ask in plain English — the AI will reason over your data, run queries, and return charts, tables, or narrative insights.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {QUERY_TEMPLATES[0].templates.slice(0, 4).map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => executeDirectTemplate(tpl)}
                    className="group flex items-start gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card p-3 text-left text-xs hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-all text-zinc-600 dark:text-zinc-400"
                  >
                    <Sparkles size={13} className="text-zinc-400 shrink-0 mt-0.5 group-hover:text-foreground transition-colors" />
                    <span className="leading-snug group-hover:text-foreground transition-colors">{tpl}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono">Shift+Enter for new line · Enter to send</p>
            </div>
          )}

          {messages.map((msg, i) => {
            const finalStep = getFinalStep(msg.steps);
            return (
              <div key={i} className="space-y-4">
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="group relative max-w-[85%] min-w-0 sm:max-w-md">
                      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-card px-4 py-3 shadow-sm">
                        <CollapsibleUserText content={msg.content} />
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-2">
                        {msg.ts && <span className="text-[10px] text-zinc-400 font-mono">{new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                        <button
                          type="button"
                          title="Copy message"
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content);
                            setCopiedId(`user-${i}`);
                            setTimeout(() => setCopiedId(null), 1800);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-all"
                        >
                          {copiedId === `user-${i}` ? <ClipboardCheck size={11} className="text-emerald-500" /> : <Clipboard size={11} />}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {msg.steps && msg.steps.length > 0 ? (
                      <StepsTimeline steps={msg.steps} />
                    ) : (
                      <div className="max-w-full min-w-0 rounded-xl border border-red-200/50 dark:border-red-950/50 bg-red-500/5 px-4 py-3 sm:max-w-[85%]">
                        <p className="text-xs text-red-500 dark:text-red-400 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                      </div>
                    )}
                    {msg.steps && msg.steps.length > 0 && (
                      <div className="flex flex-wrap gap-3 pt-1 text-[10px] text-zinc-400 dark:text-zinc-500 sm:pl-10 items-center font-mono">
                        {msg.ts && <span className="flex items-center gap-1">{new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                        <span className="flex items-center gap-1"><Clock size={10} /> {msg.steps.reduce((s: number, st: any) => s + st.durationMs, 0).toLocaleString()}ms</span>
                        <span className="flex items-center gap-1"><Zap size={10} /> {msg.steps.reduce((s: number, st: any) => s + st.tokens.input + st.tokens.output, 0).toLocaleString()} tokens</span>
                        {finalStep && (
                          <button
                            onClick={() => {
                              generatePDF({
                                title: msg.query || "Query Result",
                                query: msg.query || "",
                                rows: Array.isArray(finalStep.result) ? finalStep.result : undefined,
                                narrative: finalStep.result?.narrative || undefined,
                              });
                              toast.success("PDF report downloaded");
                            }}
                            className="flex items-center gap-1 font-sans text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-foreground hover:underline ml-auto"
                          >
                            <FileDown size={11} /> PDF report
                          </button>
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
            <div className="space-y-3 min-w-0 w-full">
              {currentSteps.length > 0 && !hitlState && (
                <StepsTimeline steps={currentSteps} live />
              )}

              <AnimatePresence mode="wait">
                {hitlState ? (
                  <div className="ml-0 sm:ml-10">
                    <HitlPanel
                      key="hitl-active"
                      state={hitlState}
                      onSubmit={handleHitlSubmit}
                      onStop={handleStopQuery}
                    />
                  </div>
                ) : null}
              </AnimatePresence>

              {!hitlState && (
                <div className="flex items-center gap-2.5 sm:pl-10">
                  <div className="flex items-center gap-1 h-3 shrink-0">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </div>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium mr-2">
                    {currentSteps.length > 0
                      ? `${currentSteps[currentSteps.length - 1].command} · ${Math.floor(elapsedMs / 1000)}s`
                      : `Reasoning · ${Math.floor(elapsedMs / 1000)}s`}
                  </span>
                  <Button variant="outline" size="sm" className="h-6 border-zinc-200 dark:border-zinc-800 text-[10px] rounded-lg font-bold" onClick={handleStopQuery}>
                    <X size={10} className="mr-1" /> Stop
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Global Input Bar */}
        <footer className="sticky bottom-0 z-20 shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-background/95 px-4 py-3 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:px-5">
          <div className="mx-auto w-full max-w-5xl">
            {messages.length > 0 && !isRunning && !input && (
              <div className="flex flex-wrap gap-1.5 mb-2 px-1">
                {QUERY_TEMPLATES.flatMap(c => c.templates).slice(0, 3).map((tpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setInput(tpl)}
                    className="flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-card px-3 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-foreground transition-all whitespace-nowrap"
                  >
                    <Sparkles size={9} className="shrink-0" />
                    {tpl.length > 38 ? tpl.slice(0, 36) + "…" : tpl}
                  </button>
                ))}
              </div>
            )}
            <div className="relative flex flex-wrap items-end gap-2 rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-card p-2 shadow-sm focus-within:border-zinc-900 dark:focus-within:border-zinc-100 focus-within:ring-1 focus-within:ring-zinc-900 dark:focus-within:ring-zinc-100 transition-all">
              <div className="relative min-w-0 flex-1">
                {isListening && (
                  <div className="absolute inset-0 flex items-center justify-between bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-sm rounded-[20px] px-4 py-2 border border-zinc-200 dark:border-zinc-800 z-20">
                    <div className="flex items-center gap-3">
                      <div className="flex items-end gap-1.5 h-6 w-12 justify-center">
                        <div className="voice-bar voice-bounce-1 bg-foreground w-1 h-3 rounded-full animate-[voice-bounce_1.2s_infinite]" />
                        <div className="voice-bar voice-bounce-2 bg-foreground w-1 h-5 rounded-full animate-[voice-bounce_1.2s_0.2s_infinite]" />
                        <div className="voice-bar voice-bounce-3 bg-foreground w-1 h-2 rounded-full animate-[voice-bounce_1.2s_0.4s_infinite]" />
                        <div className="voice-bar voice-bounce-4 bg-foreground w-1 h-6 rounded-full animate-[voice-bounce_1.2s_0.1s_infinite]" />
                        <div className="voice-bar voice-bounce-5 bg-foreground w-1 h-4 rounded-full animate-[voice-bounce_1.2s_0.3s_infinite]" />
                      </div>
                      <span className="text-xs text-foreground font-semibold animate-pulse">Capturing audio...</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleSpeech} className="h-7 px-3 text-xs border-zinc-200 dark:border-zinc-800 bg-card rounded-lg font-bold">Done</Button>
                  </div>
                )}

                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isBroken ? "Chatbot is currently offline." : isRunning ? "Analysing database..." : `Ask anything about columns...`}
                  disabled={isRunning || isBroken}
                  className="bg-transparent border-0 resize-none min-h-[40px] max-h-[120px] pr-10 text-xs sm:text-sm leading-normal focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-2"
                  rows={1}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  onClick={handleSpeech}
                  disabled={isBroken}
                  size="icon"
                  title="Voice search"
                  className={cn("h-[40px] w-[40px] rounded-[18px] border-zinc-200 dark:border-zinc-800 transition-all duration-300", isListening && "bg-red-500/10 text-red-500 border-red-500/30")}
                >
                  <Mic size={15} />
                </Button>
                <Button
                  onClick={() => handleSend()}
                  disabled={isRunning || isBroken || !input.trim()}
                  size="icon"
                  className="h-[40px] w-[40px] rounded-[18px] shrink-0 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900 transition-all"
                  title={isRunning ? "Query in progress" : "Send query"}
                >
                  {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={15} />}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-zinc-400 text-center mt-2 font-mono">
              Securely powered by <span className="font-bold text-foreground">Querify.in</span> · Snapshotted credentials are fully encrypted in memory.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
