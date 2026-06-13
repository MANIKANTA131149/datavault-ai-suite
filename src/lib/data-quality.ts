// ─── Data Quality Reports (F21) ───────────────────────────────────────────────
// Deterministic, full-dataset quality profile computed in the browser:
// completeness, uniqueness, type consistency, duplicates, outliers and
// suspicious values per column — rendered as a markdown report the agent
// returns directly when the user asks for a "data quality report". No LLM
// tokens are spent on the scan itself.

export interface ColumnQuality {
  column: string;
  inferredType: "number" | "date" | "boolean" | "string" | "mixed" | "empty";
  totalRows: number;
  nullCount: number;
  completeness: number; // 0-100
  uniqueCount: number;
  uniqueness: number; // 0-100
  typeConsistency: number; // 0-100: share of non-null values matching inferredType
  issues: string[];
}

export interface QualityReport {
  sheetName: string;
  rowCount: number;
  columnCount: number;
  duplicateRowCount: number;
  overallScore: number; // 0-100
  columns: ColumnQuality[];
  generatedAt: string;
}

const OUTLIER_Z = 3.5;

function classifyValue(v: unknown): "number" | "date" | "boolean" | "string" | "null" {
  if (v === null || v === undefined || v === "") return "null";
  if (typeof v === "number") return Number.isFinite(v) ? "number" : "null";
  if (typeof v === "boolean") return "boolean";
  const s = String(v).trim();
  if (s === "") return "null";
  if (/^-?[\d,]+(\.\d+)?%?$/.test(s) && s.replace(/[,%]/g, "") !== "") return "number";
  if (/^(true|false|yes|no)$/i.test(s)) return "boolean";
  if (!Number.isNaN(Date.parse(s)) && /[-/:]/.test(s) && s.length >= 6) return "date";
  return "string";
}

function profileColumn(column: string, rows: Record<string, unknown>[]): ColumnQuality {
  const totalRows = rows.length;
  const counts: Record<string, number> = { number: 0, date: 0, boolean: 0, string: 0, null: 0 };
  const uniques = new Set<string>();
  const numbers: number[] = [];

  for (const row of rows) {
    const v = row?.[column];
    const kind = classifyValue(v);
    counts[kind]++;
    if (kind !== "null") {
      uniques.add(String(v).trim().toLowerCase());
      if (kind === "number") {
        const n = typeof v === "number" ? v : Number(String(v).replace(/[,%]/g, ""));
        if (Number.isFinite(n)) numbers.push(n);
      }
    }
  }

  const nonNull = totalRows - counts.null;
  const dominant = (Object.entries(counts) as [string, number][])
    .filter(([k]) => k !== "null")
    .sort((a, b) => b[1] - a[1])[0];

  const inferredType: ColumnQuality["inferredType"] =
    nonNull === 0 ? "empty"
    : dominant[1] / nonNull >= 0.9 ? (dominant[0] as ColumnQuality["inferredType"])
    : "mixed";

  const completeness = totalRows === 0 ? 0 : Math.round(((totalRows - counts.null) / totalRows) * 100);
  const uniqueness = nonNull === 0 ? 0 : Math.round((uniques.size / nonNull) * 100);
  const typeConsistency = nonNull === 0 ? 100 : Math.round((dominant[1] / nonNull) * 100);

  const issues: string[] = [];
  if (inferredType === "empty") issues.push("Column is entirely empty");
  if (completeness < 100 && completeness >= 0 && counts.null > 0 && inferredType !== "empty") {
    if (completeness < 70) issues.push(`${100 - completeness}% of values are missing`);
  }
  if (inferredType === "mixed") issues.push(`Inconsistent types: ${describeTypeMix(counts, nonNull)}`);
  if (nonNull > 10 && uniques.size === 1) issues.push("All values are identical — column carries no information");

  // Numeric outliers via modified Z-score (MAD).
  if (numbers.length >= 10) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const mad = [...numbers.map((n) => Math.abs(n - med))].sort((a, b) => a - b)[Math.floor(numbers.length / 2)];
    if (mad > 0) {
      const outliers = numbers.filter((n) => Math.abs((0.6745 * (n - med)) / mad) > OUTLIER_Z);
      if (outliers.length > 0 && outliers.length <= numbers.length * 0.05) {
        issues.push(`${outliers.length} outlier value${outliers.length === 1 ? "" : "s"} (e.g. ${outliers[0].toLocaleString()})`);
      }
    }
    if (numbers.some((n) => n < 0) && /price|amount|qty|quantity|count|age|salary|revenue|sales/i.test(column)) {
      issues.push("Contains negative values in a column that is usually non-negative");
    }
  }

  // Whitespace / case duplicates in strings.
  if (inferredType === "string" && nonNull > 0) {
    const rawUniques = new Set<string>();
    for (const row of rows) {
      const v = row?.[column];
      if (v !== null && v !== undefined && v !== "") rawUniques.add(String(v));
    }
    if (rawUniques.size > uniques.size) {
      issues.push(`${rawUniques.size - uniques.size} values differ only by case/whitespace (e.g. "USA" vs "usa")`);
    }
  }

  return { column, inferredType, totalRows, nullCount: counts.null, completeness, uniqueCount: uniques.size, uniqueness, typeConsistency, issues };
}

