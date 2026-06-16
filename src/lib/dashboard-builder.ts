// ─── Conversational Dashboard Builder (F22) ───────────────────────────────────
// "Build me a weekly sales dashboard" → one LLM planning call produces a panel
// spec (title + question + SQL + chart type per panel), every panel's SQL is
// verified by actually executing it against the in-browser engine, failed
// panels are dropped, and the surviving spec is saved via /api/dashboards.
// The agent answers with a markdown summary of what was created.

import type { SqlResult } from "./sql-engine";

export interface DashboardPanelSpec {
  id: string;
  title: string;
  question: string;
  sql: string;
  chartType: "bar" | "line" | "area" | "pie" | "table" | "metric";
  layout: { w: number; h: number };
}

/** A verified panel plus the rows it produced, ready for inline rendering. */
export interface DashboardPreviewPanel extends DashboardPanelSpec {
  rows: Record<string, unknown>[];
}

/** Rich result so the chat can render the dashboard inline, not just SQL text. */
export interface DashboardBuildResult {
  markdown: string;
  dashboardId: string | null;
  name: string;
  description: string;
  panels: DashboardPreviewPanel[];
}

const CHART_TYPES = new Set(["bar", "line", "area", "pie", "table", "metric"]);
const MAX_PANELS = 12; // matches the server's hard cap — use the full allowance
const MAX_PLAN_CANDIDATES = 18; // consider extra candidates so dropped/duplicate panels don't shrink the result

/** True when the question asks to build/create a dashboard. */
export function isDashboardRequest(question: string): boolean {
  return /\b(build|create|make|generate|set\s*up)\b[\s\S]{0,60}\bdashboard\b/i.test(question);
}

/** Looks like a date/time column by name. */
function looksTemporal(name: string): boolean {
  return /\b(date|time|day|week|month|quarter|year|created|updated|timestamp|period|dt)\b/i.test(name);
}

/**
 * Pick the most fitting chart type from the actual result shape. Far better than
 * defaulting everything to "table" — drives real visual variety.
 */
function inferChartType(rows: Record<string, unknown>[], requested?: string): DashboardPanelSpec["chartType"] {
  if (requested && CHART_TYPES.has(requested)) return requested as DashboardPanelSpec["chartType"];
  if (rows.length === 0) return "table";

  const cols = Object.keys(rows[0]);
  const firstRow = rows[0];

  // Single number → KPI metric.
  if (rows.length === 1 && cols.length === 1) return "metric";

  // Identify the category (label) column and numeric columns.
  const numericCols = cols.filter((c) => rows.every((r) => r[c] === null || r[c] === undefined || Number.isFinite(Number(r[c]))));
  const labelCol = cols.find((c) => !numericCols.includes(c)) ?? cols[0];

  // Two columns, label + one number:
  if (cols.length === 2 && numericCols.length === 1) {
    if (looksTemporal(labelCol)) return rows.length > 8 ? "area" : "line"; // time series
    if (rows.length <= 6) return "pie";   // few slices → share-of-whole reads well
    return "bar";                          // ranking / distribution
  }

  // Time column + multiple measures → line.
  if (looksTemporal(labelCol) && numericCols.length >= 1) return "line";

  // Many columns / no clean single measure → table.
  if (cols.length > 3 || numericCols.length === 0) return "table";

  return "bar";
}

function extractJson(text: string): any | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence ? fence[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  // Fast path: the whole object parses.
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    /* fall through to recovery */
  }

  // Recovery: a long panel list can get truncated mid-array. Salvage the
  // name/description and as many COMPLETE panel objects as we can parse, so a
  // big dashboard still renders instead of failing entirely.
  try {
    const body = raw.slice(start);
    const nameMatch = body.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const descMatch = body.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const panels: any[] = [];
    const panelsKey = body.indexOf('"panels"');
    if (panelsKey !== -1) {
      const arrStart = body.indexOf("[", panelsKey);
      if (arrStart !== -1) {
        let depth = 0;
        let objStart = -1;
        for (let i = arrStart; i < body.length; i++) {
          const ch = body[i];
          if (ch === "{") { if (depth === 0) objStart = i; depth++; }
          else if (ch === "}") {
            depth--;
            if (depth === 0 && objStart !== -1) {
              try { panels.push(JSON.parse(body.slice(objStart, i + 1))); } catch { /* skip incomplete */ }
              objStart = -1;
            }
          }
        }
      }
    }
    if (panels.length === 0) return null;
    return {
      name: nameMatch ? JSON.parse(`"${nameMatch[1]}"`) : "Dashboard",
      description: descMatch ? JSON.parse(`"${descMatch[1]}"`) : "",
      panels,
    };
  } catch {
    return null;
  }
}

