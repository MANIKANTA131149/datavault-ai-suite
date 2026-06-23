import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutTemplate, Download, Sparkles, Loader2, ArrowUpDown, LineChart as LineChartIcon,
  PieChart as PieChartIcon, BarChart3, Table2, Gauge, Search, ShieldCheck, Users, Hash,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardGridSkeleton } from "@/components/shared/Skeletons";
import { FilterToolbar } from "@/components/shared/FilterToolbar";
import { templatesApi, type Template } from "@/lib/platform-client";
import { toast } from "@/lib/toast";

// ─── Deterministic pseudo-data so each preview looks distinct yet stable ───────
// Seeded by the template id, so a card always renders the same little chart.
function seedFrom(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Live animation hook ───────────────────────────────────────────────────────
// Drives a small array of values in [0,1] that drift smoothly over time, so the
// preview charts feel like a live dashboard (fake data, pure motion). Each value
// eases toward a fresh random target on a timer. Honors prefers-reduced-motion
// (returns a static seeded snapshot) and pauses when the tab is hidden.
function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function useLiveSeries(count: number, seed: () => number, opts: { min?: number; max?: number; period?: number } = {}) {
  const { min = 0.2, max = 0.95, period = 1500 } = opts;
  const initial = useMemo(() => Array.from({ length: count }, () => min + seed() * (max - min)), [count, seed, min, max]);
  const [values, setValues] = useState<number[]>(initial);
  const currentRef = useRef<number[]>(initial);
  const targetRef = useRef<number[]>(initial.map(() => min + Math.random() * (max - min)));

  useEffect(() => {
    if (prefersReducedMotion()) return; // accessibility: no animation
    let raf = 0;
    let lastRetarget = 0;
    let lastPaint = 0;

    const tick = (now: number) => {
      // Periodically pick new targets for each point (staggered feel).
      if (now - lastRetarget > period) {
        lastRetarget = now;
        targetRef.current = targetRef.current.map(() => min + Math.random() * (max - min));
      }
      // Ease current → target every frame, but only re-render at ~22fps to keep
      // many cards cheap. The easing math still runs each frame for smoothness.
      const cur = currentRef.current;
      const tgt = targetRef.current;
      let moved = false;
      for (let i = 0; i < cur.length; i++) {
        const delta = tgt[i] - cur[i];
        if (Math.abs(delta) > 0.001) { cur[i] += delta * 0.08; moved = true; }
      }
      if (moved && now - lastPaint > 45) { lastPaint = now; setValues([...cur]); }
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVisibility); };
  }, [min, max, period]);

  return values;
}

type ChartKind = "bar" | "line" | "area" | "pie" | "table" | "metric";

// Infer the visual a QUERY template should show, from its tags/question.
function inferQueryChart(t: Template): ChartKind {
  const hay = `${t.tags.join(" ")} ${t.name} ${(t.payload?.question as string) || ""}`.toLowerCase();
  if (/(time|trend|month|over time|series)/.test(hay)) return "line";
  if (/(rank|top|highest|outlier|anomaly)/.test(hay)) return "bar";
  if (/(share|breakdown|category|segment|comparison|grouping)/.test(hay)) return "pie";
  if (/(profil|quality|null|duplicate|count)/.test(hay)) return "table";
  return "bar";
}

// The dominant chart type of a DASHBOARD template = the one its panels use most.
function dashboardChartKinds(t: Template): ChartKind[] {
  const panels = (t.payload?.panels as Array<{ chartType?: string }>) || [];
  const kinds = panels
    .map((p) => p.chartType)
    .filter((k): k is ChartKind => !!k && ["bar", "line", "area", "pie", "table", "metric"].includes(k));
  return kinds.length ? kinds : ["bar", "line", "metric"];
}

// ─── Mini preview charts (pure SVG, theme-token colored) ───────────────────────
function BarMini({ rng }: { rng: () => number }) {
  const bars = useLiveSeries(7, rng, { min: 0.25, max: 1, period: 1400 });
  return (
    <svg viewBox="0 0 100 48" className="h-full w-full" preserveAspectRatio="none">
      {bars.map((v, i) => (
        <rect
          key={i}
          x={i * 14 + 3}
          y={48 - v * 44}
          width={9}
          height={v * 44}
          rx={2}
          className="fill-primary"
          opacity={0.55 + v * 0.4}
        />
      ))}
    </svg>
  );
}

function LineMini({ rng, area }: { rng: () => number; area?: boolean }) {
  const series = useLiveSeries(8, rng, { min: 0.2, max: 0.9, period: 1600 });
  const pts = series.map((v, i) => [i * 14, 44 - v * 40]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1].toFixed(2)}`).join(" ");
  const areaD = `${d} L98,48 L0,48 Z`;
  // The leading point pulses to suggest a live data feed.
  const head = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 100 48" className="h-full w-full" preserveAspectRatio="none">
      {area && <path d={areaD} className="fill-primary" opacity={0.15} />}
      <path d={d} fill="none" className="stroke-primary" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={1.6} className="fill-primary" />
      ))}
      <circle cx={head[0]} cy={head[1]} r={2.6} className="fill-primary">
        <animate attributeName="r" values="2.2;3.4;2.2" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function PieMini({ rng }: { rng: () => number }) {
  const slices = [0.42, 0.28, 0.18, 0.12];
  let acc = 0;
  const r = 20;
  const cx = 50;
  const cy = 24;
  const opacities = [0.95, 0.7, 0.5, 0.32];
  // tiny jitter so cards differ
  const jitter = rng() * 0.06 - 0.03;
  return (
    <svg viewBox="0 0 100 48" className="h-full w-full">
      {slices.map((s, i) => {
        const frac = i === 0 ? s + jitter : s;
        const start = acc * 2 * Math.PI - Math.PI / 2;
        acc += frac;
        const end = acc * 2 * Math.PI - Math.PI / 2;
        const large = end - start > Math.PI ? 1 : 0;
        const x1 = cx + r * Math.cos(start);
        const y1 = cy + r * Math.sin(start);
        const x2 = cx + r * Math.cos(end);
        const y2 = cy + r * Math.sin(end);
        return (
          <path
            key={i}
            d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`}
            className="fill-primary"
            opacity={opacities[i]}
          />
        );
      })}
    </svg>
  );
}

