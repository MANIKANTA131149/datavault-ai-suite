// ─── Deeper Data Tools ─────────────────────────────────────────────────────
// Pure-statistics helpers the agent can call as first-class tools, mirroring the
// zero-LLM, zero-IO style of anomaly-detector.ts. Each operates on an already
// fetched result set (Record<string, unknown>[]) and returns a small, structured
// summary the agent can reason over and the UI can render. No LLM, no network.

// ── shared numeric coercion (same rules as anomaly-detector) ─────────────────
function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function numericColumns(rows: Record<string, unknown>[], maxCols = 30): string[] {
  if (rows.length === 0) return [];
  const cols = Object.keys(rows[0]);
  const out: string[] = [];
  for (const col of cols) {
    let numeric = 0;
    let nonNull = 0;
    for (const r of rows) {
      const v = r[col];
      if (v === null || v === undefined || v === "") continue;
      nonNull++;
      if (toNumber(v) !== null) numeric++;
    }
    // Treat a column as numeric only if the overwhelming majority of its
    // non-null values parse as numbers (guards against id-looking strings).
    if (nonNull > 0 && numeric / nonNull >= 0.8) out.push(col);
    if (out.length >= maxCols) break;
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

// ── Correlation matrix ───────────────────────────────────────────────────────
export interface CorrelationMatrix {
  columns: string[];
  /** matrix[i][j] = Pearson r between columns[i] and columns[j], or null if undefined. */
  matrix: (number | null)[][];
  /** Strongest |r| pairs (excluding self), descending. */
  topPairs: { a: string; b: string; r: number }[];
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null; // constant column → undefined correlation
  const r = num / Math.sqrt(dx * dy);
  return Number.isFinite(r) ? Math.round(r * 1000) / 1000 : null;
}

/**
 * Pearson correlation matrix over the numeric columns of a result set.
 * Only rows where BOTH columns are present are used for each pair.
 */
export function correlationMatrix(
  rows: Record<string, unknown>[],
  columns?: string[]
): CorrelationMatrix {
  const cols = (columns && columns.length ? columns : numericColumns(rows)).slice(0, 30);
  const matrix: (number | null)[][] = cols.map(() => cols.map(() => null));
  const topPairs: { a: string; b: string; r: number }[] = [];

  for (let i = 0; i < cols.length; i++) {
    for (let j = i; j < cols.length; j++) {
      if (i === j) {
        matrix[i][j] = 1;
        continue;
      }
      const xs: number[] = [];
      const ys: number[] = [];
      for (const row of rows) {
        const a = toNumber(row[cols[i]]);
        const b = toNumber(row[cols[j]]);
        if (a === null || b === null) continue;
        xs.push(a);
        ys.push(b);
      }
      const r = pearson(xs, ys);
      matrix[i][j] = r;
      matrix[j][i] = r;
      if (r !== null) topPairs.push({ a: cols[i], b: cols[j], r });
    }
  }

  topPairs.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
  return { columns: cols, matrix, topPairs: topPairs.slice(0, 10) };
}

// ── Column profiling ──────────────────────────────────────────────────────────
export interface ColumnProfile {
  column: string;
  type: "numeric" | "text" | "empty";
  count: number;
  nonNull: number;
  nullPct: number;
  distinct: number;
  // numeric only
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
  // text only
  topValues?: { value: string; count: number }[];
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Per-column profile (completeness, cardinality, numeric stats / top text values).
 * Deterministic — a lighter, per-result-set complement to the full data-quality report.
 */
export function profileColumns(rows: Record<string, unknown>[]): ColumnProfile[] {
  if (rows.length === 0) return [];
  const cols = Object.keys(rows[0]);
  const numCols = new Set(numericColumns(rows));
  const profiles: ColumnProfile[] = [];

  for (const col of cols) {
    const present: unknown[] = [];
    for (const r of rows) {
      const v = r[col];
      if (v !== null && v !== undefined && v !== "") present.push(v);
    }
    const distinct = new Set(present.map((v) => String(v))).size;
    const base: ColumnProfile = {
      column: col,
      type: present.length === 0 ? "empty" : numCols.has(col) ? "numeric" : "text",
      count: rows.length,
      nonNull: present.length,
      nullPct: Math.round(((rows.length - present.length) / rows.length) * 1000) / 10,
      distinct,
    };

    if (base.type === "numeric") {
      const nums = present.map(toNumber).filter((n): n is number => n !== null);
      const sorted = [...nums].sort((a, b) => a - b);
      const m = mean(nums);
      const variance = nums.length ? mean(nums.map((x) => (x - m) ** 2)) : 0;
      base.min = sorted[0];
      base.max = sorted[sorted.length - 1];
      base.mean = Math.round(m * 1000) / 1000;
      base.median = Math.round(quantileSorted(sorted, 0.5) * 1000) / 1000;
      base.std = Math.round(Math.sqrt(variance) * 1000) / 1000;
    } else if (base.type === "text") {
      const counts = new Map<string, number>();
      for (const v of present) {
        const key = String(v);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      base.topValues = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));
    }

    profiles.push(base);
  }

  return profiles;
}

// ── Seasonal forecast ──────────────────────────────────────────────────────────
export interface SeasonalForecastPoint {
  period: string;
  value: number;
  kind: "actual" | "forecast";
}

/**
 * Forecast a periodic series with linear trend + additive seasonality.
 *
 * Pass a series of { period, value } already aggregated per period (e.g. the
 * output of a date_trunc GROUP BY). `seasonLength` is the number of periods in
 * one cycle (12 = monthly/yearly seasonality, 7 = daily/weekly, 4 = quarterly).
 * With too few cycles for seasonality it degrades gracefully to a plain linear
 * trend, so it never refuses. Mirrors the SQL linear-forecast recipe but adds a
 * seasonal component computed in JS over the fetched series.
 */
export function seasonalForecast(
  series: { period: string; value: number }[],
  horizon = 6,
  seasonLength = 12
): SeasonalForecastPoint[] {
  const pts = series
    .map((p) => ({ period: String(p.period), value: toNumber(p.value) }))
    .filter((p): p is { period: string; value: number } => p.value !== null);

  if (pts.length === 0) return [];

  const n = pts.length;
  // Least-squares linear trend over index 0..n-1
  const idx = pts.map((_, i) => i);
  const ys = pts.map((p) => p.value);
  const mi = mean(idx);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (idx[i] - mi) * (ys[i] - my);
    den += (idx[i] - mi) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mi;
  const trendAt = (i: number) => intercept + slope * i;

  // Seasonal indices (additive): average residual per season slot, but only
  // when we have at least two full cycles — otherwise skip seasonality.
  const useSeason = seasonLength >= 2 && n >= seasonLength * 2;
  const seasonal: number[] = new Array(seasonLength).fill(0);
  if (useSeason) {
    const sums = new Array(seasonLength).fill(0);
    const counts = new Array(seasonLength).fill(0);
    for (let i = 0; i < n; i++) {
      const resid = ys[i] - trendAt(i);
      const slot = i % seasonLength;
      sums[slot] += resid;
      counts[slot] += 1;
    }
    for (let s = 0; s < seasonLength; s++) {
      seasonal[s] = counts[s] ? sums[s] / counts[s] : 0;
    }
    // center the seasonal component so it sums to ~0
    const avgSeason = mean(seasonal);
    for (let s = 0; s < seasonLength; s++) seasonal[s] -= avgSeason;
  }

  const out: SeasonalForecastPoint[] = pts.map((p) => ({
    period: p.period,
    value: Math.round(p.value * 100) / 100,
    kind: "actual" as const,
  }));

  for (let h = 1; h <= horizon; h++) {
    const i = n - 1 + h;
    const seasonComp = useSeason ? seasonal[i % seasonLength] : 0;
    out.push({
      period: `forecast +${h}`,
      value: Math.round((trendAt(i) + seasonComp) * 100) / 100,
      kind: "forecast",
    });
  }

  return out;
}
