import { useState, useCallback, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useDropzone, type FileRejection } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, FileText, X, Eye, Trash2, MessageSquare, ChevronRight, Hash, TrendingUp, Tag, Calendar, ToggleLeft, AlertTriangle, CheckCircle2, Info, Search, Copy, Grid3X3, List, ArrowUpDown, Star, Pin, Pencil, StickyNote, Rows3, Columns3, CheckSquare, Square, RotateCcw, HardDrive, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardGridSkeleton } from "@/components/shared/Skeletons";
import { FilterToolbar } from "@/components/shared/FilterToolbar";
import { DensityToggle } from "@/components/shared/DensityToggle";
import { Progress } from "@/components/ui/progress";
import { parseFile } from "@/lib/file-parser";
import type { ColumnInfo, ParsedFile } from "@/lib/file-parser";
import { useDatasetStore, type StoredDataset } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";
import { useNotificationsStore } from "@/stores/notifications-store";
import { usePlanStore } from "@/stores/plan-store";
import { formatFileSizeLimit, type PlanDefinition } from "@/lib/plans";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";
import { api } from "@/lib/api-client";
import { PageHeader } from "@/components/PageHeader";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

type DatasetSort = "newest" | "oldest" | "name" | "type" | "rows";
type DatasetView = "grid" | "list";
type DatasetDensity = "comfortable" | "compact";

interface DatasetUiMeta {
  favorite?: boolean;
  pinned?: boolean;
}

type UploadStatus = "queued" | "uploading" | "done" | "failed" | "duplicate";

interface UploadQueueItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
}

const DATASET_UI_KEY = "datavault-dataset-ui";
const DATASET_FILTER_KEY = "datavault-dataset-filters";

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const index = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

