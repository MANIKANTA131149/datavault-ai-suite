import React, {
  memo,
  useState,
  useRef,
  useEffect,
  useMemo,
  useId,
  useCallback,
  Fragment,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { List, type RowComponentProps } from "react-window";
import {
  Send, Check, ChevronDown, ChevronRight, ChevronsUpDown, Zap, Clock, Copy, Download, PanelRightClose, PanelRightOpen,
  Settings2, Search, Eye, X, Database, Table2, Bookmark, BookmarkPlus, Sparkles, Lightbulb,
  LayoutTemplate, Keyboard, RefreshCw, FileJson, FileText, Code2, TrendingUp,
  MessageSquarePlus, Trash2, BarChart3, FileDown, Layout, Maximize2, Minimize2, Star, Rows3, Palette,
  Share2, Mic,
} from "lucide-react";
import { HitlPanel, HitlQuickChoices } from "@/components/HitlPanel";
import { ShareCard } from "@/components/ShareCard";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDatasetStore, type StoredDataset } from "@/stores/dataset-store";
import { useConnectionStore, DB_TYPE_LABELS, DB_TYPE_ICONS } from "@/stores/connection-store";
import { useLLMStore, PROVIDER_MODELS, PROVIDER_LABELS, getModelDisplayName } from "@/stores/llm-store";
import { useHistoryStore } from "@/stores/history-store";
import { useAuthStore } from "@/stores/auth-store";
import { useInsightsStore } from "@/stores/insights-store";
import { usePlanStore } from "@/stores/plan-store";
import { ProviderLogo } from "@/components/ProviderLogo";

import { runDatabaseAgent, runLegacyAgent, type AgentStep, type ConversationContext } from "@/lib/agent";
import { parseOptionsFromText, cleanPromptText } from "@/lib/clarification-options";
import type { Provider } from "@/lib/llm-client";
import type { ColumnInfo } from "@/lib/file-parser";
import { executeDatabaseQuery, fetchDatabaseSchema, type DatabaseSchema, type DatabaseTableData } from "@/lib/db-query-client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { generatePDF } from "@/lib/pdf-report";
import html2canvas from "html2canvas";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, CartesianGrid,
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend as RechartsLegend, LabelList,
} from "recharts";

// ─── Constants ────────────────────────────────────────────────────────────────
const COMMAND_COLORS: Record<string, string> = {
  GetSchema: "bg-primary/10 text-primary",
  GetSheetDescription: "bg-primary/10 text-primary",
  GetColumns: "bg-accent/10 text-accent",
  QuerySQL: "bg-warning/10 text-warning",
  QueryTable: "bg-warning/10 text-warning",
  QuerySheet: "bg-warning/10 text-warning",
  ExecuteSQL: "bg-success/10 text-success",
  ExecuteFinalQuery: "bg-success/10 text-success",
  FinalAnswer: "bg-success/10 text-success",
  NarrativeAnswer: "bg-purple-500/10 text-purple-400",
  Answer: "bg-success/10 text-success",
  HumanClarification: "bg-primary/10 text-primary",
  HumanApproval: "bg-warning/10 text-warning",
  MaxTurnsReached: "bg-destructive/10 text-destructive",
  Error: "bg-destructive/10 text-destructive",
};

const CHART_COLORS = [
  "hsl(217, 91%, 60%)", "hsl(263, 70%, 58%)", "hsl(160, 84%, 39%)",
  "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)",
];
const DEFAULT_CHART_ROWS = 50;
const CHART_RENDER_LIMIT = 1000;
const CHART_META_SAMPLE_LIMIT = 2000;
const CHART_VALUE_LABEL_LIMIT = 12;
const CHART_PIE_LABEL_LIMIT = 6;
const CHART_PIE_SLICE_LIMIT = 8;
const STEP_RESULT_PREVIEW_ROWS = 5;
const STEP_RESULT_PREVIEW_LIMIT = 1200;
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

const CHART_VALUE_KEY_PATTERN = /(count|total|sum|amount|revenue|sales|price|cost|qty|quantity|volume|score|rate|ratio|percent|percentage|avg|average|mean|median|min|max|value|profit|loss|margin|duration|age|size|weight|distance|time|hours?|minutes?|seconds?|power|horsepower|hp|torque|displacement|cc)/i;
const CHART_LABEL_KEY_PATTERN = /(name|title|label|category|type|group|bucket|segment|brand|manufacturer|company|country|city|state|region|department|team|player|actor|director|genre|cast|date|day|week|month|quarter|year|time|period|hour)/i;
const CHART_TEMPORAL_KEY_PATTERN = /(date|day|week|month|quarter|year|time|period|hour)/i;
const CHART_ID_KEY_PATTERN = /(^id$|_id$|^id_|identifier|index|serial|code)/i;

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

function scoreChartValueKey(
  key: string,
  stats: ReturnType<typeof getChartKeyStats>,
) {
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

function scoreChartLabelKey(
  key: string,
  stats: ReturnType<typeof getChartKeyStats>,
  valueKey: string,
) {
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

function pickBestChartKey(
  keys: string[],
  scorer: (key: string) => number,
) {
  return keys
    .map((key, index) => ({ key, index, score: scorer(key) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))[0]?.key || "";
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
  // Chartable = at least 2 data points, a valid numeric key, and ideally a label key
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
    return result.length > STEP_RESULT_PREVIEW_LIMIT
      ? `${result.slice(0, STEP_RESULT_PREVIEW_LIMIT)}...`
      : result;
  }

  const resultJson = JSON.stringify(result, null, 2);
  return resultJson.length > STEP_RESULT_PREVIEW_LIMIT
    ? `${resultJson.slice(0, STEP_RESULT_PREVIEW_LIMIT)}...`
    : resultJson;
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

function buildPieChartRows(
  rows: Record<string, any>[],
  labelKey: string,
  valueKey: string,
  maxSlices = CHART_PIE_SLICE_LIMIT,
) {
  if (!labelKey || !valueKey || rows.length <= maxSlices) return rows;

  const head = rows.slice(0, maxSlices);
  const tail = rows.slice(maxSlices);
  const otherValue = tail.reduce((sum, row) => sum + (toChartNumber(row?.[valueKey]) ?? 0), 0);
  if (!Number.isFinite(otherValue) || otherValue <= 0) return head;

  return [
    ...head,
    {
      [labelKey]: `Other (${tail.length})`,
      [valueKey]: otherValue,
      __isOther: true,
    },
  ];
}

function formatOperationLabel(operation?: string) {
  if (!operation) return "query";
  return operation.replace(/_/g, " ");
}

function describeAgentStep(step: AgentStep) {
  const args = (step.args || {}) as Record<string, any>;
  const sheetName = typeof args.sheet_name === "string" && args.sheet_name.trim() ? args.sheet_name.trim() : "";
  const tableName = typeof args.table_name === "string" && args.table_name.trim() ? args.table_name.trim() : "";
  const targetName = tableName || sheetName;
  const targetLabel = tableName ? "table" : "sheet";
  const operation = typeof args.operation === "string" && args.operation.trim()
    ? formatOperationLabel(args.operation.trim())
    : typeof args.pandas_query === "string" && args.pandas_query.trim()
      ? "pandas query"
      : "";

  switch (step.command) {
    case "GetSchema":
      return "Checked which tables are available in the database.";
    case "GetSheetDescription":
      return "Checked which sheets are available in the workbook.";
    case "GetColumns":
      return `Inspected the schema${targetName ? ` for ${targetLabel} "${targetName}"` : ""}.`;
    case "QuerySQL":
      return "Ran an intermediate read-only SQL query.";
    case "QueryTable":
      if (step.sql) {
        return `Ran an intermediate SQL query${targetName ? ` on ${targetLabel} "${targetName}"` : ""}.`;
      }
      return `Ran an intermediate ${operation || "query"}${targetName ? ` on ${targetLabel} "${targetName}"` : ""}.`;
    case "QuerySheet":
      return `Ran an intermediate ${operation || "query"}${targetName ? ` on ${targetLabel} "${targetName}"` : ""}.`;
    case "ExecuteSQL":
      return "Ran the final read-only SQL query.";
    case "ExecuteFinalQuery":
      if (step.sql) {
        return `Ran the final SQL query${targetName ? ` on ${targetLabel} "${targetName}"` : ""}.`;
      }
      return `Ran the final ${operation || "query"}${targetName ? ` on ${targetLabel} "${targetName}"` : ""}.`;
    case "Answer":
    case "FinalAnswer":
      return "Returned a direct answer.";
    case "NarrativeAnswer":
      return "Returned a written explanation.";
    case "PARSE_ERROR":
      return "Retried because the model response was not valid JSON.";
    case "MaxTurnsReached":
      return "Stopped because the agent hit its step limit.";
    case "Error":
      return "Stopped because the query hit an error.";
    default:
      return "";
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
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.command === "HumanClarification" && step.hitlPrompt) {
      return { ...step, result: step.hitlPrompt };
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
  const html = `<!DOCTYPE html><html><head><title>Querify Export</title></head><body>
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
}: RowComponentProps<ResultRowProps>) {
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

const VirtualizedResultTable = memo(function VirtualizedResultTable({
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
});

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
        tokens.push(
          <Fragment key={keyIndex++}>
            {currentText.slice(0, firstMatch.index)}
          </Fragment>
        );
      }

      if (firstMatch.type === "bold") {
        tokens.push(
          <strong key={keyIndex++} className="font-bold text-foreground">
            {firstMatch.content}
          </strong>
        );
      } else if (firstMatch.type === "italic") {
        tokens.push(
          <em key={keyIndex++} className="italic text-muted-foreground">
            {firstMatch.content}
          </em>
        );
      } else if (firstMatch.type === "code") {
        tokens.push(
          <code key={keyIndex++} className="bg-foreground/5 text-foreground px-1.5 py-0.5 rounded font-mono text-xs border border-border/30">
            {firstMatch.content}
          </code>
        );
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
            <li key={idx} className="text-sm text-foreground leading-relaxed">
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
      const content = line.trim().slice(2);
      listItems.push(content);
      continue;
    } else {
      if (inList) {
        flushList(i);
        inList = false;
      }
    }

    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="text-sm font-semibold text-foreground mt-4 mb-2">
          {parseInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-foreground mt-4 mb-2">
          {parseInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h2 key={i} className="text-lg font-bold text-foreground mt-4 mb-2">
          {parseInline(line.slice(2))}
        </h2>
      );
    } else if (line.trim()) {
      elements.push(
        <p key={i} className="text-sm text-foreground leading-relaxed mb-2">
          {parseInline(line)}
        </p>
      );
    } else {
      elements.push(<div key={i} className="h-2" />);
    }
  }

  if (inList) {
    flushList(lines.length);
  }

  return <div className="space-y-1">{elements}</div>;
}

// ─── NarrativeResult Component ────────────────────────────────────────────────
function NarrativeResult({ 
  result, 
  onSubmitQuickReply 
}: { 
  result: { narrative: string; highlights?: { label: string; value: string }[] }; 
  onSubmitQuickReply?: (text: string) => void;
}) {
  const options = useMemo(() => parseOptionsFromText(result.narrative), [result.narrative]);
  const cleanBody = useMemo(() => cleanPromptText(result.narrative, options), [result.narrative, options]);

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
      <div className="text-sm text-foreground leading-relaxed">{renderMarkdown(options.length > 0 ? cleanBody : result.narrative)}</div>

      {onSubmitQuickReply && options.length > 0 && (
        <HitlQuickChoices options={options} onSubmit={onSubmitQuickReply} />
      )}
    </div>
  );
}

// ─── StepCard Component ───────────────────────────────────────────────────────
const StepCard = memo(function StepCard({
  step,
  defaultExpanded = true,
  showConnector = true,
}: {
  step: AgentStep;
  defaultExpanded?: boolean;
  showConnector?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const colorClass = COMMAND_COLORS[step.command] || "bg-muted text-muted-foreground";
  const [showFull, setShowFull] = useState(false);
  const argsStr = useMemo(() => JSON.stringify(step.args, null, 2), [step.args]);
  const resultPreview = useMemo(() => buildStepResultPreview(step.result), [step.result]);
  const summary = useMemo(() => describeAgentStep(step), [step]);
  const fullResultStr = useMemo(
    () => (expanded ? JSON.stringify(step.result, null, 2) : ""),
    [expanded, step.result]
  );
  const canShowFull = expanded && fullResultStr.length > resultPreview.length;

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${colorClass}`}>
          {step.turn}
        </div>
        {showConnector && <div className="w-px flex-1 bg-border mt-1" />}
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
        {summary && <p className="mt-1 text-xs text-muted-foreground">{summary}</p>}
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
                <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words text-xs font-mono text-foreground [overflow-wrap:anywhere]">
                  {argsStr}
                </pre>
              </div>
            )}
            {step.sql && (
              <div className="bg-card rounded-md p-3 border border-border">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Executed SQL</p>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(step.sql || ""); toast.success("SQL copied"); }}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Copy size={10} /> Copy SQL
                  </button>
                </div>
                <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words text-xs font-mono text-foreground [overflow-wrap:anywhere]">
                  {step.sql}
                </pre>
              </div>
            )}
            <div className="bg-card rounded-md p-3 border border-border">
              <p className="text-xs text-muted-foreground mb-1 font-medium">Result</p>
              <pre className="max-h-40 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words text-xs font-mono text-foreground scrollbar-thin [overflow-wrap:anywhere]">
                {showFull ? fullResultStr : resultPreview}
              </pre>
              {canShowFull && (
                <button onClick={() => setShowFull(!showFull)} className="text-xs text-primary mt-1 hover:underline">
                  {showFull ? "Show summary" : "Show raw JSON"}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
});

