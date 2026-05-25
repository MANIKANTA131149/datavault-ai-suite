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
import {
  Send, ChevronDown, ChevronRight, Zap, Clock, BookmarkPlus, Bookmark, Sparkles,
  Search, Eye, X, Database, Table2, LayoutTemplate, Keyboard, RefreshCw, FileJson,
  FileText, Code2, TrendingUp, Trash2, BarChart3, FileDown, Layout, Maximize2,
  Minimize2, Star, Rows3, Palette, Share2, Mic, CheckCircle2, AlertTriangle, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getApiBaseUrl } from "@/lib/api-base";
import { runDatabaseAgent, runLegacyAgent, type AgentStep, type ConversationContext } from "@/lib/agent";
import { parseOptionsFromText, cleanPromptText } from "@/lib/clarification-options";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { generatePDF } from "@/lib/pdf-report";
import html2canvas from "html2canvas";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, CartesianGrid,
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend as RechartsLegend, LabelList,
} from "recharts";

// ─── Constants & Styling ──────────────────────────────────────────────────────
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

type ResultDensity = "comfortable" | "compact";
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
    case "GetSchema": return "Checked which tables are available in the database.";
    case "GetSheetDescription": return "Checked which sheets are available in the workbook.";
    case "GetColumns": return `Inspected the schema${targetName ? ` for ${targetLabel} "${targetName}"` : ""}.`;
    case "QuerySQL": return "Ran an intermediate read-only SQL query.";
    case "QueryTable":
    case "QuerySheet": return `Ran an intermediate ${operation || "query"}${targetName ? ` on ${targetLabel} "${targetName}"` : ""}.`;
    case "ExecuteSQL": return "Ran the final read-only SQL query.";
    case "ExecuteFinalQuery": return `Ran the final ${operation || "query"}${targetName ? ` on ${targetLabel} "${targetName}"` : ""}.`;
    case "Answer":
    case "FinalAnswer": return "Returned a direct answer.";
    case "NarrativeAnswer": return "Returned a written explanation.";
    case "PARSE_ERROR": return "Retried because the model response was not valid JSON.";
    case "MaxTurnsReached": return "Stopped because the agent hit its step limit.";
    case "Error": return "Stopped because the query hit an error.";
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
        tokens.push(<strong key={keyIndex++} className="font-bold text-foreground">{firstMatch.content}</strong>);
      } else if (firstMatch.type === "italic") {
        tokens.push(<em key={keyIndex++} className="italic text-muted-foreground">{firstMatch.content}</em>);
      } else if (firstMatch.type === "code") {
        tokens.push(<code key={keyIndex++} className="bg-foreground/5 text-foreground px-1.5 py-0.5 rounded font-mono text-xs border border-border/30">{firstMatch.content}</code>);
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
      listItems.push(line.trim().slice(2));
      continue;
    } else if (inList) {
      flushList(i);
      inList = false;
    }

    if (line.startsWith("### ")) {
      elements.push(<h4 key={i} className="text-sm font-semibold text-foreground mt-4 mb-2">{parseInline(line.slice(4))}</h4>);
    } else if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-base font-semibold text-foreground mt-4 mb-2">{parseInline(line.slice(3))}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="text-lg font-bold text-foreground mt-4 mb-2">{parseInline(line.slice(2))}</h2>);
    } else if (line.trim()) {
      elements.push(<p key={i} className="text-sm text-foreground leading-relaxed mb-2">{parseInline(line)}</p>);
    } else {
      elements.push(<div key={i} className="h-2" />);
    }
  }
  if (inList) flushList(lines.length);
  return <div className="space-y-1">{elements}</div>;
}

