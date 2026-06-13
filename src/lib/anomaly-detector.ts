// ─── Anomaly Detection (F10) ──────────────────────────────────────────────────
// Pure-statistics pass over a query result: flags outliers (modified Z-score
// via MAD, falling back to IQR), sudden spikes in ordered numeric series and
// suspicious null clusters. Zero LLM calls — instant and free. The agent
// appends a short "Observations" section to its answer when findings exist.

export interface AnomalyObservation {
  column: string;
  kind: "outlier" | "spike" | "nulls";
  severity: "low" | "medium" | "high";
  message: string;
  rowIndexes: number[];
}

const MIN_ROWS = 8; // below this, "outliers" are meaningless
const MAX_OBSERVATIONS = 5;
const MAX_FLAGGED_PER_COLUMN = 5;

function toNumbers(rows: Record<string, unknown>[], col: string): { value: number; index: number }[] {
  const out: { value: number; index: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]?.[col];
    if (raw === null || raw === undefined || raw === "") continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[,$%\s]/g, ""));
    if (Number.isFinite(n)) out.push({ value: n, index: i });
  }
  return out;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function detectOutliers(col: string, points: { value: number; index: number }[]): AnomalyObservation | null {
  const values = points.map((p) => p.value).sort((a, b) => a - b);
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = median(deviations);

  let flagged: { value: number; index: number }[];
  if (mad > 0) {
    // Modified Z-score: |0.6745 * (x - median) / MAD| > 3.5
    flagged = points.filter((p) => Math.abs((0.6745 * (p.value - med)) / mad) > 3.5);
  } else {
    // MAD of 0 (constant-ish data) — fall back to IQR fences.
    const q1 = values[Math.floor(values.length * 0.25)];
    const q3 = values[Math.floor(values.length * 0.75)];
    const iqr = q3 - q1;
    if (iqr === 0) return null;
    flagged = points.filter((p) => p.value < q1 - 3 * iqr || p.value > q3 + 3 * iqr);
  }

  if (flagged.length === 0 || flagged.length > points.length * 0.1) return null; // too many = a pattern, not anomalies
  const sample = flagged.slice(0, MAX_FLAGGED_PER_COLUMN);
  const valuesStr = sample.map((p) => formatNumber(p.value)).join(", ");
  return {
    column: col,
    kind: "outlier",
    severity: flagged.length === 1 ? "medium" : "high",
    message: `"${col}" has ${flagged.length} outlier value${flagged.length === 1 ? "" : "s"} (${valuesStr}) far from the typical range (median ${formatNumber(med)}).`,
    rowIndexes: sample.map((p) => p.index),
  };
}

function detectSpikes(col: string, points: { value: number; index: number }[]): AnomalyObservation | null {
  // Only meaningful when the result preserves an order (time series etc.).
  if (points.length < MIN_ROWS) return null;
  const diffs: { ratio: number; index: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].value;
    const cur = points[i].value;
    if (prev === 0) continue;
    diffs.push({ ratio: (cur - prev) / Math.abs(prev), index: points[i].index });
  }
  const spikes = diffs.filter((d) => Math.abs(d.ratio) >= 2); // ≥200% jump or drop
  if (spikes.length === 0 || spikes.length > 3) return null;
  const worst = spikes.reduce((a, b) => (Math.abs(b.ratio) > Math.abs(a.ratio) ? b : a));
  const direction = worst.ratio > 0 ? "jumps" : "drops";
  return {
    column: col,
    kind: "spike",
    severity: Math.abs(worst.ratio) >= 5 ? "high" : "medium",
    message: `"${col}" ${direction} ${Math.abs(worst.ratio * 100).toFixed(0)}% between consecutive rows (row ${worst.index + 1}).`,
    rowIndexes: spikes.slice(0, MAX_FLAGGED_PER_COLUMN).map((s) => s.index),
  };
}

function detectNullClusters(col: string, rows: Record<string, unknown>[]): AnomalyObservation | null {
  let nulls = 0;
  for (const r of rows) {
    const v = r?.[col];
    if (v === null || v === undefined || v === "") nulls++;
  }
  const ratio = nulls / rows.length;
  if (ratio < 0.3 || ratio >= 1) return null; // fully-empty columns are schema noise, not anomalies
  return {
    column: col,
    kind: "nulls",
    severity: ratio >= 0.6 ? "high" : "low",
    message: `"${col}" is missing in ${(ratio * 100).toFixed(0)}% of result rows — aggregations over it may be misleading.`,
    rowIndexes: [],
  };
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Scan a result set and return up to 5 noteworthy observations.
 * Never throws — a malformed result simply yields [].
 */
export function detectAnomalies(rows: Record<string, unknown>[]): AnomalyObservation[] {
  try {
    if (!Array.isArray(rows) || rows.length < MIN_ROWS) return [];
    const columns = Object.keys(rows[0] || {});
    const observations: AnomalyObservation[] = [];

    for (const col of columns) {
      const points = toNumbers(rows, col);
      // Numeric checks only when most values parse as numbers (skip ID-like
      // columns: near-unique integers are identifiers, not measures).
      if (points.length >= rows.length * 0.7 && points.length >= MIN_ROWS) {
        const unique = new Set(points.map((p) => p.value));
        const looksLikeId = unique.size === points.length && points.every((p) => Number.isInteger(p.value));
        if (!looksLikeId) {
          const outlier = detectOutliers(col, points);
          if (outlier) observations.push(outlier);
          const spike = detectSpikes(col, points);
          if (spike) observations.push(spike);
        }
      }
      const nulls = detectNullClusters(col, rows);
      if (nulls) observations.push(nulls);
    }

    const severityRank = { high: 0, medium: 1, low: 2 } as const;
    return observations
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .slice(0, MAX_OBSERVATIONS);
  } catch {
    return [];
  }
}

/** Render observations as a compact markdown block for the agent's answer. */
export function formatObservations(observations: AnomalyObservation[]): string {
  if (observations.length === 0) return "";
  const icon = { high: "[!]", medium: "[~]", low: "[i]" } as const;
  const lines = observations.map((o) => `- ${icon[o.severity]} ${o.message}`);
  return `\n\n**Observations**\n${lines.join("\n")}`;
}
