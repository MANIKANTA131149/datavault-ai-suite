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
  LayoutTemplate, RefreshCw, FileJson, FileText, Code2, TrendingUp,
  MessageSquarePlus, Trash2, BarChart3, FileDown, Layout, Maximize2, Minimize2, Star, Rows3, Palette,
  Share2, Mic, Globe, Loader2, Layers, AlertTriangle,
  GripVertical, Filter, Bell, BellOff, Pin, Columns, ChevronUp,
  SlidersHorizontal, ListFilter, BarChart2, Crosshair, Flame, FunctionSquare, CheckSquare, Square,
  FlipHorizontal, Sigma, Hash, Info,
} from "lucide-react";
import { HitlPanel, HitlQuickChoices } from "@/components/HitlPanel";
import { ShareCard } from "@/components/ShareCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDatasetStore, type StoredDataset } from "@/stores/dataset-store";
import { useConnectionStore, DB_TYPE_LABELS } from "@/stores/connection-store";
import { useLLMStore, PROVIDER_MODELS, PROVIDER_LABELS, getModelDisplayName } from "@/stores/llm-store";
import { useHistoryStore } from "@/stores/history-store";
import { useAuthStore } from "@/stores/auth-store";
import { useInsightsStore } from "@/stores/insights-store";
import { usePlanStore } from "@/stores/plan-store";
import { useSettingsStore } from "@/stores/settings-store";
import { ProviderLogo } from "@/components/ProviderLogo";
import { DbTypeIcon } from "@/components/DbTypeIcon";

