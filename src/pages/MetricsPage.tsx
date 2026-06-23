import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Plus, Trash2, Edit3, Loader2, FlaskConical, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardGridSkeleton } from "@/components/shared/Skeletons";
import { FilterToolbar } from "@/components/shared/FilterToolbar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { metricsApi, type Metric } from "@/lib/platform-client";
import { toast } from "@/lib/toast";

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Metric | null>(null);
  const [fName, setFName] = useState("");
  const [fExpr, setFExpr] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fDims, setFDims] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Metric | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setMetrics(await metricsApi.list());
      } catch (err) {
        toast.error((err as Error).message || "Failed to load metrics");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return metrics.filter(
      (m) => !q || m.name.toLowerCase().includes(q) || m.expression.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
    );
  }, [metrics, search]);

  const openCreate = () => {
    setEditing(null);
    setFName(""); setFExpr(""); setFDesc(""); setFDims("");
    setDialogOpen(true);
  };
  const openEdit = (m: Metric) => {
    setEditing(m);
    setFName(m.name); setFExpr(m.expression); setFDesc(m.description); setFDims(m.dimensions.join(", "));
    setDialogOpen(true);
  };

  const handleValidate = async () => {
    if (!fExpr.trim()) return toast.error("Enter an expression first");
    setValidating(true);
    try {
      const r = await metricsApi.validate(fExpr.trim());
      r.valid ? toast.success("Expression looks valid") : toast.error(r.error || "Invalid expression");
    } catch (err) {
      toast.error((err as Error).message || "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!fName.trim()) return toast.error("Name is required");
    if (!fExpr.trim()) return toast.error("Expression is required");
    const dimensions = fDims.split(",").map((d) => d.trim()).filter(Boolean);
    setSaving(true);
    try {
      if (editing) {
        await metricsApi.update(editing.id, { name: fName.trim(), expression: fExpr.trim(), description: fDesc.trim(), dimensions });
        setMetrics((prev) => prev.map((m) => (m.id === editing.id ? { ...m, name: fName.trim(), expression: fExpr.trim(), description: fDesc.trim(), dimensions } : m)));
        toast.success("Metric updated");
      } else {
        const created = await metricsApi.create({ name: fName.trim(), expression: fExpr.trim(), description: fDesc.trim(), dimensions });
        setMetrics((prev) => [created, ...prev]);
        toast.success("Metric certified");
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error((err as Error).message || "Failed to save metric");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await metricsApi.remove(deleteTarget.id);
      setMetrics((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      toast.success("Metric deleted");
    } catch (err) {
      toast.error((err as Error).message || "Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="page-shell page-enter space-y-6">
      <PageHeader
        title="Certified Metrics"
        titleIcon={ShieldCheck}
        info="Define trusted business metrics once (e.g. Revenue = SUM(net_amount)). The AI agent grounds its answers on these certified definitions instead of guessing — so 'show revenue by month' is always consistent."
        stats={[{ label: "Metrics", value: metrics.length, tone: "accent" }]}
        actions={<Button onClick={openCreate} className="gap-1.5"><Plus size={16} /> New metric</Button>}
      />

      <FilterToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search metrics…" />

      {loading ? (
        <CardGridSkeleton cards={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title={metrics.length === 0 ? "No certified metrics yet" : "No metrics match your search"}
          description={metrics.length === 0 ? "Certify your first business metric so the agent answers consistently across your whole team." : undefined}
          action={metrics.length === 0 ? <Button onClick={openCreate} className="gap-1.5"><Plus size={16} /> New metric</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <Card key={m.id} className="group flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <BadgeCheck size={15} className="shrink-0 text-emerald-400" />
                  <p className="truncate font-semibold text-foreground">{m.name}</p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => openEdit(m)} aria-label="Edit" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Edit3 size={14} /></button>
                  <button onClick={() => setDeleteTarget(m)} aria-label="Delete" className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={14} /></button>
                </div>
              </div>
              <code className="block truncate rounded-md bg-muted/60 px-2 py-1 text-xs text-foreground/90">{m.expression}</code>
              {m.description && <p className="line-clamp-2 text-xs text-muted-foreground">{m.description}</p>}
              {m.dimensions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.dimensions.map((d) => <Badge key={d} variant="secondary" className="text-[10px]">{d}</Badge>)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit metric" : "Certify a metric"}</DialogTitle>
            <DialogDescription>The agent will prefer this exact definition when a question references it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Revenue" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">SQL expression</label>
              <Textarea value={fExpr} onChange={(e) => setFExpr(e.target.value)} placeholder="SUM(net_amount)" className="font-mono text-sm" rows={2} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
              <Textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Total paid revenue, net of refunds" rows={2} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Dimensions (optional, comma-separated)</label>
              <Input value={fDims} onChange={(e) => setFDims(e.target.value)} placeholder="month, region, product" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={handleValidate} disabled={validating} className="gap-1.5">
              {validating ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} Test expression
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 size={14} className="animate-spin" />} {editing ? "Save" : "Certify metric"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete metric?"
        description={`"${deleteTarget?.name}" will no longer ground the agent's answers.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