/**
 * Plan, verify and persist a dashboard. Returns a rich result (markdown summary
 * + the verified panels with their fetched rows, so the chat can render the
 * dashboard inline) or null when planning failed (caller falls through to the
 * normal agent flow so the user still gets a useful response).
 */
export async function buildDashboardFromQuestion(opts: {
  question: string;
  schemaBlock: string;
  selectedTable: string;
  callLlm: (messages: { role: string; content: string }[], systemPrompt: string) => Promise<{ content: string }>;
  runSql: (sql: string) => Promise<SqlResult>;
  sheetName?: string | null;
  datasetId?: string | null;
}): Promise<DashboardBuildResult | null> {
  const { question, schemaBlock, selectedTable, callLlm, runSql, sheetName, datasetId } = opts;

  const systemPrompt =
    `You are a senior analytics engineer designing a RICH, COMPREHENSIVE, executive-grade dashboard. ` +
    `Reply with ONLY a JSON object:\n` +
    `{"name": "<dashboard name>", "description": "<one line>", "panels": [{"title": "<short>", "question": "<what it shows>", ` +
    `"sql": "<single DuckDB SELECT>", "chartType": "bar|line|area|pie|table|metric"}]}\n\n` +
    `PANEL COUNT — BE GENEROUS AND DATA-DRIVEN: produce as many genuinely useful panels as the data supports, ` +
    `targeting 12 to 16 candidate panels. The richer the schema (more columns, more categories, a date column), the MORE panels you should create. ` +
    `Only a small/narrow dataset should have fewer. Never stop at a generic handful — keep finding new angles until you have explored every important column. ` +
    `The best 12 are kept, so over-deliver rather than under-deliver.\n\n` +
    `COVER THIS ANALYTICAL FRAMEWORK as fully as the columns allow (adapt to whatever actually exists — skip what doesn't apply, and add more of any category that the data rewards):\n` +
    `  1. KPIs (3-5 "metric" panels): headline single numbers — total rows, total/sum of each main measure, distinct count of each key entity, average/median of a measure, min & max.\n` +
    `  2. Distributions / breakdowns: counts or sums grouped by EACH important CATEGORICAL column (status, type, category, region, segment, channel...). Make one panel per meaningful category column.\n` +
    `  3. Rankings (top-N): the biggest/most-frequent entities for several dimensions — top customers, products, applicants, locations, etc. (GROUP BY + ORDER BY ... DESC + LIMIT 10-15).\n` +
    `  4. Trends over time: if any date/time column exists, aggregate measures by day AND by month/year (line or area); add a cumulative/running-total view when it makes sense.\n` +
    `  5. Comparisons & relationships: a measure compared across two dimensions, share-of-total breakdowns, and an averages-by-category view.\n` +
    `  6. Detail & outliers: a focused detail table of the most important records, and a "largest/smallest" outlier view.\n\n` +
    `CHART VARIETY IS REQUIRED — use a deliberate MIX, never make everything one type. Aim for at least 5 of the 6 chart types across the dashboard:\n` +
    `  - "metric" → a single KPI number (SQL returns exactly one row, one column).\n` +
    `  - "line"/"area" → ONLY for time-ordered data (a date/time column on the x-axis).\n` +
    `  - "pie" → share-of-whole when there are FEW categories (<= 6 groups).\n` +
    `  - "bar" → rankings and distributions with several categories.\n` +
    `  - "table" → multi-column detail listings or many-column results.\n\n` +
    `SQL RULES: each SQL is a SINGLE read-only SELECT against the schema below; quote column names with double quotes; ` +
    `the main table is "${selectedTable}". Aggregate sensibly (GROUP BY + ORDER BY + LIMIT for rankings; cap rankings at 10-15 rows). ` +
    `Every panel must show something DIFFERENT — no two panels with the same SQL or the same grouping column. Keep each SQL compact so all panels fit in the response. No DDL/DML. No prose outside the JSON.\n\n` +
    `SCHEMA:\n${schemaBlock.slice(0, 6000)}`;

  let plan: any;
  try {
    const resp = await callLlm([{ role: "user", content: question }], systemPrompt);
    plan = extractJson(resp.content);
  } catch {
    return null;
  }
  if (!plan || !Array.isArray(plan.panels) || plan.panels.length === 0) return null;

  // Verify every panel by executing its SQL; keep only working panels.
  // Iterate over ALL planned candidates (capped for safety) and stop once we
  // have a full set — so dropped/duplicate panels never shrink the dashboard
  // below what the model actually produced.
  const verified: DashboardPreviewPanel[] = [];
  const failed: string[] = [];
  const seenSql = new Set<string>(); // drop duplicate panels (same SQL)
  for (let i = 0; i < Math.min(plan.panels.length, MAX_PLAN_CANDIDATES); i++) {
    if (verified.length >= MAX_PANELS) break;
    const p = plan.panels[i];
    const sql = String(p?.sql || "").trim();
    const title = String(p?.title || `Panel ${i + 1}`).slice(0, 120);
    if (!sql || !/^\s*(select|with)\b/i.test(sql)) {
      failed.push(title);
      continue;
    }
    const sqlNorm = sql.replace(/\s+/g, " ").toLowerCase();
    if (seenSql.has(sqlNorm)) continue; // skip exact-duplicate panel silently
    seenSql.add(sqlNorm);
    try {
      const result = await runSql(sql);
      const rows = (result.rows as Record<string, unknown>[]) ?? [];
      // Pick the best-fitting chart type from the real result shape, falling
      // back to the model's suggestion only when it's sensible.
      const chartType = inferChartType(rows, p?.chartType);
      verified.push({
        id: `panel_${verified.length}`,
        title,
        question: String(p?.question || title).slice(0, 1000),
        sql: sql.slice(0, 5000),
        chartType,
        layout: { w: chartType === "metric" ? 3 : 6, h: chartType === "metric" ? 2 : 4 },
        rows: rows.slice(0, 200), // cap retained rows for inline preview
      });
    } catch {
      failed.push(title);
    }
  }
  if (verified.length === 0) return null;

  // Order panels for a polished layout: KPIs first, then visualizations, tables last.
  const typeRank: Record<string, number> = { metric: 0, line: 1, area: 1, bar: 2, pie: 2, table: 3 };
  verified.sort((a, b) => (typeRank[a.chartType] ?? 2) - (typeRank[b.chartType] ?? 2));
  verified.forEach((p, idx) => { p.id = `panel_${idx}`; });

  // Persist via the dashboards API. If saving fails (offline etc.) we still
  // report the verified plan so the user's work isn't lost silently. The stored
  // spec omits `rows` (the server re-runs SQL on view); rows stay only for the
  // inline chat preview below.
  const name = String(plan.name || "Dashboard").slice(0, 120);
  const description = String(plan.description || "").slice(0, 500);
  const storedPanels: DashboardPanelSpec[] = verified.map(({ rows: _rows, ...spec }) => spec);
  let savedId: string | null = null;
  try {
    const { api } = await import("@/lib/api-client");
    const saved = await api.post<{ id: string }>("/dashboards", {
      name,
      description,
      datasetId: datasetId || null,
      sheetName: sheetName || null,
      panels: storedPanels,
      sourceQuestion: question.slice(0, 1000),
    });
    savedId = saved?.id ?? null;
  } catch {
    savedId = null;
  }

  // Concise summary — no raw SQL dump; the chat renders the live charts below it.
  const typeCounts = verified.reduce<Record<string, number>>((acc, p) => {
    acc[p.chartType] = (acc[p.chartType] || 0) + 1;
    return acc;
  }, {});
  const typeSummary = Object.entries(typeCounts)
    .map(([t, n]) => `${n} ${t}`)
    .join(", ");
  const parts = [
    `## ${name}`,
    description ? `${description}` : "",
    savedId
      ? `Built **${verified.length} panel${verified.length === 1 ? "" : "s"}** (${typeSummary}) — every query was run against your data before saving. Preview below; the full report is in **Reports**.`
      : `Built **${verified.length} panel${verified.length === 1 ? "" : "s"}** (${typeSummary}) — saving to your account failed, but the live preview is shown below.`,
  ];
  if (failed.length > 0) {
    parts.push("", `_${failed.length} planned panel${failed.length === 1 ? "" : "s"} failed verification and ${failed.length === 1 ? "was" : "were"} dropped._`);
  }

  return {
    markdown: parts.filter(Boolean).join("\n\n"),
    dashboardId: savedId,
    name,
    description,
    panels: verified,
  };
}
