import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Database, MessageSquare, Clock, Upload, ArrowRight, Zap, TrendingUp, TrendingDown, 
  Minus, CheckCircle, XCircle, Shield, Activity, Layout, Plus, Edit3, Save, 
  Trash2, MoreHorizontal, Maximize2, RefreshCw, ChevronDown
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


import { useAuthStore } from "@/stores/auth-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";
import { useLLMStore, PROVIDER_LABELS } from "@/stores/llm-store";
import type { Provider } from "@/lib/llm-client";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line
} from "recharts";



const CHART_COLORS = [
  "hsl(217, 91%, 60%)", "hsl(263, 70%, 58%)", "hsl(160, 84%, 39%)",
  "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)", "hsl(300, 70%, 55%)",
  "hsl(180, 70%, 45%)", "hsl(60, 80%, 50%)", "hsl(330, 70%, 55%)",
];

function isWithinDays(dateStr: string, days: number): boolean {
  return Date.now() - new Date(dateStr).getTime() < days * 86400000;
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (current === previous || (current === 0 && previous === 0)) {
    return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus size={10} />—</span>;
  }
  const up = current >= previous;

  return (
    <span className={`flex items-center gap-0.5 text-xs ${up ? "text-success" : "text-destructive"}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {previous > 0 ? `${Math.abs(Math.round(((current - previous) / previous) * 100))}%` : "new"}
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-medium">
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { datasets } = useDatasetStore();
  const { entries } = useHistoryStore();
  const { providerConfigs } = useLLMStore();



  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const lastUpdated = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // ─── Core KPIs ─────────────────────────────────────────────────────────────
  const totalRows = datasets.reduce((s, d) => s + Object.values(d.rowCounts).reduce((a, b) => a + b, 0), 0);
  const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);

  const last7q = entries.filter((e) => isWithinDays(e.date, 7)).length;
  const prev7q = entries.filter((e) => isWithinDays(e.date, 14) && !isWithinDays(e.date, 7)).length;
  const last7t = entries.filter((e) => isWithinDays(e.date, 7)).reduce((s, e) => s + e.totalTokens, 0);
  const prev7t = entries.filter((e) => isWithinDays(e.date, 14) && !isWithinDays(e.date, 7)).reduce((s, e) => s + e.totalTokens, 0);

  const successRate = entries.length
    ? Math.round((entries.filter((e) => e.status === "success").length / entries.length) * 100)
    : 0;
  const avgMs = entries.length
    ? Math.round(entries.reduce((s, e) => s + e.durationMs, 0) / entries.length)
    : 0;

  // ─── Activity chart data (last 14 days) ────────────────────────────────────
  const activityData = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return d.toISOString().split("T")[0];
    });
    const byDate: Record<string, { queries: number; tokens: number }> = {};
    for (const d of days) byDate[d] = { queries: 0, tokens: 0 };
    for (const e of entries) {
      const d = e.date.split("T")[0];
      if (byDate[d]) { byDate[d].queries++; byDate[d].tokens += e.totalTokens; }
    }
    return days.map((d) => ({
      date: new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      Queries: byDate[d].queries,
      Tokens: Math.round(byDate[d].tokens / 1000),
    }));
  }, [entries]);

  // ─── Provider breakdown ─────────────────────────────────────────────────────
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

  // ─── Dataset usage ──────────────────────────────────────────────────────────
  const datasetUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.datasetName] = (counts[e.datasetName] || 0) + 1;
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, Queries]) => ({ name: name.slice(0, 20), Queries }));
  }, [entries]);

  // ─── System status ──────────────────────────────────────────────────────────
  const configuredProviders = (Object.keys(PROVIDER_LABELS) as Provider[]).filter(
    (p) => !!providerConfigs[p]?.apiKey
  );
  const kpis = [
    {
      label: "Datasets",
      value: datasets.length,
      sub: `${totalRows.toLocaleString()} rows total`,
      icon: Database,
      color: "text-primary",
      bg: "bg-primary/10",
      trend: null,
    },
    {
      label: "Queries Run",
      value: entries.length,
      sub: `${last7q} this week`,
      icon: MessageSquare,
      color: "text-accent",
      bg: "bg-accent/10",
      trend: { current: last7q, previous: prev7q },
    },
    {
      label: "Tokens Used",
      value: totalTokens.toLocaleString(),
      sub: `${(last7t / 1000).toFixed(1)}k this week`,
      icon: Zap,
      color: "text-warning",
      bg: "bg-warning/10",
      trend: { current: last7t, previous: prev7t },
    },
    {
      label: "Success Rate",
      value: `${successRate}%`,
      sub: `${avgMs.toLocaleString()}ms avg response`,
      icon: Activity,
      color: "text-success",
      bg: "bg-success/10",
      trend: null,
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {greeting}, {user?.name?.split(" ")[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · Workspace at a glance
          </p>
          <p className="text-xs text-muted-foreground mt-1">Last updated {lastUpdated}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => toast.success("Dashboard refreshed")} variant="outline" size="sm" className="hidden sm:flex items-center gap-2 border-border">
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button onClick={() => navigate("/app/query")} size="sm" className="hidden sm:flex items-center gap-2">
            <MessageSquare size={14} /> New Query
          </Button>
        </div>
      </div>

        <div className="space-y-6 animate-in fade-in duration-300">
          {datasets.length === 0 && entries.length === 0 && (
            <Card className="p-6 bg-background-secondary border-border">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Start your workspace</h3>
                  <p className="text-sm text-muted-foreground mt-1">Upload a dataset, configure a provider, then ask your first question.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => navigate("/app/datasets")}><Upload size={14} className="mr-2" /> Upload dataset</Button>
                  <Button variant="outline" className="border-border" onClick={() => navigate("/app/settings")}><Shield size={14} className="mr-2" /> Configure provider</Button>
                  <Button variant="outline" className="border-border" onClick={() => navigate("/app/query")}><MessageSquare size={14} className="mr-2" /> Ask query</Button>
                </div>
              </div>
            </Card>
          )}

          {/* ─── KPI Cards ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi, i) => (
              <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="p-4 bg-background-secondary border-border hover:border-primary/30 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</span>
                    <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                      <kpi.icon size={15} className={kpi.color} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{kpi.value.toLocaleString()}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground">{kpi.sub}</p>
                    {kpi.trend && <TrendBadge current={kpi.trend.current} previous={kpi.trend.previous} />}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* ─── Activity Chart ─────────────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="p-6 bg-background-secondary border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Query Activity</h3>
                  <p className="text-xs text-muted-foreground">Queries and token usage over the last 14 days</p>
                </div>
              </div>
              {entries.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                  No activity yet — run your first query to see data here
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
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
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="Queries" stroke="hsl(217, 91%, 60%)" fill="url(#colorQ)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="Tokens" stroke="hsl(263, 70%, 58%)" fill="url(#colorT)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>
          </motion.div>

          {/* ─── Analytics Row ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Provider Breakdown */}
            <Card className="p-6 bg-background-secondary border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4">Provider Usage</h3>
              {providerData.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">No data yet</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={120}>
                    <PieChart>
                      <Pie data={providerData} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={28}>
                        {providerData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {providerData.slice(0, 4).map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="text-muted-foreground">{d.name}</span>
                        </div>
                        <span className="text-foreground font-medium">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            {/* Dataset Usage */}
            <Card className="p-6 bg-background-secondary border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4">Top Datasets</h3>
              {datasetUsage.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">No data yet</div>
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

            {/* System Status */}
            <Card className="p-6 bg-background-secondary border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4">System Status</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-sm text-foreground">MongoDB Atlas</span>
                  </div>
                  <Badge className="bg-success/10 text-success border-0 text-xs">Connected</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-primary" />
                    <span className="text-sm text-foreground">API Keys</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{configuredProviders.length} configured</span>
                </div>
                <div className="space-y-1.5">
                  {(Object.keys(PROVIDER_LABELS) as Provider[]).slice(0, 5).map((p) => (
                    <div key={p} className="flex items-center gap-2 text-xs text-muted-foreground">
                      {configuredProviders.includes(p)
                        ? <CheckCircle size={11} className="text-success" />
                        : <XCircle size={11} className="text-muted-foreground/40" />}
                      {PROVIDER_LABELS[p]}
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Datasets stored</span>
                  <span className="text-foreground font-medium">{datasets.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">History entries</span>
                  <span className="text-foreground font-medium">{entries.length}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* ─── Recent + Quick Actions ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-10">
            <Card className="p-6 bg-background-secondary border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Recent Queries</h3>
                {entries.length > 0 && (
                  <Button variant="link" className="text-primary text-xs h-auto p-0" onClick={() => navigate("/app/history")}>
                    View all
                  </Button>
                )}
              </div>
              {entries.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No queries yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {entries.slice(0, 6).map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${entry.status === "success" ? "bg-success" : "bg-destructive"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">{entry.query}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.datasetName} · {PROVIDER_LABELS[entry.provider as Provider]}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(entry.date).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6 bg-background-secondary border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
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
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-card/80 hover:border-primary/30 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon size={14} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-foreground font-medium">{label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
    </div>
  );
}

function Separator() {
  return <div className="h-px bg-border" />;
}
