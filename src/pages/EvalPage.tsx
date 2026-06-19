import { useEffect, useState } from "react";
import { FlaskConical, Plus, Play, Trash2, Loader2, CheckCircle2, XCircle, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { evalApi, type EvalCase, type EvalRun } from "@/lib/platform-client";
import { useDatasetStore } from "@/stores/dataset-store";
import { toast } from "@/lib/toast";

export default function EvalPage() {
  const { datasets, fetchDatasets } = useDatasetStore();
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<EvalRun | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [fQuestion, setFQuestion] = useState("");
  const [fDatasetId, setFDatasetId] = useState("");
  const [fMinRows, setFMinRows] = useState("");
  const [fColumns, setFColumns] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EvalCase | null>(null);

  useEffect(() => {
    fetchDatasets().catch(() => {});
    (async () => {
      try {
        const [c, r] = await Promise.all([evalApi.listCases(), evalApi.listRuns()]);
        setCases(c);
        setRuns(r);
      } catch (err) {
        toast.error((err as Error).message || "Failed to load eval suite");
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchDatasets]);

  const handleSave = async () => {
    if (!fQuestion.trim()) return toast.error("Question is required");
    if (!fDatasetId) return toast.error("Pick a dataset");
    setSaving(true);
    try {
      const created = await evalApi.createCase({
        question: fQuestion.trim(),
        datasetId: fDatasetId,
        expectation: {
          minRows: fMinRows ? Number(fMinRows) : undefined,
          containsColumns: fColumns.split(",").map((c) => c.trim()).filter(Boolean),
        },
      });
      setCases((prev) => [created, ...prev]);
      setDialogOpen(false);
      setFQuestion(""); setFDatasetId(""); setFMinRows(""); setFColumns("");
      toast.success("Eval case added");
    } catch (err) {
      toast.error((err as Error).message || "Failed to add case");
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    if (cases.length === 0) return toast.error("Add at least one case first");
    setRunning(true);
    try {
      const run = await evalApi.run();
      setLastRun(run);
      setRuns((prev) => [run, ...prev]);
      toast.success(`Suite ran — ${run.passed}/${run.total} passed`);
    } catch (err) {
      toast.error((err as Error).message || "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await evalApi.removeCase(deleteTarget.id);
      setCases((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success("Case removed");
    } catch (err) {
      toast.error((err as Error).message || "Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  const datasetName = (id: string | null) => datasets.find((d) => d.id === id)?.displayName || datasets.find((d) => d.id === id)?.fileName || "dataset";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evaluation Suite"
        titleIcon={FlaskConical}
        info="Golden questions with expected outcomes. Run the suite after a model or prompt change to prove answer quality didn't regress before shipping."
        stats={[
          { label: "Cases", value: cases.length, tone: "info" },
          ...(lastRun ? [{ label: "Last pass rate", value: `${lastRun.passRate}%`, tone: lastRun.passRate >= 80 ? ("success" as const) : ("warning" as const) }] : []),
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(true)} className="gap-1.5"><Plus size={16} /> Add case</Button>
            <Button onClick={handleRun} disabled={running || cases.length === 0} className="gap-1.5">
              {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Run suite
            </Button>
          </div>
        }
      />

      {loading ? (
        <TableSkeleton rows={6} columns={3} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Cases */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Golden questions</h2>
            {cases.length === 0 ? (
              <EmptyState compact icon={FlaskConical} title="No eval cases" description="Add a question with an expected outcome." />
            ) : (
              cases.map((c) => (
                <Card key={c.id} className="group flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{c.question}</p>
                    <p className="text-xs text-muted-foreground">
                      {datasetName(c.datasetId)}
                      {c.expectation.minRows != null && ` · ≥${c.expectation.minRows} rows`}
                      {c.expectation.containsColumns?.length ? ` · cols: ${c.expectation.containsColumns.join(", ")}` : ""}
                    </p>
                  </div>
                  <button onClick={() => setDeleteTarget(c)} aria-label="Delete" className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"><Trash2 size={14} /></button>
                </Card>
              ))
            )}
          </div>

          {/* Last run results / history */}
          <div className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"><History size={14} /> Results</h2>
            {(lastRun?.results || []).length > 0 ? (
              lastRun!.results!.map((r) => (
                <Card key={r.caseId} className="flex items-start gap-2.5 p-3">
                  <span className={r.pass ? "text-emerald-400" : "text-rose-400"}>{r.pass ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{r.question}</p>
                    {!r.pass && r.reasons.length > 0 && <p className="text-xs text-rose-400/90">{r.reasons.join("; ")}</p>}
                    {r.sql && <code className="mt-1 block truncate rounded bg-muted/60 px-2 py-1 text-[11px] text-foreground/80">{r.sql}</code>}
                  </div>
                </Card>
              ))
            ) : runs.length > 0 ? (
              runs.map((run) => (
                <Card key={run.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{run.passed}/{run.total} passed</p>
                    <p className="text-xs text-muted-foreground">{new Date(run.ts).toLocaleString()}</p>
                  </div>
                  <Badge variant={run.passRate >= 80 ? "secondary" : "destructive"}>{run.passRate}%</Badge>
                </Card>
              ))
            ) : (
              <EmptyState compact icon={Play} title="No runs yet" description="Run the suite to see pass/fail results." />
            )}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add eval case</DialogTitle>
            <DialogDescription>A question plus what a correct answer should look like.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Question</label>
              <Input value={fQuestion} onChange={(e) => setFQuestion(e.target.value)} placeholder="Top 5 products by revenue" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Dataset</label>
              <Select value={fDatasetId} onValueChange={setFDatasetId}>
                <SelectTrigger><SelectValue placeholder="Select a dataset" /></SelectTrigger>
                <SelectContent>
                  {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.displayName || d.fileName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Min rows (optional)</label>
                <Input value={fMinRows} onChange={(e) => setFMinRows(e.target.value)} placeholder="1" inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Expected columns (optional)</label>
                <Input value={fColumns} onChange={(e) => setFColumns(e.target.value)} placeholder="product, revenue" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">{saving && <Loader2 size={14} className="animate-spin" />} Add case</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete eval case?"
        description={deleteTarget?.question}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
