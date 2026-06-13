// ─── Shared dashboard chart rendering ─────────────────────────────────────────
// Used by both the Dashboards viewer page and the inline dashboard preview in
// the chat, so the two always render panels identically. Pure presentation:
// give it a panel spec + the rows its SQL produced and it draws the right chart.

import { useEffect, useMemo } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import {
  BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon,
  Table2, Gauge, AreaChart as AreaChartIcon,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import type { DashboardPanel } from "@/lib/automation-client";

export const CHART_COLORS = [
  "hsl(214 70% 56%)", "hsl(262 62% 60%)", "hsl(152 52% 46%)",
  "hsl(38 88% 56%)",  "hsl(350 68% 58%)", "hsl(190 62% 48%)",
  "hsl(286 60% 60%)", "hsl(168 55% 44%)", "hsl(20 80% 58%)",
  "hsl(225 62% 62%)", "hsl(96 50% 48%)",  "hsl(330 62% 58%)",
];

export const CHART_TYPE_ICON: Record<DashboardPanel["chartType"], typeof BarChart3> = {
  bar: BarChart3,
  line: LineChartIcon,
  area: AreaChartIcon,
  pie: PieChartIcon,
  table: Table2,
  metric: Gauge,
};

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 12,
  boxShadow: "0 8px 24px -12px hsl(var(--foreground) / 0.35)",
  padding: "8px 12px",
} as const;

const CHART_HEIGHT = 224;
const ANIM_DURATION = 850;

export const PRETTY = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : Math.abs(n) >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
  : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function splitColumns(rows: Record<string, unknown>[]): { xKey: string | null; valueKeys: string[] } {
  if (rows.length === 0) return { xKey: null, valueKeys: [] };
  const cols = Object.keys(rows[0]);
  const numeric = cols.filter((c) => rows.every((r) => r[c] === null || r[c] === undefined || Number.isFinite(Number(r[c]))));
  const xKey = cols.find((c) => !numeric.includes(c)) ?? cols[0] ?? null;
  const valueKeys = numeric.filter((c) => c !== xKey).slice(0, 4);
  return { xKey, valueKeys: valueKeys.length ? valueKeys : numeric.slice(0, 1) };
}

function chartRows(rows: Record<string, unknown>[], xKey: string | null, valueKeys: string[]) {
  return rows.slice(0, 30).map((r) => {
    const out: Record<string, unknown> = { __x: xKey ? String(r[xKey] ?? "") : "" };
    for (const k of valueKeys) out[k] = Number(r[k]) || 0;
    return out;
  });
}

/** Truncate a category label so long names don't overlap into gibberish. */
function shortLabel(v: unknown): string {
  const s = String(v ?? "");
  return s.length > 14 ? `${s.slice(0, 13)}…` : s;
}

