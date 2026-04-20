import { useState, useCallback, useMemo, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, FileText, X, Eye, Trash2, MessageSquare, ChevronRight, Hash, TrendingUp, Tag, Calendar, ToggleLeft, AlertTriangle, CheckCircle2, Info, Search, Copy, Grid3X3, List, ArrowUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { parseFile } from "@/lib/file-parser";
import type { ColumnInfo, ParsedFile } from "@/lib/file-parser";
import { useDatasetStore, type StoredDataset } from "@/stores/dataset-store";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

type DatasetSort = "newest" | "oldest" | "name" | "type" | "rows";
type DatasetView = "grid" | "list";

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

function DatasetDetailPanel({ dataset, onClose }: { dataset: StoredDataset; onClose: () => void }) {
  const [activeSheet, setActiveSheet] = useState(dataset.sheetNames[0]);
  const { removeDataset, loadDatasetData } = useDatasetStore();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [localData, setLocalData] = useState<ParsedFile | null>(dataset.data || null);

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

  return (
    <motion.div
      className="fixed inset-y-0 right-0 w-full max-w-lg bg-background-secondary border-l border-border z-50 flex flex-col"
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-foreground">{dataset.fileName}</h3>
          <p className="text-xs text-muted-foreground">{dataset.sheetNames.length} sheet(s) · uploaded {new Date(dataset.uploadDate).toLocaleDateString()}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
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

        <TabsContent value="preview" className="flex-1 overflow-auto px-4 pb-4">
          <div className="overflow-x-auto mt-3 rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr>
                  {sheet?.columns.map((col) => (
                    <th key={col.name} className="text-left px-3 py-2 text-muted-foreground font-medium border-b border-border whitespace-nowrap">{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet?.rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-card/50">
                    {sheet.columns.map((col) => (
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
                {sheet?.columns.map((col) => (
                  <tr key={col.name} className="border-t border-border/50">
                    <td className="px-3 py-2 font-mono text-foreground">{col.name}</td>
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
            <DialogTitle>Delete dataset</DialogTitle>
            <DialogDescription>This will permanently delete "{dataset.fileName}" and all associated data.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="border-border">Cancel</Button>
            <Button variant="destructive" onClick={async () => { await removeDataset(dataset.id); setDeleteOpen(false); toast.success("Dataset deleted"); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

export default function DatasetsPage() {
  const { datasets, addDataset, removeDataset, loading } = useDatasetStore();
  const [parsing, setParsing] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<StoredDataset | null>(null);
  const [datasetToDelete, setDatasetToDelete] = useState<StoredDataset | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<DatasetSort>("newest");
  const [viewMode, setViewMode] = useState<DatasetView>("grid");

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      setParsing(true);
      try {
        const parsed = await parseFile(file);
        await addDataset(parsed);
        toast.success(`${file.name} uploaded successfully`);
      } catch (err: any) {
        toast.error(`Failed to parse ${file.name}: ${err.message}`);
      } finally {
        setParsing(false);
      }
    }
  }, [addDataset]);

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
        if (!q) return true;
        return [
          ds.fileName,
          ds.fileType,
          ...ds.sheetNames,
        ].some((value) => value.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const aTotals = getDatasetTotals(a);
        const bTotals = getDatasetTotals(b);
        if (sortBy === "oldest") return new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime();
        if (sortBy === "name") return a.fileName.localeCompare(b.fileName);
        if (sortBy === "type") return a.fileType.localeCompare(b.fileType) || a.fileName.localeCompare(b.fileName);
        if (sortBy === "rows") return bTotals.rows - aTotals.rows;
        return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
      });
  }, [datasets, searchTerm, sortBy]);

  const copyDatasetName = async (name: string) => {
    await navigator.clipboard.writeText(name);
    toast.success("Dataset name copied");
  };

  const confirmDeleteDataset = async () => {
    if (!datasetToDelete) return;
    await removeDataset(datasetToDelete.id);
    if (selectedDataset?.id === datasetToDelete.id) setSelectedDataset(null);
    toast.success(`${datasetToDelete.fileName} deleted`);
    setDatasetToDelete(null);
  };

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

      {datasets.length > 0 && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search datasets, sheets, or file types..."
              className="pl-9 bg-background-secondary border-border"
            />
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
                return (
                  <tr key={ds.id} className="border-t border-border hover:bg-card/50 cursor-pointer" onClick={() => setSelectedDataset(ds)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileSpreadsheet size={16} className="text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground truncate">{ds.fileName}</span>
                        {fileTypeBadge(ds.fileType)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{ds.sheetNames.length} sheet(s)</p>
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
            return (
              <motion.div key={ds.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
                <Card
                  className="p-4 bg-background-secondary border-border hover:border-primary/30 transition-colors cursor-pointer group"
                  onClick={() => setSelectedDataset(ds)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileSpreadsheet size={18} className="text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">{ds.fileName}</span>
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
                  <div className="text-xs text-muted-foreground mb-3">
                    {formatBytes(ds.fileSize)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{new Date(ds.uploadDate).toLocaleDateString()}</span>
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
        {selectedDataset && <DatasetDetailPanel dataset={selectedDataset} onClose={() => setSelectedDataset(null)} />}
      </AnimatePresence>

      <Dialog open={!!datasetToDelete} onOpenChange={(open) => { if (!open) setDatasetToDelete(null); }}>
        <DialogContent className="bg-background-secondary border-border">
          <DialogHeader>
            <DialogTitle>Delete dataset</DialogTitle>
            <DialogDescription>
              This will permanently delete "{datasetToDelete?.fileName}" and all associated stored data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDatasetToDelete(null)} className="border-border">Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteDataset}>
              <Trash2 size={14} className="mr-2" /> Delete file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
