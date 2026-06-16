import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, ArrowLeft, Trash2, RefreshCw, Database, Loader2,
  MessageSquare, AlertTriangle, Hash, Clock, TrendingUp, Activity,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PanelChart, CHART_COLORS, CHART_TYPE_ICON, panelTypeBreakdown } from "@/components/dashboard/DashboardCharts";
import { useDatasetStore } from "@/stores/dataset-store";
import { dashboardsApi, type DashboardRecord } from "@/lib/automation-client";
import { loadWorkbook, runSQL, type SqlResult } from "@/lib/sql-engine";
import { toast } from "@/lib/toast";

type PanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: Record<string, unknown>[] };

/** Compact "2h ago" / "3d ago" relative time, falling back to a date. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardsViewerPage() {
  const navigate = useNavigate();
  const { datasets, fetchDatasets, loadDatasetData } = useDatasetStore();

  const [dashboards, setDashboards] = useState<DashboardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<DashboardRecord | null>(null);
  const [panelStates, setPanelStates] = useState<Record<string, PanelState>>({});
  const [running, setRunning] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const activeDatasets = useMemo(() => datasets.filter((d) => !d.archived), [datasets]);

  useEffect(() => {
    (async () => {
      try {
        setDashboards(await dashboardsApi.list());
      } catch (err: any) {
        toast.error(err.message || "Failed to load dashboards");
      } finally {
        setLoading(false);
      }
    })();
    if (datasets.length === 0) fetchDatasets();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runPanels = async (dashboard: DashboardRecord, datasetId: string) => {
    setRunning(true);
    setPanelStates(Object.fromEntries(dashboard.panels.map((p) => [p.id, { status: "loading" } as PanelState])));
    try {
      const data = await loadDatasetData(datasetId);
      if (!data) throw new Error("Could not load the dataset's contents");
      const workbookKey =
        Object.keys(data.sheets).sort().join("|") + "::" +
        Object.values(data.sheets).map((s) => s?.rows?.length ?? 0).join(",");
      await loadWorkbook(data.sheets, workbookKey);

      for (const panel of dashboard.panels) {
        try {
          const result = await runSQL(panel.sql);
          if ((result as any)?.error) throw new Error(String((result as any).error));
          setPanelStates((prev) => ({ ...prev, [panel.id]: { status: "ready", rows: (result as SqlResult).rows } }));
        } catch (err: any) {
          setPanelStates((prev) => ({ ...prev, [panel.id]: { status: "error", message: err.message || "Query failed" } }));
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Could not run the dashboard");
      setPanelStates(Object.fromEntries(dashboard.panels.map((p) => [p.id, { status: "error", message: "Dataset unavailable" } as PanelState])));
    } finally {
      setRunning(false);
    }
  };

  const openDashboard = (dashboard: DashboardRecord) => {
    setActive(dashboard);
    setPanelStates({});
    if (dashboard.datasetId) runPanels(dashboard, dashboard.datasetId);
  };

  const bindDataset = async (datasetId: string) => {
    if (!active) return;
    const updated = { ...active, datasetId };
    setActive(updated);
    setDashboards((prev) => prev.map((d) => (d.id === active.id ? updated : d)));
    dashboardsApi.update(active.id, { datasetId }).catch(() => {});
    runPanels(updated, datasetId);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await dashboardsApi.remove(deleteId);
      setDashboards((prev) => prev.filter((d) => d.id !== deleteId));
      if (active?.id === deleteId) setActive(null);
      toast.success("Dashboard deleted");
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    } finally {
      setDeleteId(null);
    }
  };

  // ─── Detail view ─────────────────────────────────────────────────────────────
  if (active) {
    return (
      <div className="page-shell page-enter space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="sm" className="h-8 border-border shrink-0" onClick={() => setActive(null)}>
              <ArrowLeft size={13} className="mr-1" />Back
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-bold text-foreground">{active.name}</h1>
                {running && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                    Live
                  </span>
                )}
              </div>
              {active.description && <p className="truncate text-xs text-muted-foreground">{active.description}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {active.datasetId && (
              <Button variant="outline" size="sm" className="h-8 border-border" onClick={() => runPanels(active, active.datasetId!)} disabled={running}>
                <RefreshCw size={13} className={`mr-1 ${running ? "animate-spin" : ""}`} />Refresh
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8 border-border text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(active.id)}>
              <Trash2 size={13} />
            </Button>
          </div>
        </div>

        {!active.datasetId ? (
          <Card className="p-6">
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Database size={18} className="text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">Which dataset does this dashboard belong to?</p>
              <p className="text-xs text-muted-foreground">Pick the dataset its queries were built for. Your choice is remembered.</p>
              <Select onValueChange={bindDataset}>
                <SelectTrigger className="w-full max-w-xs bg-card border-border"><SelectValue placeholder="Select dataset…" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {activeDatasets.map((d) => (
                    <SelectItem key={d.id} value={d.id}><span className="block max-w-[260px] truncate">{d.displayName || d.fileName}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {active.panels.map((panel, idx) => {
              const state = panelStates[panel.id] || { status: "loading" as const };
              const TypeIcon = CHART_TYPE_ICON[panel.chartType] ?? Hash;
              return (
                <motion.div
                  key={panel.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(idx * 0.07, 0.5), ease: [0.22, 1, 0.36, 1] }}
                  className="min-w-0"
                >
                  <Card className="flex min-w-0 flex-col overflow-hidden p-4 transition-shadow hover:shadow-[0_4px_20px_-10px_hsl(var(--primary)/0.2)]">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <TypeIcon size={13} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold leading-tight text-foreground" title={panel.title}>{panel.title}</h3>
                          <p className="line-clamp-1 text-[11px] leading-snug text-muted-foreground" title={panel.question}>{panel.question}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 border-border text-[10px] capitalize">{panel.chartType}</Badge>
                    </div>
                    <div className="min-w-0 flex-1">
                      {state.status === "loading" && (
                        <div className="flex h-[160px] flex-col items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          <span className="text-[11px]">Running query…</span>
                        </div>
                      )}
                      {state.status === "error" && (
                        <div className="flex h-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 text-center">
                          <AlertTriangle size={16} className="text-destructive" />
                          <p className="max-w-full break-words [overflow-wrap:anywhere] px-3 text-[11px] text-muted-foreground">{state.message}</p>
                        </div>
                      )}
                      {state.status === "ready" && <PanelChart panel={panel} rows={state.rows} />}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        <ConfirmDialog
          open={!!deleteId}
          onOpenChange={(open) => { if (!open) setDeleteId(null); }}
          title="Delete report"
          description={`"${active.name}" and all its panels will be permanently removed. This cannot be undone.`}
          confirmLabel="Delete report"
          variant="destructive"
          onConfirm={handleDelete}
        />
      </div>
    );
  }

  // ─── List view ───────────────────────────────────────────────────────────────
  return (
    <div className="page-shell page-enter space-y-6">
      <PageHeader
        title="Reports"
        titleIcon={LayoutDashboard}
        info="Reports the agent built from plain-English requests. Every panel's query was verified against your data before it was saved."
        stats={[
          { label: "Reports", value: dashboards.length },
          { label: "Panels", value: dashboards.reduce((n, d) => n + d.panels.length, 0) },
        ]}
      />

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : dashboards.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No reports yet"
          description={'Go to the Query page and ask the agent to "build me a sales dashboard" — it designs the panels, verifies every query, and saves the report here.'}
          action={
            <Button size="sm" onClick={() => navigate("/app/query")}>
              <MessageSquare size={12} className="mr-1" />Ask the agent to build one
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((d) => {
            const boundDataset = d.datasetId ? datasets.find((ds) => ds.id === d.datasetId) : undefined;
            const datasetLabel = boundDataset
              ? (boundDataset.displayName || boundDataset.fileName)
              : d.connectionId
              ? "Database connection"
              : null;
            const breakdown = panelTypeBreakdown(d.panels);
            return (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="min-w-0"
              >
                <Card
                  className="group relative flex min-w-0 cursor-pointer flex-col overflow-hidden p-0 transition-all hover:border-primary/40 hover:shadow-[0_10px_30px_-12px_hsl(var(--primary)/0.28)]"
                  onClick={() => openDashboard(d)}
                >
                  {/* Accent strip previewing the chart-type colors inside */}
                  <div className="flex h-1.5 w-full overflow-hidden bg-muted/40">
                    {d.panels.slice(0, 8).map((p, i) => (
                      <div
                        key={i}
                        className="h-full flex-1"
                        style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    ))}
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
                          <LayoutDashboard size={15} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-foreground" title={d.name}>{d.name}</h3>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{d.description || "Agent-built dashboard"}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteId(d.id); }}
                        className="reveal-actions shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="Delete dashboard"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Chart-type composition: shows at a glance what's inside */}
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      {breakdown.map(({ type, count }) => {
                        const Icon = CHART_TYPE_ICON[type];
                        return (
                          <span
                            key={type}
                            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/50 px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground"
                            title={`${count} ${type} panel${count === 1 ? "" : "s"}`}
                          >
                            <Icon size={11} className="text-primary/70" />
                            {count > 1 ? `${count} ` : ""}{type}
                          </span>
                        );
                      })}
                    </div>

                    {/* Source question, if the agent recorded one */}
                    {d.sourceQuestion && d.sourceQuestion !== d.description && (
                      <p className="mb-3 line-clamp-2 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[11px] italic leading-snug text-muted-foreground">
                        <MessageSquare size={10} className="mr-1 inline align-[-1px] text-muted-foreground/70" />
                        {d.sourceQuestion}
                      </p>
                    )}

                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                        <Activity size={11} className="text-primary/70" />
                        {d.panels.length} panel{d.panels.length === 1 ? "" : "s"}
                      </span>
                      {datasetLabel ? (
                        <span className="inline-flex min-w-0 items-center gap-1" title={datasetLabel}>
                          <Database size={11} className="shrink-0 text-emerald-400/80" />
                          <span className="truncate max-w-[130px]">{datasetLabel}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400/90" title="No dataset linked — you'll be asked to pick one when you open this dashboard">
                          <AlertTriangle size={11} className="shrink-0" />
                          Needs dataset
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {relativeTime(d.updatedAt || d.createdAt)}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-0.5 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        Open
                        <TrendingUp size={11} />
                      </span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId && !active}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete report"
        description="This report and all its panels will be permanently removed. This cannot be undone."
        confirmLabel="Delete report"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
