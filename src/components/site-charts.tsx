/* ════════════════════════════════════════════════════════════════════════
   Dependency-free SVG charts for the marketing site.
   No recharts here — these are pure SVG so the public page stays tiny and
   fast, and they scale to any container via viewBox (fully responsive).
   All data is illustrative ("dummy") sample data for the product showcase.
   ════════════════════════════════════════════════════════════════════════ */

import { cn } from "@/lib/utils";

const P = "hsl(var(--primary))";

/* ─── Area chart with smooth gradient fill ──────────────────────────────── */
export function AreaChart({
  data,
  className,
  height = 160,
  stroke = P,
  id = "area",
}: {
  data: number[];
  className?: string;
  height?: number;
  stroke?: string;
  id?: string;
}) {
  const w = 320;
  const h = height;
  const pad = 6;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);
  const points = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (d - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${h - pad} L${points[0][0].toFixed(1)},${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-full w-full", className)} role="img" aria-label="Trend chart">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* subtle gridlines */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3 4" opacity="0.5" />
      ))}
      <path d={area} fill={`url(#${id}-fill)`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill="hsl(var(--background))" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/* ─── Grouped bar chart (pure SVG so height always renders) ─────────────── */
export function BarChart({
  data,
  labels,
  className,
  id = "bar",
}: {
  data: number[];
  labels?: string[];
  className?: string;
  id?: string;
}) {
  const w = 320;
  const h = 150;
  const labelH = labels ? 18 : 0;
  const plotH = h - labelH;
  const max = Math.max(...data, 1);
  const n = data.length;
  const gap = 10;
  const barW = (w - gap * (n + 1)) / n;
  const minBar = 6;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className={cn("h-full w-full", className)} role="img" aria-label="Bar chart">
      <defs>
        <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--primary) / 0.5)" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const barH = Math.max(minBar, (d / max) * (plotH - 8));
        const x = gap + i * (barW + gap);
        const y = plotH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx="4" fill={`url(#${id}-bar)`} />
            {labels && (
              <text x={x + barW / 2} y={h - 4} textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">
                {labels[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Donut chart with legend ───────────────────────────────────────────── */
export function DonutChart({
  segments,
  className,
  size = 120,
}: {
  segments: { label: string; value: number; color: string }[];
  className?: string;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className="shrink-0 -rotate-90" role="img" aria-label="Distribution chart">
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="11" opacity="0.4" />
        {segments.map((seg) => {
          const len = (seg.value / total) * c;
          const dash = `${len} ${c - len}`;
          const el = (
            <circle
              key={seg.label}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="11"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <ul className="space-y-1.5">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: seg.color }} />
            <span className="text-foreground">{seg.label}</span>
            <span className="ml-auto tabular-nums">{Math.round((seg.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Sparkline (tiny inline trend) ─────────────────────────────────────── */
export function Sparkline({ data, className, stroke = P }: { data: number[]; className?: string; stroke?: string }) {
  const w = 80;
  const h = 24;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const line = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((d - min) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-6 w-20", className)} aria-hidden>
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
