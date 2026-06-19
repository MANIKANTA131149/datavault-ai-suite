import { useEffect, useState } from "react";
import { Activity, ChevronRight, Cpu, Clock, AlertTriangle, CheckCircle2, Database, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { CollabPanel } from "@/components/CollabPanel";
import { Separator } from "@/components/ui/separator";
import { tracesApi, type TraceSummary, type Trace, type TraceStats } from "@/lib/platform-client";
import { toast } from "@/lib/toast";

function fmtMs(ms: number) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function TracesPage() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [stats, setStats] = useState<TraceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Trace | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [list, s] = await Promise.all([tracesApi.list(), tracesApi.stats()]);
        setTraces(list.traces);
        setStats(s);
      } catch (err) {
        toast.error((err as Error).message || "Failed to load traces");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openTrace = async (id: string) => {
    setLoadingTrace(true);
    try {
      setSelected(await tracesApi.get(id));
    } catch (err) {
      toast.error((err as Error).message || "Failed to load trace");
    } finally {
      setLoadingTrace(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Traces"
        titleIcon={Activity}
        info="Every agent run is recorded here: the ordered steps it took, the SQL it ran, tokens spent, and latency. Use it to understand and debug why an answer happened."
        stats={
          stats
            ? [
                { label: "Runs (7d)", value: stats.runs, tone: "info" },
                { label: "Success", value: `${stats.successRate}%`, tone: "success" },
                { label: "Tokens", value: stats.totalTokens.toLocaleString(), tone: "accent" },
                { label: "Avg latency", value: fmtMs(stats.avgLatencyMs) },
              ]
            : []
        }
      />

      {loading ? (
        <TableSkeleton rows={8} columns={4} />
      ) : traces.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No traces yet"
          description="Run a query in the Query page and its trace will appear here for inspection."
        />
      ) : (
        <div className="space-y-2">
          {traces.map((t) => (
            <Card
              key={t.id}
              onClick={() => openTrace(t.id)}
              className="flex cursor-pointer items-center gap-3 p-3 transition-colors hover:border-primary/40 hover:bg-card/80"
            >
              <span className={t.status === "error" ? "text-rose-400" : "text-emerald-400"}>
                {t.status === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{t.question || "(no question)"}</p>
                <p className="text-xs text-muted-foreground">{new Date(t.ts).toLocaleString()}</p>
              </div>
              <div className="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex">
                <span className="inline-flex items-center gap-1"><Cpu size={12} />{t.totalTokens.toLocaleString()}</span>
                <span className="inline-flex items-center gap-1"><Clock size={12} />{fmtMs(t.latencyMs)}</span>
                <Badge variant="secondary" className="text-[10px]">{t.stepCount} steps</Badge>
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="pr-6 text-left text-base">{selected?.question}</SheetTitle>
          </SheetHeader>
          {loadingTrace ? (
            <div className="mt-6"><TableSkeleton rows={5} columns={2} /></div>
          ) : selected ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">{selected.model || "model"}</Badge>
                <Badge variant="secondary">{selected.totalTokens.toLocaleString()} tokens</Badge>
                <Badge variant="secondary">{fmtMs(selected.latencyMs)}</Badge>
                <Badge variant={selected.status === "error" ? "destructive" : "secondary"}>{selected.status}</Badge>
              </div>

              {/* Step timeline */}
              <ol className="relative space-y-3 border-l border-border/60 pl-5">
                {selected.steps.map((s) => (
                  <li key={s.index} className="relative">
                    <span className="absolute -left-[1.42rem] top-1 flex h-3 w-3 items-center justify-center rounded-full border border-primary/40 bg-background">
                      <span className={`h-1.5 w-1.5 rounded-full ${s.final ? "bg-emerald-400" : "bg-primary"}`} />
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-primary">{s.command}</span>
                      {typeof s.rows === "number" && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Database size={11} />{s.rows} rows</span>}
                    </div>
                    {s.summary && <p className="mt-0.5 text-sm text-foreground/90">{s.summary}</p>}
                    {s.reasoning && <p className="mt-0.5 text-xs italic text-muted-foreground">{s.reasoning}</p>}
                    {s.sql && (
                      <div className="group/sql relative mt-1.5">
                        <pre className="overflow-x-auto rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-foreground/90"><code>{s.sql}</code></pre>
                        <button
                          onClick={() => { navigator.clipboard?.writeText(s.sql || ""); toast.success("SQL copied"); }}
                          className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/sql:opacity-100"
                          aria-label="Copy SQL"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>

              <Separator />
              <CollabPanel resourceType="trace" resourceId={selected.id} />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