function describeTypeMix(counts: Record<string, number>, nonNull: number): string {
  return (Object.entries(counts) as [string, number][])
    .filter(([k, v]) => k !== "null" && v > 0)
    .map(([k, v]) => `${Math.round((v / nonNull) * 100)}% ${k}`)
    .join(", ");
}

/** Profile one sheet. Deterministic; never throws (returns a stub on bad input). */
export function buildQualityReport(sheetName: string, rows: Record<string, unknown>[]): QualityReport {
  const safeRows = Array.isArray(rows) ? rows : [];
  const columns = safeRows.length > 0 ? Object.keys(safeRows[0]) : [];
  const profiles = columns.map((c) => profileColumn(c, safeRows));

  // Exact duplicate rows.
  const seen = new Set<string>();
  let duplicateRowCount = 0;
  for (const row of safeRows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicateRowCount++;
    else seen.add(key);
  }

  // Overall score: completeness 40%, consistency 40%, duplicates 20%.
  const avgCompleteness = profiles.length ? profiles.reduce((s, p) => s + p.completeness, 0) / profiles.length : 0;
  const avgConsistency = profiles.length ? profiles.reduce((s, p) => s + p.typeConsistency, 0) / profiles.length : 0;
  const dupPenalty = safeRows.length ? (duplicateRowCount / safeRows.length) * 100 : 0;
  const overallScore = Math.max(0, Math.round(avgCompleteness * 0.4 + avgConsistency * 0.4 + (100 - dupPenalty) * 0.2));

  return {
    sheetName,
    rowCount: safeRows.length,
    columnCount: columns.length,
    duplicateRowCount,
    overallScore,
    columns: profiles,
    generatedAt: new Date().toISOString(),
  };
}

/** Render the report as markdown for the chat answer. */
export function formatQualityReport(report: QualityReport): string {
  const grade = report.overallScore >= 90 ? "Excellent" : report.overallScore >= 75 ? "Good" : report.overallScore >= 50 ? "Fair" : "Poor";
  const lines: string[] = [
    `## Data Quality Report — ${report.sheetName}`,
    "",
    `**Overall score: ${report.overallScore}/100 (${grade})** · ${report.rowCount.toLocaleString()} rows · ${report.columnCount} columns` +
      (report.duplicateRowCount > 0 ? ` · ${report.duplicateRowCount} exact duplicate row${report.duplicateRowCount === 1 ? "" : "s"}` : " · no duplicate rows"),
    "",
    "| Column | Type | Complete | Unique | Consistent |",
    "|---|---|---|---|---|",
  ];
  for (const c of report.columns) {
    lines.push(`| ${c.column} | ${c.inferredType} | ${c.completeness}% | ${c.uniqueness}% | ${c.typeConsistency}% |`);
  }

  const withIssues = report.columns.filter((c) => c.issues.length > 0);
  if (withIssues.length > 0) {
    lines.push("", "### Issues found");
    for (const c of withIssues) {
      for (const issue of c.issues) lines.push(`- **${c.column}**: ${issue}`);
    }
  } else {
    lines.push("", "No data quality issues detected.");
  }
  return lines.join("\n");
}

/** True when a question is asking for a data quality / profiling report. */
export function isQualityReportRequest(question: string): boolean {
  const q = question.toLowerCase();
  return (
    /\b(data\s+quality|quality\s+report|quality\s+check|data\s+health|profile\s+(the\s+)?data|data\s+profiling|completeness\s+report)\b/.test(q) ||
    /\bhow\s+(clean|good|reliable)\s+is\s+(this|the|my)\s+data\b/.test(q)
  );
}
