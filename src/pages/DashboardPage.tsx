import { useEffect, useMemo, useRef } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BarChart2,
  Cable,
  CheckCircle,
  Clock,
  Database,
  MessageSquare,
  Minus,
  RefreshCw,
  Shield,
  TrendingDown,
  TrendingUp,
  Upload,
  XCircle,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
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
import { useAuthStore } from "@/stores/auth-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";
import { useLLMStore, PROVIDER_LABELS } from "@/stores/llm-store";
import { useConnectionStore } from "@/stores/connection-store";
import type { Provider } from "@/lib/llm-client";

const CHART_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(263, 70%, 58%)",
  "hsl(160, 84%, 39%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
];

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
    <div className="rounded-2xl border border-border/70 bg-card/95 px-3 py-2 text-xs shadow-[0_16px_34px_-22px_hsl(var(--foreground)/0.8)] backdrop-blur-sm">
      <p className="mb-1 text-muted-foreground">{label}</p>
      {payload.map((item: any) => (
        <p key={item.dataKey} style={{ color: item.color }} className="font-medium">
          {item.name}: {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
        </p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { datasets, fetchDatasets } = useDatasetStore();
  const { entries, fetchHistory } = useHistoryStore();
  const { connections, fetchConnections } = useConnectionStore();
  const { providerConfigs } = useLLMStore();

  useEffect(() => {
    fetchHistory();
    fetchDatasets();
    fetchConnections();
  }, [fetchHistory, fetchDatasets, fetchConnections]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const lastUpdated = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const totalRows = datasets.reduce((sum, dataset) => sum + Object.values(dataset.rowCounts).reduce((a, b) => a + b, 0), 0);
  const totalTokens = entries.reduce((sum, entry) => sum + entry.totalTokens, 0);

  const last7Queries = entries.filter((entry) => isWithinDays(entry.date, 7)).length;
  const previous7Queries = entries.filter((entry) => isWithinDays(entry.date, 14) && !isWithinDays(entry.date, 7)).length;
  const last7Tokens = entries.filter((entry) => isWithinDays(entry.date, 7)).reduce((sum, entry) => sum + entry.totalTokens, 0);
  const previous7Tokens = entries.filter((entry) => isWithinDays(entry.date, 14) && !isWithinDays(entry.date, 7)).reduce((sum, entry) => sum + entry.totalTokens, 0);

  const successRate = entries.length
    ? Math.round((entries.filter((entry) => entry.status === "success").length / entries.length) * 100)
    : 0;
  const averageDuration = entries.length
    ? Math.round(entries.reduce((sum, entry) => sum + entry.durationMs, 0) / entries.length)
    : 0;

  const activeConnectionsCount = connections.filter((c) => c.status === "connected").length;

  const configuredProviders = (Object.keys(PROVIDER_LABELS) as Provider[]).filter((provider) => !!providerConfigs[provider]?.apiKey);

  const activityData = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (13 - index));
      return date.toISOString().split("T")[0];
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
  }, [entries]);

  const providerData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) counts[entry.provider] = (counts[entry.provider] || 0) + 1;

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([provider, value]) => ({
        name: PROVIDER_LABELS[provider as Provider] || provider,
        value,
      }));
  }, [entries]);

  const datasetUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) counts[entry.datasetName] = (counts[entry.datasetName] || 0) + 1;

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, queries]) => ({ name: name.slice(0, 20), Queries: queries }));
  }, [entries]);

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
    },
    {
      label: "Connections",
      rawValue: connections.length,
      value: connections.length.toLocaleString(),
      sub: `${activeConnectionsCount} active ${activeConnectionsCount === 1 ? "connection" : "connections"}`,
      icon: Cable,
      color: "text-pink-500",
      bg: "bg-pink-500/10",
      glow: "card-glow-pink",
      trend: null,
    },
    {
      label: "Queries Run",
      rawValue: entries.length,
      value: entries.length.toLocaleString(),
      sub: `${last7Queries} this week`,
      icon: MessageSquare,
      color: "text-accent",
      bg: "bg-accent/10",
      glow: "card-glow-purple",
      trend: { current: last7Queries, previous: previous7Queries },
    },
    {
      label: "Tokens Used",
      rawValue: totalTokens,
      value: totalTokens.toLocaleString(),
      sub: `${(last7Tokens / 1000).toFixed(1)}k this week`,
      icon: Zap,
      color: "text-warning",
      bg: "bg-warning/10",
      glow: "card-glow-amber",
      trend: { current: last7Tokens, previous: previous7Tokens },
    },
    {
      label: "Success Rate",
      rawValue: successRate,
      value: `${successRate}%`,
      sub: `${averageDuration.toLocaleString()}ms avg response`,
      icon: Activity,
      color: "text-success",
      bg: "bg-success/10",
      glow: "card-glow-green",
      trend: null,
    },
  ];

  return (
    <div className="page-shell-wide space-y-6">
      <PageHeader
        title={`${greeting}, ${user?.name?.split(" ")[0]}`}
        info="See the health of your analytics workspace at a glance, from provider readiness to dataset coverage and recent query activity."
        stats={[
          { label: "Last updated", value: lastUpdated, live: true },
          { label: "Providers ready", value: configuredProviders.length, tone: "success" },
          { label: "Rows available", value: totalRows.toLocaleString(), tone: "info" },
        ]}
        actions={
          <>
          <Button
            onClick={async () => {
              try {
                await Promise.all([fetchHistory(), fetchDatasets(), fetchConnections()]);
                toast.success("Dashboard refreshed");
              } catch (e) {
                toast.error("Failed to refresh dashboard");
              }
            }}
            variant="outline"
            size="sm"
            className="h-9 flex-1 gap-1.5 border-border/70 bg-background/70 hover:bg-background/90 sm:flex-none"
          >
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button
            onClick={() => navigate("/app/query")}
            size="sm"
            className="h-9 flex-1 gap-1.5 sm:flex-none"
          >
            <MessageSquare size={14} /> New Query
          </Button>
          </>
        }
      />

      <div className="space-y-6 animate-in fade-in duration-300">
        {datasets.length === 0 && entries.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <Card className="relative overflow-hidden p-6">
              {/* Decorative background gradient */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--primary)/0.1),_transparent_60%)]" />
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <BarChart2 size={22} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Welcome to DataVault Agent</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                      Upload a dataset or connect a database, configure your AI provider, then ask questions in plain English.
                    </p>
                  </div>
                </div>
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:shrink-0">
                  <Button className="w-full whitespace-nowrap shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.4)]" onClick={() => navigate("/app/datasets")}>
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

        <div className="metric-strip">
          {kpis.map((kpi, index) => (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
              <Card className={`metric-card ${kpi.glow}`}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kpi.label}</span>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${kpi.bg}`}>
                    <kpi.icon size={15} className={kpi.color} />
                  </div>
                </div>
                <CountUpValue value={kpi.rawValue} formatted={kpi.value} />
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{kpi.sub}</p>
                  {kpi.trend && <TrendBadge current={kpi.trend.current} previous={kpi.trend.previous} />}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">Query Activity</h3>
              <p className="text-xs text-muted-foreground">Queries and token usage over the last 14 days</p>
            </div>
            {entries.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-3">
                <div className="breathe">
                  <BarChart2 size={36} className="text-muted-foreground/30" />
                </div>
                <p className="text-sm text-muted-foreground">Run your first query to see activity here</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={activityData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorQ" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorT" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(263, 70%, 58%)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(263, 70%, 58%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="Queries" stroke="hsl(217, 91%, 60%)" fill="url(#colorQ)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="Tokens" stroke="hsl(263, 70%, 58%)" fill="url(#colorT)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Provider Usage</h3>
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

          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Top Datasets</h3>
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
                  <Bar dataKey="Queries" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold text-foreground">System Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-primary" />
                  <span className="text-sm text-foreground">API Keys</span>
                </div>
                <span className="text-xs text-muted-foreground">{configuredProviders.length} configured</span>
              </div>
              <div className="space-y-1.5">
                {(Object.keys(PROVIDER_LABELS) as Provider[]).slice(0, 5).map((provider) => (
                  <div key={provider} className="flex items-center gap-2 text-xs text-muted-foreground">
                    {configuredProviders.includes(provider) ? (
                      <CheckCircle size={11} className="text-success" />
                    ) : (
                      <XCircle size={11} className="text-muted-foreground/40" />
                    )}
                    {PROVIDER_LABELS[provider]}
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Datasets stored</span>
                <span className="font-medium text-foreground">{datasets.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Connections</span>
                <span className="font-medium text-foreground">{connections.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">History entries</span>
                <span className="font-medium text-foreground">{entries.length}</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 pb-16 lg:grid-cols-2 lg:pb-10">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Recent Queries</h3>
              {entries.length > 0 && (
                <Button variant="link" className="h-auto p-0 text-xs text-primary" onClick={() => navigate("/app/history")}>
                  View all
                </Button>
              )}
            </div>
            {entries.length === 0 ? (
              <div className="flex flex-col items-center py-8">
                <div className="breathe mb-3">
                  <MessageSquare size={32} className="text-muted-foreground/30" />
                </div>
                <p className="text-sm text-muted-foreground">No queries yet — ask your first question</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/app/query")}>
                  <MessageSquare size={13} className="mr-1.5" /> Start querying
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 border-b border-border py-2 last:border-0">
                    <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${entry.status === "success" ? "bg-success" : "bg-destructive"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{entry.query}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.datasetName} | {PROVIDER_LABELS[entry.provider as Provider]}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { icon: Upload, label: "Upload a dataset", sub: `${datasets.length} datasets stored`, path: "/app/datasets" },
                { icon: MessageSquare, label: "Start a new query", sub: "Chat with your data", path: "/app/query" },
                { icon: Clock, label: "Browse history", sub: `${entries.length} past queries`, path: "/app/history" },
                { icon: Shield, label: "Configure API keys", sub: `${configuredProviders.length} providers ready`, path: "/app/settings" },
              ].map(({ icon: Icon, label, sub, path }) => (
                <button
                  key={label}
                  onClick={() => navigate(path)}
                  className="group flex w-full items-center justify-between rounded-2xl border border-border/70 bg-card/75 p-3 text-left transition-all hover:border-primary/30 hover:bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                      <Icon size={14} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-muted-foreground transition-colors group-hover:text-primary" />
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── CountUp animated KPI value ─────────────────────────────────────────────
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
        // Format the same way as the original (keep % suffix if present)
        const hasSuffix = formatted.endsWith("%");
        const numStr    = Math.round(latest).toLocaleString();
        displayRef.current.textContent = hasSuffix ? `${numStr}%` : numStr;
      },
    });
    prevValue.current = value;
    return controls.stop;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <p ref={displayRef} className="text-2xl font-bold text-foreground tabular-nums">
      {formatted}
    </p>
  );
}

function Separator() {
  return <div className="h-px bg-border" />;
}