// ─── Sub-Components Replicated from QueryPage ──────────────────────────────────
const StepCard = memo(function StepCard({ step, defaultExpanded = true, showConnector = true }: any) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const colorClass = COMMAND_COLORS[step.command] || "bg-muted text-muted-foreground";
  const [showFull, setShowFull] = useState(false);
  const argsStr = useMemo(() => JSON.stringify(step.args, null, 2), [step.args]);
  const resultPreview = useMemo(() => buildStepResultPreview(step.result), [step.result]);
  const summary = useMemo(() => describeAgentStep(step), [step]);
  const fullResultStr = useMemo(() => (expanded ? JSON.stringify(step.result, null, 2) : ""), [expanded, step.result]);
  const canShowFull = expanded && fullResultStr.length > resultPreview.length;

  return (
    <div className="flex gap-3">
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
          {expanded ? <ChevronDown size={14} className="text-muted-foreground ml-auto" /> : <ChevronRight size={14} className="text-muted-foreground ml-auto" />}
        </button>
        {summary && <p className="mt-1 text-xs text-muted-foreground">{summary}</p>}
        {expanded && (
          <div className="mt-2 space-y-2 overflow-hidden">
            {Object.keys(step.args).length > 0 && (
              <div className="bg-card rounded-md p-3 border border-border">
                <p className="text-xs text-muted-foreground font-medium mb-1">Arguments</p>
                <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words text-xs font-mono text-foreground [overflow-wrap:anywhere]">{argsStr}</pre>
              </div>
            )}
            {step.sql && (
              <div className="bg-card rounded-md p-3 border border-border">
                <p className="text-xs text-muted-foreground font-medium mb-1">Executed SQL</p>
                <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words text-xs font-mono text-foreground [overflow-wrap:anywhere]">{step.sql}</pre>
              </div>
            )}
            <div className="bg-card rounded-md p-3 border border-border">
              <p className="text-xs text-muted-foreground mb-1 font-medium">Result</p>
              <pre className="max-h-40 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words text-xs font-mono text-foreground scrollbar-thin [overflow-wrap:anywhere]">{showFull ? fullResultStr : resultPreview}</pre>
              {canShowFull && (
                <button onClick={() => setShowFull(!showFull)} className="text-xs text-primary mt-1 hover:underline">
                  {showFull ? "Show summary" : "Show raw JSON"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

const StepsTimeline = memo(function StepsTimeline({ steps, live = false }: any) {
  if (!steps?.length) return null;
  const [open, setOpen] = useState(live);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="ml-10 rounded-md border border-border bg-background-secondary/45">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-card/40">
          <div>
            <p className="text-xs font-medium text-foreground">{live ? "Live agent steps" : "Agent steps"}</p>
            <p className="text-xs text-muted-foreground">{open ? "Showing the full step-by-step flow used to answer this query." : "Click to show the step-by-step flow used to answer this query."}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="border-border bg-card text-xs text-foreground">{steps.length} step{steps.length === 1 ? "" : "s"}</Badge>
            {open ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        <div className="mt-2">
          {steps.map((step: any, index: number) => (
            <StepCard key={index} step={step} defaultExpanded={false} showConnector={index < steps.length - 1} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

const InlineFinalResult = memo(function InlineFinalResult({ result, onSubmitQuickReply }: any) {
  const isArray = Array.isArray(result);
  const isSingleValue = !isArray && typeof result === "object" && result?.result !== undefined;
  const isPrimitiveValue = !isArray && (typeof result === "number" || typeof result === "boolean");
  const isNarrative = !isArray && typeof result === "object" && result?.narrative !== undefined;
  const { rows, chartRows, valueKey, labelKey, isChartable, defaultChart } = useMemo(() => getChartMeta(result), [result]);
  const [chartType, setChartType] = useState<ChartType>(defaultChart);
  const areaGradientId = useId().replace(/:/g, "");
  const inlineChartRows = useMemo(() => chartRows.slice(0, Math.min(DEFAULT_CHART_ROWS, CHART_RENDER_LIMIT)), [chartRows]);
  const inlinePieChartRows = useMemo(() => buildPieChartRows(inlineChartRows, labelKey, valueKey), [inlineChartRows, labelKey, valueKey]);
  const inlineChartLimited = chartRows.length > inlineChartRows.length;

  const isBlankString = typeof result === "string" && !result.trim();

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
    return (
      <div className="ml-10 mt-1 mb-3 rounded-md border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={13} className="text-purple-400" />
          <span className="text-xs text-purple-400 font-medium">AI Analysis</span>
        </div>
        {result.highlights && result.highlights.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
            {result.highlights.map((h: any, i: number) => (
              <div key={i} className="bg-card rounded-md p-2.5 border border-border">
                <p className="text-xs text-muted-foreground">{h.label}</p>
                <p className="text-sm font-semibold text-foreground font-mono">{h.value}</p>
              </div>
            ))}
          </div>
        )}
        <div className="text-sm text-foreground leading-relaxed">{renderMarkdown(options.length > 0 ? cleanBody : result.narrative)}</div>
      </div>
    );
  }

  return (
    <div className="ml-10 mt-1 mb-3 min-w-0 overflow-hidden rounded-md border border-border bg-card p-3 space-y-3">
      <p className="text-xs text-muted-foreground font-medium">Result</p>

      {isSingleValue && <p className="text-2xl font-semibold text-foreground font-mono">{typeof result.result === "number" ? result.result.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(result.result)}</p>}
      {isPrimitiveValue && <p className="text-2xl font-semibold text-foreground font-mono">{String(result)}</p>}

      {isChartable && (
        <div>
          <div className="flex gap-1 mb-2">
            {(["bar", "line", "area", "pie"] as const).map((t) => (
              <button key={t} onClick={() => setChartType(t)} className={`text-xs px-2 py-1 rounded capitalize ${chartType === t ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>{t}</button>
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
        </div>
      )}

      {isArray && rows.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-background-secondary">
              <tr>{Object.keys(rows[0] || {}).map((k) => <th key={k} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{k}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row: any, i: number) => (
                <tr key={i} className="border-t border-border/50">
                  {Object.values(row).map((v: any, j) => <td key={j} className="px-3 py-1.5 text-foreground max-w-[140px] truncate">{String(v ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isBlankString && typeof result === "string" && (
        <div className="space-y-3">
          <div className="text-sm leading-relaxed">{renderMarkdown(options.length > 0 ? cleanBody : result)}</div>
        </div>
      )}
    </div>
  );
});

// ─── Main Standalone DeployedChatPage ───────────────────────────────────────────
export default function DeployedChatPage() {
  const { deployId } = useParams<{ deployId: string }>();
  const [deployment, setDeployment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<AgentStep[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const queryStartRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const cancelRequestedRef = useRef(false);

  // Multi-turn conversation memory
  const [conversationContext, setConversationContext] = useState<ConversationContext[]>([]);
  const [workbookSheets, setWorkbookSheets] = useState<any>(null);

  const BASE_URL = getApiBaseUrl();

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
        // Hydrate dataset sheet data asynchronously if it's a dataset
        if (data.snapshot?.sourceType === "dataset" && data.snapshot?.selectedDatasetId) {
          fetch(`${BASE_URL}/deployments/public/${deployId}/dataset-data/${data.snapshot.selectedDatasetId}`)
            .then((r) => r.json())
            .then((sheets) => setWorkbookSheets(sheets?.sheets || null))
            .catch((e) => console.error("Lazy dataset fetch error:", e));
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

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isRunning) return;

    setIsRunning(true);
    cancelRequestedRef.current = false;
    setInput("");
    queryStartRef.current = Date.now();
    setMessages((prev) => [...prev, { role: "user", content: question, query: question }]);
    setCurrentSteps([]);

    const steps: AgentStep[] = [];
    const startTime = Date.now();
    const snapshot = deployment.snapshot;

    const hitlController = {
      waitForHuman: () => Promise.resolve("approve"),
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
        "snapshotted-proxy-keys", // proxy handles authenticating with actual key on backend
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
      setMessages((prev) => [...prev, { role: "agent", content: "", steps: [...steps], query: question }]);
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
      <div className="flex min-h-svh items-center justify-center bg-[#07090e] text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm">Loading chatbot experience…</p>
        </div>
      </div>
    );
  }

  if (error || !deployment) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center bg-[#07090e] p-6 text-center text-muted-foreground">
        <AlertTriangle size={48} className="text-destructive mb-3" />
        <h2 className="text-lg font-bold text-foreground">Chatbot Unavailable</h2>
        <p className="max-w-md text-sm mt-1">{error || "This chatbot link is broken or has been deleted by the owner."}</p>
      </div>
    );
  }

  const isBroken = deployment.status === "broken" || deployment.status === "deleted";
  const sourceName = deployment.snapshot?.datasetSnapshot?.fileName || deployment.snapshot?.connectionSnapshot?.name || "Connected resource";

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#07090e] text-foreground font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.08),_transparent_38%)] pointer-events-none" />

      {/* Shared Chat Header */}
      <header className="relative z-10 shrink-0 border-b border-border/70 bg-background-secondary/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto max-w-4xl flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-primary">
                Querify Shared
              </span>
              <h2 className="truncate text-sm font-semibold text-foreground">{deployment.name}</h2>
            </div>
            {deployment.description && <p className="truncate text-xs text-muted-foreground mt-0.5">{deployment.description}</p>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isBroken ? (
              <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle size={10} /> Broken</Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] gap-1">
                <CheckCircle2 size={10} /> Active
              </Badge>
            )}
            <Badge variant="outline" className="border-border text-[10px] text-muted-foreground hidden sm:inline-flex">
              {sourceName}
            </Badge>
          </div>
        </div>
      </header>

      {/* Chat messages */}
      <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-6 scrollbar-thin max-w-4xl w-full mx-auto relative z-10">
        {isBroken && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center text-sm space-y-2">
            <AlertTriangle size={24} className="text-destructive mx-auto" />
            <p className="font-semibold text-foreground">Chatbot configuration is currently offline</p>
            <p className="text-xs text-muted-foreground leading-normal max-w-md mx-auto">
              Reason: {deployment.statusReason || "One of the dependencies or database connections is unavailable."}
            </p>
          </div>
        )}

        {messages.length === 0 && !isRunning && !isBroken && (
          <div className="flex h-[60%] flex-col items-center justify-center gap-4 text-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 mb-2">
              <Sparkles size={24} className="text-primary animate-pulse" />
            </div>
            <h3 className="text-md font-bold text-foreground">Ask anything about {sourceName}</h3>
            <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
              This chatbot was deployed by its owner to share secure queries and visual insights. Ask a direct question below to begin.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const finalStep = getFinalStep(msg.steps);
          return (
            <div key={i} className="space-y-4">
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] min-w-0 rounded-xl border border-border bg-card px-4 py-3 sm:max-w-md shadow-sm">
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {msg.steps && msg.steps.length > 0 ? (
                    <StepsTimeline steps={msg.steps} />
                  ) : (
                    <div className="max-w-full min-w-0 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 sm:max-w-[85%]">
                      <p className="text-sm text-destructive whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                    </div>
                  )}
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground sm:pl-10">
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
                          className="flex items-center gap-1 text-muted-foreground hover:text-primary hover:underline ml-auto"
                        >
                          <FileDown size={10} /> PDF report
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
            {currentSteps.length > 0 && <StepsTimeline steps={currentSteps} live />}
            <div className="flex items-center gap-2 sm:pl-10">
              <div className="flex items-center gap-1.5">
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </div>
              <span className="text-xs text-muted-foreground">Thinking... {Math.floor(elapsedMs / 1000)}s</span>
            </div>
          </div>
        )}
      </div>

      {/* Shared Chat Input bar */}
      <footer className="relative z-10 shrink-0 border-t border-border/70 bg-[#07090e]/95 p-4 backdrop-blur-md">
        <div className="mx-auto max-w-4xl">
          <div className="relative flex items-end gap-2 rounded-[28px] border border-border/70 bg-card/85 p-2 shadow-lg backdrop-blur-sm query-input-glow">
            <div className="relative min-w-0 flex-1">
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
                  <Button variant="outline" size="sm" onClick={handleSpeech} className="h-7 px-3 text-xs border-border bg-card">Done</Button>
                </div>
              )}

              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isBroken ? "Chatbot is currently offline." : isRunning ? "Query is running..." : "Ask a question about this data..."}
                disabled={isRunning || isBroken}
                className="bg-background-secondary border-border resize-none min-h-[44px] max-h-[120px] pr-10 text-sm leading-normal"
                rows={1}
              />
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button
                variant="outline"
                onClick={handleSpeech}
                disabled={isBroken}
                size="icon"
                title="Voice search"
                className={cn("h-[44px] w-[44px] shrink-0 border-border transition-all duration-300", isListening && "bg-red-500/10 text-red-500 border-red-500/30")}
              >
                <Mic size={16} />
              </Button>
              <Button onClick={() => handleSend()} disabled={isRunning || isBroken || !input.trim()} size="icon" className="h-[44px] w-[44px] shrink-0">
                <Send size={16} />
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Securely powered by <span className="font-semibold text-foreground">Querify.in</span> · Stored connection snapshots are fully encrypted and sandboxed.
          </p>
        </div>
      </footer>
    </div>
  );
}
