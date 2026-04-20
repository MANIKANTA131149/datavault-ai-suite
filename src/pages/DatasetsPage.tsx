import { useState, useCallback, useMemo, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, FileText, X, Eye, Trash2, MessageSquare, ChevronRight, Hash, TrendingUp, Tag, Calendar, ToggleLeft, AlertTriangle, CheckCircle2, Info, Search, Copy, Grid3X3, List, ArrowUpDown, Star, Pin, Pencil, StickyNote, Rows3, Columns3, SlidersHorizontal, CheckSquare, Square, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { parseFile } from "@/lib/file-parser";
import type { ColumnInfo, ParsedFile } from "@/lib/file-parser";
import { useDatasetStore, type StoredDataset } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";
import { useNotificationsStore } from "@/stores/notifications-store";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
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

function DatasetDetailPanel({ dataset, onClose, displayName }: { dataset: StoredDataset; onClose: () => void; displayName?: string }) {
  const [activeSheet, setActiveSheet] = useState(dataset.sheetNames[0]);
  const { archiveDataset, loadDatasetData } = useDatasetStore();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
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

  return (
    <motion.div
      className="fixed inset-y-0 right-0 w-full max-w-lg bg-background-secondary border-l border-border z-50 flex flex-col"
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-foreground">{displayName || dataset.fileName}</h3>
          <p className="text-xs text-muted-foreground">Owner: {dataset.ownerEmail || dataset.createdBy || "You"}</p>
          <p className="text-xs text-muted-foreground">{dataset.sheetNames.length} sheet(s) · uploaded {new Date(dataset.uploadDate).toLocaleDateString()}</p>
        </div>
        <button aria-label="Close dataset details" title="Close" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-4 gap-2 p-4 pb-1">
        {[
          { label: "Rows", value: totals.rows.toLocaleString(), icon: Rows3 },
          { label: "Columns", value: totals.columns.toLocaleString(), icon: Columns3 },
          { label: "Sheets", value: dataset.sheetNames.length.toLocaleString(), icon: FileSpreadsheet },
          { label: "Uploaded", value: new Date(dataset.uploadDate).toLocaleDateString(), icon: Calendar },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-md border border-border bg-card p-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Icon size={10} />{label}</div>
            <p className="mt-1 truncate text-xs font-medium text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {dataset.sheetNames.length > 1 && (
        <div className="px-4 pt-3">
          <div className="flex gap-1 overflow-x-auto">
            {dataset.sheetNames.map((s) => (
              <button key={s} onClick={() => setActiveSheet(s)} className={`px-3 py-1 text-xs rounded-md transition-colors ${s === activeSheet ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
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
        <TabsList className="mx-4 mt-3 bg-card">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="schema">Schema</TabsTrigger>
          <TabsTrigger value="statistics">Intelligence</TabsTrigger>
        </TabsList>

        {sheet && (
          <div className="mx-4 mt-3 rounded-md border border-border bg-card p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} placeholder="Search columns..." className="h-8 pl-8 bg-background-secondary border-border text-xs" />
              </div>
              <Select value={columnTypeFilter} onValueChange={setColumnTypeFilter}>
                <SelectTrigger className="h-8 bg-background-secondary border-border text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="string">String</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(typeCounts).map(([type, count]) => (
                <Badge key={type} variant="outline" className="border-border text-xs capitalize">{type}: {count}</Badge>
              ))}
              <Badge variant="outline" className="border-border text-xs">{visibleColumns.length} visible</Badge>
            </div>
          </div>
        )}

        <TabsContent value="preview" className="flex-1 overflow-auto px-4 pb-4">
          <div className="overflow-x-auto mt-3 rounded-md border border-border">
            <table className="w-full text-xs">
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
          <div className="mt-3 rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
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

      <div className="p-4 border-t border-border flex gap-2">
        <Button className="flex-1" onClick={() => navigate(`/app/query?dataset=${dataset.id}`)}>
          <MessageSquare size={14} className="mr-2" /> Query this dataset
        </Button>
        <Button variant="outline" className="border-border text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
          <Trash2 size={14} />
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-background-secondary border-border">
          <DialogHeader>
            <DialogTitle>Archive dataset</DialogTitle>
            <DialogDescription>This will archive "{dataset.fileName}". You can undo it from the toast.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="border-border">Cancel</Button>
            <Button variant="destructive" onClick={async () => { await archiveDataset(dataset.id, true); setDeleteOpen(false); toast.success("Dataset archived", { action: { label: "Undo", onClick: () => archiveDataset(dataset.id, false) } }); onClose(); }}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

export default function DatasetsPage() {
  const { datasets, addDataset, archiveDataset, duplicateDataset, updateDatasetMeta, loading } = useDatasetStore();
  const { entries } = useHistoryStore();
  const { addLocalNotification } = useNotificationsStore();
  const [parsing, setParsing] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<StoredDataset | null>(null);
  const [datasetToDelete, setDatasetToDelete] = useState<StoredDataset | null>(null);
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
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);

  useEffect(() => {
    localStorage.setItem(DATASET_UI_KEY, JSON.stringify(uiMeta));
  }, [uiMeta]);

  useEffect(() => {
    localStorage.setItem(DATASET_FILTER_KEY, JSON.stringify({ searchTerm, sortBy, viewMode, density }));
  }, [searchTerm, sortBy, viewMode, density]);

  const processUploadFile = useCallback(async (item: UploadQueueItem) => {
    const hasDuplicate = datasets.some((ds) => !ds.archived && ds.fileName.toLowerCase() === item.file.name.toLowerCase());
    if (hasDuplicate) {
      setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "duplicate", progress: 100, error: "A dataset with this file name already exists." } : q));
      toast.warning(`${item.file.name} already exists. Rename the file or delete the old one before uploading.`);
      return;
    }

    setParsing(true);
    setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "uploading", progress: 20, error: undefined } : q));
    try {
      const parsed = await parseFile(item.file);
      setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, progress: 70 } : q));
      await addDataset(parsed);
      setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "done", progress: 100 } : q));
      toast.success(`${item.file.name} uploaded successfully`);
    } catch (err: any) {
      setUploadQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "failed", progress: 100, error: err.message || "Upload failed" } : q));
      toast.error(`Failed to parse ${item.file.name}: ${err.message}`);
    } finally {
      setParsing(false);
    }
  }, [addDataset, datasets]);

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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"] },
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
  }, [datasets, searchTerm, sortBy, uiMeta]);

  const copyDatasetName = async (name: string) => {
    await navigator.clipboard.writeText(name);
    toast.success("Dataset name copied");
  };

  const handleDuplicateDataset = async (dataset: StoredDataset) => {
    try {
      await duplicateDataset(dataset.id);
      toast.success(`${dataset.fileName} duplicated`);
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate dataset");
    }
  };

  const confirmDeleteDataset = async () => {
    if (!datasetToDelete) return;
    await archiveDataset(datasetToDelete.id, true);
    if (selectedDataset?.id === datasetToDelete.id) setSelectedDataset(null);
    toast.success(`${datasetToDelete.fileName} archived`, { action: { label: "Undo", onClick: () => archiveDataset(datasetToDelete.id, false) } });
    addLocalNotification({ type: "system", title: "Dataset archived", message: `${datasetToDelete.fileName} was archived.`, icon: "database", link: "/app/datasets" });
    setDatasetToDelete(null);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const deleteSelectedDatasets = async () => {
    const deleting = [...selectedIds];
    for (const id of deleting) await archiveDataset(id, true);
    setSelectedIds([]);
    setBulkDeleteOpen(false);
    toast.success(`${deleting.length} dataset${deleting.length === 1 ? "" : "s"} archived`, { action: { label: "Undo", onClick: () => deleting.forEach((id) => archiveDataset(id, false)) } });
    addLocalNotification({ type: "system", title: "Datasets archived", message: `${deleting.length} dataset${deleting.length === 1 ? "" : "s"} archived.`, icon: "database", link: "/app/datasets" });
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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Datasets</h1>
        <p className="text-sm text-muted-foreground mt-1">Upload and manage your data files.</p>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
        }`}
      >
        <input {...getInputProps()} />
        {parsing ? (
          <div className="space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Parsing file...</p>
          </div>
        ) : (
          <>
            <Upload size={32} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-foreground font-medium">Drop CSV or Excel files here, or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Supports .csv, .xlsx, .xls</p>
            <div className="flex gap-2 justify-center mt-3">
              {["CSV", "XLSX", "XLS"].map((t) => (
                <Badge key={t} variant="outline" className="border-border text-xs text-muted-foreground">{t}</Badge>
              ))}
            </div>
          </>
        )}
      </div>

      {uploadQueue.length > 0 && (
        <Card className="p-3 bg-background-secondary border-border space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">Upload queue</p>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setUploadQueue((prev) => prev.filter((item) => item.status === "uploading"))}>
              Clear finished
            </Button>
          </div>
          <div className="space-y-2">
            {uploadQueue.map((item) => (
              <div key={item.id} className="rounded-md border border-border bg-card p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{item.file.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.status === "queued" && "Queued"}
                      {item.status === "uploading" && "Importing"}
                      {item.status === "done" && "Uploaded"}
                      {item.status === "failed" && (item.error || "Failed")}
                      {item.status === "duplicate" && "Duplicate filename detected"}
                    </p>
                  </div>
                  {(item.status === "failed" || item.status === "duplicate") && (
                    <Button variant="outline" size="sm" className="h-7 border-border text-xs" onClick={() => retryUpload(item)}>
                      <RotateCcw size={12} className="mr-1" /> Retry
                    </Button>
                  )}
                  {item.status === "done" && <CheckCircle2 size={15} className="text-success" />}
                  {item.status === "uploading" && <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
                  {(item.status === "failed" || item.status === "duplicate") && <AlertTriangle size={15} className="text-warning" />}
                </div>
                <Progress value={item.progress} className="mt-2 h-1.5" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {datasets.length > 0 && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search datasets, sheets, or file types..."
              className="pl-9 pr-9 bg-background-secondary border-border"
            />
            {searchTerm && (
              <button type="button" aria-label="Clear search" title="Clear search" onClick={() => setSearchTerm("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as DatasetSort)}>
              <SelectTrigger className="w-[160px] bg-background-secondary border-border">
                <ArrowUpDown size={13} className="mr-2" />
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
              aria-label="Toggle density"
              title="Toggle density"
              onClick={() => setDensity((prev) => prev === "compact" ? "comfortable" : "compact")}
              className="h-9 rounded-md border border-border bg-background-secondary px-2 text-muted-foreground hover:text-foreground"
            >
              <SlidersHorizontal size={14} />
            </button>
            <div className="flex rounded-md border border-border bg-background-secondary p-1">
              <button
                type="button"
                aria-label="Grid view"
                title="Grid view"
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded ${viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Grid3X3 size={14} />
              </button>
              <button
                type="button"
                aria-label="List view"
                title="List view"
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background-secondary px-3 py-2">
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
                  <Trash2 size={13} className="mr-1" /> Archive selected
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {loading && datasets.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="p-4 bg-background-secondary border-border space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-full" />
            </Card>
          ))}
        </div>
      ) : datasets.length === 0 ? (
        <div className="text-center py-16">
          <FileSpreadsheet size={48} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">No datasets uploaded yet</p>
          <p className="text-xs text-muted-foreground mt-1">Upload a CSV or Excel file to get started</p>
        </div>
      ) : visibleDatasets.length === 0 ? (
        <div className="text-center py-16">
          <Search size={48} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">No matching datasets</p>
          <p className="text-xs text-muted-foreground mt-1">Try a different name, sheet, or file type.</p>
        </div>
      ) : viewMode === "list" ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background-secondary">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Dataset</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Rows</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Columns</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Size</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Uploaded</th>
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
                        {(ds.tags || []).map((tag) => <Badge key={tag} variant="outline" className="border-border text-[10px]">{tag}</Badge>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{totals.rows.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{totals.columns.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatBytes(ds.fileSize)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{new Date(ds.uploadDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label="Copy dataset name"
                          title="Copy dataset name"
                          onClick={(event) => { event.stopPropagation(); copyDatasetName(ds.fileName); }}
                          className="p-1.5 rounded hover:bg-background-secondary text-muted-foreground hover:text-foreground"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label="Duplicate dataset"
                          title="Duplicate dataset"
                          onClick={(event) => { event.stopPropagation(); handleDuplicateDataset(ds); }}
                          className="p-1.5 rounded hover:bg-background-secondary text-muted-foreground hover:text-foreground"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label="Edit dataset details"
                          title="Edit dataset details"
                          onClick={(event) => { event.stopPropagation(); openEditDataset(ds); }}
                          className="p-1.5 rounded hover:bg-background-secondary text-muted-foreground hover:text-foreground"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label="Pin dataset"
                          title="Pin dataset"
                          onClick={(event) => { event.stopPropagation(); patchMeta(ds.id, { pinned: !meta.pinned }); }}
                          className={`p-1.5 rounded hover:bg-background-secondary ${meta.pinned ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          <Pin size={13} fill={meta.pinned ? "currentColor" : "none"} />
                        </button>
                        <button
                          type="button"
                          aria-label="Favorite dataset"
                          title="Favorite dataset"
                          onClick={(event) => { event.stopPropagation(); patchMeta(ds.id, { favorite: !meta.favorite }); }}
                          className={`p-1.5 rounded hover:bg-background-secondary ${meta.favorite ? "text-warning" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          <Star size={13} fill={meta.favorite ? "currentColor" : "none"} />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete dataset"
                          title="Delete dataset"
                          onClick={(event) => { event.stopPropagation(); setDatasetToDelete(ds); }}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleDatasets.map((ds) => {
            const { rows: totalRows, columns: totalCols } = getDatasetTotals(ds);
            const meta = uiMeta[ds.id] || {};
            const label = ds.displayName || ds.fileName;
            return (
              <motion.div key={ds.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
                <Card
                  className={`${density === "compact" ? "p-3" : "p-4"} bg-background-secondary border-border hover:border-primary/30 transition-colors cursor-pointer group`}
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
                        aria-label="Copy dataset name"
                        title="Copy dataset name"
                        onClick={(event) => { event.stopPropagation(); copyDatasetName(ds.fileName); }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-card text-muted-foreground hover:text-foreground transition-opacity"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        type="button"
                        aria-label="Duplicate dataset"
                        title="Duplicate dataset"
                        onClick={(event) => { event.stopPropagation(); handleDuplicateDataset(ds); }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-card text-muted-foreground hover:text-foreground transition-opacity"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        type="button"
                        aria-label="Edit dataset details"
                        title="Edit dataset details"
                        onClick={(event) => { event.stopPropagation(); openEditDataset(ds); }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-card text-muted-foreground hover:text-foreground transition-opacity"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        aria-label="Pin dataset"
                        title="Pin dataset"
                        onClick={(event) => { event.stopPropagation(); patchMeta(ds.id, { pinned: !meta.pinned }); }}
                        className={`p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-card transition-opacity ${meta.pinned ? "text-primary opacity-100" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Pin size={12} fill={meta.pinned ? "currentColor" : "none"} />
                      </button>
                      <button
                        type="button"
                        aria-label="Favorite dataset"
                        title="Favorite dataset"
                        onClick={(event) => { event.stopPropagation(); patchMeta(ds.id, { favorite: !meta.favorite }); }}
                        className={`p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-card transition-opacity ${meta.favorite ? "text-warning opacity-100" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Star size={12} fill={meta.favorite ? "currentColor" : "none"} />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete dataset"
                        title="Delete dataset"
                        onClick={(event) => { event.stopPropagation(); setDatasetToDelete(ds); }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                      {fileTypeBadge(ds.fileType)}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground mb-3">
                    <span>{totalRows.toLocaleString()} rows</span>
                    <span>{totalCols} columns</span>
                    <span>{ds.sheetNames.length} sheet(s)</span>
                  </div>
                  {ds.displayName && ds.displayName !== ds.fileName && (
                    <p className="mb-3 truncate text-xs text-muted-foreground" title={ds.fileName}>File: {ds.fileName}</p>
                  )}
                  <div className="mb-3 flex flex-wrap gap-1">
                    {meta.pinned && <Badge className="border-0 bg-primary/10 text-primary text-xs">Pinned</Badge>}
                    {meta.favorite && <Badge className="border-0 bg-warning/10 text-warning text-xs">Favorite</Badge>}
                    {isRecentlyUsed(ds) && <Badge className="border-0 bg-success/10 text-success text-xs">Recently used</Badge>}
                    {(ds.tags || []).map((tag) => <Badge key={tag} variant="outline" className="border-border text-[10px]">{tag}</Badge>)}
                    {ds.notes && <Badge variant="outline" className="border-border text-[10px]"><StickyNote size={8} className="mr-1" />Note</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mb-3">
                    {formatBytes(ds.fileSize)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{ds.ownerEmail || ds.createdBy || "You"} - {new Date(ds.uploadDate).toLocaleDateString()}</span>
                    <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      View <ChevronRight size={12} />
                    </span>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {selectedDataset && (
          <DatasetDetailPanel
            dataset={selectedDataset}
            displayName={selectedDataset.displayName}
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
            <DialogTitle>Archive selected datasets</DialogTitle>
            <DialogDescription>
              This will hide {selectedIds.length} selected dataset{selectedIds.length === 1 ? "" : "s"} from active views. You can undo from the toast.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} className="border-border">Cancel</Button>
            <Button variant="destructive" onClick={deleteSelectedDatasets}>
              <Trash2 size={14} className="mr-2" /> Archive selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!datasetToDelete} onOpenChange={(open) => { if (!open) setDatasetToDelete(null); }}>
        <DialogContent className="bg-background-secondary border-border">
          <DialogHeader>
            <DialogTitle>Archive dataset</DialogTitle>
            <DialogDescription>
              This will hide "{datasetToDelete?.fileName}" from active views. You can undo from the toast.
            </DialogDescription>
          </DialogHeader>
          {datasetToDelete && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border bg-card p-2">Rows: {getDatasetTotals(datasetToDelete).rows.toLocaleString()}</div>
              <div className="rounded-md border border-border bg-card p-2">Columns: {getDatasetTotals(datasetToDelete).columns.toLocaleString()}</div>
              <div className="rounded-md border border-border bg-card p-2">Type: {datasetToDelete.fileType.toUpperCase()}</div>
              <div className="rounded-md border border-border bg-card p-2">Uploaded: {new Date(datasetToDelete.uploadDate).toLocaleDateString()}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDatasetToDelete(null)} className="border-border">Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteDataset}>
              <Trash2 size={14} className="mr-2" /> Archive file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