import { runDatabaseAgent, runLegacyAgent, type AgentStep, type ConversationContext } from "@/lib/agent";
import { parseOptionsFromText, cleanPromptText } from "@/lib/clarification-options";
import type { Provider } from "@/lib/llm-client";
import type { ColumnInfo } from "@/lib/file-parser";
import { executeDatabaseQuery, fetchDatabaseSchema, type DatabaseSchema, type DatabaseTableData } from "@/lib/db-query-client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { getApiBaseUrl } from "@/lib/api-base";
import { api } from "@/lib/api-client";
import { generatePDF } from "@/lib/pdf-report";
import html2canvas from "html2canvas";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, CartesianGrid,
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend as RechartsLegend, LabelList,
  ScatterChart, Scatter, ComposedChart, ReferenceLine,
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
  "hsl(214, 65%, 54%)", "hsl(252, 52%, 57%)", "hsl(160, 60%, 42%)",
  "hsl(38, 85%, 50%)", "hsl(0, 72%, 56%)",
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
    category: "Sales & Revenue",
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
    category: "People & HR",
    templates: [
      "How many employees are there by department?",
      "What is the average salary by role?",
      "Show headcount growth over time",
      "Which department has the highest attrition?",
      "What is the salary distribution?",
    ],
  },
  {
    category: "Finance",
    templates: [
      "What is the total expense by category?",
      "Show budget vs actual comparison",
      "What are the top cost drivers?",
      "Calculate the profit margin",
      "Show cash flow trend",
    ],
  },
  {
    category: "Operations",
    templates: [
      "What is the on-time delivery rate?",
      "Show defect rate by category",
      "What are the top issues by frequency?",
      "Calculate average resolution time",
      "Which supplier has the lowest quality score?",
    ],
  },
  {
    category: "Exploration",
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



const FAVORITE_PROMPTS_KEY = "datavault-favorite-prompts";
type ResultDensity = "comfortable" | "compact";

interface ColFormatRule {
  id: string;
  column: string;
  op: ">" | "<" | "=" | "contains" | "!=";
  value: string;
  bgClass: string;
}

function getFormatBg(rule: ColFormatRule, cellValue: string): string {
  const v = cellValue;
  const rv = rule.value;
  const num = parseFloat(v);
  const rnum = parseFloat(rv);
  switch (rule.op) {
    case ">": return Number.isFinite(num) && Number.isFinite(rnum) && num > rnum ? rule.bgClass : "";
    case "<": return Number.isFinite(num) && Number.isFinite(rnum) && num < rnum ? rule.bgClass : "";
    case "=": return v === rv ? rule.bgClass : "";
    case "!=": return v !== rv ? rule.bgClass : "";
    case "contains": return v.toLowerCase().includes(rv.toLowerCase()) ? rule.bgClass : "";
    default: return "";
  }
}

// Turns an unexpected exception thrown during a query run into a readable
// message. Real internal bugs (TypeError/ReferenceError from minified code,
// e.g. "e.filter is not a function") are opaque to users, so we surface a
// generic message while the full error + stack is logged to the console.
function formatRunError(err: any): string {
  const raw = err?.message ? String(err.message) : String(err ?? "Unknown error");
  if (err instanceof TypeError || err instanceof ReferenceError || /is not a function|undefined|null/i.test(raw)) {
    return "Something went wrong while processing this query. Please try rephrasing it or running it again. (Technical details were logged to the console.)";
  }
  return raw;
}

function computeColStats(rows: Record<string, any>[], col: string) {
  const vals = rows.map((r) => r[col]);
  const nonNull = vals.filter((v) => v !== null && v !== undefined && v !== "");
  const nums = nonNull.map((v) => parseFloat(String(v))).filter((n) => Number.isFinite(n));
  const uniq = new Set(nonNull.map((v) => String(v))).size;
  const nullPct = Math.round(((vals.length - nonNull.length) / Math.max(1, vals.length)) * 100);
  if (nums.length > 0) {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const avg = nums.reduce((s, n) => s + n, 0) / nums.length;
    return { nullPct, uniq, min, max, avg: Math.round(avg * 100) / 100, isNumeric: true };
  }
  return { nullPct, uniq, min: null, max: null, avg: null, isNumeric: false };
}

function linearRegression(data: Record<string, any>[], xKey: string, yKey: string) {
  const pts = data
    .map((d, i) => ({ x: parseFloat(String(d[xKey])) || i, y: parseFloat(String(d[yKey])) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return null;
  const n = pts.length;
  const sumX = pts.reduce((s, p) => s + p.x, 0);
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (!denom) return null;
  const m = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - m * sumX) / n;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  return { m, b, minX, maxX, y1: m * minX + b, y2: m * maxX + b };
}

function readStoredList(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

// Smart suggestion helper removed

// ─── Helpers ─────────────────────────────────────────────────────────────────
type ChartType = "bar" | "pie" | "line" | "area" | "scatter" | "dual";

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
  selectedRows?: Set<number>;
  onToggleRow?: (i: number) => void;
  onToggleAll?: () => void;
  onCellCopy?: (value: string) => void;
  onRowClick?: (row: any, index: number) => void;
  colWidths?: Record<string, number>;
  onResizeStart?: (header: string, e: React.MouseEvent) => void;
  frozenFirst?: boolean;
  formatRules?: ColFormatRule[];
  columnOrder?: string[];
}

interface ResultRowProps {
  rows: Record<string, any>[];
  headers: string[];
  gridTemplateColumns: string;
  density: ResultDensity;
  selectedRows?: Set<number>;
  onToggleRow?: (i: number) => void;
  onCellCopy?: (value: string) => void;
  onRowClick?: (row: any, index: number) => void;
  frozenFirst?: boolean;
  formatRules?: ColFormatRule[];
}

function ResultTableRow({
  index,
  style,
  ariaAttributes,
  rows,
  headers,
  gridTemplateColumns,
  density,
  selectedRows,
  onToggleRow,
  onCellCopy,
  onRowClick,
  frozenFirst,
  formatRules,
}: RowComponentProps<ResultRowProps>) {
  const row = rows[index];
  const isSelected = selectedRows?.has(index) ?? false;
  return (
    <div
      {...ariaAttributes}
      style={{ ...style, display: "grid", gridTemplateColumns }}
      className={`border-t border-border/50 group/row ${isSelected ? "bg-primary/8" : index % 2 === 0 ? "bg-background-secondary/30" : "bg-card"} hover:bg-primary/5 transition-colors`}
    >
      {onToggleRow && (
        <div className={`${density === "compact" ? "px-2 py-1.5" : "px-3 py-2"} flex items-center justify-center`}
          style={{ position: frozenFirst ? "sticky" : undefined, left: 0, zIndex: 1, background: "inherit" }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleRow(index); }}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            {isSelected ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
          </button>
        </div>
      )}
      {headers.map((header, hi) => {
        const value = String(row?.[header] ?? "");
        const fmtBg = formatRules?.reduce((acc, r) => acc || (r.column === header ? getFormatBg(r, value) : ""), "") || "";
        const isFirst = hi === 0 && frozenFirst;
        return (
          <div
            key={header}
            title={value}
            onClick={() => onCellCopy?.(value)}
            className={`${density === "compact" ? "px-2 py-1.5" : "px-3 py-2"} min-w-0 truncate text-xs text-foreground cursor-pointer hover:bg-primary/10 transition-colors ${fmtBg}`}
            style={isFirst ? { position: "sticky", left: onToggleRow ? 40 : 0, zIndex: 1, background: "inherit" } : undefined}
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
  selectedRows,
  onToggleRow,
  onToggleAll,
  onCellCopy,
  onRowClick,
  colWidths,
  onResizeStart,
  frozenFirst,
  formatRules,
  columnOrder,
}: VirtualizedResultTableProps) {
  const rowHeight = RESULT_TABLE_ROW_HEIGHT[density];
  const effectiveHeaders = columnOrder ?? headers;
  const minColWidth = density === "compact" ? 116 : 140;
  const baseColWidth = (header: string) => colWidths?.[header] ?? minColWidth;
  const colDefs = effectiveHeaders.map((h) => `${baseColWidth(h)}px`).join(" ");
  const checkboxCol = onToggleRow ? "40px " : "";
  const gridTemplateColumns = checkboxCol + colDefs;
  const totalWidth = (onToggleRow ? 40 : 0) + effectiveHeaders.reduce((s, h) => s + baseColWidth(h), 0);
  const minWidth = Math.max(420, totalWidth);
  const listHeight = Math.min(maxHeight, Math.max(rowHeight, rows.length * rowHeight));
  const allSelected = selectedRows && selectedRows.size === rows.length && rows.length > 0;

  // Aggregation footer
  const aggFooter = useMemo(() => {
    return effectiveHeaders.map((h) => {
      const nums = rows.map((r) => parseFloat(String(r[h]))).filter((n) => Number.isFinite(n));
      if (nums.length === 0) return null;
      const sum = nums.reduce((a, b) => a + b, 0);
      if (sum > 1000000) return { sum: `${(sum / 1000000).toFixed(1)}M`, count: nums.length };
      if (sum > 1000) return { sum: `${(sum / 1000).toFixed(1)}k`, count: nums.length };
      return { sum: sum.toFixed(2).replace(/\.?0+$/, ""), count: nums.length };
    });
  }, [rows, effectiveHeaders]);

  const hasAggFooter = aggFooter.some(Boolean);

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
        {/* Header */}
        <div
          className="grid border-b border-border bg-background-secondary text-xs font-medium text-muted-foreground sticky top-0 z-10"
          style={{ gridTemplateColumns }}
        >
          {onToggleAll && (
            <div className={`${density === "compact" ? "px-2 py-2" : "px-3 py-2.5"} flex items-center justify-center`}>
              <button type="button" onClick={onToggleAll} className="text-muted-foreground hover:text-primary transition-colors">
                {allSelected ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
              </button>
            </div>
          )}
          {effectiveHeaders.map((header, hi) => (
            <div
              key={header}
              className="relative flex items-center group/hdr min-w-0"
              draggable
              onDragStart={() => {/* column reorder start - handled in ResultPanel */}}
            >
              <button
                type="button"
                disabled={!onSort}
                onClick={() => onSort?.(header)}
                className={`${density === "compact" ? "px-2 py-2" : "px-3 py-2.5"} flex-1 min-w-0 text-left hover:text-foreground disabled:hover:text-muted-foreground flex items-center gap-1 truncate`}
                title={header}
              >
                <span className="truncate">{header}</span>
                {sortKey === header && (
                  sortDir === "asc" ? <ChevronUp size={10} className="shrink-0 text-primary" /> : <ChevronDown size={10} className="shrink-0 text-primary" />
                )}
              </button>
              {/* Column stats popover */}
              <ColumnStatsPopover header={header} rows={rows} density={density} />
              {/* Resize handle */}
              {onResizeStart && (
                <div
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover/hdr:opacity-100 hover:bg-primary/40 transition-opacity z-20"
                  onMouseDown={(e) => { e.preventDefault(); onResizeStart(header, e); }}
                />
              )}
            </div>
          ))}
        </div>
        {/* Rows */}
        <List<ResultRowProps>
          className="scrollbar-thin"
          defaultHeight={listHeight}
          overscanCount={8}
          rowComponent={ResultTableRow}
          rowCount={rows.length}
          rowHeight={rowHeight}
          rowProps={{ rows, headers: effectiveHeaders, gridTemplateColumns, density, selectedRows, onToggleRow, onCellCopy, onRowClick, frozenFirst, formatRules }}
          style={{ height: listHeight, width: "100%" }}
        />
        {/* Aggregation footer */}
        {hasAggFooter && (
          <div
            className="grid border-t-2 border-border bg-background-secondary/80 text-xs font-medium text-muted-foreground"
            style={{ gridTemplateColumns }}
          >
            {onToggleRow && <div className="px-2 py-1.5" />}
            {effectiveHeaders.map((header, hi) => {
              const agg = aggFooter[hi];
              return (
                <div key={header} className={`${density === "compact" ? "px-2 py-1.5" : "px-3 py-2"} min-w-0 truncate`}>
                  {agg ? (
                    <span className="text-primary/80 font-mono" title={`Sum: ${agg.sum} · Count: ${agg.count}`}>Σ {agg.sum}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
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

// ─── RowDetailPanel ───────────────────────────────────────────────────────────
function RowDetailPanel({ row, headers, rowIndex, onClose }: { row: any; headers: string[]; rowIndex: number; onClose: () => void }) {
  if (!row) return null;
  return (
    <Sheet open={!!row} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-[340px] sm:w-[420px] p-0 border-l border-border bg-background-secondary flex flex-col z-[90]">
        <SheetHeader className="px-4 py-3 border-b border-border bg-background">
          <SheetTitle className="text-sm flex items-center gap-2"><Table2 size={14} className="text-primary" /> Row {rowIndex + 1} Detail</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">{headers.length} fields</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {headers.map((h) => {
            const val = String(row[h] ?? "");
            return (
              <div key={h} className="flex flex-col gap-0.5 p-2.5 rounded-md bg-card border border-border">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{h}</span>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-foreground font-mono break-all leading-relaxed">{val || <span className="text-muted-foreground italic">null</span>}</span>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(val); toast.success("Copied"); }}
                    className="shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Copy value"
                  >
                    <Copy size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="shrink-0 border-t border-border p-3 flex gap-2">
          <button
            onClick={() => { navigator.clipboard.writeText(JSON.stringify(row, null, 2)); toast.success("Row JSON copied"); }}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-md border border-border bg-card hover:bg-background hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all"
          >
            <Copy size={12} /> Copy JSON
          </button>
          <button onClick={onClose} className="flex items-center justify-center px-3 py-2 rounded-md border border-border bg-card text-xs text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── ColumnStatsPopover ───────────────────────────────────────────────────────
function ColumnStatsPopover({ header, rows, density }: { header: string; rows: Record<string, any>[]; density: ResultDensity }) {
  const stats = useMemo(() => computeColStats(rows, header), [rows, header]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 ml-0.5 p-0.5 rounded opacity-0 group-hover/hdr:opacity-70 hover:!opacity-100 text-muted-foreground hover:text-primary transition-all"
          title="Column statistics"
        >
          <Info size={10} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-52 p-3 text-xs bg-background-secondary border border-border shadow-xl">
        <p className="font-semibold text-foreground mb-2 truncate">{header}</p>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">Null %</span><span className="font-mono text-foreground">{stats.nullPct}%</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Unique</span><span className="font-mono text-foreground">{stats.uniq.toLocaleString()}</span></div>
          {stats.isNumeric && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Min</span><span className="font-mono text-foreground">{stats.min?.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Max</span><span className="font-mono text-foreground">{stats.max?.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Avg</span><span className="font-mono text-foreground">{stats.avg?.toLocaleString()}</span></div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── FollowUpChips ────────────────────────────────────────────────────────────
function FollowUpChips({ query, result, onSelect }: { query: string; result: any; onSelect: (q: string) => void }) {
  const suggestions = useMemo(() => {
    const resultType = Array.isArray(result) ? "table" : typeof result === "object" && result?.narrative ? "narrative" : "value";
    const base = [
      `What is the trend for "${query.slice(0, 30)}"?`,
      resultType === "table" ? "Show me the top 10 rows" : "Can you explain this in more detail?",
      "Break this down by category",
      "What are the outliers in this data?",
    ];
    // Tailor based on query content
    if (/revenue|sales|profit/i.test(query)) return ["Compare this month vs last month", "Show me the top 5 by revenue", "What is the year-over-year growth?", "Break down by region"];
    if (/employee|staff|headcount/i.test(query)) return ["Which department has the most?", "Show salary distribution", "What is the average tenure?", "Who are the top earners?"];
    if (/customer|client|user/i.test(query)) return ["Who are the top customers?", "What is the churn rate?", "Show customer growth over time", "Which segment drives the most value?"];
    return base;
  }, [query, result]);

  return (
    <div className="ml-3 sm:ml-10 mt-2 mb-1 flex flex-wrap gap-1.5">
      {suggestions.slice(0, 4).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:bg-primary/10 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all duration-150 truncate max-w-[240px]"
          title={s}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

// ─── CostEstimatorBadge ───────────────────────────────────────────────────────
function CostEstimatorBadge({ input, model, provider }: { input: string; model: string; provider: string }) {
  const estimate = useMemo(() => {
    const chars = input.length;
    const tokens = Math.ceil(chars / 4) + 200; // add ~200 for system + context
    // Very rough cost estimates per 1M tokens (input)
    const COST_PER_M: Record<string, number> = {
      "gpt-4o": 5, "gpt-4o-mini": 0.15, "claude-3-5-sonnet": 3, "claude-3-haiku": 0.25,
      "gemini-1.5-flash": 0.075, "gemini-1.5-pro": 3.5, "llama3-70b-8192": 0.59,
      "amazon.nova-pro-v1:0": 0.8,
    };
    const rate = COST_PER_M[model] ?? 1;
    const cost = (tokens / 1_000_000) * rate;
    return { tokens, cost: cost < 0.001 ? "<$0.001" : `~$${cost.toFixed(4)}` };
  }, [input, model]);

  if (!input.trim()) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
      <Zap size={9} />
      ~{estimate.tokens.toLocaleString()} tokens · {estimate.cost}
    </span>
  );
}

// ─── SmartRetryBar ────────────────────────────────────────────────────────────
function SmartRetryBar({ query, onRetry }: { query: string; onRetry: (q: string) => void }) {
  const variants = [
    { label: "Simplify", q: `In simple terms: ${query}` },
    { label: "More detail", q: `Give me detailed analysis with breakdown: ${query}` },
    { label: "As table", q: `Show results as a table: ${query}` },
  ];
  return (
    <div className="ml-3 sm:ml-10 mt-1 mb-2 flex flex-wrap gap-1.5 items-center">
      <span className="text-[10px] text-muted-foreground">Retry:</span>
      {variants.map((v) => (
        <button
          key={v.label}
          type="button"
          onClick={() => onRetry(v.q)}
          className="text-xs px-2.5 py-1 rounded border border-border/60 bg-card hover:bg-background hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all"
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

// ─── NarrativeResult Component ────────────────────────────────────────────────
function NarrativeResult({
  result,
  onSubmitQuickReply
}: {
  result: { narrative: string; highlights?: { label: string; value: string }[] };
  onSubmitQuickReply?: (text: string) => void;
}) {
  const options = useMemo(() => {
    const lower = (result.narrative || "").toLowerCase();
    if (!lower.includes("suggested") && !lower.includes("follow-up") && !lower.includes("try asking")) return [];
    return parseOptionsFromText(result.narrative);
  }, [result.narrative]);
  const cleanBody = useMemo(() => cleanPromptText(result.narrative, options), [result.narrative, options]);

  return (
    <div className="ml-3 sm:ml-10 mt-1 mb-3 rounded-md border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={13} className="text-purple-400" />
        <span className="text-xs text-purple-400 font-medium">AI Analysis</span>
      </div>
      {result.highlights && result.highlights.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 mb-3">
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
    <Collapsible open={open} onOpenChange={setOpen} className="ml-3 sm:ml-10 rounded-md border border-border bg-background-secondary/45">
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

const MultiTableResult = memo(function MultiTableResult({ result, density = "compact" }: { result: any, density?: ResultDensity }) {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null;

  const keys = Object.keys(result);

  return (
    <div className="space-y-4">
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
              <div className="rounded-md border border-border bg-card/50 p-2.5 text-center text-xs text-muted-foreground">
                No records found.
              </div>
            );
          } else {
            const headers = Object.keys(val[0] || {});
            content = (
              <div className="max-h-60 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-background-secondary">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="text-left px-3 py-1.5 text-muted-foreground font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {val.map((row: any, i: number) => (
                      <tr key={i} className="border-t border-border/50">
                        {headers.map((h, j) => (
                          <td key={j} className="px-3 py-1.5 text-foreground min-w-[80px] max-w-[140px] truncate">
                            {String(row[h] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
        } else if (val && typeof val === "object") {
          if (val.result !== undefined) {
            content = (
              <div className="bg-background-secondary/35 rounded-md p-3 border border-border flex items-baseline gap-2">
                <span className="text-lg font-bold text-foreground font-mono">
                  {typeof val.result === "number" ? val.result.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(val.result)}
                </span>
              </div>
            );
          } else if (val.narrative !== undefined) {
            content = (
              <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                {String(val.narrative)}
              </div>
            );
          } else {
            const headers = Object.keys(val);
            content = (
              <div className="max-h-60 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-background-secondary">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="text-left px-3 py-1.5 text-muted-foreground font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border/50">
                      {headers.map((h, j) => (
                        <td key={j} className="px-3 py-1.5 text-foreground min-w-[80px] max-w-[140px] truncate">
                          {String(val[h] ?? "")}
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
            <div className="bg-background-secondary/35 rounded-md p-3 border border-border">
              <span className="text-xs font-mono text-foreground">{String(val ?? "")}</span>
            </div>
          );
        }

        return (
          <div key={key} className="space-y-1.5">
            <h4 className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {formattedKey}
            </h4>
            {content}
          </div>
        );
      })}
    </div>
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
  // Tier 1 — table power features
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [frozenFirst, setFrozenFirst] = useState(false);
  const [formatRules, setFormatRules] = useState<ColFormatRule[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [showFormatPanel, setShowFormatPanel] = useState(false);
  const [rowDetailData, setRowDetailData] = useState<{ row: any; index: number } | null>(null);
  const [dragColFrom, setDragColFrom] = useState<string | null>(null);
  const resizingColRef = useRef<{ header: string; startX: number; startW: number } | null>(null);
  // Tier 3 — chart power features
  const [showTrendLine, setShowTrendLine] = useState(false);
  const [dualAxisKey, setDualAxisKey] = useState("");
  const [showChartTable, setShowChartTable] = useState(false);
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
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreen]);

  // Initialize column order when rows change
  useEffect(() => {
    if (rows.length > 0) {
      const hdrs = Object.keys(rows[0] || {});
      setColumnOrder((prev) => {
        if (prev.length === hdrs.length && prev.every((h, i) => h === hdrs[i])) return prev;
        return hdrs;
      });
    }
  }, [rows]);

  // Column resize mouse handlers
  const handleResizeStart = useCallback((header: string, e: React.MouseEvent) => {
    const startW = colWidths[header] ?? 140;
    resizingColRef.current = { header, startX: e.clientX, startW };
    const onMove = (mv: MouseEvent) => {
      if (!resizingColRef.current) return;
      const delta = mv.clientX - resizingColRef.current.startX;
      const newW = Math.max(60, resizingColRef.current.startW + delta);
      setColWidths((prev) => ({ ...prev, [resizingColRef.current!.header]: newW }));
    };
    const onUp = () => {
      resizingColRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [colWidths]);

  // Multi-select helpers
  const handleToggleRow = useCallback((i: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }, []);
  const handleToggleAll = useCallback(() => {
    setSelectedRows((prev) => prev.size === rows.length ? new Set<number>() : new Set(rows.map((_, i) => i)));
  }, [rows]);

  // Cell copy
  const handleCellCopy = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    toast.success("Cell copied", { duration: 1200 });
  }, []);

  // Column drag reorder
  const handleColDragStart = (header: string) => setDragColFrom(header);
  const handleColDrop = (header: string) => {
    if (!dragColFrom || dragColFrom === header) { setDragColFrom(null); return; }
    setColumnOrder((prev) => {
      const arr = [...prev];
      const fi = arr.indexOf(dragColFrom);
      const ti = arr.indexOf(header);
      if (fi === -1 || ti === -1) return arr;
      arr.splice(fi, 1);
      arr.splice(ti, 0, dragColFrom);
      return arr;
    });
    setDragColFrom(null);
  };

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
                {(["bar", "line", "area", "pie", "scatter", "dual"] as const).map((t) => (
                  <button key={t} onClick={() => setChartType(t)} title={`${t} chart`} className={`text-xs px-2.5 py-1 rounded capitalize ${chartType === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {t}
                  </button>
                ))}
                <button onClick={() => setShowChartTable((p) => !p)} className={`text-xs px-2.5 py-1 rounded flex items-center gap-1 ${showChartTable ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`} title="Show raw data table">
                  <Table2 size={11} /> {showChartTable ? "Data on" : "Data off"}
                </button>
                {chartType !== "pie" && chartType !== "scatter" && (
                  <button onClick={() => setShowTrendLine((p) => !p)} className={`text-xs px-2.5 py-1 rounded flex items-center gap-1 ${showTrendLine ? "bg-warning/10 text-warning" : "text-muted-foreground hover:text-foreground"}`} title="Trend line">
                    <TrendingUp size={11} /> Trend
                  </button>
                )}
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
              <div className="relative">
                <select
                  value={chartSort}
                  onChange={(e) => setChartSort(e.target.value as "none" | "asc" | "desc")}
                  className="w-full h-8 appearance-none rounded-xl border border-border bg-card px-3 py-1 pr-9 text-xs text-foreground focus:border-primary/45 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                >
                  <option value="none" className="bg-popover text-foreground py-1">Original order</option>
                  <option value="asc" className="bg-popover text-foreground py-1">Sort ascending</option>
                  <option value="desc" className="bg-popover text-foreground py-1">Sort descending</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
              </div>
              <div className="relative">
                <select
                  value={String(topN)}
                  onChange={(e) => setTopN(Number(e.target.value))}
                  className="w-full h-8 appearance-none rounded-xl border border-border bg-card px-3 py-1 pr-9 text-xs text-foreground focus:border-primary/45 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                >
                  {chartTopNOptions.map((n) => (
                    <option key={n} value={String(n)} className="bg-popover text-foreground py-1">
                      {chartType === "line" || chartType === "area" ? `First ${n} rows` : `Top ${n} values`}
                    </option>
                  ))}
                  <option value="0" className="bg-popover text-foreground py-1">All rows</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
              </div>
              <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => setShowLegend((prev) => !prev)}>
                {showLegend ? "Legend on" : "Legend off"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => setShowLabels((prev) => !prev)}>
                {showLabels ? "Labels on" : "Labels off"}
              </Button>
              {chartType === "dual" && (
                <Input value={dualAxisKey} onChange={(e) => setDualAxisKey(e.target.value)} placeholder="Right Y-axis column" className="h-8 bg-card border-border text-xs" />
              )}
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
                  ) : chartType === "scatter" ? (
                    <ScatterChart margin={chartMargin}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                      <XAxis dataKey={labelKey} name={labelKey} type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => formatChartValue(v)} tickLine={false} axisLine={false} width={60} />
                      <YAxis dataKey={valueKey} name={valueKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => formatChartValue(v)} tickLine={false} axisLine={false} width={60} />
                      {showLegend && <RechartsLegend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />}
                      <RechartsTooltip formatter={(v: any) => formatChartValue(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter data={visibleChartRows} fill={chartColor} opacity={0.8} />
                    </ScatterChart>
                  ) : chartType === "dual" ? (() => {
                    const secKey = dualAxisKey || (Object.keys(visibleChartRows[0] || {}).find((k) => k !== labelKey && k !== valueKey) ?? valueKey);
                    return (
                      <ComposedChart data={visibleChartRows} margin={chartMargin}>
                        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey={labelKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} angle={rotateXAxisTicks ? -35 : 0} textAnchor={rotateXAxisTicks ? "end" : "middle"} height={rotateXAxisTicks ? 72 : 32} tickMargin={10} interval={xAxisInterval} tickFormatter={(v) => truncateChartLabel(v, 14)} />
                        <YAxis yAxisId="left" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => formatChartValue(v)} tickLine={false} axisLine={false} width={60} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => formatChartValue(v)} tickLine={false} axisLine={false} width={60} />
                        {showLegend && <RechartsLegend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />}
                        <RechartsTooltip formatter={(v: any) => formatChartValue(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Bar yAxisId="left" dataKey={valueKey} fill={chartColor} radius={[4, 4, 0, 0]} maxBarSize={28} />
                        <Line yAxisId="right" type="monotone" dataKey={secKey} stroke="hsl(38, 92%, 50%)" strokeWidth={2.5} dot={false} />
                      </ComposedChart>
                    );
                  })() : (() => {
                    const trendRows = showTrendLine ? (() => {
                      const reg = linearRegression(visibleChartRows, labelKey, valueKey);
                      if (!reg) return null;
                      return visibleChartRows.map((row, i) => ({ ...row, __trend: Math.round((reg.m * i + reg.b) * 100) / 100 }));
                    })() : null;
                    const BarWrapper = trendRows ? ComposedChart : BarChart;
                    return (
                      <BarWrapper data={trendRows ?? visibleChartRows} margin={chartMargin}>
                        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey={labelKey} label={{ value: xAxisLabel, position: "insideBottom", offset: rotateXAxisTicks ? -8 : -2, fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(value) => truncateChartLabel(value, rotateXAxisTicks ? 12 : 18)} tickLine={false} axisLine={false} angle={rotateXAxisTicks ? -35 : 0} textAnchor={rotateXAxisTicks ? "end" : "middle"} height={rotateXAxisTicks ? 72 : 32} tickMargin={10} interval={xAxisInterval} />
                        <YAxis label={{ value: yAxisLabel, angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(value) => formatChartValue(value)} tickLine={false} axisLine={false} width={60} />
                        {showLegend && <RechartsLegend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />}
                        <RechartsTooltip formatter={(value: any) => formatChartValue(value)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Bar dataKey={valueKey} fill={chartColor} radius={[6, 6, 0, 0]} maxBarSize={36}>
                          {canShowValueLabels && <LabelList dataKey={valueKey} position="top" formatter={(value: any) => formatChartValue(value)} fill="hsl(var(--muted-foreground))" fontSize={10} />}
                        </Bar>
                        {trendRows && <Line type="linear" dataKey="__trend" stroke="hsl(38, 92%, 50%)" strokeDasharray="5 3" strokeWidth={2} dot={false} name="Trend" />}
                      </BarWrapper>
                    );
                  })()}
                </ResponsiveContainer>
              </div>
            </div>
            {chartNotes && <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{chartNotes}</p>}
            {showChartTable && rows.length > 0 && (
              <div className="mt-3 max-h-48 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-background-secondary sticky top-0">
                    <tr>{Object.keys(rows[0] || {}).map((k) => <th key={k} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{k}</th>)}</tr>
                  </thead>
                  <tbody>
                    {visibleChartRows.map((row: any, i: number) => (
                      <tr key={i} className="border-t border-border/50">
                        {Object.keys(rows[0] || {}).map((h) => (
                          <td key={h} className="px-3 py-1.5 text-foreground max-w-[120px] truncate">{String(row[h] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

        {isMultiTable && (
          <MultiTableResult result={result} density={density} />
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            {/* Table toolbar */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative flex-1 min-w-[120px]">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={resultSearch} onChange={(e) => setResultSearch(e.target.value)} placeholder="Search rows..." className="h-8 bg-card border-border pl-8 text-xs" />
              </div>
              <Button variant="outline" size="sm" className="h-8 border-border text-xs px-2" onClick={() => setDensity((prev) => prev === "compact" ? "comfortable" : "compact")} title="Toggle density">
                <Rows3 size={12} />
              </Button>
              <Button variant="outline" size="sm" className={`h-8 border-border text-xs px-2 ${frozenFirst ? "bg-primary/10 text-primary border-primary/30" : ""}`} onClick={() => setFrozenFirst((p) => !p)} title="Freeze first column">
                <Pin size={12} />
              </Button>
              <Button variant="outline" size="sm" className={`h-8 border-border text-xs px-2 ${showFormatPanel ? "bg-primary/10 text-primary border-primary/30" : ""}`} onClick={() => setShowFormatPanel((p) => !p)} title="Conditional formatting">
                <Flame size={12} />
              </Button>
              {selectedRows.size > 0 && (
                <Button variant="outline" size="sm" className="h-8 border-border text-xs" onClick={() => { const sel = displayedRows.filter((_, i) => selectedRows.has(i)); copyRows(sel); }}>
                  <Copy size={11} className="mr-1" /> Copy {selectedRows.size}
                </Button>
              )}
            </div>

            {/* Conditional formatting panel */}
            {showFormatPanel && (
              <div className="rounded-md border border-border bg-card/60 p-3 space-y-2">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5"><Flame size={11} className="text-warning" /> Conditional Formatting</p>
                {formatRules.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-1.5 flex-wrap">
                    <select value={rule.column} onChange={(e) => setFormatRules((r) => r.map((x) => x.id === rule.id ? { ...x, column: e.target.value } : x))} className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground">
                      {(columnOrder.length ? columnOrder : Object.keys(rows[0] || {})).map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <select value={rule.op} onChange={(e) => setFormatRules((r) => r.map((x) => x.id === rule.id ? { ...x, op: e.target.value as any } : x))} className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground w-24">
                      {([">", "<", "=", "!=", "contains"] as const).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <Input value={rule.value} onChange={(e) => setFormatRules((r) => r.map((x) => x.id === rule.id ? { ...x, value: e.target.value } : x))} className="h-7 w-24 bg-background border-border text-xs" placeholder="value" />
                    <select value={rule.bgClass} onChange={(e) => setFormatRules((r) => r.map((x) => x.id === rule.id ? { ...x, bgClass: e.target.value } : x))} className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground">
                      <option value="bg-red-500/20">Red</option>
                      <option value="bg-green-500/20">Green</option>
                      <option value="bg-yellow-500/20">Yellow</option>
                      <option value="bg-blue-500/20">Blue</option>
                      <option value="bg-orange-500/20">Orange</option>
                    </select>
                    <button onClick={() => setFormatRules((r) => r.filter((x) => x.id !== rule.id))} className="h-7 w-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-destructive transition-colors"><X size={12} /></button>
                  </div>
                ))}
                <button
                  onClick={() => setFormatRules((r) => [...r, { id: Math.random().toString(36).slice(2), column: Object.keys(rows[0] || {})[0] || "", op: ">", value: "0", bgClass: "bg-green-500/20" }])}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  + Add rule
                </button>
              </div>
            )}

            {/* Table */}
            <VirtualizedResultTable
              rows={displayedRows}
              headers={Object.keys(rows[0] || {})}
              density={density}
              maxHeight={fullscreen ? 560 : 400}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              selectedRows={selectedRows}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onCellCopy={handleCellCopy}
              onRowClick={(row, index) => setRowDetailData({ row, index })}
              colWidths={colWidths}
              onResizeStart={handleResizeStart}
              frozenFirst={frozenFirst}
              formatRules={formatRules}
              columnOrder={columnOrder.length ? columnOrder : undefined}
            />

            {/* Status bar */}
            <div className="flex items-center gap-3 px-1 text-[10px] text-muted-foreground border-t border-border/40 pt-1">
              <span className="flex items-center gap-1"><Hash size={9} /> {displayedRows.length.toLocaleString()} rows{resultSearch ? ` (filtered from ${rows.length.toLocaleString()})` : ""}</span>
              {selectedRows.size > 0 && <span className="flex items-center gap-1 text-primary"><CheckSquare size={9} /> {selectedRows.size} selected</span>}
              {(() => {
                const numericCols = (columnOrder.length ? columnOrder : Object.keys(rows[0] || {})).filter((h) => {
                  const sample = rows.slice(0, 5).map((r) => parseFloat(String(r[h]))).filter((n) => Number.isFinite(n));
                  return sample.length > 0;
                });
                if (!numericCols.length) return null;
                const col = numericCols[0];
                const sum = displayedRows.reduce((s, r) => s + (parseFloat(String(r[col])) || 0), 0);
                return <span className="flex items-center gap-1"><Sigma size={9} /> {col}: {sum > 1e6 ? `${(sum / 1e6).toFixed(1)}M` : sum > 1e3 ? `${(sum / 1e3).toFixed(1)}k` : sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>;
              })()}
            </div>
          </div>
        )}

        {/* Row detail slide-in panel */}
        {rowDetailData && (
          <RowDetailPanel
            row={rowDetailData.row}
            headers={columnOrder.length ? columnOrder : Object.keys(rows[0] || {})}
            rowIndex={rowDetailData.index}
            onClose={() => setRowDetailData(null)}
          />
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
          {rows.length > 0 && (
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
        <div className="mx-auto flex min-h-[calc(100dvh-1rem)] w-full max-w-[96rem] flex-col overflow-hidden rounded-[24px] border border-border/55 bg-background-secondary shadow-[0_32px_64px_-24px_hsl(var(--foreground)/0.22)] sm:min-h-[calc(100dvh-2rem)] lg:min-h-[calc(100dvh-3rem)]">
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
  onOpenDetails?: () => void;
}

const InlineFinalResult = memo(function InlineFinalResult({
  result,
  onSubmitQuickReply,
  onOpenDetails,
}: InlineFinalResultProps) {
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
  const isEmptyArray = isArray && rows.length === 0;
  const isEmptyObject = !isArray && !isSingleValue && !isPrimitiveValue && !isNarrative && result && typeof result === "object" && Object.keys(result).length === 0;
  const isBlankString = typeof result === "string" && !result.trim();
  const inlineChartRows = useMemo(() => chartRows.slice(0, Math.min(DEFAULT_CHART_ROWS, CHART_RENDER_LIMIT)), [chartRows]);
  const inlinePieChartRows = useMemo(
    () => buildPieChartRows(inlineChartRows, labelKey, valueKey),
    [inlineChartRows, labelKey, valueKey]
  );
  const inlineChartLimited = chartRows.length > inlineChartRows.length;

  const inlineLongestLabel = useMemo(
    () => inlineChartRows.reduce((max, row) => Math.max(max, String(row?.[labelKey] ?? "").length), 0),
    [inlineChartRows, labelKey]
  );
  const inlineRotateX = inlineChartRows.length > 6 || inlineLongestLabel > 10;
  const inlineXInterval = useMemo(() => {
    if (chartType === "pie") return 0;
    if (inlineChartRows.length > 15) return Math.ceil(inlineChartRows.length / 5) - 1;
    if (inlineChartRows.length > 8) return 1;
    return 0;
  }, [chartType, inlineChartRows.length]);

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
    return <NarrativeResult result={result} onSubmitQuickReply={onSubmitQuickReply} />;
  }

  const hasDetails = isArray && rows.length > 0;
  const showDetailsButton = onOpenDetails && (isChartable || hasDetails);

  return (
    <div className="ml-3 sm:ml-10 mt-1 mb-3 min-w-0 overflow-hidden rounded-md border border-border bg-card p-3 space-y-3">
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
                  <XAxis
                    dataKey={labelKey}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    tickFormatter={(value) => truncateChartLabel(value, inlineRotateX ? 8 : 12)}
                    interval={inlineXInterval}
                    angle={inlineRotateX ? -30 : 0}
                    textAnchor={inlineRotateX ? "end" : "middle"}
                    height={inlineRotateX ? 40 : 24}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    tickFormatter={(value) => formatChartValue(value)}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
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
                  <XAxis
                    dataKey={labelKey}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    tickFormatter={(value) => truncateChartLabel(value, inlineRotateX ? 8 : 12)}
                    interval={inlineXInterval}
                    angle={inlineRotateX ? -30 : 0}
                    textAnchor={inlineRotateX ? "end" : "middle"}
                    height={inlineRotateX ? 40 : 24}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    tickFormatter={(value) => formatChartValue(value)}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Area type="monotone" dataKey={valueKey} stroke="hsl(var(--primary))" fill={`url(#${areaGradientId})`} strokeWidth={2} dot={false} />
                </AreaChart>
              ) : (
                <BarChart data={inlineChartRows}>
                  <XAxis
                    dataKey={labelKey}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    tickFormatter={(value) => truncateChartLabel(value, inlineRotateX ? 8 : 12)}
                    interval={inlineXInterval}
                    angle={inlineRotateX ? -30 : 0}
                    textAnchor={inlineRotateX ? "end" : "middle"}
                    height={inlineRotateX ? 40 : 24}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    tickFormatter={(value) => formatChartValue(value)}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
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

      {isMultiTable && (
        <MultiTableResult result={result} density="compact" />
      )}

      {rows.length > 0 && (
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
                {(rows.length > 200 ? [] : rows).map((row: any, i: number) => {
                  const headers = Object.keys(rows[0] || {});
                  return (
                    <tr key={i} className="border-t border-border/50">
                      {headers.map((h, j) => (
                        <td key={j} className="px-3 py-1.5 text-foreground min-w-[80px] max-w-[140px] truncate">
                          {String(row[h] ?? "")}
                        </td>
                      ))}
                    </tr>
                  );
                })}
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
      {!isArray && !isSingleValue && typeof result === "object" && result !== null && !isNarrative && !isMultiTable && rows.length === 0 && (
        <pre className="max-h-52 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-md border border-border bg-background-secondary p-2 text-xs font-mono text-foreground scrollbar-thin [overflow-wrap:anywhere]">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      {showDetailsButton && (
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenDetails}
            className="h-7 text-[11px] border-border flex items-center gap-1 hover:text-primary transition-all duration-200"
          >
            <PanelRightOpen size={12} />
            <span>Result details & controls</span>
          </Button>
        </div>
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

// ─── SchemaExplorer ───────────────────────────────────────────────────────────
function SchemaExplorer({ schema, sheetData, isDbMode }: {
  schema: DatabaseSchema | null;
  sheetData?: { columns: any[]; rows: any[] } | null;
  isDbMode: boolean;
}) {
  const [search, setSearch] = useState("");
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const q = search.toLowerCase();

  if (isDbMode) {
    const tables = (schema?.tables ?? []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q)));
    return (
      <div className="flex flex-col h-full">
        <div className="relative mb-2">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tables & columns..." className="w-full h-7 rounded-md border border-border bg-card pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
        <div className="flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
          {tables.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tables found</p>}
          {tables.map((table) => (
            <div key={table.name}>
              <button
                type="button"
                onClick={() => setExpandedTable((p) => p === table.name ? null : table.name)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-card text-left transition-colors"
              >
                <Database size={11} className="text-primary shrink-0" />
                <span className="text-xs font-medium text-foreground truncate flex-1">{table.name.split(".").pop()}</span>
                {table.rowCount != null && <span className="text-[10px] text-muted-foreground shrink-0">{table.rowCount.toLocaleString()}r</span>}
                {expandedTable === table.name ? <ChevronDown size={11} className="text-muted-foreground shrink-0" /> : <ChevronRight size={11} className="text-muted-foreground shrink-0" />}
              </button>
              {expandedTable === table.name && table.columns.length > 0 && (
                <div className="ml-4 space-y-px pb-1">
                  {table.columns.filter((c) => !q || c.name.toLowerCase().includes(q)).map((col) => (
                    <div key={col.name} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-card/60 cursor-pointer" onClick={() => navigator.clipboard.writeText(col.name).then(() => toast.success(`Copied "${col.name}"`))}>
                      <span className={`text-[10px] px-1 py-0.5 rounded font-mono shrink-0 ${col.dtype === "number" ? "bg-blue-500/10 text-blue-400" : col.dtype === "date" ? "bg-purple-500/10 text-purple-400" : "bg-muted/50 text-muted-foreground"}`}>{col.dtype?.slice(0, 4) ?? "str"}</span>
                      <span className="text-xs text-foreground truncate">{col.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!sheetData) return <p className="text-xs text-muted-foreground text-center py-4">No dataset loaded</p>;
  const cols = sheetData.columns.filter((c: any) => !q || c.name.toLowerCase().includes(q));
  return (
    <div className="flex flex-col h-full">
      <div className="relative mb-2">
        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search columns..." className="w-full h-7 rounded-md border border-border bg-card pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
      </div>
      <p className="text-[10px] text-muted-foreground mb-2">{sheetData.rows.length.toLocaleString()} rows · {sheetData.columns.length} columns</p>
      <div className="flex-1 overflow-y-auto space-y-px scrollbar-thin">
        {cols.map((col: any) => {
          const sample = sheetData.rows.slice(0, 3).map((r: any) => String(r[col.name] ?? "")).filter(Boolean).join(", ");
          return (
            <div key={col.name} className="px-2 py-1.5 rounded hover:bg-card cursor-pointer transition-colors" onClick={() => navigator.clipboard.writeText(col.name).then(() => toast.success(`Copied "${col.name}"`))}>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] px-1 py-0.5 rounded font-mono shrink-0 ${col.dtype === "number" ? "bg-blue-500/10 text-blue-400" : col.dtype === "date" ? "bg-purple-500/10 text-purple-400" : col.dtype === "boolean" ? "bg-amber-500/10 text-amber-400" : "bg-muted/50 text-muted-foreground"}`}>{col.dtype}</span>
                <span className="text-xs font-medium text-foreground truncate">{col.name}</span>
              </div>
              {sample && <p className="text-[10px] text-muted-foreground truncate mt-0.5 ml-5">{sample}</p>}
            </div>
          );
        })}
      </div>
    </div>
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
  const groupedTables = useMemo(() => buildDatabaseTableGroups(tables), [tables]);

  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={tables.length === 0}
        className={cn(
          "w-full appearance-none rounded-xl border border-border/80 bg-card px-3 py-2 pr-9 text-xs text-foreground focus:border-primary/45 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60",
          triggerClassName
        )}
      >
        <option value="" disabled className="bg-popover text-muted-foreground">
          {placeholder}
        </option>
        {groupedTables.map((group) => (
          <optgroup key={group.key} label={`${group.label} (${group.tables.length})`} className="bg-popover text-foreground font-semibold">
            {group.tables.map((table) => {
              const parts = getDatabaseTableNameParts(table.name);
              const stats = table.rowCount != null 
                ? `${table.rowCount.toLocaleString()} rows` 
                : table.columns.length > 0 
                  ? `${table.columns.length} cols` 
                  : "";
              const suffix = [table.kind?.toUpperCase(), stats].filter(Boolean).join(" - ");
              const label = suffix ? `${parts.shortName} (${suffix})` : parts.shortName;
              return (
                <option key={table.name} value={table.name} className="bg-popover text-foreground py-1">
                  {label}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
    </div>
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
  const navigate = useNavigate();
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
  const { user } = useAuthStore();
  const isFreeUser = user?.planTier === "free";
  const isFreeNovaModel = (activeProvider === "bedrock" || activeProvider === "querify") && ["amazon.nova-pro-v1:0"].includes(activeModel);

  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 1280px)");
    const onChange = (e: MediaQueryListEvent) => {
      setIsLargeScreen(e.matches);
    };
    mql.addEventListener("change", onChange);
    setIsLargeScreen(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const [dailyTokens, setDailyTokens] = useState<{
    tokensUsed: number;
    limit: number;
    queriesUsed: number;
    queryLimit: number;
    percentage: number;
  } | null>(null);

  const dynamicGreeting = useMemo(() => {
    const name = user?.name ? user.name.split(" ")[0] : "there";
    const hrs = new Date().getHours();
    
    let templates: string[] = [];
    if (hrs >= 5 && hrs < 12) {
      templates = [
        "Hello {name}, Good Morning. What shall we explore today?",
        "Good morning, {name}. Ready to dive into your database?",
        "Morning, {name}! Let's uncover some fresh insights today.",
        "Hello {name}, Good Morning. How can I assist with your workspace data?",
        "Good morning, {name}. Let's make sense of your spreadsheets.",
        "Hello {name}! Hope your morning is going great. What are we querying today?",
        "Good morning, {name}. Ready to build some stunning charts?",
        "Morning, {name}! Let's turn raw rows into clear decisions.",
        "Hello {name}, Good Morning. What's on your agenda today?",
        "Good morning, {name}. Let's run some queries.",
        "Morning, {name}! Ready to look at your data trends?",
        "Hello {name}, Good Morning. Let's discover some patterns.",
        "Good morning, {name}. Let's kickstart your data analysis.",
        "Hello {name}! Let's make today productive. What data are we inspecting?",
        "Good morning, {name}. Ready to query your databases?",
        "Morning, {name}! What insights are we hunting for today?",
        "Hello {name}, Good Morning. Let's look at your key metrics.",
        "Good morning, {name}. How can I make your data work for you today?"
      ];
    } else if (hrs >= 12 && hrs < 17) {
      templates = [
        "Hello {name}, Good Afternoon. What are you working on?",
        "Good afternoon, {name}. Ready to run some queries?",
        "Hello {name}, Good Afternoon. Let's dive back into your data.",
        "Good afternoon, {name}. Need help visualizing some metrics?",
        "Hello {name}! Hope your day is going well. What shall we query next?",
        "Good afternoon, {name}. Let's make sense of those tables.",
        "Afternoon, {name}! Ready for some quick analysis?",
        "Hello {name}, Good Afternoon. What insights can I pull for you today?",
        "Good afternoon, {name}. Let's analyze your dataset.",
        "Hello {name}! Ready to write some SQL or analyze sheets?",
        "Good afternoon, {name}. Let's uncover some trends together.",
        "Afternoon, {name}! What data puzzle are we solving next?",
        "Hello {name}, Good Afternoon. How can I help you in the workspace?",
        "Good afternoon, {name}. Ready to build a new dashboard view?",
        "Hello {name}! Let's keep the momentum going. What are we querying?",
        "Good afternoon, {name}. Ready to check your latest table schemas?"
      ];
    } else {
      templates = [
        "Hello {name}, Good Evening. What would you like to explore tonight?",
        "Good evening, {name}. Let's wrap up today's analysis.",
        "Hello {name}, Good Evening. Ready for some late-day insights?",
        "Good evening, {name}. How has your data journey been today?",
        "Hello {name}, Good Evening. What shall we query before we sign off?",
        "Evening, {name}! Let's find some final trends for the day.",
        "Hello {name}, Good Evening. Ready to inspect some database rows?",
        "Good evening, {name}. Let's build a chart to finish the day.",
        "Hello {name}, Good Evening. What can I help you analyze tonight?",
        "Good evening, {name}. Ready to query your workbook sheets?",
        "Hello {name}, Good Evening. Need a quick visualization or report?",
        "Evening, {name}! What database tables are we looking at tonight?",
        "Hello {name}, Good Evening. Let's make your evening productive.",
        "Good evening, {name}. Ready to extract some valuable metrics?",
        "Hello {name}, Good Evening. How can I assist you with your queries tonight?",
        "Good evening, {name}. Let's double check those trends.",
        "Hello {name}, Good Evening. What's the plan for tonight's data session?",
        "Good evening, {name}. Let's run one last query before the night ends."
      ];
    }

    const randomIndex = Math.floor(Math.random() * templates.length);
    const chosenTemplate = templates[randomIndex] || "Hello {name}, Good Evening";
    return chosenTemplate.replace(/{name}/g, name);
  }, [user?.name]);

  const fetchDailyTokens = useCallback(async () => {
    if (!isFreeUser) return;
    try {
      const token = useAuthStore.getState().token;
      if (!token) return;
      const res = await fetch(`${getApiBaseUrl()}/llm/token-usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDailyTokens(data);
      }
    } catch (e) {
      console.error("Failed to fetch daily token usage:", e);
    }
  }, [isFreeUser]);

  useEffect(() => {
    fetchDailyTokens();
  }, [fetchDailyTokens]);

  // Set default provider for free users if not already configured on mount/auth load
  useEffect(() => {
    if (isFreeUser && activeProvider !== "querify") {
      const hasConfiguredOther = Object.keys(providerConfigs).some(
        (key) => providerConfigs[key as Provider]?.apiKey
      );
      if (!hasConfiguredOther) {
        setActiveProvider("querify");
        setActiveModel("amazon.nova-pro-v1:0");
      }
    }
    // Only run this initialization on mount or when plan tier changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFreeUser, setActiveProvider, setActiveModel]);

  const {
    selectedDatasetId,
    selectedSheet,
    selectedTable,
    setSelectedDatasetId,
    setSelectedSheet,
    setSelectedTable,
  } = useSettingsStore();

  useEffect(() => {
    const urlDataset = searchParams.get("dataset");
    if (urlDataset && urlDataset !== selectedDatasetId) {
      setSelectedDatasetId(urlDataset);
    }
  }, [searchParams, selectedDatasetId, setSelectedDatasetId]);
  const [dbSchema, setDbSchema] = useState<DatabaseSchema | null>(null);
  const [loadingDbSchema, setLoadingDbSchema] = useState(false);

  // Isolated Chatbot Deployment States
  const [activeTab, setActiveTab] = useState<"workspace" | "deployments">("workspace");
  const [deployments, setDeployments] = useState<any[]>([]);
  const [loadingDeployments, setLoadingDeployments] = useState(false);
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [deployName, setDeployName] = useState("");
  const [deployDescription, setDeployDescription] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployedInfo, setDeployedInfo] = useState<any>(null);
  const [deploymentToRedeploy, setDeploymentToRedeploy] = useState<any>(null);
  const [redeploying, setRedeploying] = useState(false);

  const fetchDeployments = useCallback(async () => {
    setLoadingDeployments(true);
    try {
      const data = await api.get<{ deployments: any[] }>("/deployments");
      setDeployments(data.deployments || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load deployments");
    } finally {
      setLoadingDeployments(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "deployments") {
      fetchDeployments();
    }
  }, [activeTab, fetchDeployments]);

  const handleCreateDeployment = async () => {
    if (!deployName.trim()) {
      toast.error("Please provide a name for the deployment");
      return;
    }
    setIsDeploying(true);
    try {
      const snapshot = {
        sourceType: isDbConnection ? "connection" : "dataset",
        selectedDatasetId,
        selectedSheet,
        selectedTable,
        activeProvider,
        activeModel,
        providerConfigs: {
          [activeProvider]: {
            ...providerConfigs[activeProvider],
            apiKey: getApiKey(activeProvider) || providerConfigs[activeProvider]?.apiKey,
          },
        },
        temperature,
        maxTokens,
        systemPrompt,
        connectionSnapshot: selectedConnection ? {
          _id: selectedConnection._id,
          name: selectedConnection.name,
          dbType: selectedConnection.dbType,
        } : undefined,
        databaseTables: dbSchema?.tables || [],
        datasetSnapshot: selectedDataset ? {
          id: selectedDataset.id,
          fileName: selectedDataset.fileName,
          fileType: selectedDataset.fileType,
        } : undefined,
      };

      const data = await api.post<{ deployment: { _id: string } }>(
        "/deployments",
        {
          name: deployName.trim(),
          description: deployDescription.trim(),
          snapshot,
        }
      );
      setDeployedInfo({ deployId: data.deployment?._id });
      toast.success("Chatbot deployed successfully!");
      if (activeTab === "deployments") {
        fetchDeployments();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to deploy chatbot");
    } finally {
      setIsDeploying(false);
    }
  };

  const handleRedeployDeployment = async (dep: any) => {
    setRedeploying(true);
    try {
      const snapshot = {
        sourceType: isDbConnection ? "connection" : "dataset",
        selectedDatasetId,
        selectedSheet,
        selectedTable,
        activeProvider,
        activeModel,
        providerConfigs: {
          [activeProvider]: {
            ...providerConfigs[activeProvider],
            apiKey: getApiKey(activeProvider) || providerConfigs[activeProvider]?.apiKey,
          },
        },
        temperature,
        maxTokens,
        systemPrompt,
        connectionSnapshot: selectedConnection ? {
          _id: selectedConnection._id,
          name: selectedConnection.name,
          dbType: selectedConnection.dbType,
        } : undefined,
        databaseTables: dbSchema?.tables || [],
        datasetSnapshot: selectedDataset ? {
          id: selectedDataset.id,
          fileName: selectedDataset.fileName,
          fileType: selectedDataset.fileType,
        } : undefined,
      };

      await api.put(`/deployments/${dep._id}`, {
        name: dep.name,
        description: dep.description,
        snapshot,
      });
      toast.success(`Chatbot "${dep.name}" redeployed with current settings!`);
      fetchDeployments();
    } catch (err: any) {
      toast.error(err.message || "Failed to redeploy chatbot");
    } finally {
      setRedeploying(false);
      setDeploymentToRedeploy(null);
    }
  };

  const handleDeleteDeployment = async (id: string) => {
    if (!confirm("Are you sure you want to delete this deployed chatbot? This link will stop working for all users.")) return;
    try {
      await api.delete(`/deployments/${id}`);
      toast.success("Deployment deleted");
      fetchDeployments();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete deployment");
    }
  };

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
      const currentTable = useSettingsStore.getState().selectedTable;
      const nextTable = (currentTable && response.schema.tables.some((table) => table.name === currentTable))
        ? currentTable
        : (response.schema.tables[0]?.name || "");
      setSelectedTable(nextTable);
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

  // New enterprise state
  const [showSchemaExplorer, setShowSchemaExplorer] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const prevRunningRef = useRef(false);

  // Browser notification when query completes
  useEffect(() => {
    if (prevRunningRef.current && !isRunning && finalResult !== null) {
      if (notifEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("DataVault — Query Complete", {
          body: lastQuery.slice(0, 80),
          icon: "/favicon.ico",
        });
      }
    }
    prevRunningRef.current = isRunning;
  }, [isRunning, finalResult, notifEnabled, lastQuery]);

  const handleEnableNotifications = async () => {
    if (typeof Notification === "undefined") { toast.error("Notifications not supported"); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") { setNotifEnabled(true); toast.success("Notifications enabled"); }
    else toast.error("Notification permission denied");
  };



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



  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
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

    const isFreeNovaModelLocal = isFreeNovaModel && isFreeUser;

    // Check daily limits first
    if (isFreeNovaModelLocal && dailyTokens) {
      const tokensExhausted = dailyTokens.tokensUsed >= dailyTokens.limit;
      const queriesExhausted = dailyTokens.queriesUsed >= dailyTokens.queryLimit;
      if (tokensExhausted || queriesExhausted) {
        const limitMsg = tokensExhausted
          ? "daily free Bedrock token limit (200k tokens)"
          : "daily free Bedrock query limit (25 queries)";
        toast.error(`Your ${limitMsg} has been exhausted. Please upgrade your plan for higher limits.`, {
          action: {
            label: "View Plans",
            onClick: () => navigate("/app/pricing"),
          }
        });
        return;
      }
    }

    const apiKey = getApiKey(activeProvider);
    const activeProviderConfig = providerConfigs[activeProvider] || {};
    const providerOptions = activeProvider === "bedrock"
      ? {
        secretAccessKey: activeProviderConfig.secretAccessKey || "",
        region: activeProviderConfig.region || "us-east-1",
      }
      : {};

    if (!apiKey && activeProvider !== "ollama" && activeProvider !== "querify" && !isFreeNovaModelLocal) {
      const message = activeProvider === "bedrock"
        ? "AWS Bedrock access key is missing. Add it in Settings or paste it in the left provider fields."
        : `${PROVIDER_LABELS[activeProvider]} API key is missing. Add it in Settings or paste it in the left API key field.`;
      setApiWarning(message);
      toast.error(message);
      return;
    }
    if (activeProvider === "bedrock" && !activeProviderConfig.secretAccessKey && !isFreeNovaModelLocal) {
      const message = "AWS Bedrock secret access key is missing. Add it in Settings or paste it in the left provider fields.";
      setApiWarning(message);
      toast.error(message);
      return;
    }

    const actualApiKey = isFreeNovaModelLocal ? (apiKey || "free-bedrock-token") : apiKey;
    const actualProviderOptions = isFreeNovaModelLocal ? {
      secretAccessKey: activeProviderConfig.secretAccessKey || "free-bedrock-secret",
      region: activeProviderConfig.region || "us-east-1",
    } : providerOptions;

    setIsRunning(true);
    cancelRequestedRef.current = false;

    if (!isFreeNovaModelLocal) {
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
          narrative: `**Connected to ${selectedConnection.name}** (${DB_TYPE_LABELS[selectedConnection.dbType]})\n\nYour question: "${question}"\n\nThe database connection is configured and ready. In the next release, this will execute real SQL queries against your ${DB_TYPE_LABELS[selectedConnection.dbType]} database.\n\n**Connection Details:**\n- Type: ${DB_TYPE_LABELS[selectedConnection.dbType]}\n- Host: ${selectedConnection.config.host || selectedConnection.config.url || selectedConnection.config.account || "configured"}\n- Database: ${selectedConnection.config.database || selectedConnection.config.projectId || "configured"}\n- Status: ${selectedConnection.status}`,
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
        question, workbookSheets, selectedSheet, activeProvider, activeModel, actualApiKey, temperature, maxTokens,
        systemPrompt || undefined, conversationContext, actualProviderOptions, hitlController
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
      console.error("Query run failed:", err);
      const message = formatRunError(err);
      toast.error(message);
      setLastFailedQuery(question);
      setMessages((prev) => [...prev, { role: "agent", content: message, steps: [] }]);
    } finally {
      setIsRunning(false);
      fetchDailyTokens();
    }
  };

  const handleSend = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? input).trim();
    if (!question || isRunning) return;
    if (!selectedDatasetId) { toast.error("Select a data source first"); return; }

    const isFreeNovaModelLocal = isFreeNovaModel && isFreeUser;

    // Check daily limits first
    if (isFreeNovaModelLocal && dailyTokens) {
      const tokensExhausted = dailyTokens.tokensUsed >= dailyTokens.limit;
      const queriesExhausted = dailyTokens.queriesUsed >= dailyTokens.queryLimit;
      if (tokensExhausted || queriesExhausted) {
        const limitMsg = tokensExhausted
          ? "daily free Bedrock token limit (200k tokens)"
          : "daily free Bedrock query limit (25 queries)";
        toast.error(`Your ${limitMsg} has been exhausted. Please upgrade your plan for higher limits.`, {
          action: {
            label: "View Plans",
            onClick: () => navigate("/app/pricing"),
          }
        });
        return;
      }
    }

    const apiKey = getApiKey(activeProvider);
    const activeProviderConfig = providerConfigs[activeProvider] || {};
    const providerOptions = activeProvider === "bedrock"
      ? {
        secretAccessKey: activeProviderConfig.secretAccessKey || "",
        region: activeProviderConfig.region || "us-east-1",
      }
      : {};

    if (!apiKey && activeProvider !== "ollama" && activeProvider !== "querify" && !isFreeNovaModelLocal) {
      const message = activeProvider === "bedrock"
        ? "AWS Bedrock access key is missing. Add it in Settings or paste it in the left provider fields."
        : `${PROVIDER_LABELS[activeProvider]} API key is missing. Add it in Settings or paste it in the left API key field.`;
      setApiWarning(message);
      toast.error(message);
      return;
    }
    if (activeProvider === "bedrock" && !activeProviderConfig.secretAccessKey && !isFreeNovaModelLocal) {
      const message = "AWS Bedrock secret access key is missing. Add it in Settings or paste it in the left provider fields.";
      setApiWarning(message);
      toast.error(message);
      return;
    }

    const actualApiKey = isFreeNovaModelLocal ? (apiKey || "free-bedrock-token") : apiKey;
    const actualProviderOptions = isFreeNovaModelLocal ? {
      secretAccessKey: activeProviderConfig.secretAccessKey || "free-bedrock-secret",
      region: activeProviderConfig.region || "us-east-1",
    } : providerOptions;

    setIsRunning(true);
    cancelRequestedRef.current = false;

    if (!isFreeNovaModelLocal) {
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
        actualApiKey,
        temperature,
        maxTokens,
        systemPrompt || undefined,
        conversationContext,
        actualProviderOptions,
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
        actualApiKey,
        temperature,
        maxTokens,
        systemPrompt || undefined,
        conversationContext,
        actualProviderOptions,
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
      console.error("Query run failed:", err);
      const message = formatRunError(err);
      toast.error(message);
      setLastFailedQuery(question);
      setMessages((prev) => [...prev, { role: "agent", content: message, steps: [] }]);
    } finally {
      setIsRunning(false);
      setHitlState(null);
      fetchDailyTokens();
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

    // Suggest matching column names
    const colMatch = activeColumns.find((c) => c.toLowerCase().startsWith(lowercaseInput));
    if (colMatch) {
      return colMatch.slice(input.length);
    }

    return "";
  }, [input, activeColumns]);

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
    <div className="relative flex h-[calc(100dvh-3.5rem-4.5rem-env(safe-area-inset-bottom))] min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.08),_transparent_34%)] md:h-[calc(100dvh-3.5rem)]">
      {/* Top switcher/actions bar */}
      <div className="shrink-0 border-b border-border bg-background-secondary/85 backdrop-blur-md px-4 py-2.5 flex items-center justify-between z-40 gap-4">
        <div className="flex items-center gap-2">
          <Layers className="text-primary h-4 w-4" />
          <span className="font-semibold text-sm text-foreground tracking-tight hidden sm:inline-block">Query Control Room</span>
        </div>

        {/* HSL Tabs Switcher */}
        <div className="relative flex items-center rounded-lg border border-border bg-card p-0.5 sm:p-1">
          <button
            type="button"
            onClick={() => setActiveTab("workspace")}
            className={cn(
              "relative px-2 sm:px-3 py-0.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-colors duration-200 z-10",
              activeTab === "workspace" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {activeTab === "workspace" && (
              <motion.div
                layoutId="activeTabPill"
                className="absolute inset-0 bg-primary rounded shadow -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="hidden sm:inline">Chatbot </span>Workspace
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("deployments")}
            className={cn(
              "relative px-2 sm:px-3 py-0.5 sm:py-1 rounded text-[11px] sm:text-xs font-medium transition-colors duration-200 z-10",
              activeTab === "deployments" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {activeTab === "deployments" && (
              <motion.div
                layoutId="activeTabPill"
                className="absolute inset-0 bg-primary rounded shadow -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="hidden sm:inline">Deployed </span>Chatbots
          </button>
        </div>

        {/* Deploy Button */}
        <div>
          {activeTab === "workspace" && (
            <Button
              size="sm"
              onClick={() => {
                setDeployName(sourceName ? `${sourceName} Agent` : "My Custom Agent");
                setDeployDescription("");
                setDeployedInfo(null);
                setShowDeployDialog(true);
              }}
              disabled={!selectedDatasetId}
              className="bg-primary/90 text-primary-foreground hover:bg-primary font-semibold text-[11px] sm:text-xs h-8 px-2 sm:px-3 gap-1 sm:gap-1.5 shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)] border border-primary/20"
            >
              <Share2 size={13} className="shrink-0" />
              <span className="hidden sm:inline">Deploy Chatbot</span>
              <span className="sm:hidden">Deploy</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative xl:flex-row flex-col">
        <AnimatePresence>
          {showPreview && selectedDataset && (
            <DataPreviewPanel dataset={selectedDataset} sheet={selectedSheet} onClose={() => setShowPreview(false)} />
          )}
          {showPreview && selectedConnection && dbSchema && (
            <DatabasePreviewPanel connectionId={selectedConnection._id} schema={dbSchema} tableName={selectedTable} onSelectTable={setSelectedTable} onClose={() => setShowPreview(false)} />
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {activeTab === "workspace" ? (
            <motion.div
              key="workspace"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative xl:flex-row flex-col w-full h-full"
            >
            {/* Left: Context Panel */}
            <div className="hidden w-[clamp(16rem,20vw,18rem)] shrink-0 flex-col overflow-hidden border-r border-border/70 bg-background-secondary/90 backdrop-blur-sm lg:flex">
              {/* Sidebar Tab Switcher */}
              <div className="shrink-0 flex items-center border-b border-border/60 bg-background-secondary px-3 py-2 gap-1">
                <button
                  onClick={() => setShowSchemaExplorer(false)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-md transition-colors ${!showSchemaExplorer ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Settings2 size={11} /> Configure
                </button>
                <button
                  onClick={() => setShowSchemaExplorer(true)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-md transition-colors ${showSchemaExplorer ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Database size={11} /> Schema
                </button>
              </div>

              {/* Schema Explorer Tab */}
              {showSchemaExplorer ? (
                <div className="flex-1 overflow-hidden p-3">
                  <SchemaExplorer
                    schema={dbSchema}
                    sheetData={selectedDataset?.data?.sheets[selectedSheet] ?? null}
                    isDbMode={isDbConnection}
                  />
                </div>
              ) : (
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Data Source</Label>
                  <div className="relative mt-1.5">
                    <select
                      value={selectedDatasetId}
                      onChange={(e) => handleSourceChange(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-border/80 bg-card px-3 py-2 pr-9 text-xs text-foreground focus:border-primary/45 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                    >
                      <option value="" disabled className="bg-popover text-muted-foreground">Select data source</option>
                      {datasets.length > 0 && (
                        <optgroup label="Uploaded Files" className="bg-popover text-foreground font-semibold">
                          {datasets.map((d) => (
                            <option key={d.id} value={d.id} className="bg-popover text-foreground py-1">
                              {d.fileName}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {connectedDbs.length > 0 && (
                        <optgroup label="Database Connections" className="bg-popover text-foreground font-semibold">
                          {connectedDbs.map((c) => (
                            <option key={`conn:${c._id}`} value={`conn:${c._id}`} className="bg-popover text-foreground py-1">
                              {c.name} ({c.dbType.toUpperCase()})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
                  </div>
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
                      <DbTypeIcon dbType={selectedConnection.dbType} size={16} className="text-primary/80 shrink-0" />
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
                  <div className="relative mt-1.5">
                    <select
                      value={activeProvider}
                      onChange={(e) => setActiveProvider(e.target.value as Provider)}
                      className="w-full appearance-none rounded-xl border border-border/80 bg-card px-3 py-2 pr-9 text-xs text-foreground focus:border-primary/45 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                    >
                      {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                        <option key={p} value={p} className="bg-popover text-foreground py-1">
                          {PROVIDER_LABELS[p]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
                  </div>
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
                ) : activeProvider === "ollama" || activeProvider === "querify" ? null : (
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
                    <div className="relative mt-1.5">
                      <select
                        value={activeModel}
                        onChange={(e) => setActiveModel(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-border/80 bg-card px-3 py-2 pr-9 text-xs text-foreground focus:border-primary/45 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                      >
                        {PROVIDER_MODELS[activeProvider]?.map((m) => (
                          <option key={m} value={m} className="bg-popover text-foreground py-1">
                            {getModelDisplayName(m)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
                    </div>
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
                  <div className="relative mt-1.5">
                    <select
                      value={String(maxTokens)}
                      onChange={(e) => setMaxTokens(Number(e.target.value))}
                      className="w-full appearance-none rounded-xl border border-border/80 bg-card px-3 py-2 pr-9 text-xs text-foreground focus:border-primary/45 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                    >
                      {[256, 512, 1024, 2048, 4096].map((t) => (
                        <option key={t} value={String(t)} className="bg-popover text-foreground py-1">
                          {t}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
                  </div>
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
                <div className="space-y-1.5">
                  <button onClick={() => setShowTemplates(true)} className="w-full flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded border border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all">
                    <LayoutTemplate size={11} /> Templates
                  </button>
                  <button
                    onClick={notifEnabled ? () => setNotifEnabled(false) : handleEnableNotifications}
                    className={`w-full flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded border transition-all ${notifEnabled ? "border-primary/30 bg-primary/5 text-primary" : "border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground"}`}
                    title="Get notified when a long-running query finishes in a background tab"
                  >
                    {notifEnabled ? <Bell size={11} /> : <BellOff size={11} />}
                    {notifEnabled ? "Notifications on" : "Notify on complete"}
                  </button>
                </div>
              </div>
              )} {/* end schema toggle */}
            </div>

            {/* Center: Chat */}
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
              <div className="shrink-0 border-b border-border/70 bg-background-secondary/90 p-2.5 backdrop-blur-sm lg:hidden">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
                      {isDbConnection ? <Database size={14} /> : <Table2 size={14} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{sourceName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {PROVIDER_LABELS[activeProvider]} · {getModelDisplayName(activeModel)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(selectedDataset || selectedConnection) && (
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-border" onClick={() => setShowPreview(true)} title="Preview Data">
                        <Eye size={14} />
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-border" onClick={() => setShowMobileSettings(true)} title="Configure Settings">
                      <Settings2 size={14} />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-border" onClick={() => setShowTemplates(true)} title="Templates">
                      <LayoutTemplate size={14} />
                    </Button>
                  </div>
                </div>
              </div>
              <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 space-y-4 scrollbar-thin sm:p-4">
                {messages.length === 0 && !isRunning && (
                  <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-12 text-center max-w-xl mx-auto">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm animate-pulse">
                      <Sparkles size={28} />
                    </div>
                    <div className="space-y-2">
                      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-primary/80 bg-clip-text text-transparent">
                        {dynamicGreeting}
                      </h1>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        How can I help you analyze, visualize, or query your data today? Feel free to ask any question to get started.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowTemplates(true)}
                      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <LayoutTemplate size={13} />
                      <span>Browse template library</span>
                    </button>
                  </div>
                )}

                {messages.map((msg, i) => {
                  const finalStep = getFinalStep(msg.steps);
                  const isLast = i === messages.length - 1;
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
                            <>
                              <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground pl-3 sm:pl-10">
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
                                    {msg.query && (
                                      <button
                                        onClick={() => setInput(msg.query || "")}
                                        className="flex items-center gap-1 text-muted-foreground hover:text-primary hover:underline"
                                        title="Refine this query"
                                      >
                                        <RefreshCw size={10} /> Refine
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </>
                          )}
                          {finalStep && (
                            <InlineFinalResult
                              result={finalStep.result}
                              onSubmitQuickReply={(text) => {
                                handleSend(text);
                              }}
                              onOpenDetails={() => setShowResult(true)}
                            />
                          )}
                          {/* Follow-up chips (last agent message only) */}
                          {isLast && finalStep && msg.query && (
                            <FollowUpChips
                              query={msg.query}
                              result={finalStep.result}
                              onSelect={(q) => handleSend(q)}
                            />
                          )}
                          {/* Smart retry (for failed queries only) */}
                          {isLast && msg.steps?.some((s) => s.command === "Error") && msg.query && (
                            <SmartRetryBar query={msg.query} onRetry={(q) => handleSend(q)} />
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
                        onOpenDetails={() => setShowResult(true)}
                      />
                    )}

                    <AnimatePresence mode="wait">
                      {hitlState ? (
                        <div className="pl-3 sm:pl-10">
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
                        </div>
                      ) : null}
                    </AnimatePresence>
                    {!hitlState && (
                      <div className="flex flex-wrap items-center gap-2 pl-3 sm:pl-10">
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
                {isFreeUser && dailyTokens && (dailyTokens.tokensUsed >= 150000 || dailyTokens.queriesUsed >= 18) && (
                  <div className={`mx-auto mb-3 flex max-w-3xl flex-col items-start gap-2 rounded-md border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between ${
                    dailyTokens.tokensUsed >= dailyTokens.limit || dailyTokens.queriesUsed >= dailyTokens.queryLimit
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-warning/30 bg-warning/10 text-warning"
                  }`}>
                    <span>
                      {dailyTokens.tokensUsed >= dailyTokens.limit || dailyTokens.queriesUsed >= dailyTokens.queryLimit
                        ? `Daily free Bedrock limit (${dailyTokens.tokensUsed >= dailyTokens.limit ? `${dailyTokens.limit.toLocaleString()} tokens` : `${dailyTokens.queryLimit} queries`}) has been exhausted. Please upgrade your plan to continue chatting.`
                        : `Notice: You have consumed ${dailyTokens.tokensUsed.toLocaleString()} / ${dailyTokens.limit.toLocaleString()} tokens & ${dailyTokens.queriesUsed} / ${dailyTokens.queryLimit} queries (${dailyTokens.percentage}%) of your daily free Bedrock allowance.`
                      }
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-7 text-xs ${
                        dailyTokens.tokensUsed >= dailyTokens.limit || dailyTokens.queriesUsed >= dailyTokens.queryLimit
                          ? "border-destructive/30 hover:bg-destructive/10"
                          : "border-warning/30 hover:bg-warning/10"
                      }`}
                      onClick={() => navigate("/app/pricing")}
                    >
                      Upgrade Plan
                    </Button>
                  </div>
                )}
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
                <div className="mx-auto flex max-w-3xl items-end gap-1.5 sm:gap-2 rounded-[20px] sm:rounded-[24px] border border-border/55 bg-card/80 p-1.5 sm:p-2 shadow-[0_4px_20px_-8px_hsl(var(--foreground)/0.12)] backdrop-blur-sm query-input-glow">
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
                      className={`bg-background-secondary border-border resize-none min-h-[36px] sm:min-h-[44px] py-2 sm:py-2.5 disabled:cursor-not-allowed disabled:opacity-70 ${queryExpanded ? "min-h-[140px] max-h-[260px]" : "max-h-[120px]"} pr-10`}
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
                  <div className="flex shrink-0 gap-1.5 sm:gap-2">
                    <Button
                      variant="outline"
                      onClick={handleSpeech}
                      size="icon"
                      title={isListening ? "Stop listening" : "Voice search"}
                      className={`h-9 w-9 sm:h-11 sm:w-11 shrink-0 border-border transition-all duration-300 ${isListening ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/30 ring-2 ring-red-500/20" : "hover:text-primary hover:border-primary/45"}`}
                    >
                      <Mic size={16} className={isListening ? "animate-pulse" : ""} />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setQueryExpanded((prev) => !prev)}
                      size="icon"
                      title={queryExpanded ? "Collapse query box" : "Expand query box"}
                      className="h-9 w-9 sm:h-11 sm:w-11 shrink-0 border-border"
                    >
                      {queryExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </Button>
                    <Button onClick={isRunning ? handleStopQuery : () => handleSend()} disabled={!isRunning && !input.trim()} size="icon" className="h-9 w-9 sm:h-11 sm:w-11 shrink-0">
                      {isRunning ? <X size={16} /> : <Send size={16} />}
                    </Button>
                  </div>
                </div>
                {input.length > 0 && (
                  <p className="text-[10px] sm:text-xs text-muted-foreground text-center mt-1 flex items-center justify-center gap-2 flex-wrap">
                    <span>~{Math.ceil(input.length / 4)} tokens · {input.length.toLocaleString()} chars · Ctrl+Enter to send</span>
                    <CostEstimatorBadge input={input} model={activeModel} provider={activeProvider} />
                  </p>
                )}
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

            {/* Result Panel Sheet for mobile/tablet screens < xl */}
            <Sheet open={!isLargeScreen && finalResult !== null && showResult} onOpenChange={setShowResult}>
              <SheetContent side="right" className="w-[100vw] sm:w-[500px] p-0 border-l border-border bg-background-secondary xl:hidden flex flex-col h-full z-[70]">
                <SheetHeader className="sr-only">
                  <SheetTitle>Result Details</SheetTitle>
                  <SheetDescription>View charts, tables, and export options.</SheetDescription>
                </SheetHeader>
                <div className="flex-1 min-h-0 flex flex-col">
                  <ResultPanel
                    result={finalResult}
                    query={lastQuery}
                    onClose={() => setShowResult(false)}
                    onBookmark={() => setShowSaveInsight(true)}
                    datasetName={sourceName}
                    onShare={() => setShowShareCard(true)}
                  />
                </div>
              </SheetContent>
            </Sheet>

            {finalResult !== null && !showResult && (
              <button
                onClick={() => setShowResult(true)}
                className="fixed right-4 bottom-24 md:bottom-6 z-50 bg-primary text-primary-foreground p-2.5 rounded-full shadow-lg hover:bg-primary/90 transition-all active:scale-95"
                title="Show result panel"
              >
                <PanelRightOpen size={16} />
              </button>
            )}
            </motion.div>
          ) : (
            <motion.div
              key="deployments"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-6xl w-full mx-auto relative z-10 scrollbar-thin h-full"
            >
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Globe size={18} className="text-primary animate-pulse" /> Deployed Chatbots
              </h2>
              <p className="text-xs text-muted-foreground max-w-xl">
                These chatbots are deployed securely on public sandboxed proxies. Your connected database credentials and provider keys remain protected on the backend.
              </p>
            </div>

            {loadingDeployments ? (
              <div className="flex min-h-[30vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={24} className="animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Loading deployments...</p>
                </div>
              </div>
            ) : deployments.length === 0 ? (
              <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border/60 bg-card/45 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Globe size={24} className="text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">No chatbots deployed yet</p>
                <p className="max-w-md text-xs text-muted-foreground leading-normal">
                  Configure your database connections or file uploads in the workspace, verify settings, and click "Deploy Chatbot" to share an isolated bot.
                </p>
                <Button size="sm" onClick={() => setActiveTab("workspace")} className="mt-2 text-xs">
                  Go to Workspace
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {deployments.map((dep) => {
                  const snapshot = dep.snapshot || {};
                  const isDb = snapshot.sourceType === "connection";
                  const depSourceName = snapshot.datasetSnapshot?.fileName || snapshot.connectionSnapshot?.name || "Connected data source";
                  const shareUrl = `${window.location.origin}/deploy/${dep._id}`;
                  const isBroken = dep.status === "broken" || dep.status === "deleted";

                  return (
                    <Card key={dep._id} className="p-4 bg-background-secondary border-border hover:border-primary/25 transition-all duration-200 group flex flex-col justify-between min-h-[220px]">
                      <div className="space-y-3 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-foreground truncate">{dep.name}</h3>
                            {dep.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{dep.description}</p>}
                          </div>
                          {isBroken ? (
                            <Badge variant="destructive" className="text-[9px] gap-0.5 shrink-0 py-0.5 px-1.5"><AlertTriangle size={8} /> Broken</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[9px] gap-0.5 shrink-0 py-0.5 px-1.5">Active</Badge>
                          )}
                        </div>

                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          <p className="truncate">Resource: <span className="text-foreground font-medium">{depSourceName}</span></p>
                          <p className="truncate">Model: <span className="text-foreground font-mono">{snapshot.activeModel || "Default"}</span></p>
                          {dep.chatsCount !== undefined && <p>Conversations: <span className="text-foreground font-medium">{dep.chatsCount}</span></p>}
                          {isBroken && dep.statusReason && (
                            <p className="text-[10px] text-destructive leading-normal mt-1 border-t border-destructive/10 pt-1.5">
                              Reason: {dep.statusReason}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-border/50 mt-4 flex items-center justify-between gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground font-mono">{new Date(dep.createdAt).toLocaleDateString()}</span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            title="Copy share link"
                            onClick={() => {
                              navigator.clipboard.writeText(shareUrl);
                              toast.success("Share link copied to clipboard!");
                            }}
                            className="h-8 w-8 border-border text-muted-foreground hover:text-foreground"
                          >
                            <Copy size={13} />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            title="Redeploy with current workspace settings"
                            onClick={() => setDeploymentToRedeploy(dep)}
                            className="h-8 w-8 border-border text-muted-foreground hover:text-foreground"
                          >
                            <RefreshCw size={13} />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            title="Open shared chatbot link"
                            onClick={() => window.open(shareUrl, "_blank")}
                            className="h-8 w-8 border-border text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight size={14} />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            title="Delete chatbot deployment"
                            onClick={() => handleDeleteDeployment(dep._id)}
                            className="h-8 w-8 border-border text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
              <div className="relative mt-1.5">
                <select
                  value={selectedDatasetId}
                  onChange={(e) => handleSourceChange(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-border/80 bg-card px-3 py-2 pr-9 text-xs text-foreground focus:border-primary/45 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                >
                  <option value="" disabled className="bg-popover text-muted-foreground">Select data source</option>
                  {datasets.length > 0 && (
                    <optgroup label="Uploaded Files" className="bg-popover text-foreground font-semibold">
                      {datasets.map((d) => (
                        <option key={d.id} value={d.id} className="bg-popover text-foreground py-1">
                          {d.displayName || d.fileName}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {connectedDbs.length > 0 && (
                    <optgroup label="Database Connections" className="bg-popover text-foreground font-semibold">
                      {connectedDbs.map((c) => (
                        <option key={`conn:${c._id}`} value={`conn:${c._id}`} className="bg-popover text-foreground py-1">
                          {c.name} ({c.dbType.toUpperCase()})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
              </div>
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
              <div className="relative mt-1.5">
                <select
                  value={activeProvider}
                  onChange={(e) => setActiveProvider(e.target.value as Provider)}
                  className="w-full appearance-none rounded-xl border border-border/80 bg-card px-3 py-2 pr-9 text-xs text-foreground focus:border-primary/45 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                >
                  {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                    <option key={p} value={p} className="bg-popover text-foreground py-1">
                      {PROVIDER_LABELS[p]}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
              </div>
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
            ) : activeProvider === "ollama" || activeProvider === "querify" ? null : (
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
                <div className="relative mt-1.5">
                  <select
                    value={activeModel}
                    onChange={(e) => setActiveModel(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-border/80 bg-card px-3 py-2 pr-9 text-xs text-foreground focus:border-primary/45 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                  >
                    {PROVIDER_MODELS[activeProvider]?.map((m) => (
                      <option key={m} value={m} className="bg-popover text-foreground py-1">
                        {getModelDisplayName(m)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
                </div>
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
              <div className="relative mt-1.5">
                <select
                  value={String(maxTokens)}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  className="w-full appearance-none rounded-xl border border-border/80 bg-card px-3 py-2 pr-9 text-xs text-foreground focus:border-primary/45 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                >
                  {[256, 512, 1024, 2048, 4096].map((t) => (
                    <option key={t} value={String(t)} className="bg-popover text-foreground py-1">
                      {t}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none opacity-60" />
              </div>
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

      {/* Deploy Dialog */}
      <Dialog open={showDeployDialog} onOpenChange={setShowDeployDialog}>
        <DialogContent className="bg-background-secondary border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Globe size={16} className="text-primary" /> Deploy Chatbot (Beta)</DialogTitle>
            <DialogDescription>
              Create a secure, sandboxed public chatbot based on your current configurations.
            </DialogDescription>
          </DialogHeader>

          {!deployedInfo ? (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs text-muted-foreground font-medium">Chatbot Name *</Label>
                <Input
                  value={deployName}
                  onChange={(e) => setDeployName(e.target.value)}
                  placeholder="e.g. Sales Analysis Agent"
                  className="mt-1 bg-card border-border text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground font-medium">Description</Label>
                <Textarea
                  value={deployDescription}
                  onChange={(e) => setDeployDescription(e.target.value)}
                  placeholder="Tell users what questions this chatbot is configured to answer..."
                  className="mt-1 bg-card border-border min-h-[60px] text-xs"
                />
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1.5 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Snapshotted Configurations:</p>
                <p>Data Source: <span className="text-foreground">{sourceName}</span></p>
                <p>Model Configs: <span className="text-foreground font-mono">{activeProvider}/{activeModel}</span></p>
                <p>Security Level: <span className="text-emerald-400 font-medium">Fully Encrypted Proxy</span></p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowDeployDialog(false)} className="border-border text-xs h-9">Cancel</Button>
                <Button onClick={handleCreateDeployment} disabled={isDeploying} className="text-xs h-9">
                  {isDeploying ? "Deploying..." : "Create Deployment"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2 text-center">
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-2 animate-bounce">
                <Check size={20} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Chatbot Deployed!</h3>
              <p className="text-xs text-muted-foreground leading-normal max-w-sm mx-auto">
                Your secure public chatbot is active. Share the unique link below with external clients or test it directly.
              </p>

              <div className="relative mt-3 flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-xs font-mono text-foreground">
                <span className="truncate flex-1 pr-6 text-left">{`${window.location.origin}/deploy/${deployedInfo.deployId}`}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/deploy/${deployedInfo.deployId}`);
                    toast.success("Share link copied!");
                  }}
                  className="absolute right-2 text-muted-foreground hover:text-foreground animate-pulse"
                  title="Copy link"
                >
                  <Copy size={13} />
                </button>
              </div>

              <div className="flex gap-2 justify-center pt-2">
                <Button variant="outline" onClick={() => setShowDeployDialog(false)} className="border-border text-xs h-9">Done</Button>
                <Button onClick={() => window.open(`${window.location.origin}/deploy/${deployedInfo.deployId}`, "_blank")} className="text-xs h-9">
                  Open Chatbot
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Redeploy confirmation Dialog */}
      <Dialog open={!!deploymentToRedeploy} onOpenChange={(open) => { if (!open) setDeploymentToRedeploy(null); }}>
        <DialogContent className="bg-background-secondary border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Redeploy chatbot</DialogTitle>
            <DialogDescription>
              Are you sure you want to overwrite the snapshot of "{deploymentToRedeploy?.name}" with your current workspace configuration?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-warning leading-normal">
            This updates the deployed chatbot instantly without changing its unique URL. Any active database table definitions or prompt parameters are updated in the snapshot.
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="outline" onClick={() => setDeploymentToRedeploy(null)} className="border-border text-xs h-9">Cancel</Button>
            <Button onClick={() => handleRedeployDeployment(deploymentToRedeploy)} disabled={redeploying} className="text-xs h-9">
              {redeploying ? "Updating..." : "Redeploy Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