const StepsTimeline = memo(function StepsTimeline({
  steps,
  live = false,
}: {
  steps: AgentStep[];
  live?: boolean;
}) {
  if (!steps.length) return null;
  const [open, setOpen] = useState(live);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="ml-10 rounded-md border border-border bg-background-secondary/45">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-card/40"
        >
          <div>
            <p className="text-xs font-medium text-foreground">{live ? "Live agent steps" : "Agent steps"}</p>
            <p className="text-xs text-muted-foreground">
              {open
                ? "Showing the full step-by-step flow used to answer this query."
                : "Click to show the step-by-step flow used to answer this query."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="border-border bg-card text-xs text-foreground">
              {steps.length} step{steps.length === 1 ? "" : "s"}
            </Badge>
            {open ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        <div>
          {steps.map((step, index) => (
            <StepCard
              key={`${step.turn}-${step.command}-${index}`}
              step={step}
              defaultExpanded={false}
              showConnector={index < steps.length - 1}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

// ─── ResultPanel (Right Sidebar) ─────────────────────────────────────────────
const ResultPanel = memo(function ResultPanel({
  result, query, onClose, onBookmark, datasetName, onShare,
}: {
  result: any; query: string; onClose: () => void; onBookmark: () => void;
  datasetName: string; onShare: () => void;
}) {
  const navigate = useNavigate();
  const isArray = Array.isArray(result);
  const isSingleValue = !isArray && typeof result === "object" && result?.result !== undefined;
  const isPrimitiveValue = !isArray && (typeof result === "number" || typeof result === "boolean");
  const isNarrative = !isArray && typeof result === "object" && result?.narrative !== undefined;
  const { rows, chartRows, valueKey, labelKey, isChartable, defaultChart } = useMemo(() => getChartMeta(result), [result]);
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
  useEffect(() => {
    if (!fullscreen || typeof document === "undefined") return;

    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreen]);

  const autoTopSort = chartSort === "none" && topN > 0 && (chartType === "bar" || chartType === "pie");
  const effectiveChartSort = autoTopSort ? "desc" : chartSort;
  const sortedChartRows = useMemo(() => {
    let next = [...chartRows];
    if (effectiveChartSort !== "none" && valueKey) {
      next.sort((a, b) => effectiveChartSort === "asc" ? Number(a[valueKey]) - Number(b[valueKey]) : Number(b[valueKey]) - Number(a[valueKey]));
    }
    return next;
  }, [chartRows, effectiveChartSort, valueKey]);
  const visibleChartRows = useMemo(() => {
    const selected = topN > 0 ? sortedChartRows.slice(0, topN) : sortedChartRows;
    return selected.length > CHART_RENDER_LIMIT ? selected.slice(0, CHART_RENDER_LIMIT) : selected;
  }, [sortedChartRows, topN]);
  const pieChartRows = useMemo(
    () => buildPieChartRows(visibleChartRows, labelKey, valueKey),
    [visibleChartRows, labelKey, valueKey]
  );
  const pieChartGroupedCount = useMemo(() => {
    if (pieChartRows.length >= visibleChartRows.length) return 0;
    return Math.max(0, visibleChartRows.length - (pieChartRows.length - 1));
  }, [pieChartRows.length, visibleChartRows.length]);
  const chartRenderLimited = topN === 0 && sortedChartRows.length > CHART_RENDER_LIMIT;
  const chartTopNOptions = useMemo(() => {
    const candidates = [5, 10, 20, DEFAULT_CHART_ROWS, 100, 250]
      .filter((value) => value > 0 && value < sortedChartRows.length);
    if (topN > 0 && topN < sortedChartRows.length) candidates.push(topN);
    return Array.from(new Set(candidates)).sort((a, b) => a - b);
  }, [sortedChartRows.length, topN]);
  const longestVisibleLabel = useMemo(
    () => visibleChartRows.reduce((max, row) => Math.max(max, String(row?.[labelKey] ?? "").length), 0),
    [visibleChartRows, labelKey]
  );
  const rotateXAxisTicks = chartType !== "pie" && (visibleChartRows.length > 6 || longestVisibleLabel > 14);
  const xAxisInterval = useMemo(() => {
    if (chartType === "pie") return 0;
    if (visibleChartRows.length > 24) return Math.ceil(visibleChartRows.length / 8) - 1;
    if (visibleChartRows.length > 12) return 1;
    return 0;
  }, [chartType, visibleChartRows.length]);
  const canShowValueLabels = chartType === "pie"
    ? showLabels && pieChartRows.length <= CHART_PIE_LABEL_LIMIT
    : showLabels && visibleChartRows.length <= CHART_VALUE_LABEL_LIMIT;
  const chartMargin = useMemo(() => ({
    top: 8,
    right: chartType === "pie" ? 20 : 12,
    left: chartType === "pie" ? 20 : 4,
    bottom: chartType === "pie" ? 12 : rotateXAxisTicks ? 70 : 30,
  }), [chartType, rotateXAxisTicks]);
  const chartControlsGridClass = fullscreen ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1";
  const chartTitleText = chartTitle || query || "Chart";
  const chartSummaryText = [
    labelKey && valueKey ? `${labelKey} vs ${valueKey}` : "",
    topN > 0
      ? chartType === "line" || chartType === "area"
        ? `Showing first ${visibleChartRows.length.toLocaleString()} row${visibleChartRows.length === 1 ? "" : "s"}`
        : autoTopSort
          ? `Showing top ${visibleChartRows.length.toLocaleString()} values`
          : `Showing ${visibleChartRows.length.toLocaleString()} row${visibleChartRows.length === 1 ? "" : "s"}`
      : `Showing all ${visibleChartRows.length.toLocaleString()} rows`,
  ].filter(Boolean).join(" • ");

  const displayedRows = useMemo(() => {
    const q = resultSearch.trim().toLowerCase();
    if (!q && !sortKey) return rows;

    let next = q
      ? rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(q)))
      : rows;
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
      toast.error(err.message || `${label} export is not available on your plan`, {
        action: {
          label: "View Plans",
          onClick: () => navigate("/app/pricing"),
        },
      });
    }
  };

  const panelContent = (
    <>
      <div className="shrink-0 flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Result</h3>
          {isArray && <p className="text-xs text-muted-foreground">{displayedRows.length.toLocaleString()} of {rows.length.toLocaleString()} rows</p>}
        </div>
        <div className="flex flex-wrap gap-1 sm:justify-end">
          <button onClick={onShare} title="Share Story Card" className="p-1.5 rounded hover:bg-card text-muted-foreground hover:text-primary transition-colors">
            <Share2 size={14} />
          </button>
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
        <div className="shrink-0 p-3 border-b border-border bg-card/40 space-y-2">
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

      <div className="min-w-0 min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4">
        {isNarrative && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-purple-400" />
              <span className="text-xs text-purple-400 font-medium">AI Analysis</span>
            </div>
            {result.highlights?.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {result.highlights.map((h: any, i: number) => (
                  <div key={i} className="bg-card rounded-md p-2.5 border border-border">
                    <p className="text-xs text-muted-foreground">{h.label}</p>
                    <p className="text-sm font-semibold text-foreground">{h.value}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="text-sm leading-relaxed">{renderMarkdown(result.narrative)}</div>
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
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1">
                {(["bar", "line", "area", "pie"] as const).map((t) => (
                  <button key={t} onClick={() => setChartType(t)} title={`${t} chart`} className={`text-xs px-2.5 py-1 rounded capitalize ${chartType === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
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
            <div className={`mb-3 grid gap-2 ${chartControlsGridClass}`}>
              <Input value={chartTitle} onChange={(e) => setChartTitle(e.target.value)} placeholder="Chart title" className={`h-8 bg-card border-border text-xs ${fullscreen ? "col-span-2" : ""}`} />
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
                  {chartTopNOptions.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {chartType === "line" || chartType === "area" ? `First ${n} rows` : `Top ${n} values`}
                    </SelectItem>
                  ))}
                  <SelectItem value="0">All rows</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => setShowLegend((prev) => !prev)}>
                {showLegend ? "Legend on" : "Legend off"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => setShowLabels((prev) => !prev)}>
                {showLabels ? "Labels on" : "Labels off"}
              </Button>
              <Textarea value={chartNotes} onChange={(e) => setChartNotes(e.target.value)} placeholder="Chart notes..." className={`min-h-[56px] bg-card border-border text-xs ${fullscreen ? "col-span-2" : ""}`} />
              <Button variant="outline" size="sm" className={`${fullscreen ? "col-span-2 " : ""}h-8 border-border text-xs`} onClick={onBookmark}>
                <BookmarkPlus size={12} className="mr-1" /> Save chart as insight
              </Button>
            </div>
            {!canShowValueLabels && showLabels && (
              <div className="mb-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                Value labels are hidden automatically when there are too many points to keep the chart readable.
              </div>
            )}
            {chartType === "pie" && pieChartGroupedCount > 0 && (
              <div className="mb-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                Pie charts show the top {Math.max(0, pieChartRows.length - 1)} slices here. The remaining {pieChartGroupedCount.toLocaleString()} categories are grouped into <span className="font-medium text-foreground">Other</span> so the chart stays readable.
              </div>
            )}
            {chartRenderLimited && (
              <div className="mb-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                Chart preview is capped at {CHART_RENDER_LIMIT.toLocaleString()} points for performance. The table and exports still include all rows.
              </div>
            )}
            <div ref={chartRef} className="rounded-md border border-border bg-background-secondary/30 p-3">
              <div className="mb-3 space-y-1">
                <p className="truncate text-sm font-medium text-foreground">{chartTitleText}</p>
                <p className="text-xs text-muted-foreground">{chartSummaryText}</p>
              </div>
              <div className={fullscreen ? "h-[48vh] sm:h-[54vh]" : "h-64 sm:h-72"}>
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "pie" ? (
                    <PieChart margin={chartMargin}>
                      <Pie
                        data={pieChartRows}
                        dataKey={valueKey}
                        nameKey={labelKey}
                        cx="50%"
                        cy={showLegend ? "42%" : "50%"}
                        outerRadius={showLegend ? 78 : 96}
                        innerRadius={pieChartRows.length > 4 ? 22 : 0}
                        label={canShowValueLabels ? ({ name, percent }) => `${truncateChartLabel(name, 12)} ${Math.round((percent || 0) * 100)}%` : false}
                        labelLine={false}
                      >
                        {pieChartRows.map((_: any, i: number) => <Cell key={i} fill={i === 0 ? chartColor : CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      {showLegend && <RechartsLegend verticalAlign="bottom" wrapperStyle={{ fontSize: 11, paddingTop: 12 }} formatter={(value) => truncateChartLabel(value, 16)} />}
                      <RechartsTooltip
                        formatter={(value: any) => formatChartValue(value)}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      />
                    </PieChart>
                  ) : chartType === "line" ? (
                    <LineChart data={visibleChartRows} margin={chartMargin}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey={labelKey}
                        label={{ value: xAxisLabel, position: "insideBottom", offset: rotateXAxisTicks ? -8 : -2, fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickFormatter={(value) => truncateChartLabel(value, rotateXAxisTicks ? 12 : 18)}
                        tickLine={false}
                        axisLine={false}
                        angle={rotateXAxisTicks ? -35 : 0}
                        textAnchor={rotateXAxisTicks ? "end" : "middle"}
                        height={rotateXAxisTicks ? 72 : 32}
                        tickMargin={10}
                        interval={xAxisInterval}
                      />
                      <YAxis
                        label={{ value: yAxisLabel, angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickFormatter={(value) => formatChartValue(value)}
                        tickLine={false}
                        axisLine={false}
                        width={60}
                      />
                      {showLegend && <RechartsLegend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />}
                      <RechartsTooltip formatter={(value: any) => formatChartValue(value)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Line type="monotone" dataKey={valueKey} stroke={chartColor} strokeWidth={2.5} dot={visibleChartRows.length <= 20 ? { r: 2.5, strokeWidth: 0, fill: chartColor } : false} activeDot={{ r: 4 }} />
                    </LineChart>
                  ) : chartType === "area" ? (
                    <AreaChart data={visibleChartRows} margin={chartMargin}>
                      <defs>
                        <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey={labelKey}
                        label={{ value: xAxisLabel, position: "insideBottom", offset: rotateXAxisTicks ? -8 : -2, fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickFormatter={(value) => truncateChartLabel(value, rotateXAxisTicks ? 12 : 18)}
                        tickLine={false}
                        axisLine={false}
                        angle={rotateXAxisTicks ? -35 : 0}
                        textAnchor={rotateXAxisTicks ? "end" : "middle"}
                        height={rotateXAxisTicks ? 72 : 32}
                        tickMargin={10}
                        interval={xAxisInterval}
                      />
                      <YAxis
                        label={{ value: yAxisLabel, angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickFormatter={(value) => formatChartValue(value)}
                        tickLine={false}
                        axisLine={false}
                        width={60}
                      />
                      {showLegend && <RechartsLegend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />}
                      <RechartsTooltip formatter={(value: any) => formatChartValue(value)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Area type="monotone" dataKey={valueKey} stroke={chartColor} fill={`url(#${areaGradientId})`} strokeWidth={2.5} dot={visibleChartRows.length <= 20 ? { r: 2, strokeWidth: 0, fill: chartColor } : false} />
                    </AreaChart>
                  ) : (
                    <BarChart data={visibleChartRows} margin={chartMargin}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey={labelKey}
                        label={{ value: xAxisLabel, position: "insideBottom", offset: rotateXAxisTicks ? -8 : -2, fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickFormatter={(value) => truncateChartLabel(value, rotateXAxisTicks ? 12 : 18)}
                        tickLine={false}
                        axisLine={false}
                        angle={rotateXAxisTicks ? -35 : 0}
                        textAnchor={rotateXAxisTicks ? "end" : "middle"}
                        height={rotateXAxisTicks ? 72 : 32}
                        tickMargin={10}
                        interval={xAxisInterval}
                      />
                      <YAxis
                        label={{ value: yAxisLabel, angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickFormatter={(value) => formatChartValue(value)}
                        tickLine={false}
                        axisLine={false}
                        width={60}
                      />
                      {showLegend && <RechartsLegend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />}
                      <RechartsTooltip formatter={(value: any) => formatChartValue(value)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Bar dataKey={valueKey} fill={chartColor} radius={[6, 6, 0, 0]} maxBarSize={36}>
                        {canShowValueLabels && <LabelList dataKey={valueKey} position="top" formatter={(value: any) => formatChartValue(value)} fill="hsl(var(--muted-foreground))" fontSize={10} />}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
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
            <div className="text-sm leading-relaxed">{renderMarkdown(result)}</div>
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

    </>
  );

  if (!fullscreen || typeof document === "undefined") {
    return <div className="flex h-full min-h-0 flex-col">{panelContent}</div>;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label="Exit fullscreen result"
        className="absolute inset-0 bg-background/86 backdrop-blur-md"
        onClick={() => setFullscreen(false)}
      />
      <div className="relative z-10 h-full overflow-y-auto p-2 sm:p-4 lg:p-6">
        <div className="mx-auto flex min-h-[calc(100dvh-1rem)] w-full max-w-[96rem] flex-col overflow-hidden rounded-[24px] border border-border bg-background-secondary shadow-2xl sm:min-h-[calc(100dvh-2rem)] lg:min-h-[calc(100dvh-3rem)]">
          {panelContent}
        </div>
      </div>
    </div>,
    document.body
  );
});

// ─── InlineFinalResult ────────────────────────────────────────────────────────
interface InlineFinalResultProps {
  result: any;
  onSubmitQuickReply?: (text: string) => void;
}

const InlineFinalResult = memo(function InlineFinalResult({ result, onSubmitQuickReply }: InlineFinalResultProps) {
  const isArray = Array.isArray(result);
  const isSingleValue = !isArray && typeof result === "object" && result?.result !== undefined;
  const isPrimitiveValue = !isArray && (typeof result === "number" || typeof result === "boolean");
  const isNarrative = !isArray && typeof result === "object" && result?.narrative !== undefined;
  const { rows, chartRows, valueKey, labelKey, isChartable, defaultChart } = useMemo(() => getChartMeta(result), [result]);
  const [chartType, setChartType] = useState<ChartType>(defaultChart);
  const areaGradientId = useId().replace(/:/g, "");
  const isEmptyArray = isArray && rows.length === 0;
  const isEmptyObject = !isArray && !isSingleValue && !isPrimitiveValue && !isNarrative && result && typeof result === "object" && Object.keys(result).length === 0;
  const isBlankString = typeof result === "string" && !result.trim();
  const inlineChartRows = useMemo(() => chartRows.slice(0, Math.min(DEFAULT_CHART_ROWS, CHART_RENDER_LIMIT)), [chartRows]);
  const inlinePieChartRows = useMemo(
    () => buildPieChartRows(inlineChartRows, labelKey, valueKey),
    [inlineChartRows, labelKey, valueKey]
  );
  const inlineChartLimited = chartRows.length > inlineChartRows.length;

  const options = useMemo(() => {
    if (typeof result !== "string") return [];
    return parseOptionsFromText(result);
  }, [result]);

  const cleanBody = useMemo(() => {
    if (typeof result !== "string") return "";
    const cleaned = cleanPromptText(result, options);
    return cleaned.trim() ? cleaned : result;
  }, [result, options]);

  useEffect(() => { setChartType(defaultChart); }, [defaultChart]);

  if (isNarrative) {
    return <NarrativeResult result={result} onSubmitQuickReply={onSubmitQuickReply} />;
  }

  return (
    <div className="ml-10 mt-1 mb-3 min-w-0 overflow-hidden rounded-md border border-border bg-card p-3 space-y-3">
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
                  <Pie data={inlinePieChartRows} dataKey={valueKey} nameKey={labelKey} cx="50%" cy="50%" outerRadius={68}>
                    {inlinePieChartRows.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
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

      {isEmptyArray && (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          Query completed but returned no rows.
        </div>
      )}
      {isEmptyObject && (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          Query completed with an empty result.
        </div>
      )}
      {isBlankString && (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          No answer returned from the model.
        </div>
      )}
      {!isBlankString && typeof result === "string" && (
        <div className="space-y-3">
          <div className="text-sm leading-relaxed">{renderMarkdown(options.length > 0 ? cleanBody : result)}</div>
          {onSubmitQuickReply && options.length > 0 && (
            <HitlQuickChoices options={options} onSubmit={onSubmitQuickReply} />
          )}
        </div>
      )}
      {!isArray && !isSingleValue && typeof result === "object" && result !== null && !isNarrative && (
        <pre className="max-h-52 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-md border border-border bg-background-secondary p-2 text-xs font-mono text-foreground scrollbar-thin [overflow-wrap:anywhere]">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
});

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
    <motion.div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-background" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.18 }}>
      <div className="flex flex-col gap-2 border-b border-border bg-background-secondary px-4 py-3 shrink-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-7 w-full rounded-md border border-border bg-card pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-44"
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
            <div className="min-w-full overflow-x-auto">
              <table className="min-w-[720px] w-full text-xs border-collapse">
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
          </div>
          {totalPages > 1 && (
            <div className="flex flex-col gap-2 border-t border-border bg-background-secondary px-4 py-2.5 shrink-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
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
function getDatabaseTableNameParts(tableName: string) {
  const parts = tableName.split(".").filter(Boolean);
  if (parts.length <= 1) {
    return {
      shortName: tableName,
      namespace: "",
    };
  }

  return {
    shortName: parts[parts.length - 1],
    namespace: parts.slice(0, -1).join("."),
  };
}

function formatDatabaseTableStat(table: DatabaseTableData) {
  if (table.rowCount != null) return `${table.rowCount.toLocaleString()} rows`;
  if (table.columns.length > 0) return `${table.columns.length} cols`;
  return "Metadata pending";
}

function buildDatabaseTableGroups(tables: DatabaseTableData[]) {
  const grouped = new Map<string, DatabaseTableData[]>();

  for (const table of tables) {
    const { namespace } = getDatabaseTableNameParts(table.name);
    const key = namespace || "";
    const existing = grouped.get(key);
    if (existing) existing.push(table);
    else grouped.set(key, [table]);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => {
      if (!left && right) return -1;
      if (left && !right) return 1;
      return left.localeCompare(right);
    })
    .map(([namespace, entries]) => ({
      key: namespace || "__default__",
      label: namespace || "Tables",
      tables: [...entries].sort((left, right) => {
        const leftParts = getDatabaseTableNameParts(left.name);
        const rightParts = getDatabaseTableNameParts(right.name);
        return leftParts.shortName.localeCompare(rightParts.shortName) || left.name.localeCompare(right.name);
      }),
    }));
}

function DatabaseTablePicker({
  tables,
  value,
  onChange,
  placeholder = "Select table",
  triggerClassName,
  contentClassName,
}: {
  tables: DatabaseTableData[];
  value: string;
  onChange: (tableName: string) => void;
  placeholder?: string;
  triggerClassName?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  const selectedTable = useMemo(
    () => tables.find((table) => table.name === value) ?? tables[0] ?? null,
    [tables, value]
  );
  const groupedTables = useMemo(() => buildDatabaseTableGroups(tables), [tables]);

  const selectedParts = selectedTable ? getDatabaseTableNameParts(selectedTable.name) : null;
  const pickerSubtitle = selectedTable
    ? [
        selectedParts?.namespace || "",
        selectedTable.kind?.toUpperCase() || "",
        formatDatabaseTableStat(selectedTable),
      ].filter(Boolean).join(" | ")
    : `${tables.length.toLocaleString()} tables available`;
  const selectedSubtitle = selectedTable
    ? [
        selectedParts?.namespace || "",
        selectedTable.kind?.toUpperCase() || "",
        formatDatabaseTableStat(selectedTable),
      ].filter(Boolean).join(" • ")
    : `${tables.length.toLocaleString()} tables available`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={tables.length === 0}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:border-primary/30 hover:bg-card/80 disabled:cursor-not-allowed disabled:opacity-60",
            triggerClassName,
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-5 text-foreground">
              {selectedParts?.shortName || placeholder}
            </p>
            <p className="truncate text-[10px] leading-4 text-muted-foreground">
              {pickerSubtitle}
            </p>
          </div>
          <ChevronsUpDown size={13} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-[min(30rem,calc(100vw-1.5rem))] p-0", contentClassName)}
      >
        <Command>
          <CommandInput placeholder="Search tables or schemas..." className="h-10 text-xs" />
          <CommandList className="max-h-[20rem]">
            <CommandEmpty>No matching tables found.</CommandEmpty>
            {groupedTables.map((group) => (
              <CommandGroup key={group.key} heading={`${group.label} (${group.tables.length})`}>
                {group.tables.map((table) => {
                  const parts = getDatabaseTableNameParts(table.name);
                  const isSelected = table.name === selectedTable?.name;

                  return (
                    <CommandItem
                      key={table.name}
                      value={`${table.name} ${parts.shortName} ${parts.namespace} ${table.kind || ""}`}
                      onSelect={() => {
                        onChange(table.name);
                        setOpen(false);
                      }}
                      className="gap-2 px-2.5 py-1.5"
                    >
                      <Check
                        size={12}
                        className={cn("mt-0.5 shrink-0", isSelected ? "text-primary opacity-100" : "opacity-0")}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium leading-5 text-foreground" title={table.name}>
                          {parts.shortName}
                        </p>
                        <p className="truncate text-[10px] leading-4 text-muted-foreground" title={table.name}>
                          {parts.namespace || table.name}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          {table.kind}
                        </p>
                        <p className="text-[10px] leading-4 text-muted-foreground">
                          {formatDatabaseTableStat(table)}
                        </p>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DatabasePreviewPanel({ connectionId, schema, tableName, onSelectTable, onClose }: {
  connectionId: string;
  schema: DatabaseSchema;
  tableName: string;
  onSelectTable: (tableName: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const PAGE_SIZE = 100;

  const activeTable = useMemo(
    () => schema.tables.find((table) => table.name === tableName) ?? schema.tables[0] ?? null,
    [schema.tables, tableName]
  );
  const displayColumns = useMemo<ColumnInfo[]>(() => {
    if (!activeTable) return [];
    if (activeTable.columns.length > 0) return activeTable.columns;

    const firstRow = previewRows[0];
    if (!firstRow || typeof firstRow !== "object") return [];

    return Object.keys(firstRow).map((name) => ({
      name,
      dtype: "string",
      nonNullCount: 0,
      uniqueCount: 0,
      sampleValues: [],
    }));
  }, [activeTable, previewRows]);

  useEffect(() => {
    if (activeTable && activeTable.name !== tableName) {
      onSelectTable(activeTable.name);
    }
  }, [activeTable, tableName, onSelectTable]);

  useEffect(() => {
    setPage(0);
  }, [search, tableName]);

  useEffect(() => {
    if (!activeTable) {
      setPreviewRows([]);
      return;
    }

    let alive = true;
    setLoadingRows(true);
    setPreviewError("");
    executeDatabaseQuery(connectionId, {
      operation: "preview_table",
      params: {
        tableName: activeTable.name,
        limit: 500,
      },
    }).then((result) => {
      if (!alive) return;
      setPreviewRows(Array.isArray(result.data) ? result.data : []);
    }).catch((err: any) => {
      if (!alive) return;
      setPreviewRows([]);
      setPreviewError(err.message || "Failed to load preview rows");
    }).finally(() => {
      if (!alive) return;
      setLoadingRows(false);
    });

    return () => {
      alive = false;
    };
  }, [activeTable, connectionId]);

  const filtered = useMemo(() => {
    if (!activeTable) return [];
    if (!search.trim()) return previewRows;
    const query = search.toLowerCase();
    return previewRows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(query)));
  }, [activeTable, previewRows, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const activeTableParts = activeTable ? getDatabaseTableNameParts(activeTable.name) : null;

  return (
    <motion.div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-background" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.18 }}>
      <div className="flex flex-col gap-2 border-b border-border bg-background-secondary px-4 py-3 shrink-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Database size={14} className="text-primary" />
          <span className="font-medium text-sm text-foreground">{schema.connectionName}</span>
          {activeTable && (
            <>
              <span className="text-muted-foreground">.</span>
              <span className="text-sm text-muted-foreground">{activeTableParts?.shortName}</span>
              {activeTableParts?.namespace && (
                <span className="max-w-[14rem] truncate text-xs text-muted-foreground/80" title={activeTable.name}>
                  {activeTableParts.namespace}
                </span>
              )}
              <span className="text-xs text-muted-foreground bg-card border border-border px-2 py-0.5 rounded uppercase">{activeTable.kind}</span>
              <span className="text-xs text-muted-foreground bg-card border border-border px-2 py-0.5 rounded">
                {activeTable.rowCount != null ? `${activeTable.rowCount.toLocaleString()} rows` : `${previewRows.length.toLocaleString()} preview rows`}
              </span>
              <span className="text-xs text-muted-foreground bg-card border border-border px-2 py-0.5 rounded">{displayColumns.length} cols</span>
            </>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-7 w-full rounded-md border border-border bg-card pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-44"
              placeholder="Search rows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>
      </div>

      {schema.tables.length > 1 && (
        <div className="border-b border-border bg-card/40 px-4 py-2.5 shrink-0 sm:px-5">
          <DatabaseTablePicker
            tables={schema.tables}
            value={activeTable?.name || tableName}
            onChange={onSelectTable}
            placeholder="Choose a table"
            triggerClassName="bg-background-secondary"
          />
        </div>
      )}

      {activeTable && (
        <div className="flex gap-3 px-4 py-1.5 border-b border-border bg-card/40 overflow-x-auto shrink-0 sm:px-5">
          {displayColumns.map((col: ColumnInfo) => (
            <div key={col.name} className="flex flex-col gap-0.5 shrink-0">
              <span className="text-[11px] font-medium leading-4 text-foreground">{col.name}</span>
              <span className={["text-[10px] px-1.5 py-0.5 rounded font-mono leading-4", col.dtype === "number" ? "bg-blue-500/10 text-blue-400" : col.dtype === "date" ? "bg-purple-500/10 text-purple-400" : col.dtype === "boolean" ? "bg-amber-500/10 text-amber-400" : "bg-muted/60 text-muted-foreground"].join(" ")}>{col.dtype}</span>
            </div>
          ))}
        </div>
      )}

      {!activeTable ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">No table preview is available for this connection</p>
        </div>
      ) : loadingRows ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading live preview rows...</p>
          </div>
        </div>
      ) : previewError ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">{previewError}</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto scrollbar-thin">
            <div className="min-w-full overflow-x-auto">
              <table className="min-w-[680px] w-full border-collapse text-[11px] leading-4">
                <thead className="sticky top-0 bg-background-secondary z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground border-b border-border">#</th>
                    {displayColumns.map((col: ColumnInfo) => (
                      <th key={col.name} className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap border-b border-border">{col.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row: Record<string, any>, index: number) => (
                    <tr key={index} className="hover:bg-card/50 transition-colors">
                      <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground border-b border-border/40">{page * PAGE_SIZE + index + 1}</td>
                      {displayColumns.map((col: ColumnInfo) => (
                        <td
                          key={col.name}
                          className="max-w-[180px] truncate px-3 py-1.5 text-[11px] leading-4 text-foreground border-b border-border/40"
                          title={String(row[col.name] ?? "")}
                        >
                          {String(row[col.name] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex flex-col gap-2 border-t border-border bg-background-secondary px-4 py-2.5 shrink-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} rows
              </span>
              <div className="flex gap-1.5">
                <button onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} className="px-3 h-7 text-xs border border-border rounded hover:bg-card disabled:opacity-40 text-foreground">Previous</button>
                <span className="px-2 h-7 text-xs flex items-center text-muted-foreground">{page + 1} / {totalPages}</span>
                <button onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={page >= totalPages - 1} className="px-3 h-7 text-xs border border-border rounded hover:bg-card disabled:opacity-40 text-foreground">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

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
      toast.error(err.message || "Insight limit reached for your plan", {
        action: {
          label: "View Plans",
          onClick: () => navigate("/app/pricing"),
        },
      });
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
  const { connections } = useConnectionStore();
  const { activeProvider, activeModel, temperature, maxTokens, systemPrompt, setActiveProvider, setActiveModel, setTemperature, setMaxTokens, setSystemPrompt, getApiKey, providerConfigs, setProviderConfig } = useLLMStore();
  const { addEntry, entries } = useHistoryStore();
  const { checkMetric, checkExport, fetchPlan } = usePlanStore();

  const [selectedDatasetId, setSelectedDatasetId] = useState(searchParams.get("dataset") || "");
  const [selectedSheet, setSelectedSheet] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [dbSchema, setDbSchema] = useState<DatabaseSchema | null>(null);
  const [loadingDbSchema, setLoadingDbSchema] = useState(false);

  // Determine if the selected source is a DB connection (prefixed with "conn:") or a dataset
  const isDbConnection = selectedDatasetId.startsWith("conn:");
  const selectedConnectionId = isDbConnection ? selectedDatasetId.slice(5) : null;
  const selectedConnection = selectedConnectionId ? connections.find((c) => c._id === selectedConnectionId) : null;
  const connectedDbs = connections.filter((c) => c.status === "connected");
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
  const [showShareCard, setShowShareCard] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [showMobileAdvanced, setShowMobileAdvanced] = useState(false);
  const [favoritePrompts, setFavoritePrompts] = useState<string[]>(() => readStoredList(FAVORITE_PROMPTS_KEY));
  const [queryExpanded, setQueryExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [hitlState, setHitlState] = useState<{
    kind: "clarification" | "approval";
    prompt: string;
    options?: string[];
    details?: { rowCount?: number; operation?: string; sql?: string; options?: string[] };
  } | null>(null);
  const hitlResolverRef = useRef<((value: string) => void) | null>(null);
  const [lastFailedQuery, setLastFailedQuery] = useState("");
  const [apiWarning, setApiWarning] = useState("");

  // Multi-turn conversation memory
  const [conversationContext, setConversationContext] = useState<ConversationContext[]>([]);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelRequestedRef = useRef(false);
  const queryStartRef = useRef(0);

  const selectedDataset = isDbConnection ? undefined : (getDataset(selectedDatasetId) ?? datasets.find((d) => d.id === selectedDatasetId));
  const selectedDbTableData = useMemo(
    () => dbSchema?.tables.find((table) => table.name === selectedTable) ?? dbSchema?.tables[0] ?? null,
    [dbSchema, selectedTable]
  );
  const sourceName = selectedConnection?.name || selectedDataset?.fileName || "Unknown source";
  const defaultPromptLabel = isDbConnection && selectedConnection
    ? `${DB_TYPE_LABELS[selectedConnection.dbType]} database agent`
    : "CSV/Excel workbook agent";

  const loadDbSchema = useCallback(async (connectionId: string, options: { refresh?: boolean } = {}) => {
    setLoadingDbSchema(true);
    try {
      const response = await fetchDatabaseSchema(connectionId, undefined, options);
      setDbSchema(response.schema);
      setSelectedTable((current) => {
        if (current && response.schema.tables.some((table) => table.name === current)) return current;
        return response.schema.tables[0]?.name || "";
      });
      return response.schema;
    } catch (err: any) {
      setDbSchema(null);
      toast.error(err.message || "Failed to load database schema");
      return null;
    } finally {
      setLoadingDbSchema(false);
    }
  }, []);

  const loadDbTableSchema = useCallback(async (connectionId: string, tableName: string) => {
    if (!tableName.trim()) return null;

    try {
      const response = await fetchDatabaseSchema(connectionId, tableName, { refresh: true });
      const detailedTable = response.schema.tables[0] ?? null;
      if (!detailedTable) return null;

      setDbSchema((current) => {
        if (!current) return response.schema;

        const existingTables = current.tables.some((table) => table.name === detailedTable.name)
          ? current.tables.map((table) => table.name === detailedTable.name ? { ...table, ...detailedTable } : table)
          : [...current.tables, detailedTable];

        return {
          ...current,
          ...response.schema,
          tables: existingTables,
        };
      });

      return detailedTable;
    } catch (err: any) {
      toast.error(err.message || `Failed to load schema for ${tableName}`);
      return null;
    }
  }, []);

  useEffect(() => {
    if (selectedDataset && !selectedSheet) setSelectedSheet(selectedDataset.sheetNames[0]);
  }, [selectedDataset, selectedSheet]);

  useEffect(() => {
    if (!isDbConnection || !selectedConnectionId) {
      setDbSchema(null);
      setSelectedTable("");
      return;
    }
    void loadDbSchema(selectedConnectionId);
  }, [isDbConnection, selectedConnectionId, loadDbSchema]);

  useEffect(() => {
    if (!isDbConnection || !selectedConnectionId || !selectedTable) return;
    const table = dbSchema?.tables.find((entry) => entry.name === selectedTable);
    if (table?.columns.length) return;
    void loadDbTableSchema(selectedConnectionId, selectedTable);
  }, [dbSchema, isDbConnection, loadDbTableSchema, selectedConnectionId, selectedTable]);

  useEffect(() => {
    const replayQuestion = searchParams.get("q");
    if (replayQuestion) setInput(replayQuestion);
  }, [searchParams]);

  useEffect(() => {
    const scroller = chatScrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [messages, currentSteps, hitlState]);
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

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        if (text) {
          setInput((prev) => prev ? prev + " " + text : text);
          toast.success("Speech recognized!");
        }
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          toast.error("Microphone access denied.");
        } else {
          toast.error(`Error: ${event.error}`);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error(err);
      toast.error("Failed to start speech recognition.");
      setIsListening(false);
    }
  };

  const toggleFavoritePrompt = (prompt: string) => {
    if (!prompt.trim()) return;
    setFavoritePrompts((prev) => prev.includes(prompt) ? prev.filter((item) => item !== prompt) : [prompt, ...prev].slice(0, 20));
  };

  const handleSourceChange = (value: string) => {
    setSelectedDatasetId(value);
    setSelectedSheet("");
    setSelectedTable("");
    setDbSchema(null);
  };

  // Smart suggestions based on dataset columns
  const smartSuggestions = useMemo(() => {
    if (isDbConnection && selectedConnection) {
      if (selectedDbTableData?.columns.length) {
        return generateSmartSuggestions(selectedDbTableData.columns).slice(0, 5);
      }
      return [
        "Show all tables in this database",
        "What is the total row count?",
        "Describe the schema",
        "Show the first 10 rows",
        "What columns are available?",
      ];
    }
    const sheet = selectedDataset?.data?.sheets[selectedSheet];
    if (sheet) return generateSmartSuggestions(sheet.columns);
    return [
      "What is the total revenue?",
      "Show top 10 by sales",
      "What are the unique categories?",
      "Find rows where value > 1000",
      "What is the average order value?",
    ];
  }, [selectedDataset, selectedSheet, isDbConnection, selectedConnection, selectedDbTableData]);

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

  const handleSendLegacy = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? input).trim();
    if (!question || isRunning) return;
    if (!selectedDatasetId) { toast.error("Select a data source first"); return; }
    const apiKey = getApiKey(activeProvider);
    const activeProviderConfig = providerConfigs[activeProvider] || {};
    const providerOptions = activeProvider === "bedrock"
      ? {
        secretAccessKey: activeProviderConfig.secretAccessKey || "",
        region: activeProviderConfig.region || "us-east-1",
      }
      : {};
    if (!apiKey && activeProvider !== "ollama") {
      const message = activeProvider === "bedrock"
        ? "AWS Bedrock access key is missing. Add it in Settings or paste it in the left provider fields."
        : `${PROVIDER_LABELS[activeProvider]} API key is missing. Add it in Settings or paste it in the left API key field.`;
      setApiWarning(message);
      toast.error(message);
      return;
    }
    if (activeProvider === "bedrock" && !activeProviderConfig.secretAccessKey) {
      const message = "AWS Bedrock secret access key is missing. Add it in Settings or paste it in the left provider fields.";
      setApiWarning(message);
      toast.error(message);
      return;
    }

    setIsRunning(true);
    cancelRequestedRef.current = false;

    try {
      await checkMetric("monthlyQueries", 1);
      await checkMetric("monthlyTokens", maxTokens);
    } catch (err: any) {
      toast.error(err.message || "Query limit reached for your plan", {
        action: {
          label: "View Plans",
          onClick: () => navigate("/app/pricing"),
        },
      });
      setIsRunning(false);
      return;
    }
    if (cancelRequestedRef.current) return;

    setInput(overrideQuestion ? input : "");
    setApiWarning("");
    setLastFailedQuery("");
    queryStartRef.current = Date.now();
    setMessages((prev) => [...prev, { role: "user", content: question, query: question }]);
    setCurrentSteps([]);
    setFinalResult(null);
    setLastQuery(question);

    // Handle DB connection source — show info message that actual DB querying is coming soon
    if (isDbConnection && selectedConnection) {
      const steps: AgentStep[] = [{
        turn: 1,
        command: "Answer",
        args: {},
        result: {
          narrative: `🔗 **Connected to ${selectedConnection.name}** (${DB_TYPE_LABELS[selectedConnection.dbType]})\n\nYour question: "${question}"\n\nThe database connection is configured and ready. In the next release, this will execute real SQL queries against your ${DB_TYPE_LABELS[selectedConnection.dbType]} database.\n\n**Connection Details:**\n- Type: ${DB_TYPE_LABELS[selectedConnection.dbType]}\n- Host: ${selectedConnection.config.host || selectedConnection.config.url || selectedConnection.config.account || "configured"}\n- Database: ${selectedConnection.config.database || selectedConnection.config.projectId || "configured"}\n- Status: ✅ ${selectedConnection.status}`,
          highlights: [
            { label: "Database", value: DB_TYPE_LABELS[selectedConnection.dbType] },
            { label: "Connection", value: selectedConnection.name },
            { label: "Status", value: selectedConnection.status },
          ],
        },
        tokens: { input: 0, output: 0 },
        durationMs: Date.now() - queryStartRef.current,
        isFinal: true,
      }];
      setCurrentSteps([]);
      setFinalResult(steps[0].result);
      setShowResult(true);
      setMessages((prev) => [...prev, { role: "agent", content: "", steps, query: question }]);
      setConversationContext((prev) => [...prev, { question, answer: steps[0].result }]);
      setIsRunning(false);
      return;
    }

    let workbookSheets = selectedDataset?.data?.sheets;
    if (!workbookSheets) {
      toast.info("Loading dataset from storage…");
      const { loadDatasetData } = useDatasetStore.getState();
      const fetched = await loadDatasetData(selectedDatasetId);
      workbookSheets = fetched?.sheets;
    }
    if (cancelRequestedRef.current) return;
    if (!workbookSheets || !workbookSheets[selectedSheet]) {
      toast.error("Dataset data unavailable. Please re-upload the file.");
      setIsRunning(false);
      return;
    }
    const steps: AgentStep[] = [];
    const startTime = Date.now();

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

    try {
      for await (const step of runLegacyAgent(
        question, workbookSheets, selectedSheet, activeProvider, activeModel, apiKey, temperature, maxTokens,
        systemPrompt || undefined, conversationContext, providerOptions, hitlController
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

  const handleSend = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? input).trim();
    if (!question || isRunning) return;
    if (!selectedDatasetId) { toast.error("Select a data source first"); return; }

    const apiKey = getApiKey(activeProvider);
    const activeProviderConfig = providerConfigs[activeProvider] || {};
    const providerOptions = activeProvider === "bedrock"
      ? {
        secretAccessKey: activeProviderConfig.secretAccessKey || "",
        region: activeProviderConfig.region || "us-east-1",
      }
      : {};

    if (!apiKey && activeProvider !== "ollama") {
      const message = activeProvider === "bedrock"
        ? "AWS Bedrock access key is missing. Add it in Settings or paste it in the left provider fields."
        : `${PROVIDER_LABELS[activeProvider]} API key is missing. Add it in Settings or paste it in the left API key field.`;
      setApiWarning(message);
      toast.error(message);
      return;
    }
    if (activeProvider === "bedrock" && !activeProviderConfig.secretAccessKey) {
      const message = "AWS Bedrock secret access key is missing. Add it in Settings or paste it in the left provider fields.";
      setApiWarning(message);
      toast.error(message);
      return;
    }

    setIsRunning(true);
    cancelRequestedRef.current = false;

    try {
      await checkMetric("monthlyQueries", 1);
      await checkMetric("monthlyTokens", maxTokens);
    } catch (err: any) {
      toast.error(err.message || "Query limit reached for your plan", {
        action: {
          label: "View Plans",
          onClick: () => navigate("/app/pricing"),
        },
      });
      setIsRunning(false);
      return;
    }
    if (cancelRequestedRef.current) return;

    setInput(overrideQuestion ? input : "");
    setApiWarning("");
    setLastFailedQuery("");
    queryStartRef.current = Date.now();
    setMessages((prev) => [...prev, { role: "user", content: question, query: question }]);
    setCurrentSteps([]);
    setFinalResult(null);
    setLastQuery(question);

    const steps: AgentStep[] = [];
    const startTime = Date.now();
    let runner: AsyncGenerator<AgentStep>;

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

    if (isDbConnection) {
      if (!selectedConnection || !selectedConnectionId) {
        toast.error("Select a connected database first");
        setIsRunning(false);
        return;
      }

      const schema = await loadDbSchema(selectedConnectionId, { refresh: true });
      if (cancelRequestedRef.current) {
        setIsRunning(false);
        return;
      }
      if (!schema || schema.tables.length === 0) {
        toast.error("Database schema is unavailable for this connection.");
        setIsRunning(false);
        return;
      }

      const activeTableName = selectedTable || schema.tables[0]?.name || "";
      let databaseTables = schema.tables;
      const selectedTableSchema = activeTableName
        ? await loadDbTableSchema(selectedConnectionId, activeTableName)
        : null;
      if (cancelRequestedRef.current) {
        setIsRunning(false);
        return;
      }
      if (selectedTableSchema) {
        databaseTables = databaseTables.map((table) =>
          table.name === selectedTableSchema.name ? { ...table, ...selectedTableSchema } : table
        );
      }

      runner = runDatabaseAgent(
        question,
        databaseTables,
        activeTableName,
        DB_TYPE_LABELS[selectedConnection.dbType],
        activeProvider,
        activeModel,
        apiKey,
        temperature,
        maxTokens,
        systemPrompt || undefined,
        conversationContext,
        providerOptions,
        {
          loadTableSchema: (tableName) => loadDbTableSchema(selectedConnectionId, tableName),
          executeSql: async ({ sql }) => {
            const response = await executeDatabaseQuery(selectedConnectionId, { sql });
            return response;
          },
          executeTableOperation: async ({ tableName, operation, params }) => {
            const response = await executeDatabaseQuery(selectedConnectionId, {
              operation,
              params: {
                ...params,
                tableName,
              },
            });
            return response;
          },
        },
        hitlController
      );
    } else {
      let workbookSheets = selectedDataset?.data?.sheets;
      if (!workbookSheets) {
        toast.info("Loading dataset from storage...");
        const { loadDatasetData } = useDatasetStore.getState();
        const fetched = await loadDatasetData(selectedDatasetId);
        workbookSheets = fetched?.sheets;
      }
      if (cancelRequestedRef.current) {
        setIsRunning(false);
        return;
      }
      if (!workbookSheets || !workbookSheets[selectedSheet]) {
        toast.error("Dataset data unavailable. Please re-upload the file.");
        setIsRunning(false);
        return;
      }

      runner = runLegacyAgent(
        question,
        workbookSheets,
        selectedSheet,
        activeProvider,
        activeModel,
        apiKey,
        temperature,
        maxTokens,
        systemPrompt || undefined,
        conversationContext,
        providerOptions,
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

      const totalTokens = steps.reduce((sum, step) => sum + step.tokens.input + step.tokens.output, 0);
      const finalStep = getFinalStep(steps);

      if (finalStep) {
        setConversationContext((prev) => [...prev, { question, answer: finalStep.result }]);
      }

      setMessages((prev) => [...prev, { role: "agent", content: "", steps: [...steps], query: question }]);
      setCurrentSteps([]);

      try {
        await addEntry({
          query: question,
          datasetName: sourceName,
          provider: activeProvider,
          model: activeModel,
          turns: steps.length,
          totalTokens,
          durationMs: Date.now() - startTime,
          status: steps.some((step) => step.command === "Error") ? "error" : "success",
          steps: [...steps],
          finalResult: steps[steps.length - 1]?.result,
        });
      } catch (err: any) {
        toast.error(err.message || "Query usage could not be saved for your plan");
      } finally {
        fetchPlan();
      }
    } catch (err: any) {
      if (hitlResolverRef.current) {
        hitlResolverRef.current("reject");
        hitlResolverRef.current = null;
      }
      setHitlState(null);
      toast.error(err.message);
      setLastFailedQuery(question);
      setMessages((prev) => [...prev, { role: "agent", content: err.message, steps: [] }]);
    } finally {
      setIsRunning(false);
      setHitlState(null);
    }
  };

  void handleSendLegacy;

  const handleStopQuery = () => {
    cancelRequestedRef.current = true;
    setIsRunning(false);
    if (hitlResolverRef.current) {
      hitlResolverRef.current("reject");
      hitlResolverRef.current = null;
    }
    setHitlState(null);
    setMessages((prev) => [...prev, { role: "agent", content: "Query stopped by user.", steps: [] }]);
    setCurrentSteps([]);
    toast.info("Query stopped");
  };

  // Active columns for matching
  const activeColumns = useMemo(() => {
    if (isDbConnection && selectedDbTableData?.columns) {
      return selectedDbTableData.columns.map((c: any) => c.name);
    }
    const sheet = selectedDataset?.data?.sheets[selectedSheet];
    if (sheet?.columns) {
      return sheet.columns.map((c: any) => c.name);
    }
    return [];
  }, [selectedDataset, selectedSheet, isDbConnection, selectedDbTableData]);

  const activeSuggestion = useMemo(() => {
    if (!input.trim()) return "";
    const lowercaseInput = input.toLowerCase();
    
    // Try smart suggestions first
    const match = smartSuggestions.find(s => s.toLowerCase().startsWith(lowercaseInput));
    if (match) {
      return match.slice(input.length);
    }
    
    // Fallback to column names
    const colMatch = activeColumns.find(c => c.toLowerCase().startsWith(lowercaseInput));
    if (colMatch) {
      return colMatch.slice(input.length);
    }
    
    return "";
  }, [input, smartSuggestions, activeColumns]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && activeSuggestion) {
      e.preventDefault();
      setInput((prev) => prev + activeSuggestion);
      return;
    }
    if (e.key === "ArrowRight" && activeSuggestion) {
      const cursorPosition = e.currentTarget.selectionStart;
      if (cursorPosition === input.length) {
        e.preventDefault();
        setInput((prev) => prev + activeSuggestion);
        return;
      }
    }
    if (e.key === "Enter" && (!e.shiftKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
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
      toast.error(err.message || "PDF export is not available on your plan", {
        action: {
          label: "View Plans",
          onClick: () => navigate("/app/pricing"),
        },
      });
    }
  };

  const activeProviderConfig = providerConfigs[activeProvider] || {};
  const apiKeyForProvider = activeProviderConfig.apiKey || "";
  const secretAccessKeyForProvider = activeProviderConfig.secretAccessKey || "";
  const bedrockRegionForProvider = activeProviderConfig.region || "us-east-1";

  return (
    <div className="relative flex h-[calc(100dvh-3.5rem-4.5rem-env(safe-area-inset-bottom))] min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.08),_transparent_34%)] md:h-[calc(100dvh-3.5rem)] xl:flex-row">
      <AnimatePresence>
        {showPreview && selectedDataset && (
          <DataPreviewPanel dataset={selectedDataset} sheet={selectedSheet} onClose={() => setShowPreview(false)} />
        )}
        {showPreview && selectedConnection && dbSchema && (
          <DatabasePreviewPanel connectionId={selectedConnection._id} schema={dbSchema} tableName={selectedTable} onSelectTable={setSelectedTable} onClose={() => setShowPreview(false)} />
        )}
      </AnimatePresence>

      {/* Left: Context Panel */}
      <div className="hidden w-[clamp(16rem,20vw,18rem)] shrink-0 flex-col overflow-auto border-r border-border/70 bg-background-secondary/90 backdrop-blur-sm lg:flex">
        <div className="p-4 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Data Source</Label>
            <Select value={selectedDatasetId} onValueChange={handleSourceChange}>
              <SelectTrigger className="mt-1.5 bg-card border-border"><SelectValue placeholder="Select data source" /></SelectTrigger>
              <SelectContent className="bg-popover border-border max-h-72">
                {datasets.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">📄 Uploaded Files</div>
                    {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.fileName}</SelectItem>)}
                  </>
                )}
                {connectedDbs.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-1">🔗 Database Connections</div>
                    {connectedDbs.map((c) => (
                      <SelectItem key={`conn:${c._id}`} value={`conn:${c._id}`}>
                        <span className="flex items-center gap-2">{DB_TYPE_ICONS[c.dbType]} {c.name}</span>
                      </SelectItem>
                    ))}
                  </>
                )}
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

          {selectedConnection && dbSchema && dbSchema.tables.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Table</Label>
              <div className="mt-1.5">
                <DatabaseTablePicker
                  tables={dbSchema.tables}
                  value={selectedDbTableData?.name || selectedTable}
                  onChange={setSelectedTable}
                  placeholder="Choose a table"
                />
              </div>
            </div>
          )}

          {selectedConnection && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">{DB_TYPE_ICONS[selectedConnection.dbType]}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{selectedConnection.name}</p>
                  <p className="text-[10px] text-muted-foreground">{DB_TYPE_LABELS[selectedConnection.dbType]}</p>
                </div>
              </div>
              {selectedConnection.config.host && <p className="text-[10px] text-muted-foreground">Host: <span className="font-mono text-foreground">{selectedConnection.config.host}</span></p>}
              {selectedConnection.config.database && <p className="text-[10px] text-muted-foreground">DB: <span className="font-mono text-foreground">{selectedConnection.config.database}</span></p>}
              {loadingDbSchema && <p className="text-[10px] text-muted-foreground">Loading table schema...</p>}
            </div>
          )}

          {selectedDataset && selectedSheet && (
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="border-border text-xs">{selectedDataset.rowCounts[selectedSheet]} rows</Badge>
              <Badge variant="outline" className="border-border text-xs">{selectedDataset.columnCounts[selectedSheet]} cols</Badge>
            </div>
          )}

          {selectedConnection && selectedDbTableData && (
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="border-border text-xs">
                {selectedDbTableData.rowCount != null ? `${selectedDbTableData.rowCount} rows` : "Rows pending"}
              </Badge>
              <Badge variant="outline" className="border-border text-xs">
                {selectedDbTableData.columns.length > 0 ? `${selectedDbTableData.columns.length} cols` : "Cols pending"}
              </Badge>
              <Badge variant="outline" className="border-border text-xs uppercase">{selectedDbTableData.kind}</Badge>
            </div>
          )}

          {(selectedDataset || selectedConnection) && (
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

          {activeProvider === "bedrock" ? (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">Access Key ID</Label>
                <Input
                  type="password"
                  placeholder="Enter AWS access key ID"
                  value={apiKeyForProvider}
                  onChange={(e) => setProviderConfig(activeProvider, { apiKey: e.target.value })}
                  className="mt-1.5 bg-card border-border text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Secret Access Key</Label>
                <Input
                  type="password"
                  placeholder="Enter AWS secret access key"
                  value={secretAccessKeyForProvider}
                  onChange={(e) => setProviderConfig(activeProvider, { secretAccessKey: e.target.value })}
                  className="mt-1.5 bg-card border-border text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Region</Label>
                <Input
                  placeholder="us-east-1"
                  value={bedrockRegionForProvider}
                  onChange={(e) => setProviderConfig(activeProvider, { region: e.target.value })}
                  className="mt-1.5 bg-card border-border text-xs font-mono"
                />
              </div>
            </>
          ) : (
            <div>
              <Label className="text-xs text-muted-foreground">API Key</Label>
              <Input type="password" placeholder="Enter API key" value={apiKeyForProvider} onChange={(e) => setProviderConfig(activeProvider, { apiKey: e.target.value })} className="mt-1.5 bg-card border-border text-xs font-mono" />
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Model</Label>
            {activeProvider === "bedrock" ? (
              <Input
                value={activeModel}
                onChange={(e) => {
                  setActiveModel(e.target.value);
                  setProviderConfig(activeProvider, { model: e.target.value });
                }}
                placeholder="Enter Bedrock model ID"
                className="mt-1.5 bg-card border-border text-xs font-mono"
              />
            ) : (
              <Select value={activeModel} onValueChange={setActiveModel}>
                <SelectTrigger className="mt-1.5 bg-card border-border min-w-0 [&>span]:truncate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border w-[min(28rem,calc(100vw-2rem))] max-h-72">
                  {PROVIDER_MODELS[activeProvider]?.map((m) => (
                    <SelectItem key={m} value={m} className="items-start py-2 pl-7 pr-3 text-sm">
                      <span className="min-w-0 whitespace-normal break-words leading-snug">
                        {getModelDisplayName(m)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
              <Textarea placeholder={`Override the ${defaultPromptLabel} prompt...`} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="bg-card border-border text-xs min-h-[80px]" />
              <p className="mt-1 text-[10px] text-muted-foreground">Default mode: {defaultPromptLabel}</p>
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
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
        <div className="shrink-0 space-y-2 border-b border-border/70 bg-background-secondary/90 p-3 backdrop-blur-sm lg:hidden">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select value={selectedDatasetId} onValueChange={handleSourceChange}>
              <SelectTrigger className="bg-card border-border text-xs"><SelectValue placeholder="Data source" /></SelectTrigger>
              <SelectContent className="bg-popover border-border max-h-72">
                {datasets.length > 0 && <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">📄 Files</div>}
                {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.displayName || d.fileName}</SelectItem>)}
                {connectedDbs.length > 0 && <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-1">🔗 Databases</div>}
                {connectedDbs.map((c) => (
                  <SelectItem key={`conn:${c._id}`} value={`conn:${c._id}`}>
                    <span className="flex items-center gap-2">{DB_TYPE_ICONS[c.dbType]} {c.name}</span>
                  </SelectItem>
                ))}
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
          {selectedConnection && dbSchema && dbSchema.tables.length > 0 && (
            <div className="w-full">
              <DatabaseTablePicker
                tables={dbSchema.tables}
                value={selectedDbTableData?.name || selectedTable}
                onChange={setSelectedTable}
                placeholder="Choose a table"
                triggerClassName="py-1.5"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(selectedDataset || selectedConnection) && (
              <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => setShowPreview(true)}>
                <Eye size={12} className="mr-1" /> Preview
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => setShowMobileSettings(true)}>
              <Settings2 size={12} className="mr-1" /> Provider
            </Button>
            <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => setShowTemplates(true)}>
              <LayoutTemplate size={12} className="mr-1" /> Templates
            </Button>
            <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => setShowShortcuts(true)}>
              <Keyboard size={12} className="mr-1" /> Shortcuts
            </Button>
          </div>
        </div>
        <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 space-y-4 scrollbar-thin sm:p-4">
          {messages.length === 0 && !isRunning && (
            <div className="flex h-full flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-border/70 bg-card/45 px-6 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles size={24} className="text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">Ask anything about your data</p>
              <p className="max-w-xl text-sm text-muted-foreground">
                Use smart suggestions, prompt templates, or your own question. The workspace stays optimized for both
                handheld and desktop query sessions.
              </p>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {smartSuggestions.map((p) => (
                  <button key={p} onClick={() => { setInput(p); textareaRef.current?.focus(); }}
                    className="rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
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
                    <div className="max-w-[85%] min-w-0 rounded-lg border border-border bg-card px-4 py-2.5 sm:max-w-md">
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {msg.steps && msg.steps.length > 0 ? (
                      <StepsTimeline steps={msg.steps} />
                    ) : (
                      <div className="max-w-full min-w-0 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 sm:max-w-[85%]">
                        <p className="text-sm text-destructive whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                          {msg.content}
                        </p>
                      </div>
                    )}
                    {msg.steps && msg.steps.length > 0 && (
                      <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground sm:pl-10">
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
                    {finalStep && (
                      <InlineFinalResult 
                        result={finalStep.result} 
                        onSubmitQuickReply={(text) => {
                          handleSend(text);
                        }}
                      />
                    )}
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
              {currentFinalStep && !hitlState && (
                <InlineFinalResult 
                  result={currentFinalStep.result} 
                  onSubmitQuickReply={(text) => {
                    handleSend(text);
                  }}
                />
              )}

              <AnimatePresence mode="wait">
                {hitlState ? (
                  <HitlPanel
                    key="hitl-active"
                    state={hitlState}
                    onSubmit={(val) => {
                      if (hitlResolverRef.current) {
                        hitlResolverRef.current(val);
                        hitlResolverRef.current = null;
                        setHitlState(null);
                      }
                    }}
                    onStop={handleStopQuery}
                  />
                ) : null}
              </AnimatePresence>
              {!hitlState && (
                <div className="flex flex-wrap items-center gap-2 sm:pl-10">
                  {/* Premium 3-dot thinking indicator */}
                  <div className="flex items-center gap-1.5">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Agent is thinking... {Math.floor(elapsedMs / 1000)}s
                    {elapsedMs > 30000 ? " — taking longer than usual" : ""}
                  </span>
                  <Button variant="outline" size="sm" className="h-7 border-border text-xs" onClick={handleStopQuery}>
                    <X size={12} className="mr-1" /> Stop
                  </Button>
                </div>
              )}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="shrink-0 border-t border-border/70 bg-background/90 p-3 backdrop-blur-sm sm:p-4">
          {apiWarning && (
            <div className="mx-auto mb-3 flex max-w-3xl flex-col items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning sm:flex-row sm:items-center sm:justify-between">
              <span>{apiWarning}</span>
              <Button variant="outline" size="sm" className="h-7 border-warning/30 text-xs" onClick={() => navigate("/app/settings")}>Settings</Button>
            </div>
          )}
          {lastFailedQuery && !isRunning && (
            <div className="mx-auto mb-3 flex max-w-3xl flex-col items-start gap-2 rounded-md border border-border bg-background-secondary px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Last query failed.</span>
              <Button variant="outline" size="sm" className="h-7 border-border text-xs" onClick={() => handleSend(lastFailedQuery)}>
                <RefreshCw size={12} className="mr-1" /> Retry
              </Button>
            </div>
          )}
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[28px] border border-border/70 bg-card/80 p-2 shadow-[0_20px_44px_-34px_hsl(var(--foreground)/0.82)] backdrop-blur-sm query-input-glow">
            <div className="relative min-w-0 flex-1">
              {/* Ghost text backdrop overlay */}
              {activeSuggestion && !isRunning && !isListening && (
                <div 
                  className="absolute inset-0 bg-transparent text-transparent pointer-events-none whitespace-pre-wrap break-all select-none px-3 py-2 text-sm leading-normal border border-transparent font-normal font-sans"
                  style={{
                    fontFamily: "inherit",
                    fontSize: "0.875rem",
                    lineHeight: "1.25rem",
                    padding: "0.5rem 0.75rem",
                    pointerEvents: "none",
                  }}
                >
                  <span>{input}</span>
                  <span className="text-muted-foreground/30 dark:text-muted-foreground/35">{activeSuggestion}</span>
                </div>
              )}

              {/* Listening waveforms overlay */}
              {isListening && (
                <div className="absolute inset-0 flex items-center justify-between bg-background-secondary/95 backdrop-blur-sm rounded-[24px] px-4 py-2 border border-primary/20 z-20">
                  <div className="flex items-center gap-3">
                    <div className="flex items-end gap-1.5 h-6 w-12 justify-center">
                      <div className="voice-bar voice-bounce-1 bg-primary w-1.5 h-3 rounded-full" />
                      <div className="voice-bar voice-bounce-2 bg-primary w-1.5 h-5 rounded-full" />
                      <div className="voice-bar voice-bounce-3 bg-primary w-1.5 h-2 rounded-full" />
                      <div className="voice-bar voice-bounce-4 bg-primary w-1.5 h-6 rounded-full" />
                      <div className="voice-bar voice-bounce-5 bg-primary w-1.5 h-4 rounded-full" />
                    </div>
                    <span className="text-xs text-foreground font-medium animate-pulse">Listening...</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSpeech}
                    className="h-7 px-3 text-xs border-border bg-card hover:bg-background"
                  >
                    Done
                  </Button>
                </div>
              )}

              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // Auto-grow
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, queryExpanded ? 260 : 120)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder={isRunning ? "Query is running... stop it or wait to ask another question" : "Ask a question about your data... (Shift+Enter for new line)"}
                disabled={isRunning}
                className={`bg-background-secondary border-border resize-none min-h-[44px] disabled:cursor-not-allowed disabled:opacity-70 ${queryExpanded ? "min-h-[140px] max-h-[260px]" : "max-h-[120px]"} pr-10`}
                rows={queryExpanded ? 5 : 1}
              />
              {input && !isListening && (
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
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                onClick={handleSpeech}
                size="icon"
                title={isListening ? "Stop listening" : "Voice search"}
                className={`h-[44px] w-[44px] shrink-0 border-border transition-all duration-300 ${isListening ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/30 ring-2 ring-red-500/20" : "hover:text-primary hover:border-primary/45"}`}
              >
                <Mic size={16} className={isListening ? "animate-pulse" : ""} />
              </Button>
              <Button
                variant="outline"
                onClick={() => setQueryExpanded((prev) => !prev)}
                size="icon"
                title={queryExpanded ? "Collapse query box" : "Expand query box"}
                className="h-[44px] w-[44px] shrink-0 border-border"
              >
                {queryExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </Button>
              <Button onClick={isRunning ? handleStopQuery : () => handleSend()} disabled={!isRunning && !input.trim()} size="icon" className="h-[44px] w-[44px] shrink-0">
                {isRunning ? <X size={16} /> : <Send size={16} />}
              </Button>
            </div>
          </div>
          {input.length > 0 && <p className="text-xs text-muted-foreground text-center mt-1">~{Math.ceil(input.length / 4)} tokens · Ctrl+Enter to send</p>}
          {input.length > 0 && <p className="text-xs text-muted-foreground text-center mt-0.5">{input.length.toLocaleString()} characters</p>}
        </div>
      </div>

      {/* Right: Result Panel */}
      {finalResult !== null && showResult && (
        <div className="hidden w-[clamp(20rem,28vw,26rem)] shrink-0 border-l border-border/70 bg-background-secondary/90 backdrop-blur-sm xl:block">
          <ResultPanel
            result={finalResult}
            query={lastQuery}
            onClose={() => setShowResult(false)}
            onBookmark={() => setShowSaveInsight(true)}
            datasetName={sourceName}
            onShare={() => setShowShareCard(true)}
          />
        </div>
      )}

      {finalResult !== null && !showResult && (
        <button onClick={() => setShowResult(true)} className="fixed right-4 bottom-20 bg-primary text-primary-foreground p-2 rounded-full shadow-lg hover:bg-primary/90 hidden xl:block">
          <PanelRightOpen size={16} />
        </button>
      )}

      <Sheet open={showMobileSettings} onOpenChange={setShowMobileSettings}>
        <SheetContent side="bottom" className="h-[88dvh] overflow-y-auto border-t border-border bg-background-secondary px-4 pb-6 pt-10 lg:hidden">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <Settings2 size={16} className="text-primary" /> Query settings
            </SheetTitle>
            <SheetDescription>
              Manage provider, model, API key, and query runtime options on mobile.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Data Source</Label>
              <Select value={selectedDatasetId} onValueChange={handleSourceChange}>
                <SelectTrigger className="mt-1.5 bg-card border-border text-xs">
                  <SelectValue placeholder="Select data source" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border max-h-72">
                  {datasets.length > 0 && <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">📄 Files</div>}
                  {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.displayName || d.fileName}</SelectItem>)}
                  {connectedDbs.length > 0 && <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-1">🔗 Databases</div>}
                  {connectedDbs.map((c) => (
                    <SelectItem key={`conn:${c._id}`} value={`conn:${c._id}`}>
                      <span className="flex items-center gap-2">{DB_TYPE_ICONS[c.dbType]} {c.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDataset && selectedDataset.sheetNames.length > 1 && (
              <div>
                <Label className="text-xs text-muted-foreground">Sheet</Label>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {selectedDataset.sheetNames.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelectedSheet(s)}
                      className={`rounded px-2 py-1 text-xs ${s === selectedSheet ? "bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:text-foreground"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedConnection && dbSchema && dbSchema.tables.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Table</Label>
                <div className="mt-1.5">
                  <DatabaseTablePicker
                    tables={dbSchema.tables}
                    value={selectedDbTableData?.name || selectedTable}
                    onChange={setSelectedTable}
                    placeholder="Choose a table"
                  />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">LLM Provider</Label>
              <Select value={activeProvider} onValueChange={(v) => setActiveProvider(v as Provider)}>
                <SelectTrigger className="mt-1.5 bg-card border-border text-xs">
                  <SelectValue />
                </SelectTrigger>
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

            {activeProvider === "bedrock" ? (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground">Access Key ID</Label>
                  <Input
                    type="password"
                    placeholder="Enter AWS access key ID"
                    value={apiKeyForProvider}
                    onChange={(e) => setProviderConfig(activeProvider, { apiKey: e.target.value })}
                    className="mt-1.5 bg-card border-border text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Secret Access Key</Label>
                  <Input
                    type="password"
                    placeholder="Enter AWS secret access key"
                    value={secretAccessKeyForProvider}
                    onChange={(e) => setProviderConfig(activeProvider, { secretAccessKey: e.target.value })}
                    className="mt-1.5 bg-card border-border text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Region</Label>
                  <Input
                    placeholder="us-east-1"
                    value={bedrockRegionForProvider}
                    onChange={(e) => setProviderConfig(activeProvider, { region: e.target.value })}
                    className="mt-1.5 bg-card border-border text-xs font-mono"
                  />
                </div>
              </>
            ) : (
              <div>
                <Label className="text-xs text-muted-foreground">API Key</Label>
                <Input
                  type="password"
                  placeholder="Enter API key"
                  value={apiKeyForProvider}
                  onChange={(e) => setProviderConfig(activeProvider, { apiKey: e.target.value })}
                  className="mt-1.5 bg-card border-border text-xs font-mono"
                />
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">Model</Label>
              {activeProvider === "bedrock" ? (
                <Input
                  value={activeModel}
                  onChange={(e) => {
                    setActiveModel(e.target.value);
                    setProviderConfig(activeProvider, { model: e.target.value });
                  }}
                  placeholder="Enter Bedrock model ID"
                  className="mt-1.5 bg-card border-border text-xs font-mono"
                />
              ) : (
                <Select value={activeModel} onValueChange={setActiveModel}>
                  <SelectTrigger className="mt-1.5 bg-card border-border min-w-0 text-xs [&>span]:truncate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border w-[min(28rem,calc(100vw-2rem))] max-h-72">
                    {PROVIDER_MODELS[activeProvider]?.map((m) => (
                      <SelectItem key={m} value={m} className="items-start py-2 pl-7 pr-3 text-sm">
                        <span className="min-w-0 whitespace-normal break-words leading-snug">
                          {getModelDisplayName(m)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
                <SelectTrigger className="mt-1.5 bg-card border-border text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {[256, 512, 1024, 2048, 4096].map((t) => <SelectItem key={t} value={String(t)}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Collapsible open={showMobileAdvanced} onOpenChange={setShowMobileAdvanced}>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Settings2 size={12} /> Advanced {showMobileAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <Textarea
                  placeholder={`Override the ${defaultPromptLabel} prompt...`}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="bg-card border-border text-xs min-h-[96px]"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">Default mode: {defaultPromptLabel}</p>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </SheetContent>
      </Sheet>

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
        datasetName={selectedConnection?.name || selectedDataset?.fileName || ""}
      />

      <ShareCard
        open={showShareCard}
        onClose={() => setShowShareCard(false)}
        query={lastQuery}
        result={finalResult}
        datasetName={selectedConnection?.name || selectedDataset?.fileName || ""}
      />
    </div>
  );
}
