import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Plus, Trash2, Edit3, Loader2, FileCode2, Tags } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { FilterToolbar } from "@/components/shared/FilterToolbar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { glossaryApi, type GlossaryTermRecord } from "@/lib/automation-client";
import { invalidateGlossaryCache } from "@/lib/glossary-client";
import { toast } from "@/lib/toast";

export default function GlossaryPage() {
  const [terms, setTerms] = useState<GlossaryTermRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GlossaryTermRecord | null>(null);
  const [fTerm, setFTerm] = useState("");
  const [fDefinition, setFDefinition] = useState("");
  const [fSql, setFSql] = useState("");
  const [fAliases, setFAliases] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GlossaryTermRecord | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setTerms(await glossaryApi.list());
      } catch (err: any) {
        toast.error(err.message || "Failed to load glossary");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return terms.filter(
      (t) => !q || t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q) || t.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [terms, search]);

  const openCreate = () => {
    setEditing(null);
    setFTerm(""); setFDefinition(""); setFSql(""); setFAliases("");
    setDialogOpen(true);
  };

  const openEdit = (t: GlossaryTermRecord) => {
    setEditing(t);
    setFTerm(t.term);
    setFDefinition(t.definition);
    setFSql(t.sqlExpression || "");
    setFAliases(t.aliases.join(", "));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!fTerm.trim()) return toast.error("Term is required");
    if (!fDefinition.trim()) return toast.error("Definition is required");
    const aliases = fAliases.split(",").map((a) => a.trim()).filter(Boolean);
    setSaving(true);
    try {
      if (editing) {
        await glossaryApi.update(editing.id, { definition: fDefinition.trim(), sqlExpression: fSql.trim(), aliases });
        setTerms((prev) => prev.map((t) => (t.id === editing.id ? { ...t, definition: fDefinition.trim(), sqlExpression: fSql.trim() || null, aliases } : t)));
        toast.success("Term updated");
      } else {
        const created = await glossaryApi.create({ term: fTerm.trim(), definition: fDefinition.trim(), sqlExpression: fSql.trim() || undefined, aliases });
        setTerms((prev) => [created, ...prev]);
        toast.success("Term added — the agent will use this definition from now on");
      }
      invalidateGlossaryCache();
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await glossaryApi.remove(deleteTarget.id);
      setTerms((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      invalidateGlossaryCache();
      toast.success("Term deleted");
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="page-shell page-enter space-y-6">
      <PageHeader
        title="Business Glossary"
        titleIcon={BookOpen}
        info="Define what business terms officially mean — like revenue or active user. Whenever a question mentions a defined term, the agent uses your definition instead of guessing from column names."
        stats={[
          { label: "Terms", value: terms.length },
          { label: "With SQL", value: terms.filter((t) => t.sqlExpression).length },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <FilterToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search terms…"
            filters={[]}
            values={{}}
            onValueChange={() => {}}
            onClearAll={() => setSearch("")}
          />
        </div>
        <Button size="sm" className="shrink-0" onClick={openCreate}>
          <Plus size={13} className="mr-1" /> New term
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={terms.length === 0 ? "No terms defined yet" : "No matching terms"}
          description={
            terms.length === 0
              ? 'Add your first definition — e.g. "revenue" means SUM(amount) WHERE status = \'paid\'. The whole team gets consistent answers.'
              : "Try a different search term."
          }
          action={
            terms.length === 0 ? (
              <Button size="sm" onClick={openCreate}><Plus size={12} className="mr-1" />Define your first term</Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="min-w-0">
              <Card className="group glass-card-hover min-w-0 overflow-hidden card-pad-sm">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
                      <BookOpen size={14} className="text-primary" />
                    </div>
                    <h3 className="truncate type-h3">{t.term}</h3>
                  </div>
                  <div className="reveal-actions flex shrink-0 gap-1">
                    <button onClick={() => openEdit(t)} className="rounded p-1.5 text-muted-foreground hover:bg-card hover:text-foreground" title="Edit">
                      <Edit3 size={12} />
                    </button>
                    <button onClick={() => setDeleteTarget(t)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <p className="mb-3 type-body-sm leading-relaxed line-clamp-3 break-words [overflow-wrap:anywhere]">{t.definition}</p>

                {t.sqlExpression && (
                  <div className="mb-3 min-w-0 overflow-hidden rounded-md border border-border bg-card p-2.5">
                    <pre className="max-h-16 max-w-full overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[11px] font-mono text-muted-foreground">
                      {t.sqlExpression.slice(0, 160)}{t.sqlExpression.length > 160 ? "…" : ""}
                    </pre>
                  </div>
                )}

                {t.aliases.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.aliases.map((a) => (
                      <Badge key={a} variant="outline" className="border-border text-xs"><Tags size={8} className="mr-1" />{a}</Badge>
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-background-secondary border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit "${editing.term}"` : "Define a business term"}</DialogTitle>
            <DialogDescription>
              The agent injects this definition whenever the term appears in a question.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Term</label>
              <Input value={fTerm} onChange={(e) => setFTerm(e.target.value)} placeholder="revenue" disabled={!!editing} className="mt-1 bg-card border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Definition (plain English)</label>
              <Textarea value={fDefinition} onChange={(e) => setFDefinition(e.target.value)} placeholder="Total paid order amount, excluding refunds and taxes." className="mt-1 bg-card border-border min-h-[70px]" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground flex items-center gap-1"><FileCode2 size={11} />Official SQL expression (optional)</label>
              <Textarea value={fSql} onChange={(e) => setFSql(e.target.value)} placeholder={'SUM("amount") FILTER (WHERE "status" = \'paid\')'} className="mt-1 bg-card border-border min-h-[60px] font-mono text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Aliases (comma-separated, optional)</label>
              <Input value={fAliases} onChange={(e) => setFAliases(e.target.value)} placeholder="sales, turnover, income" className="mt-1 bg-card border-border" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={13} className="mr-1 animate-spin" /> : null}
              {editing ? "Save changes" : "Add term"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete term"
        description={`"${deleteTarget?.term}" will be removed and the agent will stop using this definition. This cannot be undone.`}
        confirmLabel="Delete term"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
