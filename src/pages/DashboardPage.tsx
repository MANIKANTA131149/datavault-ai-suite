import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Archive,
  BarChart2,
  Cable,
  ChevronRight,
  Clock,
  Database,
  Lightbulb,
  MessageSquare,
  Minus,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";
import { useLLMStore, PROVIDER_LABELS } from "@/stores/llm-store";
import { useConnectionStore } from "@/stores/connection-store";
import type { Provider } from "@/lib/llm-client";

// ─── Constants ────────────────────────────────────────────────────────────────
const CHART_COLORS = [
  "hsl(214, 65%, 54%)",
  "hsl(252, 52%, 57%)",
  "hsl(160, 60%, 42%)",
  "hsl(38, 85%, 50%)",
  "hsl(0, 72%, 56%)",
];

// ─── Animation variants ───────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
  }),
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isWithinDays(dateStr: string, days: number): boolean {
  return Date.now() - new Date(dateStr).getTime() < days * 86400000;
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (current === previous || (current === 0 && previous === 0)) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus size={10} />
        Stable
      </span>
    );
  }
  const up = current >= previous;
  return (
    <span className={`flex items-center gap-1 text-xs ${up ? "text-success" : "text-destructive"}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {previous > 0 ? `${Math.abs(Math.round(((current - previous) / previous) * 100))}%` : "new"}
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-card/95 px-3 py-2 text-xs shadow-[0_4px_16px_-6px_hsl(var(--foreground)/0.1)] backdrop-blur-sm">
      <p className="mb-1 text-muted-foreground">{label}</p>
      {payload.map((item: any) => (
        <p key={item.dataKey} style={{ color: item.color }} className="font-medium">
          {item.name}: {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
        </p>
      ))}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { datasets, fetchDatasets } = useDatasetStore();
  const { entries, fetchHistory } = useHistoryStore();
  const { connections, fetchConnections } = useConnectionStore();
  const { providerConfigs } = useLLMStore();

  const [chartDays, setChartDays] = useState<7 | 14 | 30>(14);

  useEffect(() => {
    fetchHistory();
    fetchDatasets();
    fetchConnections();
  }, [fetchHistory, fetchDatasets, fetchConnections]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const lastUpdated = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const totalRows = datasets.reduce(
    (sum, dataset) => sum + Object.values(dataset.rowCounts).reduce((a, b) => a + b, 0),
    0,
  );
  const totalTokens = entries.reduce((sum, entry) => sum + entry.totalTokens, 0);
  const successRate = entries.length
    ? Math.round((entries.filter((e) => e.status === "success").length / entries.length) * 100)
    : 0;
  const averageDuration = entries.length
    ? Math.round(entries.reduce((sum, e) => sum + e.durationMs, 0) / entries.length)
    : 0;
  const activeConnectionsCount = connections.filter((c) => c.status === "connected").length;
  const configuredProviders = (Object.keys(PROVIDER_LABELS) as Provider[]).filter(
    (p) => !!providerConfigs[p]?.apiKey,
  );

  // ── Weekly digest ──────────────────────────────────────────────────────────
  const weeklyDigest = useMemo(() => {
    const thisWeek = entries.filter((e) => isWithinDays(e.date, 7));
    const lastWeek = entries.filter((e) => isWithinDays(e.date, 14) && !isWithinDays(e.date, 7));
    const pct = (cur: number, prev: number): number | null =>
      prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);

    const qCur = thisWeek.length;
    const qPrev = lastWeek.length;
    const tCur = thisWeek.reduce((s, e) => s + e.totalTokens, 0);
    const tPrev = lastWeek.reduce((s, e) => s + e.totalTokens, 0);
    const srCur = thisWeek.length
      ? Math.round((thisWeek.filter((e) => e.status === "success").length / thisWeek.length) * 100)
      : 0;
    const srPrev = lastWeek.length
      ? Math.round((lastWeek.filter((e) => e.status === "success").length / lastWeek.length) * 100)
      : 0;

    return {
      queries: { cur: qCur, prev: qPrev, delta: pct(qCur, qPrev) },
      tokens:  { cur: tCur, prev: tPrev, delta: pct(tCur, tPrev) },
      success: { cur: srCur, delta: srCur - srPrev },
    };
  }, [entries]);

  // ── AI Insights (rule-based, derived purely from existing client data) ─────
  const aiInsights = useMemo(() => {
    const out: {
      id: string;
      icon: typeof Sparkles;
      tone: "info" | "success" | "warning";
      title: string;
      description: string;
      cta?: { label: string; path: string };
    }[] = [];

    // 1. Provider readiness gate
    if (configuredProviders.length === 0 && (datasets.length > 0 || entries.length > 0)) {
      out.push({
        id: "no-provider",
        icon: Shield,
        tone: "warning",
        title: "No AI provider configured yet",
        description: "Add an API key to start asking questions about your data in plain English.",
        cta: { label: "Configure provider", path: "/app/settings" },
      });
    }

    // 2. Most-queried dataset → suggest automation
    if (entries.length >= 5) {
      const counts: Record<string, number> = {};
      for (const e of entries) if (e.datasetName) counts[e.datasetName] = (counts[e.datasetName] || 0) + 1;
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 3) {
        out.push({
          id: "top-dataset",
          icon: TrendingUp,
          tone: "info",
          title: `"${top[0]}" is your most active dataset`,
          description: `${top[1]} queries recently — turn your repeat questions into a scheduled automation.`,
          cta: { label: "Create automation", path: "/app/automations" },
        });
      }
    }

    // 3. Low success rate signal
    if (entries.length >= 5 && successRate < 70) {
      out.push({
        id: "low-success",
        icon: Activity,
        tone: "warning",
        title: `Success rate is ${successRate}%`,
        description: "Some queries are failing. Reviewing recent runs can reveal schema or phrasing issues.",
        cta: { label: "Review history", path: "/app/history" },
      });
    }

    // 4. Unused datasets cleanup
    const queriedNames = new Set(entries.map((e) => e.datasetName).filter(Boolean));
    const unused = datasets.filter((ds) => !queriedNames.has(ds.fileName) && !queriedNames.has(ds.displayName || ""));
    if (unused.length >= 3) {
      out.push({
        id: "unused-datasets",
        icon: Archive,
        tone: "info",
        title: `${unused.length} datasets haven't been queried`,
        description: "Keep your workspace focused by archiving datasets you no longer use.",
        cta: { label: "Review datasets", path: "/app/datasets" },
      });
    }

    // 5. Connection needing attention
    const brokenConn = connections.find((c) => c.status === "error");
    if (brokenConn) {
      out.push({
        id: "broken-conn",
        icon: Cable,
        tone: "warning",
        title: `"${brokenConn.name}" needs attention`,
        description: "A database connection is offline. Re-test it to keep live queries working.",
        cta: { label: "Open connections", path: "/app/connections" },
      });
    }

    // 6. Positive momentum
    if (out.length < 3 && weeklyDigest.queries.delta != null && weeklyDigest.queries.delta > 20) {
      out.push({
        id: "momentum",
        icon: Sparkles,
        tone: "success",
        title: `Query activity is up ${weeklyDigest.queries.delta}% this week`,
        description: "Your team is leaning into the data. Pin your best queries for quick re-runs.",
        cta: { label: "Open query", path: "/app/query" },
      });
    }

    return out.slice(0, 3);
  }, [configuredProviders.length, datasets, entries, connections, successRate, weeklyDigest]);

  // ── Activity chart (variable range) ───────────────────────────────────────
  const activityData = useMemo(() => {
    const days = Array.from({ length: chartDays }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (chartDays - 1 - i));
      return d.toISOString().split("T")[0];
    });
    const byDate: Record<string, { queries: number; tokens: number }> = {};
    for (const day of days) byDate[day] = { queries: 0, tokens: 0 };
    for (const entry of entries) {
      const day = entry.date.split("T")[0];
      if (byDate[day]) {
        byDate[day].queries += 1;
        byDate[day].tokens += entry.totalTokens;
      }
    }
    return days.map((day) => ({
      date: new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      Queries: byDate[day].queries,
      Tokens: Math.round(byDate[day].tokens / 1000),
    }));
  }, [entries, chartDays]);

  // ── Sparkline data (7-day per-metric) ─────────────────────────────────────
  const sparklineData = useMemo(() => {
    const days7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split("T")[0];
    });
    const byDay = (fn: (e: typeof entries[number]) => number) =>
      days7.map((day) => ({
        v: entries.filter((e) => e.date.startsWith(day)).reduce((s, e) => s + fn(e), 0),
      }));
    return {
      queries:     byDay(() => 1),
      tokens:      byDay((e) => e.totalTokens),
      successRate: days7.map((day) => {
        const de = entries.filter((e) => e.date.startsWith(day));
        return {
          v: de.length
            ? Math.round((de.filter((e) => e.status === "success").length / de.length) * 100)
            : 0,
        };
      }),
    };
  }, [entries]);

  // ── Model performance ──────────────────────────────────────────────────────
  const modelPerf = useMemo(() => {
    const map = new Map<string, { total: number; success: number; dur: number }>();
    for (const e of entries) {
      const cur = map.get(e.model) ?? { total: 0, success: 0, dur: 0 };
      map.set(e.model, {
        total:   cur.total + 1,
        success: cur.success + (e.status === "success" ? 1 : 0),
        dur:     cur.dur + e.durationMs,
      });
    }
    return Array.from(map.entries())
      .map(([model, s]) => ({
        model,
        rate:  Math.round((s.success / s.total) * 100),
        avgMs: Math.round(s.dur / s.total),
        count: s.total,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [entries]);

  // ── Provider & dataset charts ──────────────────────────────────────────────
  const providerData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.provider] = (counts[e.provider] || 0) + 1;
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([provider, value]) => ({
        name: PROVIDER_LABELS[provider as Provider] || provider,
        value,
      }));
  }, [entries]);

  const datasetUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.datasetName] = (counts[e.datasetName] || 0) + 1;
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, queries]) => ({ name: name.slice(0, 20), Queries: queries }));
  }, [entries]);

  // ── KPI definitions ────────────────────────────────────────────────────────
  const kpis = [
    {
      label: "Datasets",
      rawValue: datasets.length,
      value: datasets.length.toLocaleString(),
      sub: `${totalRows.toLocaleString()} rows total`,
      icon: Database,
      color: "text-primary",
      bg: "bg-primary/10",
      glow: "card-glow-blue",
      trend: null,
      sparkKey: null as "queries" | "tokens" | "successRate" | null,
      sparkColor: "",
    },
    {
      label: "Connections",
      rawValue: connections.length,
      value: connections.length.toLocaleString(),
      sub: `${activeConnectionsCount} active`,
      icon: Cable,
      color: "text-pink-500",
      bg: "bg-pink-500/10",
      glow: "card-glow-pink",
      trend: null,
      sparkKey: null as "queries" | "tokens" | "successRate" | null,
      sparkColor: "",
    },
    {
      label: "Queries Run",
      rawValue: entries.length,
      value: entries.length.toLocaleString(),
      sub: `${weeklyDigest.queries.cur} this week`,
      icon: MessageSquare,
      color: "text-accent",
      bg: "bg-accent/10",
      glow: "card-glow-purple",
      trend: { current: weeklyDigest.queries.cur, previous: weeklyDigest.queries.prev },
      sparkKey: "queries" as const,
      sparkColor: CHART_COLORS[1],
    },
    {
      label: "Tokens Used",
      rawValue: totalTokens,
      value: totalTokens.toLocaleString(),
      sub: `${(weeklyDigest.tokens.cur / 1000).toFixed(1)}k this week`,
      icon: Zap,
      color: "text-warning",
      bg: "bg-warning/10",
      glow: "card-glow-amber",
      trend: { current: weeklyDigest.tokens.cur, previous: weeklyDigest.tokens.prev },
      sparkKey: "tokens" as const,
      sparkColor: CHART_COLORS[3],
    },
    {
      label: "Success Rate",
      rawValue: successRate,
      value: `${successRate}%`,
      sub: `${averageDuration.toLocaleString()}ms avg`,
      icon: Activity,
      color: "text-success",
      bg: "bg-success/10",
      glow: "card-glow-green",
      trend: null,
      sparkKey: "successRate" as const,
      sparkColor: CHART_COLORS[2],
    },
  ];

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="page-shell-wide page-enter space-y-6">
      <PageHeader
        title={`${greeting}, ${user?.name?.split(" ")[0]}`}
        info="See the health of your analytics workspace at a glance, from provider readiness to dataset coverage and recent query activity."
        stats={[
          { label: "Last updated", value: lastUpdated, live: true },
          { label: "Providers ready", value: configuredProviders.length, tone: "success" },
          { label: "Rows available", value: totalRows.toLocaleString(), tone: "info" },
        ]}
        actions={
          <Button
            onClick={() => navigate("/app/query")}
            size="sm"
            className="h-9 flex-1 gap-1.5 sm:flex-none"
          >
            <Plus size={14} /> New Query
          </Button>
        }
      />

      <motion.div className="space-y-6" initial="hidden" animate="visible" variants={stagger}>
        {/* Welcome card */}
        {datasets.length === 0 && entries.length === 0 && (
          <motion.div variants={fadeUp}>
            <Card className="relative overflow-hidden p-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--primary)/0.1),_transparent_60%)]" />
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <BarChart2 size={22} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="type-h3">Welcome to Querify Agent</h3>
                    <p className="mt-1 max-w-md type-body-sm">
                      Upload a dataset or connect a database, configure your AI provider, then ask questions in plain English.
                    </p>
                  </div>
                </div>
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:shrink-0">
                  <Button className="w-full whitespace-nowrap" onClick={() => navigate("/app/datasets")}>
                    <Upload size={14} className="mr-2" /> Upload dataset
                  </Button>
                  <Button variant="outline" className="w-full whitespace-nowrap" onClick={() => navigate("/app/settings")}>
                    <Shield size={14} className="mr-2" /> Configure provider
                  </Button>
                  <Button variant="outline" className="w-full whitespace-nowrap" onClick={() => navigate("/app/query")}>
                    <MessageSquare size={14} className="mr-2" /> Ask query
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* KPI strip */}
        <motion.div variants={fadeUp} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {kpis.map((kpi, index) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className={`metric-card ${kpi.glow}`}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="stat-label">{kpi.label}</span>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${kpi.bg}`}>
                    <kpi.icon size={15} className={kpi.color} />
                  </div>
                </div>
                <CountUpValue value={kpi.rawValue} formatted={kpi.value} />
                <div className="mt-1.5 opacity-60">
                  {kpi.sparkKey != null ? (
                    <KpiSparkline
                      data={sparklineData[kpi.sparkKey]}
                      color={kpi.sparkColor}
                    />
                  ) : (
                    <div className="h-8" />
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{kpi.sub}</p>
                  {kpi.trend && <TrendBadge current={kpi.trend.current} previous={kpi.trend.previous} />}
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Weekly digest banner */}
        {entries.length > 0 && (
          <motion.div variants={fadeUp}>
            <Card className="px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-x-0 gap-y-3 divide-y sm:divide-y-0 sm:divide-x divide-border/40">
                <DigestStat
                  label="Queries this week"
                  value={weeklyDigest.queries.cur}
                  delta={weeklyDigest.queries.delta}
                  className="w-full sm:w-auto sm:pr-6"
                />
                <DigestStat
                  label="Tokens this week"
                  value={`${(weeklyDigest.tokens.cur / 1000).toFixed(1)}k`}
                  delta={weeklyDigest.tokens.delta}
                  className="w-full sm:w-auto sm:px-6"
                />
                <DigestStat
                  label="Success rate (7d)"
                  value={`${weeklyDigest.success.cur}%`}
                  delta={weeklyDigest.success.delta}
                  isPoints
                  className="w-full sm:w-auto sm:pl-6"
                />
              </div>
            </Card>
          </motion.div>
        )}

        {/* Activity chart */}
        <motion.div variants={fadeUp}>
          <Card className="p-6">
            <div className="card-header">
              <div>
                <h3 className="type-h3">Query Activity</h3>
                <p className="type-body-sm mt-0.5">
                  Queries and token usage over the last {chartDays} days
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setChartDays(d)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      chartDays === d
                        ? "border-primary/30 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                  >
                    {d}D
                  </button>
                ))}
              </div>
            </div>
            {entries.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/40 bg-muted/10">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted/30">
                  <BarChart2 size={20} className="text-muted-foreground/40" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">No activity yet</p>
                  <p className="text-xs text-muted-foreground">Run your first query to see trends here</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/app/query")}>
                  <MessageSquare size={13} className="mr-1.5" /> Start querying
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={activityData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorQ" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(214, 65%, 54%)" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="hsl(214, 65%, 54%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorT" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(252, 52%, 57%)" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="hsl(252, 52%, 57%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="Queries" stroke="hsl(214, 65%, 54%)" fill="url(#colorQ)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="Tokens" stroke="hsl(252, 52%, 57%)" fill="url(#colorT)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </motion.div>

        {/* 3-column grid */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Provider usage */}
          <Card className="p-6">
            <h3 className="type-h3 mb-4">Provider Usage</h3>
            {providerData.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2">
                <div className="breathe"><Database size={28} className="text-muted-foreground/25" /></div>
                <p className="text-xs text-muted-foreground">No provider data yet</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={providerData} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={28}>
                      {providerData.map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1.5">
                  {providerData.slice(0, 4).map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                      <span className="font-medium text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Top datasets */}
          <Card className="p-6">
            <h3 className="type-h3 mb-4">Top Datasets</h3>
            {datasetUsage.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2">
                <div className="breathe"><BarChart2 size={28} className="text-muted-foreground/25" /></div>
                <p className="text-xs text-muted-foreground">No dataset queries yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={datasetUsage} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Queries" fill="hsl(214, 65%, 54%)" radius={[0, 4, 4, 0]} maxBarSize={10} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Model performance */}
          <Card className="p-6">
            <h3 className="type-h3 mb-4">Model Performance</h3>
            {modelPerf.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2">
                <div className="breathe"><Activity size={28} className="text-muted-foreground/25" /></div>
                <p className="text-xs text-muted-foreground">No model data yet</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {modelPerf.map((m, i) => (
                  <div key={m.model} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate text-foreground max-w-[140px]" title={m.model}>
                        {(m.model.split("/").pop() ?? m.model).slice(0, 22)}
                      </span>
                      <div className="flex gap-2.5 text-muted-foreground shrink-0 ml-2">
                        <span className="tabular-nums">{m.rate}%</span>
                        <span className="tabular-nums text-muted-foreground/60">{m.avgMs}ms</span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${m.rate}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* AI Insights — bottom of the dashboard */}
        {aiInsights.length > 0 && (
          <motion.div variants={fadeUp}>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                <Lightbulb size={13} className="text-primary" />
              </div>
              <h3 className="type-h3">AI Insights</h3>
              <span className="status-badge-info">Smart</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {aiInsights.map((insight, i) => {
                const toneRing =
                  insight.tone === "success" ? "border-success/25 hover:border-success/40"
                  : insight.tone === "warning" ? "border-warning/25 hover:border-warning/40"
                  : "border-primary/20 hover:border-primary/40";
                const toneIcon =
                  insight.tone === "success" ? "bg-success/10 text-success"
                  : insight.tone === "warning" ? "bg-warning/10 text-warning"
                  : "bg-primary/10 text-primary";
                return (
                  <motion.div
                    key={insight.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Card className={cn("card-lift flex h-full flex-col p-4", toneRing)}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", toneIcon)}>
                          <insight.icon size={15} />
                        </div>
                      </div>
                      <p className="text-sm font-semibold leading-snug text-foreground">{insight.title}</p>
                      <p className="mt-1 flex-1 type-body-sm">{insight.description}</p>
                      {insight.cta && (
                        <button
                          type="button"
                          onClick={() => navigate(insight.cta!.path)}
                          className="press-dim mt-3 inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:gap-1.5 transition-all"
                        >
                          {insight.cta.label} <ArrowRight size={12} />
                        </button>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

      </motion.div>
    </div>
  );
}

// ─── CountUp animated KPI value ───────────────────────────────────────────────
function CountUpValue({ value, formatted }: { value: number; formatted: string }) {
  const motionValue = useMotionValue(0);
  const displayRef  = useRef<HTMLParagraphElement>(null);
  const prevValue   = useRef(value);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate(latest) {
        if (!displayRef.current) return;
        const hasSuffix = formatted.endsWith("%");
        const numStr    = Math.round(latest).toLocaleString();
        displayRef.current.textContent = hasSuffix ? `${numStr}%` : numStr;
      },
    });
    prevValue.current = value;
    return controls.stop;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <p ref={displayRef} className="stat-number">
      {formatted}
    </p>
  );
}

// ─── KPI sparkline ────────────────────────────────────────────────────────────
function KpiSparkline({ data, color }: { data: { v: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Digest stat ──────────────────────────────────────────────────────────────
function DigestStat({
  label,
  value,
  delta,
  isPoints = false,
  className,
}: {
  label: string;
  value: string | number;
  delta: number | null;
  isPoints?: boolean;
  className?: string;
}) {
  const up = delta !== null && delta > 0;
  const dn = delta !== null && delta < 0;
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="stat-label">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
        {delta !== null && (
          <span className={cn(
            "flex items-center gap-0.5 text-[11px]",
            up ? "text-success" : dn ? "text-destructive" : "text-muted-foreground",
          )}>
            {up ? <TrendingUp size={10} /> : dn ? <TrendingDown size={10} /> : <Minus size={10} />}
            {Math.abs(delta)}{isPoints ? "pp" : "%"}
          </span>
        )}
      </div>
    </div>
  );
}

function Separator() {
  return <div className="h-px bg-border" />;
}