function DatasetNameText({ label, query }: { label: string; query: string }) {
  return (
    <span
      className="block min-w-0 text-sm font-medium leading-snug text-foreground"
      title={label}
      style={{
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        overflowWrap: "anywhere",
      }}
    >
      {highlightText(label, query)}
    </span>
  );
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "Size unavailable";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function getFileSizeLimitMessage(file: File, plan: PlanDefinition) {
  return `${plan.name} plan allows dataset files up to ${formatFileSizeLimit(plan.fileSizeLimitBytes)}. "${file.name}" is ${formatBytes(file.size)}.`;
}

function getDatasetTotals(ds: StoredDataset) {
  return {
    rows: Object.values(ds.rowCounts).reduce((a, b) => a + b, 0),
    columns: Object.values(ds.columnCounts).reduce((a, b) => a + b, 0),
  };
}

// ─── Column Intelligence Helpers ─────────────────────────────────────────────
function detectColumnTag(col: ColumnInfo, totalRows: number): { tag: string; color: string; icon: React.ElementType } {
  const name = col.name.toLowerCase();
  if (col.dtype === "date") return { tag: "Date", color: "bg-purple-500/10 text-purple-400", icon: Calendar };
  if (col.dtype === "boolean") return { tag: "Boolean", color: "bg-amber-500/10 text-amber-400", icon: ToggleLeft };
  if (col.uniqueCount === totalRows && col.dtype !== "number") return { tag: "ID", color: "bg-blue-500/10 text-blue-400", icon: Hash };
  if (col.dtype === "number") return { tag: "Metric", color: "bg-green-500/10 text-green-400", icon: TrendingUp };
  if (col.uniqueCount <= Math.max(10, totalRows * 0.05)) return { tag: "Dimension", color: "bg-pink-500/10 text-pink-400", icon: Tag };
  return { tag: "Text", color: "bg-muted/60 text-muted-foreground", icon: FileText };
}

function computeDataQuality(col: ColumnInfo, totalRows: number) {
  const nullPct = totalRows > 0 ? ((totalRows - col.nonNullCount) / totalRows) * 100 : 0;
  const cardinalityPct = totalRows > 0 ? (col.uniqueCount / totalRows) * 100 : 0;
  // Quality score: 100 - null% - (high cardinality for non-ID columns penalty)
  let score = 100 - nullPct;
  return { nullPct, cardinalityPct, score: Math.max(0, Math.round(score)) };
}

function ColumnIntelligenceTab({ sheet }: { sheet: { columns: ColumnInfo[]; rows: Record<string, any>[] } }) {
  const totalRows = sheet.rows.length;

  // Pre-compute all column stats
  const colStats = useMemo(() => {
    return sheet.columns.map((col) => {
      const tagInfo = detectColumnTag(col, totalRows);
      const quality = computeDataQuality(col, totalRows);

      let nums: number[] = [];
      let freqData: { name: string; value: number }[] = [];

      if (col.dtype === "number") {
        nums = sheet.rows.map((r) => Number(r[col.name])).filter((n) => !isNaN(n));
      } else {
        const counts: Record<string, number> = {};
        for (const row of sheet.rows) {
          const v = String(row[col.name] ?? "");
          counts[v] = (counts[v] || 0) + 1;
        }
        freqData = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name: name.slice(0, 18), value }));
      }

      const min = nums.length ? Math.min(...nums) : null;
      const max = nums.length ? Math.max(...nums) : null;
      const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      const sorted = [...nums].sort((a, b) => a - b);
      const median = sorted.length ? (sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)]) : null;

      return { col, tagInfo, quality, nums, freqData, min, max, mean, median };
    });
  }, [sheet]);

  // Overall dataset quality
  const avgQuality = Math.round(colStats.reduce((s, c) => s + c.quality.score, 0) / colStats.length);
  const qualityColor = avgQuality >= 80 ? "text-green-400" : avgQuality >= 60 ? "text-amber-400" : "text-red-400";
  const qualityBg = avgQuality >= 80 ? "bg-green-500/10" : avgQuality >= 60 ? "bg-amber-500/10" : "bg-red-500/10";

  return (
    <div className="mt-3 space-y-4">
      {/* Dataset Quality Banner */}
      <div className={`flex items-center justify-between rounded-lg ${qualityBg} border border-border px-4 py-3`}>
        <div className="flex items-center gap-2">
          {avgQuality >= 80 ? <CheckCircle2 size={16} className="text-green-400" /> : <AlertTriangle size={16} className="text-amber-400" />}
          <span className="text-sm font-medium text-foreground">Data Quality Score</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className={`text-2xl font-bold ${qualityColor}`}>{avgQuality}</span>
            <span className="text-xs text-muted-foreground">/100</span>
          </div>
          <div className="w-24 h-2 bg-border rounded-full overflow-hidden">
            <div className={`h-2 rounded-full ${avgQuality >= 80 ? "bg-green-400" : avgQuality >= 60 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${avgQuality}%` }} />
          </div>
        </div>
      </div>

      {/* Column Cards */}
      {colStats.map(({ col, tagInfo, quality, nums, freqData, min, max, mean, median }) => {
        const TagIcon = tagInfo.icon;
        return (
          <Card key={col.name} className="p-4 bg-card border-border space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-mono font-medium text-foreground truncate">{col.name}</span>
                <Badge className={`${tagInfo.color} border-0 text-xs gap-1 shrink-0`}>
                  <TagIcon size={9} />{tagInfo.tag}
                </Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="border-border text-xs">{col.dtype}</Badge>
              </div>
            </div>

            {/* Quality Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Completeness</span>
                <span>{(100 - quality.nullPct).toFixed(0)}% filled · {col.uniqueCount.toLocaleString()} unique · {col.nonNullCount.toLocaleString()} non-null</span>
              </div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${100 - quality.nullPct}%` }} />
              </div>
            </div>

            {/* Numeric Stats */}
            {nums.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {[{ l: "Min", v: min }, { l: "Max", v: max }, { l: "Mean", v: mean }, { l: "Median", v: median }].map((s) => (
                  <div key={s.l} className="bg-background-secondary rounded-md p-2 border border-border">
                    <p className="text-xs text-muted-foreground">{s.l}</p>
                    <p className="text-xs font-mono font-medium text-foreground">
                      {s.v !== null ? s.v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Frequency Chart for Categorical */}
            {freqData.length > 0 && (
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={freqData} layout="vertical">
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} width={90} />
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Sample Values */}
            <div className="flex gap-1 flex-wrap">
              {col.sampleValues.slice(0, 5).map((v, i) => (
                <span key={i} className="text-xs bg-background-secondary border border-border rounded px-1.5 py-0.5 text-muted-foreground font-mono">{String(v)}</span>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DatasetDetailPanel({ dataset, onClose, displayName, onDeleteClick }: { dataset: StoredDataset; onClose: () => void; displayName?: string; onDeleteClick: (ds: StoredDataset) => void }) {
  const [activeSheet, setActiveSheet] = useState(dataset.sheetNames[0]);
  const { removeDataset, loadDatasetData } = useDatasetStore();
  const navigate = useNavigate();
  const [loadingData, setLoadingData] = useState(false);
  const [localData, setLocalData] = useState<ParsedFile | null>(dataset.data || null);
  const [columnSearch, setColumnSearch] = useState("");
  const [columnTypeFilter, setColumnTypeFilter] = useState("all");
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);

  // Lazy-load data from MongoDB if not in memory
  useEffect(() => {
    if (!localData && !loadingData) {
      setLoadingData(true);
      loadDatasetData(dataset.id).then((data) => {
        setLocalData(data);
        setLoadingData(false);
      });
    }
  }, [dataset.id]);

  const sheet = localData?.sheets[activeSheet];
  const totals = getDatasetTotals(dataset);
  const visibleColumns = useMemo(() => {
    if (!sheet) return [];
    return sheet.columns.filter((col) => !hiddenColumns.includes(col.name));
  }, [sheet, hiddenColumns]);
  const filteredColumns = useMemo(() => {
    if (!sheet) return [];
    const q = columnSearch.trim().toLowerCase();
    return sheet.columns.filter((col) => {
      if (q && !col.name.toLowerCase().includes(q)) return false;
      if (columnTypeFilter !== "all" && col.dtype !== columnTypeFilter) return false;
      return true;
    });
  }, [sheet, columnSearch, columnTypeFilter]);
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { number: 0, string: 0, date: 0, boolean: 0 };
    sheet?.columns.forEach((col) => { counts[col.dtype] = (counts[col.dtype] || 0) + 1; });
    return counts;
  }, [sheet]);
  const copyColumnName = async (name: string) => {
    await navigator.clipboard.writeText(name);
    toast.success("Column name copied");
  };

  // Portaled to <body>: the route wrapper is a transformed scroll container,
  // which would otherwise capture this fixed panel and scroll/clip it with
  // the page. The portal keeps it truly viewport-fixed and above the top bar.
  return createPortal(
    <motion.div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col border-l border-border bg-background-secondary sm:max-w-lg"
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{displayName || dataset.fileName}</h3>
          <p className="truncate text-[11px] text-muted-foreground">
            {dataset.ownerEmail || dataset.createdBy || "You"} · uploaded {new Date(dataset.uploadDate).toLocaleDateString()}
          </p>
        </div>
        <button aria-label="Close dataset details" title="Close" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground"><X size={18} /></button>
      </div>

      {/* Compact stat strip — one line instead of four cards so the data area below gets the space */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-2">
        {[
          { label: "rows", value: totals.rows.toLocaleString(), icon: Rows3 },
          { label: "columns", value: totals.columns.toLocaleString(), icon: Columns3 },
          { label: dataset.sheetNames.length === 1 ? "sheet" : "sheets", value: dataset.sheetNames.length.toLocaleString(), icon: FileSpreadsheet },
        ].map(({ label, value, icon: Icon }) => (
          <span key={label} className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Icon size={11} className="shrink-0" />
            <span className="font-semibold text-foreground tabular-nums">{value}</span> {label}
          </span>
        ))}
      </div>

      {dataset.sheetNames.length > 1 && (
        <div className="px-4 pt-1.5">
          <div className="flex gap-1 overflow-x-auto">
            {dataset.sheetNames.map((s) => (
              <button key={s} onClick={() => setActiveSheet(s)} className={`shrink-0 px-2.5 py-0.5 text-xs rounded-md transition-colors ${s === activeSheet ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {loadingData && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-foreground">Loading dataset from storage...</p>
          <p className="text-xs text-muted-foreground">Fetching full data from MongoDB</p>
        </div>
      )}
      {!loadingData && !localData && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <FileText size={32} className="text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Data not available</p>
          <p className="text-xs text-muted-foreground">The dataset could not be loaded from storage. This may happen if the file was too large to store. Re-upload the file to view its contents.</p>
        </div>
      )}
      <Tabs defaultValue="preview" className="flex-1 flex flex-col overflow-hidden" style={{ display: localData ? undefined : 'none' }}>
        <TabsList className="mx-4 mt-2 inline-flex h-auto w-auto flex-wrap justify-start gap-1 bg-card p-0.5">
          <TabsTrigger value="preview" className="px-2.5 py-1 text-xs">Preview</TabsTrigger>
          <TabsTrigger value="schema" className="px-2.5 py-1 text-xs">Schema</TabsTrigger>
          <TabsTrigger value="statistics" className="px-2.5 py-1 text-xs">Intelligence</TabsTrigger>
        </TabsList>

        {sheet && (
          <div className="mx-4 mt-2 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} placeholder="Search columns..." className="h-7 pl-7 bg-card border-border text-xs" />
            </div>
            <Select value={columnTypeFilter} onValueChange={setColumnTypeFilter}>
              <SelectTrigger className="h-7 w-[110px] shrink-0 bg-card border-border text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
              </SelectContent>
            </Select>
            <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
              {visibleColumns.length}/{sheet.columns.length} visible
            </span>
          </div>
        )}

        <TabsContent value="preview" className="flex-1 overflow-auto px-4 pb-4">
          <div className="mt-3 overflow-x-auto rounded-md border border-border">
            <table className="min-w-[640px] w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr>
                  {visibleColumns.map((col) => (
                    <th key={col.name} className="text-left px-3 py-2 text-muted-foreground font-medium border-b border-border whitespace-nowrap">{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet?.rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-card/50">
                    {visibleColumns.map((col) => (
                      <td key={col.name} className="px-3 py-1.5 text-foreground max-w-[120px] truncate">{String(row[col.name] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="schema" className="flex-1 overflow-auto px-4 pb-4">
          <div className="mt-3 overflow-x-auto rounded-md border border-border">
            <table className="min-w-[640px] w-full text-xs">
              <thead className="bg-card">
                <tr>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Column</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Type</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Non-null</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Unique</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Sample</th>
                </tr>
              </thead>
              <tbody>
                {filteredColumns.map((col) => (
                  <tr key={col.name} className="border-t border-border/50">
                    <td className="px-3 py-2 font-mono text-foreground">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={!hiddenColumns.includes(col.name)}
                          onCheckedChange={(checked) => setHiddenColumns((prev) => checked ? prev.filter((name) => name !== col.name) : [...prev, col.name])}
                          aria-label={`Toggle ${col.name}`}
                        />
                        <span className="truncate">{highlightText(col.name, columnSearch)}</span>
                        <button type="button" title="Copy column name" onClick={() => copyColumnName(col.name)} className="text-muted-foreground hover:text-foreground">
                          <Copy size={10} />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-xs border-border">{col.dtype}</Badge></td>
                    <td className="px-3 py-2 text-muted-foreground">{col.nonNullCount}</td>
                    <td className="px-3 py-2 text-muted-foreground">{col.uniqueCount}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[100px] truncate">{String(col.sampleValues[0] ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="statistics" className="flex-1 overflow-auto px-4 pb-4">
          {sheet ? (
            <ColumnIntelligenceTab sheet={sheet} />
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Load the dataset to view column intelligence
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row">
        <Button className="flex-1" onClick={() => navigate(`/app/query?dataset=${dataset.id}`)}>
          <MessageSquare size={14} className="mr-2" /> Query this dataset
        </Button>
        <Button variant="outline" className="border-border text-destructive hover:bg-destructive/10 sm:w-auto" onClick={() => { onDeleteClick(dataset); onClose(); }}>
          <Trash2 size={14} />
        </Button>
      </div>
    </motion.div>,
    document.body
  );
}

export default function DatasetsPage() {
  const navigate = useNavigate();
  const { datasets, addDataset, removeDataset, duplicateDataset, updateDatasetMeta, loading } = useDatasetStore();
  const { entries } = useHistoryStore();
  const { addLocalNotification } = useNotificationsStore();
  const { context: planContext, checkMetric, fetchPlan } = usePlanStore();
  const [parsing, setParsing] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<StoredDataset | null>(null);
  const [datasetToDelete, setDatasetToDelete] = useState<StoredDataset | null>(null);
  const [dependencyWarningData, setDependencyWarningData] = useState<{ isUsed: boolean; deployments: any[] } | null>(null);
  const [checkingDependency, setCheckingDependency] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingDataset, setEditingDataset] = useState<StoredDataset | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [uiMeta, setUiMeta] = useState<Record<string, DatasetUiMeta>>(() => readJson(DATASET_UI_KEY, {}));
  const savedFilters = readJson<{ searchTerm?: string; sortBy?: DatasetSort; viewMode?: DatasetView; density?: DatasetDensity }>(DATASET_FILTER_KEY, {});
  const [searchTerm, setSearchTerm] = useState(savedFilters.searchTerm || "");
  const [sortBy, setSortBy] = useState<DatasetSort>(savedFilters.sortBy || "newest");
  const [viewMode, setViewMode] = useState<DatasetView>(savedFilters.viewMode || "grid");
  const [density, setDensity] = useState<DatasetDensity>(savedFilters.density || "comfortable");
  const [typeFilter, setTypeFilter] = useState<"all" | "csv" | "xlsx" | "xls">("all");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showRecentOnly, setShowRecentOnly] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);

  useEffect(() => {
    localStorage.setItem(DATASET_UI_KEY, JSON.stringify(uiMeta));
  }, [uiMeta]);

  useEffect(() => {
    localStorage.setItem(DATASET_FILTER_KEY, JSON.stringify({ searchTerm, sortBy, viewMode, density }));
  }, [searchTerm, sortBy, viewMode, density]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const processUploadFile = useCallback(async (item: UploadQueueItem) => {
    const hasDuplicate = datasets.some((ds) => !ds.archived && ds.fileName.toLowerCase() === item.file.name.toLowerCase());
    if (hasDuplicate) {
      setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "duplicate", progress: 100, error: "A dataset with this file name already exists." } : q));
      toast.warning(`${item.file.name} already exists. Rename the file or delete the old one before uploading.`);
      return;
    }

    try {
      const activePlan = planContext?.plan || (await fetchPlan())?.plan;
      if (activePlan?.fileSizeLimitBytes !== null && activePlan?.fileSizeLimitBytes !== undefined && item.file.size > activePlan.fileSizeLimitBytes) {
        const message = getFileSizeLimitMessage(item.file, activePlan);
        setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "failed", progress: 100, error: message } : q));
        toast.error(message, {
          action: {
            label: "View Plans",
            onClick: () => navigate("/app/pricing"),
          },
        });
        return;
      }

      setParsing(true);
      setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "uploading", progress: 20, error: undefined } : q));
      await checkMetric("datasets", 1);
      const parsed = await parseFile(item.file);
      setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, progress: 70 } : q));
      await addDataset(parsed);
      fetchPlan();
      setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "done", progress: 100 } : q));
      toast.success(`${item.file.name} uploaded successfully`);
    } catch (err: any) {
      setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "failed", progress: 100, error: err.message || "Upload failed" } : q));
      toast.error(err.message || `Failed to upload ${item.file.name}`, {
        action: {
          label: "View Plans",
          onClick: () => navigate("/app/pricing"),
        },
      });
    } finally {
      setParsing(false);
    }
  }, [addDataset, checkMetric, datasets, fetchPlan, planContext]);

  const retryUpload = useCallback((item: UploadQueueItem) => {
    processUploadFile({ ...item, status: "queued", progress: 0, error: undefined });
  }, [processUploadFile]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const seenNames = new Set(datasets.filter((ds) => !ds.archived).map((ds) => ds.fileName.toLowerCase()));
    const queued = acceptedFiles.map((file) => {
      const key = file.name.toLowerCase();
      const duplicate = seenNames.has(key);
      seenNames.add(key);
      return {
        id: crypto.randomUUID(),
        file,
        status: duplicate ? "duplicate" as UploadStatus : "queued" as UploadStatus,
        progress: duplicate ? 100 : 0,
        error: duplicate ? "A dataset with this file name already exists." : undefined,
      };
    });
    setUploadQueue((prev) => [...queued, ...prev].slice(0, 12));
    if (queued.some((item) => item.status === "duplicate")) {
      toast.warning("One or more files already exist. Duplicate names were skipped.");
    }
    for (const item of queued.filter((q) => q.status === "queued")) {
      await processUploadFile(item);
    }
  }, [datasets, processUploadFile]);

  const onDropRejected = useCallback((fileRejections: FileRejection[]) => {
    const activePlan = planContext?.plan;
    const rejected = fileRejections.map(({ file, errors }) => {
      const message = errors.some((error) => error.code === "file-too-large") && activePlan
        ? getFileSizeLimitMessage(file, activePlan)
        : errors.map((error) => error.message).join(", ") || "File rejected";
      return {
        id: crypto.randomUUID(),
        file,
        status: "failed" as UploadStatus,
        progress: 100,
        error: message,
      };
    });
    if (rejected.length === 0) return;
    setUploadQueue((prev) => [...rejected, ...prev].slice(0, 12));
    toast.error(rejected[0].error || "One or more files were rejected.");
  }, [planContext]);

  const fileSizeLimit = planContext?.plan.fileSizeLimitBytes;
  const fileSizeLimitLabel = planContext ? formatFileSizeLimit(fileSizeLimit) : "Checking plan limit...";

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: { "text/csv": [".csv"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"] },
    maxSize: planContext ? fileSizeLimit ?? undefined : undefined,
  });

  const fileTypeBadge = (type: string) => {
    const colors: Record<string, string> = { csv: "bg-success/10 text-success", xlsx: "bg-primary/10 text-primary", xls: "bg-primary/10 text-primary" };
    return <Badge className={`${colors[type] || "bg-muted text-muted-foreground"} border-0 text-xs uppercase`}>{type}</Badge>;
  };

  const visibleDatasets = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return datasets
      .filter((ds) => {
        const meta = uiMeta[ds.id];
        if (ds.archived) return false;
        if (typeFilter !== "all" && ds.fileType.toLowerCase() !== typeFilter) return false;
        if (showFavoritesOnly && !meta?.favorite) return false;
        if (showRecentOnly && !isRecentlyUsed(ds)) return false;
        if (!q) return true;
        return [
          ds.fileName,
          ds.displayName || "",
          ds.notes || "",
          ds.fileType,
          ...ds.sheetNames,
          ...(ds.tags || []),
        ].some((value) => value.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const aTotals = getDatasetTotals(a);
        const bTotals = getDatasetTotals(b);
        const aMeta = uiMeta[a.id] || {};
        const bMeta = uiMeta[b.id] || {};
        if (aMeta.pinned !== bMeta.pinned) return aMeta.pinned ? -1 : 1;
        if (aMeta.favorite !== bMeta.favorite) return aMeta.favorite ? -1 : 1;
        if (sortBy === "oldest") return new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime();
        if (sortBy === "name") return (a.displayName || a.fileName).localeCompare(b.displayName || b.fileName);
        if (sortBy === "type") return a.fileType.localeCompare(b.fileType) || a.fileName.localeCompare(b.fileName);
        if (sortBy === "rows") return bTotals.rows - aTotals.rows;
        return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
      });
  }, [datasets, searchTerm, sortBy, uiMeta, typeFilter, showFavoritesOnly, showRecentOnly]);

  const copyDatasetName = async (name: string) => {
    await navigator.clipboard.writeText(name);
    toast.success("Dataset name copied");
  };

  const handleDuplicateDataset = async (dataset: StoredDataset) => {
    try {
      await checkMetric("datasets", 1);
      await duplicateDataset(dataset.id);
      fetchPlan();
      toast.success(`${dataset.fileName} duplicated`);
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate dataset", {
        action: {
          label: "View Plans",
          onClick: () => navigate("/app/pricing"),
        },
      });
    }
  };

  const handleAttemptDeleteDataset = async (ds: StoredDataset) => {
    setCheckingDependency(true);
    try {
      const data = await api.get<{ isUsed: boolean; deployments: any[] }>(
        `/deployments/check-dependency?datasetId=${ds.id}`
      );
      if (data.isUsed) {
        setDependencyWarningData({ isUsed: true, deployments: data.deployments });
      }
      setDatasetToDelete(ds);
    } catch (err) {
      console.error(err);
      setDatasetToDelete(ds);
    } finally {
      setCheckingDependency(false);
    }
  };

  const confirmDeleteDataset = async () => {
    if (!datasetToDelete) return;
    await removeDataset(datasetToDelete.id);
    if (selectedDataset?.id === datasetToDelete.id) setSelectedDataset(null);
    setSelectedIds((prev) => prev.filter((id) => id !== datasetToDelete.id));
    setUiMeta((prev) => {
      const next = { ...prev };
      delete next[datasetToDelete.id];
      return next;
    });
    toast.success(`${datasetToDelete.fileName} deleted`);
    addLocalNotification({ type: "system", title: "Dataset deleted", message: `${datasetToDelete.fileName} was deleted.`, icon: "database", link: "/app/datasets" });
    setDatasetToDelete(null);
    setDependencyWarningData(null);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const deleteSelectedDatasets = async () => {
    const deleting = [...selectedIds];
    await Promise.all(deleting.map((id) => removeDataset(id)));
    setSelectedIds([]);
    setBulkDeleteOpen(false);
    setUiMeta((prev) => {
      const next = { ...prev };
      deleting.forEach((id) => delete next[id]);
      return next;
    });
    if (selectedDataset && deleting.includes(selectedDataset.id)) setSelectedDataset(null);
    toast.success(`${deleting.length} dataset${deleting.length === 1 ? "" : "s"} deleted`);
    addLocalNotification({ type: "system", title: "Datasets deleted", message: `${deleting.length} dataset${deleting.length === 1 ? "" : "s"} deleted.`, icon: "database", link: "/app/datasets" });
  };

  const patchMeta = (id: string, patch: DatasetUiMeta) => {
    setUiMeta((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const openEditDataset = (dataset: StoredDataset) => {
    setEditingDataset(dataset);
    setEditName(dataset.displayName || dataset.fileName);
    setEditTags((dataset.tags || []).join(", "));
    setEditNotes(dataset.notes || "");
  };

  const saveDatasetMeta = async () => {
    if (!editingDataset) return;
    try {
      await updateDatasetMeta(editingDataset.id, {
        displayName: editName.trim() || editingDataset.fileName,
        tags: editTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        notes: editNotes.trim(),
      });
      setEditingDataset(null);
      toast.success("Dataset details saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save dataset details");
    }
  };

  const isRecentlyUsed = (dataset: StoredDataset) => entries.some((entry) => entry.datasetName === dataset.fileName);

  const lastQueriedMap = useMemo(() => {
    const map: Record<string, Date> = {};
    for (const e of entries) {
      const d = new Date(e.date);
      if (!map[e.datasetName] || d > map[e.datasetName]) map[e.datasetName] = d;
    }
    return map;
  }, [entries]);

  const queryCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of entries) {
      map[e.datasetName] = (map[e.datasetName] || 0) + 1;
    }
    return map;
  }, [entries]);

  const totalRows = useMemo(() =>
    datasets.reduce((s, ds) => s + getDatasetTotals(ds).rows, 0), [datasets]);

  const totalSize = useMemo(() =>
    datasets.reduce((s, ds) => s + (ds.fileSize || 0), 0), [datasets]);

  const recentlyUsedCount = useMemo(() =>
    datasets.filter(isRecentlyUsed).length, [datasets, entries]);

  return (
    <div className="page-shell page-enter space-y-6">
      <PageHeader
        title="Datasets"
        titleIcon={FileSpreadsheet}
        info="Upload CSV and Excel files, organize them with tags and notes, and manage them in list or grid view across all screen sizes."
        stats={[
          { label: "Datasets", value: datasets.length },
          { label: "Recently used", value: datasets.filter(isRecentlyUsed).length },
          { label: "Size limit", value: fileSizeLimitLabel },
        ]}
      />

      {datasets.filter((ds) => !ds.archived).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total datasets", value: datasets.filter((ds) => !ds.archived).length.toLocaleString(), icon: FileSpreadsheet },
            { label: "Total rows", value: totalRows.toLocaleString(), icon: Rows3 },
            { label: "Total size", value: formatBytes(totalSize), icon: HardDrive },
            { label: "Recently used", value: recentlyUsedCount.toLocaleString(), icon: Clock },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="flex items-center gap-3 p-3 bg-background-secondary border-border">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon size={14} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Compact upload bar ──────────────────────────────────────────── */}
      <div
        {...getRootProps()}
        className={[
          "cursor-pointer rounded-2xl border border-dashed transition-all duration-200",
          isDragActive
            ? "border-primary bg-primary/8 shadow-[0_4px_20px_-8px_hsl(var(--primary)/0.35)] py-5"
            : "border-border/60 bg-card/60 hover:border-primary/40 hover:bg-card/80 py-3",
        ].join(" ")}
      >
        <input {...getInputProps()} />
        {parsing ? (
          <div className="flex items-center justify-center gap-2.5 px-4">
            <div className="h-4 w-4 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Parsing file…</p>
          </div>
        ) : isDragActive ? (
          <div className="flex flex-col items-center gap-1.5 px-4 text-center">
            <Upload size={22} className="text-primary" />
            <p className="text-sm font-medium text-primary">Drop to upload</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Upload size={13} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug">Drop files or <span className="text-primary underline underline-offset-2 decoration-primary/40">click to browse</span></p>
                <p className="text-[11px] text-muted-foreground leading-none mt-0.5">{fileSizeLimitLabel} per file</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {["CSV", "XLSX", "XLS"].map((t) => (
                <span key={t} className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Upload queue — fixed bottom-right toast panel ────────────────── */}
      <AnimatePresence>
        {uploadQueue.length > 0 && createPortal(
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-4 right-4 z-50 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-border bg-card shadow-[0_8px_32px_-8px_hsl(var(--foreground)/0.18)] backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Upload size={12} className="text-primary" />
                <p className="text-xs font-semibold text-foreground">Uploads</p>
                <span className="status-badge-neutral tabular-nums">{uploadQueue.length}</span>
              </div>
              <button
                type="button"
                onClick={() => setUploadQueue((prev) => prev.filter((item) => item.status === "uploading"))}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear done
              </button>
            </div>
            <div className="max-h-[260px] overflow-y-auto divide-y divide-border/40 px-0">
              {uploadQueue.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 px-3 py-2">
                  <div className="shrink-0">
                    {item.status === "done" && <CheckCircle2 size={14} className="text-success" />}
                    {item.status === "uploading" && <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
                    {item.status === "queued" && <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/40 border-t-transparent animate-spin" />}
                    {(item.status === "failed" || item.status === "duplicate") && <AlertTriangle size={14} className="text-warning" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground leading-snug">{item.file.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/60">
                        <div
                          className={[
                            "h-1 rounded-full transition-all duration-300",
                            item.status === "done" ? "bg-success" : item.status === "failed" || item.status === "duplicate" ? "bg-warning" : "bg-primary",
                          ].join(" ")}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{item.progress}%</span>
                    </div>
                    {(item.status === "failed" || item.status === "duplicate") && item.error && (
                      <p className="mt-0.5 text-[10px] leading-snug text-warning line-clamp-1">{item.error}</p>
                    )}
                  </div>
                  {(item.status === "failed" || item.status === "duplicate") && (
                    <button
                      type="button"
                      onClick={() => retryUpload(item)}
                      className="shrink-0 rounded-lg border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                    >
                      Retry
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>,
          document.body
        )}
      </AnimatePresence>

      {datasets.length > 0 && (
        <FilterToolbar
          search={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search datasets, sheets, or file types…"
          filters={[
            {
              key: "type",
              label: "Type",
              options: [
                { value: "all", label: "All types" },
                { value: "csv", label: "CSV" },
                { value: "xlsx", label: "XLSX" },
                { value: "xls", label: "XLS" },
              ],
            },
          ]}
          values={{ type: typeFilter }}
          onValueChange={(key, value) => {
            if (key === "type") setTypeFilter(value);
          }}
          onClearAll={() => {
            setTypeFilter("all");
            setShowFavoritesOnly(false);
            setShowRecentOnly(false);
          }}
          trailing={
            <>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as DatasetSort)}>
                <SelectTrigger className="h-9 w-[150px] bg-background-secondary border-border text-xs">
                  <ArrowUpDown size={13} className="mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                  <SelectItem value="type">File type</SelectItem>
                  <SelectItem value="rows">Most rows</SelectItem>
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => setShowFavoritesOnly((p) => !p)}
                className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                  showFavoritesOnly
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <Star size={12} fill={showFavoritesOnly ? "currentColor" : "none"} />
                <span className="hidden lg:inline">Favorites</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRecentOnly((p) => !p)}
                className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                  showRecentOnly
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <Clock size={12} />
                <span className="hidden lg:inline">Recent</span>
              </button>
              <DensityToggle value={density} onValueChange={setDensity} showLabel={false} />
              <div className="flex rounded-lg border border-border bg-background-secondary p-0.5">
                <button
                  type="button"
                  aria-label="Grid view"
                  title="Grid view"
                  onClick={() => setViewMode("grid")}
                  className={`rounded-md p-1.5 transition-colors ${viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Grid3X3 size={14} />
                </button>
                <button
                  type="button"
                  aria-label="List view"
                  title="List view"
                  onClick={() => setViewMode("list")}
                  className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <List size={14} />
                </button>
              </div>
            </>
          }
        />
      )}

      {selectedIds.length > 0 && (
        <div className="toolbar-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setSelectedIds(selectedIds.length === visibleDatasets.length ? [] : visibleDatasets.map((ds) => ds.id))}
              className="flex items-center gap-1 hover:text-foreground"
            >
              {selectedIds.length === visibleDatasets.length && visibleDatasets.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
              {selectedIds.length} selected
            </button>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <>
                <Button variant="outline" size="sm" className="h-8 border-border" onClick={() => setSelectedIds([])}>
                  <RotateCcw size={13} className="mr-1" /> Clear
                </Button>
                <Button variant="destructive" size="sm" className="h-8" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 size={13} className="mr-1" /> Delete selected
                </Button>
              </>
            )}
          </div>
        </div>
        </div>
      )}

      {loading && datasets.length === 0 ? (
        <CardGridSkeleton cards={6} />
      ) : datasets.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No datasets yet"
          description="Upload a CSV or Excel file above to get started. Your data stays private and secure."
          secondaryAction={
            <Button variant="outline" size="sm" onClick={() => navigate("/app/templates")}>
              Browse templates
            </Button>
          }
        />
      ) : visibleDatasets.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching datasets"
          description="Try a different search term or clear your active filters."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSearchTerm(""); setTypeFilter("all"); setShowFavoritesOnly(false); setShowRecentOnly(false); }}
            >
              <X size={12} className="mr-1" /> Clear filters
            </Button>
          }
        />
      ) : viewMode === "list" ? (
        <div className="page-table-wrap data-table-sticky">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="bg-background-secondary">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Dataset</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Rows</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Columns</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Size</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Uploaded</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden xl:table-cell">Last queried</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleDatasets.map((ds) => {
                const totals = getDatasetTotals(ds);
                const meta = uiMeta[ds.id] || {};
                const label = ds.displayName || ds.fileName;
                return (
                  <tr key={ds.id} className="border-t border-border hover:bg-card/50 cursor-pointer" onClick={() => setSelectedDataset(ds)}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <Checkbox checked={selectedIds.includes(ds.id)} onCheckedChange={() => toggleSelected(ds.id)} onClick={(event) => event.stopPropagation()} aria-label={`Select ${label}`} />
                        <FileSpreadsheet size={16} className="text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <DatasetNameText label={label} query={searchTerm} />
                          <div className="flex flex-wrap gap-1">
                            {fileTypeBadge(ds.fileType)}
                            {meta.pinned && <Badge className="border-0 bg-primary/10 text-primary text-xs">Pinned</Badge>}
                            {meta.favorite && <Badge className="border-0 bg-warning/10 text-warning text-xs">Favorite</Badge>}
                            {isRecentlyUsed(ds) && <Badge className="border-0 bg-success/10 text-success text-xs">Recently used</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                        {ds.displayName && ds.displayName !== ds.fileName && <span className="max-w-full truncate" title={ds.fileName}>File: {ds.fileName}</span>}
                        <span>{ds.sheetNames.length} sheet(s)</span>
                        <span>Owner: {ds.ownerEmail || ds.createdBy || "You"}</span>
                        {(ds.tags || []).map((tag) => (
                          <button key={tag} type="button" onClick={(e) => { e.stopPropagation(); setSearchTerm(tag); }}>
                            <Badge variant="outline" className="border-border text-[10px] cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors">{tag}</Badge>
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{totals.rows.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{totals.columns.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatBytes(ds.fileSize)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{new Date(ds.uploadDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden xl:table-cell">
                      {lastQueriedMap[ds.fileName]
                        ? <span className="flex items-center gap-1"><Clock size={10} />{lastQueriedMap[ds.fileName].toLocaleDateString()}</span>
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label="Delete dataset"
                          title="Delete dataset"
                          onClick={(event) => { event.stopPropagation(); handleAttemptDeleteDataset(ds); }}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={13} />
                        </button>
                        <ChevronRight size={14} className="text-muted-foreground" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          initial="hidden"
          animate="visible"
        >
          {visibleDatasets.map((ds) => {
            const { rows: dsRows, columns: dsCols } = getDatasetTotals(ds);
            const meta = uiMeta[ds.id] || {};
            const label = ds.displayName || ds.fileName;
            return (
              <motion.div
                key={ds.id}
                variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } }}
                whileHover={{ y: -2, transition: { duration: 0.15 } }}
              >
                <Card
                  className={`${density === "compact" ? "p-3" : "p-4"} bg-background-secondary border-border hover:border-primary/30 hover:shadow-[0_4px_20px_-8px_hsl(var(--primary)/0.2)] transition-all cursor-pointer group`}
                  onClick={() => setSelectedDataset(ds)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox checked={selectedIds.includes(ds.id)} onCheckedChange={() => toggleSelected(ds.id)} onClick={(event) => event.stopPropagation()} aria-label={`Select ${label}`} />
                      <FileSpreadsheet size={18} className="text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <DatasetNameText label={label} query={searchTerm} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label="Delete dataset"
                        title="Delete dataset"
                        onClick={(event) => { event.stopPropagation(); handleAttemptDeleteDataset(ds); }}
                        className="reveal-actions p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={12} />
                      </button>
                      {fileTypeBadge(ds.fileType)}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground mb-3">
                    <span>{dsRows.toLocaleString()} rows</span>
                    <span>{dsCols} columns</span>
                    <span>{ds.sheetNames.length} sheet(s)</span>
                  </div>
                  {ds.displayName && ds.displayName !== ds.fileName && (
                    <p className="mb-3 truncate text-xs text-muted-foreground" title={ds.fileName}>File: {ds.fileName}</p>
                  )}
                  <div className="mb-3 flex flex-wrap gap-1">
                    {meta.pinned && <Badge className="border-0 bg-primary/10 text-primary text-xs">Pinned</Badge>}
                    {meta.favorite && <Badge className="border-0 bg-warning/10 text-warning text-xs">Favorite</Badge>}
                    {isRecentlyUsed(ds) && <Badge className="border-0 bg-success/10 text-success text-xs">Recently used</Badge>}
                    {(ds.tags || []).map((tag) => (
                      <button key={tag} type="button" onClick={(e) => { e.stopPropagation(); setSearchTerm(tag); }}>
                        <Badge variant="outline" className="border-border text-[10px] cursor-pointer hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors">{tag}</Badge>
                      </button>
                    ))}
                    {ds.notes && <Badge variant="outline" className="border-border text-[10px]"><StickyNote size={8} className="mr-1" />Note</Badge>}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                    <span>{formatBytes(ds.fileSize)}</span>
                    {queryCountMap[ds.fileName] > 0 && (
                      <span className="text-primary font-medium">{queryCountMap[ds.fileName]}× queried</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                      <span>{new Date(ds.uploadDate).toLocaleDateString()}</span>
                      {lastQueriedMap[ds.fileName] && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} /> {lastQueriedMap[ds.fileName].toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <span className="reveal-actions flex items-center gap-1 text-xs text-primary">
                      View <ChevronRight size={12} />
                    </span>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <AnimatePresence>
        {selectedDataset && (
          <DatasetDetailPanel
            dataset={selectedDataset}
            displayName={selectedDataset.displayName}
            onDeleteClick={handleAttemptDeleteDataset}
            onClose={() => setSelectedDataset(null)}
          />
        )}
      </AnimatePresence>

      <Dialog open={!!editingDataset} onOpenChange={(open) => { if (!open) setEditingDataset(null); }}>
        <DialogContent className="bg-background-secondary border-border">
          <DialogHeader>
            <DialogTitle>Dataset details</DialogTitle>
            <DialogDescription>Rename the display label and add notes or tags. The source file data stays unchanged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Display name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 bg-card border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tags</label>
              <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="sales, finance, draft" className="mt-1 bg-card border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="What should your team remember about this file?" className="mt-1 min-h-[80px] bg-card border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDataset(null)} className="border-border">Cancel</Button>
            <Button onClick={saveDatasetMeta}>Save details</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="bg-background-secondary border-border">
          <DialogHeader>
            <DialogTitle>Delete selected datasets</DialogTitle>
            <DialogDescription>
              This will permanently delete {selectedIds.length} selected dataset{selectedIds.length === 1 ? "" : "s"} and their stored data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} className="border-border">Cancel</Button>
            <Button variant="destructive" onClick={deleteSelectedDatasets}>
              <Trash2 size={14} className="mr-2" /> Delete selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!datasetToDelete} onOpenChange={(open) => { if (!open) { setDatasetToDelete(null); setDependencyWarningData(null); } }}>
        <DialogContent className="bg-background-secondary border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dependencyWarningData ? (
                <AlertTriangle className="text-warning shrink-0" size={18} />
              ) : null}
              {dependencyWarningData ? "Resource In Use" : "Delete dataset"}
            </DialogTitle>
            <DialogDescription>
              {dependencyWarningData ? (
                <span className="text-warning font-medium">
                  WARNING: This dataset is connected to active, deployed chatbots. Deleting it will break their functionality!
                </span>
              ) : (
                `This will permanently delete "${datasetToDelete?.fileName}" and its stored data.`
              )}
            </DialogDescription>
          </DialogHeader>
          
          {dependencyWarningData && dependencyWarningData.deployments.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Affected deployments:</p>
              <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-md border border-border bg-card p-2.5">
                {dependencyWarningData.deployments.map((dep: any) => (
                  <div key={dep.id || dep._id} className="flex items-center justify-between text-xs text-foreground">
                    <span className="font-medium truncate max-w-[180px]">{dep.name}</span>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {dep.status || "active"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {datasetToDelete && !dependencyWarningData && (
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-md border border-border bg-card p-2">Rows: {getDatasetTotals(datasetToDelete).rows.toLocaleString()}</div>
              <div className="rounded-md border border-border bg-card p-2">Columns: {getDatasetTotals(datasetToDelete).columns.toLocaleString()}</div>
              <div className="rounded-md border border-border bg-card p-2">Type: {datasetToDelete.fileType.toUpperCase()}</div>
              <div className="rounded-md border border-border bg-card p-2">Uploaded: {new Date(datasetToDelete.uploadDate).toLocaleDateString()}</div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setDatasetToDelete(null); setDependencyWarningData(null); }} className="border-border">Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteDataset} disabled={checkingDependency}>
              <Trash2 size={14} className="mr-2" /> {dependencyWarningData ? "Force Delete" : "Delete file"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
