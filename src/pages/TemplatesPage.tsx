import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutTemplate, Download, MessageSquare, LayoutPanelTop, Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardGridSkeleton } from "@/components/shared/Skeletons";
import { FilterToolbar } from "@/components/shared/FilterToolbar";
import { templatesApi, type Template, type TemplateType } from "@/lib/platform-client";
import { toast } from "@/lib/toast";

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [forking, setForking] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await templatesApi.gallery();
        setTemplates(r.templates);
      } catch (err) {
        toast.error((err as Error).message || "Failed to load templates");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        (typeFilter === "all" || t.type === typeFilter) &&
        (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    );
  }, [templates, search, typeFilter]);

  const handleFork = async (t: Template) => {
    setForking(t.id);
    try {
      const r = await templatesApi.fork(t.id);
      if (r.type === "dashboard") {
        toast.success("Dashboard added — bind it to one of your datasets");
        navigate("/app/dashboards");
      } else {
        // Stash the query payload so QueryPage can pick it up.
        try { sessionStorage.setItem("querify:forked-query", JSON.stringify(r.payload || {})); } catch { /* ignore */ }
        toast.success("Template ready — opening in Query");
        navigate("/app/query");
      }
    } catch (err) {
      toast.error((err as Error).message || "Failed to use template");
    } finally {
      setForking(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Template Gallery"
        titleIcon={LayoutTemplate}
        info="Start from a curated query or dashboard instead of a blank page. Forking copies the template into your workspace, ready to bind to your own data."
        stats={[{ label: "Templates", value: templates.length, tone: "accent" }]}
      />

      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search templates…"
        filters={[{
          key: "type",
          label: "Type",
          options: [
            { value: "all", label: "All" },
            { value: "query", label: "Queries" },
            { value: "dashboard", label: "Dashboards" },
          ],
        }]}
        values={{ type: typeFilter }}
        onValueChange={(_, v) => setTypeFilter(v)}
      />

      {loading ? (
        <CardGridSkeleton cards={6} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Sparkles} title="No templates available yet" description="Check back soon — curated templates are on the way." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Card key={t.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                  {t.type === "dashboard" ? <LayoutPanelTop size={16} /> : <MessageSquare size={16} />}
                </span>
                <p className="min-w-0 flex-1 truncate font-semibold text-foreground">{t.name}</p>
                <Badge variant="secondary" className="text-[10px] capitalize">{t.type}</Badge>
              </div>
              {t.description && <p className="line-clamp-2 flex-1 text-xs text-muted-foreground">{t.description}</p>}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{t.installs > 0 ? `Used by ${t.installs}` : "New"}</span>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleFork(t)} disabled={forking === t.id}>
                  {forking === t.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Use
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
