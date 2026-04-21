import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, Search, Trash2, Edit3, Tag, X, Calendar, Database, Copy, Filter, FileDown, Pin, Star } from "lucide-react";
import { generatePDF } from "@/lib/pdf-report";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInsightsStore, type Insight } from "@/stores/insights-store";
import { usePlanStore } from "@/stores/plan-store";
import { toast } from "sonner";

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  blue:   { bg: "bg-blue-500/10",   text: "text-blue-400",   border: "border-blue-500/20" },
  purple: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  green:  { bg: "bg-green-500/10",  text: "text-green-400",  border: "border-green-500/20" },
  amber:  { bg: "bg-amber-500/10",  text: "text-amber-400",  border: "border-amber-500/20" },
  red:    { bg: "bg-red-500/10",    text: "text-red-400",    border: "border-red-500/20" },
  pink:   { bg: "bg-pink-500/10",   text: "text-pink-400",   border: "border-pink-500/20" },
};

function InsightCard({ insight, onEdit, onDelete, pinned, onTogglePin, onExportPdf }: { insight: Insight; onEdit: () => void; onDelete: () => void; pinned: boolean; onTogglePin: () => void; onExportPdf: () => void }) {
  const colors = COLOR_MAP[insight.color] || COLOR_MAP.blue;
  const resultPreview = typeof insight.result === "string"
    ? insight.result.slice(0, 200)
    : JSON.stringify(insight.result, null, 2)?.slice(0, 200);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="min-w-0">
      <Card className={`min-w-0 overflow-hidden p-5 bg-background-secondary border-border hover:${colors.border} transition-all group`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
              <Bookmark size={14} className={colors.text} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{insight.label}</h3>
              <p className="text-xs text-muted-foreground truncate">{insight.query}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onTogglePin} className={`p-1.5 rounded hover:bg-primary/10 ${pinned ? "text-primary" : "text-muted-foreground hover:text-primary"}`} title="Pin">
              <Pin size={12} fill={pinned ? "currentColor" : "none"} />
            </button>
            <button onClick={onEdit} className="p-1.5 rounded hover:bg-card text-muted-foreground hover:text-foreground" title="Edit">
              <Edit3 size={12} />
            </button>
            <button
              onClick={onExportPdf}
              className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
              title="Download PDF report"
            >
              <FileDown size={12} />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Delete">
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {insight.notes && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{insight.notes}</p>
        )}

        <div className="min-w-0 overflow-hidden bg-card rounded-md p-3 border border-border mb-3">
          <pre className="max-w-full max-h-24 overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs font-mono text-foreground">
            {resultPreview}{(resultPreview?.length ?? 0) >= 200 ? "…" : ""}
          </pre>
        </div>

        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex min-w-0 gap-1.5 flex-wrap">
            {insight.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="border-border text-xs">
                <Tag size={8} className="mr-1" />{tag}
              </Badge>
            ))}
          </div>
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1">
              <Database size={9} className="shrink-0" />
              <span className="truncate">{insight.datasetName}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1"><Calendar size={9} />{new Date(insight.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function InsightsPage() {
  const { insights, updateInsight, removeInsight } = useInsightsStore();
  const { checkExport } = usePlanStore();
  const [search, setSearch] = useState("");
  const [colorFilter, setColorFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("datavault-pinned-insights") || "[]"); } catch { return []; }
  });
  const [editInsight, setEditInsight] = useState<Insight | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Edit form state
  const [editLabel, setEditLabel] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editColor, setEditColor] = useState<Insight["color"]>("blue");
  const [editTags, setEditTags] = useState("");

  const filtered = useMemo(() => {
    return insights.filter((i) => {
      if (search && !i.label.toLowerCase().includes(search.toLowerCase()) && !i.query.toLowerCase().includes(search.toLowerCase())) return false;
      if (colorFilter !== "all" && i.color !== colorFilter) return false;
      if (tagFilter !== "all" && !i.tags.includes(tagFilter)) return false;
      return true;
    }).sort((a, b) => Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id)));
  }, [insights, search, colorFilter, tagFilter, pinnedIds]);

  const allTags = useMemo(() => Array.from(new Set(insights.flatMap((insight) => insight.tags))).sort(), [insights]);

  const togglePinned = (id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [id, ...prev];
      localStorage.setItem("datavault-pinned-insights", JSON.stringify(next));
      return next;
    });
  };

  const openEdit = (insight: Insight) => {
    setEditInsight(insight);
    setEditLabel(insight.label);
    setEditNotes(insight.notes);
    setEditColor(insight.color);
    setEditTags(insight.tags.join(", "));
  };

  const handleSaveEdit = async () => {
    if (!editInsight) return;
    await updateInsight(editInsight.id, {
      label: editLabel,
      notes: editNotes,
      color: editColor,
      tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setEditInsight(null);
    toast.success("Insight updated");
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await removeInsight(deleteId);
    setDeleteId(null);
    toast.success("Insight deleted");
  };

  const handleExportPdf = async (insight: Insight) => {
    try {
      await checkExport("pdf");
      generatePDF({
        title: insight.label,
        query: insight.query,
        datasetName: insight.datasetName,
        narrative: insight.notes || undefined,
        rows: Array.isArray(insight.result) ? insight.result : undefined,
      });
    } catch (err: any) {
      toast.error(err.message || "PDF export is not available on your plan");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Saved Insights</h1>
          <p className="text-sm text-muted-foreground mt-1">{insights.length} bookmarked results</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search insights..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-background-secondary border-border" />
        </div>
        <Select value={colorFilter} onValueChange={setColorFilter}>
          <SelectTrigger className="w-[130px] bg-background-secondary border-border">
            <Filter size={12} className="mr-1" /><SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All colors</SelectItem>
            {Object.keys(COLOR_MAP).map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-[140px] bg-background-secondary border-border">
            <Tag size={12} className="mr-1" /><SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All tags</SelectItem>
            {allTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Bookmark size={48} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">{insights.length === 0 ? "No saved insights yet" : "No matching insights"}</p>
          <p className="text-xs text-muted-foreground mt-1">Save query results as insights from the Query page</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onEdit={() => openEdit(insight)}
              onDelete={() => setDeleteId(insight.id)}
              pinned={pinnedIds.includes(insight.id)}
              onTogglePin={() => togglePinned(insight.id)}
              onExportPdf={() => handleExportPdf(insight)}
            />
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editInsight} onOpenChange={(open) => { if (!open) setEditInsight(null); }}>
        <DialogContent className="bg-background-secondary border-border">
          <DialogHeader>
            <DialogTitle>Edit Insight</DialogTitle>
            <DialogDescription>Update the label, notes, color, or tags.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Label</label>
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="mt-1 bg-card border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="mt-1 bg-card border-border min-h-[60px]" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Color</label>
              <div className="flex gap-2 mt-1.5">
                {(Object.keys(COLOR_MAP) as Insight["color"][]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditColor(c)}
                    className={`w-7 h-7 rounded-full ${COLOR_MAP[c].bg} border-2 transition-all ${editColor === c ? `${COLOR_MAP[c].border} scale-110` : "border-transparent"}`}
                  >
                    <span className={`block w-3 h-3 rounded-full mx-auto ${COLOR_MAP[c].text.replace("text-", "bg-")}`} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tags (comma-separated)</label>
              <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="revenue, q4, important" className="mt-1 bg-card border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditInsight(null)} className="border-border">Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent className="bg-background-secondary border-border">
          <DialogHeader>
            <DialogTitle>Delete Insight</DialogTitle>
            <DialogDescription>This will permanently remove this saved insight.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="border-border">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
