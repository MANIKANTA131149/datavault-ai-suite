import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap, Clock, BellRing, Plus, Trash2, Pause, Play, Database,
  CalendarClock, Loader2, Wand2, FileCode2, History as HistoryIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useDatasetStore } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";
import {
  schedulesApi, alertsApi,
  type Schedule, type DataAlert, type ScheduleInterval, type AlertOperator, type TranslatedAlertRule,
} from "@/lib/automation-client";
import { toast } from "@/lib/toast";

const INTERVAL_LABELS: Record<ScheduleInterval, string> = {
  hourly: "Every hour",
  every6h: "Every 6 hours",
  daily: "Daily",
  weekly: "Weekly",
};

const CHECK_INTERVAL_LABELS: Record<"hourly" | "every6h" | "daily", string> = {
  hourly: "Every hour",
  every6h: "Every 6 hours",
  daily: "Daily",
};

const OPERATORS: AlertOperator[] = ["<", "<=", ">", ">=", "=", "!="];

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

// ─── Schedule card ─────────────────────────────────────────────────────────────
function ScheduleCard({ schedule, datasetName, onToggle, onDelete, busy }: {
  schedule: Schedule;
  datasetName: string;
  onToggle: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="min-w-0">
      <Card className="min-w-0 overflow-hidden p-5 transition-all hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-3 mb-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarClock size={14} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{schedule.name}</h3>
              <p className="text-xs text-muted-foreground truncate">{schedule.question || "Scheduled SQL query"}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusBadge
              status={!schedule.enabled ? "inactive" : schedule.lastStatus === "error" ? "error" : schedule.lastStatus === "success" ? "success" : "pending"}
              label={!schedule.enabled ? "Paused" : schedule.lastStatus === "error" ? "Failed" : schedule.lastStatus === "success" ? "Healthy" : "Scheduled"}
            />
          </div>
        </div>

        <div className="min-w-0 overflow-hidden bg-card rounded-md p-2.5 border border-border mb-3">
          <pre className="max-w-full max-h-16 overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[11px] font-mono text-muted-foreground">
            {schedule.sql.slice(0, 220)}{schedule.sql.length > 220 ? "…" : ""}
          </pre>
        </div>

        {schedule.lastError && (
          <p className="mb-3 text-xs text-destructive break-words [overflow-wrap:anywhere] line-clamp-2">{schedule.lastError}</p>
        )}

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-border text-xs">{INTERVAL_LABELS[schedule.interval]}</Badge>
            <span className="flex min-w-0 items-center gap-1">
              <Database size={9} className="shrink-0" /><span className="truncate">{datasetName}</span>
            </span>
            <span className="shrink-0">Next: {schedule.enabled ? formatWhen(schedule.nextRun) : "—"}</span>
            <span className="shrink-0">{schedule.runCount} run{schedule.runCount === 1 ? "" : "s"}</span>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 border-border text-xs" onClick={onToggle} disabled={busy}>
              {schedule.enabled ? <><Pause size={11} className="mr-1" />Pause</> : <><Play size={11} className="mr-1" />Resume</>}
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 border-border text-xs text-destructive hover:bg-destructive/10" onClick={onDelete} disabled={busy}>
              <Trash2 size={11} />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ─── Alert card ────────────────────────────────────────────────────────────────
function AlertCard({ alert, datasetName, onToggle, onDelete, busy }: {
  alert: DataAlert;
  datasetName: string;
  onToggle: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const fired = !!alert.lastFired && alert.lastChecked === null ? false : !!alert.lastFired;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="min-w-0">
      <Card className="min-w-0 overflow-hidden p-5 transition-all hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-3 mb-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <BellRing size={14} className="text-amber-500" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{alert.label}</h3>
              <p className="text-xs text-muted-foreground truncate">
                {alert.conditionNl || `Fires when value ${alert.operator} ${alert.threshold.toLocaleString()}`}
              </p>
            </div>
          </div>
          <StatusBadge
            status={!alert.enabled ? "inactive" : fired ? "warning" : "active"}
            label={!alert.enabled ? "Paused" : fired ? "Triggered" : "Watching"}
            pulse={alert.enabled && !fired}
          />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="border-border font-mono text-xs">
            value {alert.operator} {alert.threshold.toLocaleString()}
          </Badge>
          {alert.lastValue !== null && (
            <span className="text-muted-foreground">Last value: <span className="font-medium text-foreground">{alert.lastValue.toLocaleString()}</span></span>
          )}
          {alert.fireCount > 0 && <span className="text-muted-foreground">Fired {alert.fireCount}×</span>}
        </div>

        {alert.lastError && (
          <p className="mb-3 text-xs text-destructive break-words [overflow-wrap:anywhere] line-clamp-2">{alert.lastError}</p>
        )}

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-border text-xs">{CHECK_INTERVAL_LABELS[alert.checkInterval]}</Badge>
            <span className="flex min-w-0 items-center gap-1">
              <Database size={9} className="shrink-0" /><span className="truncate">{datasetName}</span>
            </span>
            <span className="shrink-0">Checked: {formatWhen(alert.lastChecked)}</span>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 border-border text-xs" onClick={onToggle} disabled={busy}>
              {alert.enabled ? <><Pause size={11} className="mr-1" />Pause</> : <><Play size={11} className="mr-1" />Resume</>}
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 border-border text-xs text-destructive hover:bg-destructive/10" onClick={onDelete} disabled={busy}>
              <Trash2 size={11} />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function AutomationsPage() {
  const { datasets, fetchDatasets, loadDatasetData } = useDatasetStore();
  const { entries: historyEntries, fetchHistory } = useHistoryStore();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [alerts, setAlerts] = useState<DataAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create-schedule dialog state
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schName, setSchName] = useState("");
  const [schDatasetId, setSchDatasetId] = useState("");
  const [schSheet, setSchSheet] = useState("");
  const [schQuestion, setSchQuestion] = useState("");
  const [schSql, setSchSql] = useState("");
  const [schInterval, setSchInterval] = useState<ScheduleInterval>("daily");
  const [schSaving, setSchSaving] = useState(false);

  // Create-alert dialog state
  const [alertOpen, setAlertOpen] = useState(false);
  const [alMode, setAlMode] = useState<"nl" | "advanced">("nl");
  const [alDatasetId, setAlDatasetId] = useState("");
  const [alSheet, setAlSheet] = useState("");
  const [alCondition, setAlCondition] = useState("");
  const [alRule, setAlRule] = useState<TranslatedAlertRule | null>(null);
  const [alTranslating, setAlTranslating] = useState(false);
  const [alMetricSql, setAlMetricSql] = useState("");
  const [alOperator, setAlOperator] = useState<AlertOperator>("<");
  const [alThreshold, setAlThreshold] = useState("");
  const [alLabel, setAlLabel] = useState("");
  const [alCheckInterval, setAlCheckInterval] = useState<"hourly" | "every6h" | "daily">("daily");
  const [alSaving, setAlSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ kind: "schedule" | "alert"; id: string; name: string } | null>(null);

  const activeDatasets = useMemo(() => datasets.filter((d) => !d.archived), [datasets]);
  const datasetNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of datasets) m.set(d.id, d.displayName || d.fileName);
    return m;
  }, [datasets]);

  const historyWithSql = useMemo(
    () => historyEntries.filter((e) => e.status === "success" && e.steps.some((s) => s.sql)).slice(0, 30),
    [historyEntries]
  );

  const refresh = async () => {
    try {
      const [s, a] = await Promise.all([schedulesApi.list(), alertsApi.list()]);
      setSchedules(s);
      setAlerts(a);
    } catch (err: any) {
      toast.error(err.message || "Failed to load automations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    if (datasets.length === 0) fetchDatasets();
    if (historyEntries.length === 0) fetchHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSchDataset = activeDatasets.find((d) => d.id === schDatasetId);
  const selectedAlDataset = activeDatasets.find((d) => d.id === alDatasetId);

  const resetScheduleForm = () => {
    setSchName(""); setSchDatasetId(""); setSchSheet(""); setSchQuestion(""); setSchSql(""); setSchInterval("daily");
  };
  const resetAlertForm = () => {
    setAlMode("nl"); setAlDatasetId(""); setAlSheet(""); setAlCondition(""); setAlRule(null);
    setAlMetricSql(""); setAlOperator("<"); setAlThreshold(""); setAlLabel(""); setAlCheckInterval("daily");
  };

  const prefillFromHistory = (entryId: string) => {
    const entry = historyWithSql.find((e) => e.id === entryId);
    if (!entry) return;
    const sqlStep = [...entry.steps].reverse().find((s) => s.sql);
    if (sqlStep?.sql) setSchSql(sqlStep.sql);
    setSchQuestion(entry.query);
    if (!schName) setSchName(entry.query.slice(0, 80));
    const ds = activeDatasets.find((d) => (d.displayName || d.fileName) === entry.datasetName);
    if (ds) {
      setSchDatasetId(ds.id);
      setSchSheet(ds.sheetNames[0] || "");
    }
  };

  const handleCreateSchedule = async () => {
    if (!schSql.trim()) return toast.error("SQL query is required");
    if (!schDatasetId) return toast.error("Pick a dataset");
    setSchSaving(true);
    try {
      await schedulesApi.create({
        name: schName.trim() || schQuestion.trim() || "Scheduled query",
        question: schQuestion.trim(),
        sql: schSql.trim(),
        datasetId: schDatasetId,
        sheetName: schSheet || selectedSchDataset?.sheetNames[0],
        interval: schInterval,
      });
      toast.success("Schedule created — it will run automatically");
      setScheduleOpen(false);
      resetScheduleForm();
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to create schedule");
    } finally {
      setSchSaving(false);
    }
  };

  const buildSchemaDescription = async (datasetId: string, sheetName: string): Promise<string> => {
    const data = await loadDatasetData(datasetId);
    if (!data) throw new Error("Could not load the dataset's contents");
    const sheet = data.sheets[sheetName] || Object.values(data.sheets)[0];
    if (!sheet) throw new Error("Dataset has no sheets");
    const cols = sheet.columns.map((c) => `"${c.name}" (${c.dtype})`).join(", ");
    const name = sheetName || Object.keys(data.sheets)[0];
    return `Table "${name}" with ${sheet.rows.length} rows. Columns: ${cols}`;
  };

  const handleTranslate = async () => {
    if (!alCondition.trim()) return toast.error("Describe the alert condition first");
    if (!alDatasetId) return toast.error("Pick a dataset first");
    setAlTranslating(true);
    setAlRule(null);
    try {
      const schemaDescription = await buildSchemaDescription(alDatasetId, alSheet || selectedAlDataset?.sheetNames[0] || "");
      const rule = await alertsApi.translate({ condition: alCondition.trim(), schemaDescription, dialect: "DuckDB" });
      setAlRule(rule);
      if (!alLabel) setAlLabel(rule.label || alCondition.slice(0, 80));
    } catch (err: any) {
      toast.error(err.message || "Could not translate the condition — try rephrasing it");
    } finally {
      setAlTranslating(false);
    }
  };

  const handleCreateAlert = async () => {
    if (!alDatasetId) return toast.error("Pick a dataset");
    const metricSql = alMode === "nl" ? alRule?.metricSql : alMetricSql.trim();
    const operator = alMode === "nl" ? alRule?.operator : alOperator;
    const threshold = alMode === "nl" ? alRule?.threshold : Number(alThreshold);
    if (!metricSql) return toast.error(alMode === "nl" ? "Translate the condition first" : "Metric SQL is required");
    if (operator === undefined || threshold === undefined || !Number.isFinite(threshold)) {
      return toast.error("A valid operator and numeric threshold are required");
    }
    setAlSaving(true);
    try {
      await alertsApi.create({
        conditionNl: alCondition.trim(),
        metricSql,
        operator,
        threshold,
        label: alLabel.trim() || alCondition.trim() || "Data alert",
        datasetId: alDatasetId,
        sheetName: alSheet || selectedAlDataset?.sheetNames[0],
        checkInterval: alCheckInterval,
      });
      toast.success("Alert created — you will be notified when it triggers");
      setAlertOpen(false);
      resetAlertForm();
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to create alert");
    } finally {
      setAlSaving(false);
    }
  };

  const toggleSchedule = async (s: Schedule) => {
    setBusyId(s.id);
    try {
      await schedulesApi.update(s.id, { enabled: !s.enabled });
      setSchedules((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: !s.enabled } : x)));
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const toggleAlert = async (a: DataAlert) => {
    setBusyId(a.id);
    try {
      await alertsApi.update(a.id, { enabled: !a.enabled });
      setAlerts((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: !a.enabled } : x)));
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === "schedule") {
        await schedulesApi.remove(deleteTarget.id);
        setSchedules((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      } else {
        await alertsApi.remove(deleteTarget.id);
        setAlerts((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      }
      toast.success(`${deleteTarget.kind === "schedule" ? "Schedule" : "Alert"} deleted`);
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    } finally {
      setDeleteTarget(null);
    }
  };

  const datasetLabel = (id: string | null) => (id ? datasetNameById.get(id) || "Dataset" : "Live connection");

  return (
    <div className="page-shell page-enter space-y-6">
      <PageHeader
        title="Automations"
        titleIcon={Zap}
        info="Schedule queries to run on their own and set plain-English alerts that watch your data and notify you the moment something crosses a threshold."
        stats={[
          { label: "Schedules", value: schedules.length },
          { label: "Alerts", value: alerts.length },
          { label: "Active", value: schedules.filter((s) => s.enabled).length + alerts.filter((a) => a.enabled).length, tone: "success" },
        ]}
      />

      <Tabs defaultValue="schedules">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="inline-flex h-auto w-full flex-wrap justify-start gap-1 bg-background-secondary p-1 sm:w-auto">
            <TabsTrigger value="schedules" className="flex items-center gap-2"><Clock size={13} />Schedules</TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-2"><BellRing size={13} />Alerts</TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Schedules ─────────────────────────────────────────────────────── */}
        <TabsContent value="schedules" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setScheduleOpen(true)}>
              <Plus size={13} className="mr-1" /> New schedule
            </Button>
          </div>
          {loading ? (
            <div className="flex min-h-[20vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : schedules.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No scheduled queries yet"
              description="Pick a verified query from your history (or write SQL), choose how often it should run, and results will arrive as notifications."
              action={<Button size="sm" onClick={() => setScheduleOpen(true)}><Plus size={12} className="mr-1" />Create your first schedule</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {schedules.map((s) => (
                <ScheduleCard
                  key={s.id}
                  schedule={s}
                  datasetName={datasetLabel(s.datasetId)}
                  onToggle={() => toggleSchedule(s)}
                  onDelete={() => setDeleteTarget({ kind: "schedule", id: s.id, name: s.name })}
                  busy={busyId === s.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Alerts ────────────────────────────────────────────────────────── */}
        <TabsContent value="alerts" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setAlertOpen(true)}>
              <Plus size={13} className="mr-1" /> New alert
            </Button>
          </div>
          {loading ? (
            <div className="flex min-h-[20vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : alerts.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title="No data alerts yet"
              description={'Describe a condition in plain English — like "notify me when total sales drop below 50,000" — and Querify watches your data for you.'}
              action={<Button size="sm" onClick={() => setAlertOpen(true)}><Plus size={12} className="mr-1" />Create your first alert</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {alerts.map((a) => (
                <AlertCard
                  key={a.id}
                  alert={a}
                  datasetName={datasetLabel(a.datasetId)}
                  onToggle={() => toggleAlert(a)}
                  onDelete={() => setDeleteTarget({ kind: "alert", id: a.id, name: a.label })}
                  busy={busyId === a.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Create schedule dialog ─────────────────────────────────────────── */}
      <Dialog open={scheduleOpen} onOpenChange={(open) => { setScheduleOpen(open); if (!open) resetScheduleForm(); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-background-secondary border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock size={15} className="text-primary" />New scheduled query</DialogTitle>
            <DialogDescription>The query runs automatically on the server and results arrive as notifications.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {historyWithSql.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1"><HistoryIcon size={11} />Prefill from a past query (optional)</label>
                <Select onValueChange={prefillFromHistory}>
                  <SelectTrigger className="mt-1 bg-card border-border"><SelectValue placeholder="Pick a verified query from history…" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {historyWithSql.map((e) => (
                      <SelectItem key={e.id} value={e.id}><span className="block max-w-[320px] truncate">{e.query}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={schName} onChange={(e) => setSchName(e.target.value)} placeholder="Weekly sales summary" className="mt-1 bg-card border-border" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Dataset</label>
                <Select value={schDatasetId} onValueChange={(v) => { setSchDatasetId(v); const ds = activeDatasets.find((d) => d.id === v); setSchSheet(ds?.sheetNames[0] || ""); }}>
                  <SelectTrigger className="mt-1 bg-card border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {activeDatasets.map((d) => (
                      <SelectItem key={d.id} value={d.id}><span className="block max-w-[220px] truncate">{d.displayName || d.fileName}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Sheet</label>
                <Select value={schSheet} onValueChange={setSchSheet} disabled={!selectedSchDataset}>
                  <SelectTrigger className="mt-1 bg-card border-border"><SelectValue placeholder="Sheet" /></SelectTrigger>
                  <SelectContent>
                    {(selectedSchDataset?.sheetNames || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Question (optional, for context)</label>
              <Input value={schQuestion} onChange={(e) => setSchQuestion(e.target.value)} placeholder="What were total sales by region?" className="mt-1 bg-card border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground flex items-center gap-1"><FileCode2 size={11} />SQL query (read-only SELECT)</label>
              <Textarea value={schSql} onChange={(e) => setSchSql(e.target.value)} placeholder={'SELECT region, SUM(sales) AS total FROM "Sheet1" GROUP BY region'} className="mt-1 bg-card border-border min-h-[90px] font-mono text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Run</label>
              <Select value={schInterval} onValueChange={(v) => setSchInterval(v as ScheduleInterval)}>
                <SelectTrigger className="mt-1 bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(INTERVAL_LABELS) as ScheduleInterval[]).map((k) => (
                    <SelectItem key={k} value={k}>{INTERVAL_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setScheduleOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleCreateSchedule} disabled={schSaving}>
              {schSaving ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Plus size={13} className="mr-1" />}Create schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Create alert dialog ────────────────────────────────────────────── */}
      <Dialog open={alertOpen} onOpenChange={(open) => { setAlertOpen(open); if (!open) resetAlertForm(); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-background-secondary border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BellRing size={15} className="text-amber-500" />New data alert</DialogTitle>
            <DialogDescription>Querify checks the condition on a schedule and notifies you when it triggers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Dataset</label>
                <Select value={alDatasetId} onValueChange={(v) => { setAlDatasetId(v); const ds = activeDatasets.find((d) => d.id === v); setAlSheet(ds?.sheetNames[0] || ""); setAlRule(null); }}>
                  <SelectTrigger className="mt-1 bg-card border-border"><SelectValue placeholder="Select dataset" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {activeDatasets.map((d) => (
                      <SelectItem key={d.id} value={d.id}><span className="block max-w-[220px] truncate">{d.displayName || d.fileName}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Sheet</label>
                <Select value={alSheet} onValueChange={setAlSheet} disabled={!selectedAlDataset}>
                  <SelectTrigger className="mt-1 bg-card border-border"><SelectValue placeholder="Sheet" /></SelectTrigger>
                  <SelectContent>
                    {(selectedAlDataset?.sheetNames || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs value={alMode} onValueChange={(v) => setAlMode(v as "nl" | "advanced")}>
              <TabsList className="inline-flex h-auto w-full flex-wrap justify-start gap-1 bg-card p-1">
                <TabsTrigger value="nl" className="flex items-center gap-1.5 text-xs"><Wand2 size={11} />Plain English</TabsTrigger>
                <TabsTrigger value="advanced" className="flex items-center gap-1.5 text-xs"><FileCode2 size={11} />Advanced (SQL)</TabsTrigger>
              </TabsList>

              <TabsContent value="nl" className="mt-3 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Condition</label>
                  <Textarea value={alCondition} onChange={(e) => { setAlCondition(e.target.value); setAlRule(null); }} placeholder='e.g. "Notify me when total sales drop below 50,000"' className="mt-1 bg-card border-border min-h-[60px]" />
                </div>
                <Button variant="outline" size="sm" onClick={handleTranslate} disabled={alTranslating || !alCondition.trim() || !alDatasetId} className="border-border">
                  {alTranslating ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Wand2 size={12} className="mr-1" />}
                  Translate condition
                </Button>
                {alRule && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-foreground">Translated rule</p>
                    <pre className="max-h-20 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[11px] font-mono text-muted-foreground">{alRule.metricSql}</pre>
                    <p className="text-xs text-muted-foreground">Fires when result <span className="font-mono font-semibold text-foreground">{alRule.operator} {alRule.threshold.toLocaleString()}</span></p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="advanced" className="mt-3 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Metric SQL (must return one numeric value)</label>
                  <Textarea value={alMetricSql} onChange={(e) => setAlMetricSql(e.target.value)} placeholder={'SELECT SUM(sales) FROM "Sheet1"'} className="mt-1 bg-card border-border min-h-[70px] font-mono text-xs" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">Fires when value is</label>
                    <Select value={alOperator} onValueChange={(v) => setAlOperator(v as AlertOperator)}>
                      <SelectTrigger className="mt-1 bg-card border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Threshold</label>
                    <Input type="number" value={alThreshold} onChange={(e) => setAlThreshold(e.target.value)} placeholder="50000" className="mt-1 bg-card border-border" />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Label</label>
                <Input value={alLabel} onChange={(e) => setAlLabel(e.target.value)} placeholder="Low sales alert" className="mt-1 bg-card border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Check</label>
                <Select value={alCheckInterval} onValueChange={(v) => setAlCheckInterval(v as "hourly" | "every6h" | "daily")}>
                  <SelectTrigger className="mt-1 bg-card border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CHECK_INTERVAL_LABELS) as ("hourly" | "every6h" | "daily")[]).map((k) => (
                      <SelectItem key={k} value={k}>{CHECK_INTERVAL_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAlertOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleCreateAlert} disabled={alSaving || (alMode === "nl" && !alRule)}>
              {alSaving ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Plus size={13} className="mr-1" />}Create alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete ${deleteTarget?.kind === "schedule" ? "schedule" : "alert"}`}
        description={`"${deleteTarget?.name}" will stop running and be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