function TableMini() {
  return (
    <div className="flex h-full w-full flex-col gap-1 px-1 py-1.5">
      <div className="h-2 w-full rounded-sm bg-primary/40" />
      {[0.9, 0.7, 0.85, 0.6].map((w, i) => (
        <div key={i} className="flex gap-1">
          <div className="h-1.5 rounded-sm bg-muted-foreground/30" style={{ width: `${w * 40}%` }} />
          <div className="h-1.5 rounded-sm bg-muted-foreground/20" style={{ width: `${(1 - w) * 50 + 20}%` }} />
        </div>
      ))}
    </div>
  );
}

function MetricMini({ rng }: { rng: () => number }) {
  // One live value drives the big number; it drifts so the metric "ticks".
  const [v] = useLiveSeries(1, rng, { min: 0.15, max: 0.95, period: 1800 });
  const base = useMemo(() => rng() * 6 + 2, [rng]);
  const big = (base + v * 3).toFixed(1);
  const pct = (v * 24 + 1).toFixed(0);
  const up = v > 0.45;
  return (
    <div className="flex h-full w-full flex-col items-start justify-center px-2">
      <span className="flex items-center gap-1.5 text-lg font-bold leading-none text-primary tabular-nums">
        {big}K
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
      </span>
      <span className={`mt-0.5 text-[10px] font-medium tabular-nums ${up ? "text-success" : "text-warning"}`}>
        {up ? "▲" : "▼"} {pct}%
      </span>
    </div>
  );
}

function ChartByKind({ kind, rng }: { kind: ChartKind; rng: () => number }) {
  switch (kind) {
    case "line": return <LineMini rng={rng} />;
    case "area": return <LineMini rng={rng} area />;
    case "pie": return <PieMini rng={rng} />;
    case "table": return <TableMini />;
    case "metric": return <MetricMini rng={rng} />;
    default: return <BarMini rng={rng} />;
  }
}

// Small labelled icon for the chart-type pill on each card.
const KIND_META: Record<ChartKind, { icon: typeof BarChart3; label: string }> = {
  bar: { icon: BarChart3, label: "Bar" },
  line: { icon: LineChartIcon, label: "Trend" },
  area: { icon: LineChartIcon, label: "Trend" },
  pie: { icon: PieChartIcon, label: "Breakdown" },
  table: { icon: Table2, label: "Table" },
  metric: { icon: Gauge, label: "Metric" },
};

// Topical icon for a query template, for a touch more personality.
function queryTopicIcon(t: Template) {
  const hay = `${t.tags.join(" ")} ${t.name}`.toLowerCase();
  if (/(rank|top|highest)/.test(hay)) return ArrowUpDown;
  if (/(quality|profil|null)/.test(hay)) return ShieldCheck;
  if (/(anomaly|outlier)/.test(hay)) return Search;
  if (/(customer|user|segment)/.test(hay)) return Users;
  if (/(count|number|metric)/.test(hay)) return Hash;
  return Sparkles;
}

// ─── Per-template preview header (the "graphical" part) ────────────────────────
function TemplatePreview({ t }: { t: Template }) {
  const rng = useMemo(() => seedFrom(t.id), [t.id]);

  if (t.type === "dashboard") {
    const kinds = dashboardChartKinds(t).slice(0, 4);
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-1.5 rounded-lg bg-gradient-to-br from-primary/10 via-card to-accent/10 p-2">
        {Array.from({ length: 4 }).map((_, i) => {
          const kind = kinds[i % kinds.length];
          return (
            <div key={i} className="flex h-[42px] items-center justify-center overflow-hidden rounded-md border border-border/50 bg-background/60">
              <ChartByKind kind={kind} rng={rng} />
            </div>
          );
        })}
      </div>
    );
  }

  const kind = inferQueryChart(t);
  return (
    <div className="flex h-[92px] items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/10 via-card to-accent/10 p-3">
      <div className="h-full w-full">
        <ChartByKind kind={kind} rng={rng} />
      </div>
    </div>
  );
}

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
    <div className="page-shell page-enter space-y-6">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const kind = t.type === "dashboard" ? "metric" : inferQueryChart(t);
            const meta = t.type === "dashboard"
              ? { icon: LayoutTemplate, label: "Dashboard" }
              : KIND_META[kind];
            const TopicIcon = t.type === "dashboard" ? LayoutTemplate : queryTopicIcon(t);
            const MetaIcon = meta.icon;
            return (
              <Card
                key={t.id}
                className="group flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                {/* Graphical preview */}
                <div className="p-3 pb-0">
                  <TemplatePreview t={t} />
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-2 p-4 pt-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                      <TopicIcon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold leading-tight text-foreground">{t.name}</p>
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MetaIcon size={11} /> {meta.label}
                      </span>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">{t.type}</Badge>
                  </div>

                  {t.description && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
                  )}

                  {t.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {t.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground">
                      {t.installs > 0 ? `Used by ${t.installs}` : "New"}
                    </span>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleFork(t)}
                      disabled={forking === t.id}
                    >
                      {forking === t.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Use
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