/** Count panels by chart type, most common first. */
export function panelTypeBreakdown(panels: DashboardPanel[]): { type: DashboardPanel["chartType"]; count: number }[] {
  const counts = new Map<DashboardPanel["chartType"], number>();
  for (const p of panels) counts.set(p.chartType, (counts.get(p.chartType) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

/**
 * Wraps a Recharts chart so it re-mounts when its data changes — which replays
 * the one-time draw-on animation — and gently fades/scales in. No continuous
 * motion, no moving background overlay.
 */
function ChartShell({ animKey, children }: { animKey: string; children: React.ReactNode }) {
  return (
    <motion.div
      key={animKey}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

/** A number that rolls up to its value like a ticker on mount/change. */
function CountUp({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) =>
    v.toLocaleString(undefined, { maximumFractionDigits: 2 }),
  );
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    return controls.stop;
  }, [value, mv]);
  return <motion.span>{rounded}</motion.span>;
}

export function PanelChart({ panel, rows }: { panel: DashboardPanel; rows: Record<string, unknown>[] }) {
  const { xKey, valueKeys } = useMemo(() => splitColumns(rows), [rows]);

  if (panel.chartType === "metric" || (rows.length === 1 && Object.keys(rows[0] || {}).length === 1)) {
    const value = Object.values(rows[0] || {})[0];
    const num = Number(value);
    const isNum = Number.isFinite(num);
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="flex h-full min-h-[150px] flex-col items-center justify-center gap-2 text-center"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <Gauge size={17} className="text-primary" />
        </div>
        <p className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
          {isNum ? <CountUp value={num} /> : String(value ?? "—")}
        </p>
        <p className="max-w-full truncate px-2 text-xs text-muted-foreground">{panel.title}</p>
      </motion.div>
    );
  }

  if (panel.chartType === "table" || valueKeys.length === 0 || rows.length === 0) {
    const cols = Object.keys(rows[0] || {});
    if (cols.length === 0) {
      return (
        <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground">
          No rows returned
        </div>
      );
    }
    return (
      <div className="max-h-[224px] overflow-auto rounded-lg border border-border/70">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
            <tr>
              {cols.map((c) => (
                <th key={c} className="border-b border-border px-2.5 py-2 text-left font-semibold uppercase tracking-wide text-[10px] text-muted-foreground whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((r, i) => (
              <tr key={i} className="transition-colors even:bg-muted/20 hover:bg-primary/5">
                {cols.map((c) => {
                  const v = r[c];
                  const isNum = typeof v === "number";
                  return (
                    <td
                      key={c}
                      className={`px-2.5 py-1.5 text-foreground whitespace-nowrap max-w-[180px] truncate ${isNum ? "text-right tabular-nums" : "text-left"}`}
                      title={String(v ?? "")}
                    >
                      {isNum ? (v as number).toLocaleString() : String(v ?? "")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const data = chartRows(rows, xKey, valueKeys);

  if (panel.chartType === "pie") {
    const key = valueKeys[0];
    const sorted = [...data].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
    const top = sorted.slice(0, 8);
    const restTotal = sorted.slice(8).reduce((s, r) => s + (Number(r[key]) || 0), 0);
    const pieData = restTotal > 0 ? [...top, { __x: "Other", [key]: restTotal }] : top;
    const total = pieData.reduce((s, r) => s + (Number(r[key]) || 0), 0) || 1;

    return (
      <ChartShell animKey={`pie:${pieData.length}:${key}`}>
        <div className="flex h-full min-h-[200px] flex-col items-center gap-2 sm:flex-row sm:gap-3">
          <div className="h-[200px] w-full shrink-0 sm:w-[55%]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey={key}
                  nameKey="__x"
                  innerRadius={"58%"}
                  outerRadius={"90%"}
                  paddingAngle={2}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                  isAnimationActive
                  animationBegin={0}
                  animationDuration={ANIM_DURATION}
                  animationEasing="ease-out"
                >
                  {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, name) => [`${PRETTY(Number(v))} (${((Number(v) / total) * 100).toFixed(1)}%)`, String(name)]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex max-h-[200px] w-full min-w-0 flex-col gap-1 overflow-y-auto pr-1 sm:w-[45%]">
            {pieData.map((r, i) => {
              const v = Number(r[key]) || 0;
              const pct = ((v / total) * 100).toFixed(0);
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.04, duration: 0.3 }}
                  className="flex items-center gap-1.5 text-[11px]"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground" title={String(r.__x)}>{String(r.__x)}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">{pct}%</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </ChartShell>
    );
  }

  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
      <XAxis
        dataKey="__x"
        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        tickLine={false}
        axisLine={{ stroke: "hsl(var(--border))" }}
        interval="preserveStartEnd"
        tickFormatter={shortLabel}
        height={22}
        minTickGap={12}
      />
      <YAxis
        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        tickLine={false}
        axisLine={false}
        width={44}
        tickFormatter={(v) => PRETTY(Number(v))}
      />
      <Tooltip
        cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
        contentStyle={TOOLTIP_STYLE}
        formatter={(v: number) => PRETTY(Number(v))}
      />
      {valueKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />}
    </>
  );

  const animKey = `${data.length}:${valueKeys.join(",")}`;

  if (panel.chartType === "line") {
    return (
      <ChartShell animKey={animKey}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>{common}
            {valueKeys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                isAnimationActive
                animationBegin={i * 150}
                animationDuration={ANIM_DURATION}
                animationEasing="ease-in-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartShell>
    );
  }
  if (panel.chartType === "area") {
    return (
      <ChartShell animKey={animKey}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {valueKeys.map((k, i) => (
                <linearGradient key={k} id={`area-${panel.id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            {common}
            {valueKeys.map((k, i) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={`url(#area-${panel.id}-${i})`}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive
                animationBegin={i * 150}
                animationDuration={ANIM_DURATION}
                animationEasing="ease-in-out"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartShell>
    );
  }
  // Single-series bars get a distinct color per category (multi-color); grouped
  // multi-series keep one color per series so groups stay readable.
  const multiColorBars = valueKeys.length === 1;
  return (
    <ChartShell animKey={animKey}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>{common}
          {valueKeys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              radius={[5, 5, 0, 0]}
              maxBarSize={48}
              isAnimationActive
              animationBegin={i * 120}
              animationDuration={ANIM_DURATION}
              animationEasing="ease-out"
            >
              {multiColorBars && data.map((_, ci) => <Cell key={ci} fill={CHART_COLORS[ci % CHART_COLORS.length]} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
