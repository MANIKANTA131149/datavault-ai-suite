// ─── Multi-Agent Orchestration (F1) ───────────────────────────────────────────
// Planner layer for clearly multi-part questions ("top 5 products by revenue,
// and also the monthly trend, and flag any anomalies"). A cheap LLM call
// decomposes the request into 2-4 self-contained sub-questions; the caller
// (runSheetAgent) runs each through the normal verified SQL pipeline and
// synthesizes one combined answer.
//
// Deliberately conservative: the heuristic gate keeps single-intent questions
// (the overwhelming majority) on the exact same path as before — zero extra
// LLM calls, zero behavior change. Decomposition failure of any kind falls
// back to the normal single-agent flow.

const MAX_SUB_QUESTIONS = 4;

/**
 * Cheap syntactic gate: only clearly enumerated multi-task questions pass.
 * Conjunctions alone ("sales and profit by region") do NOT trigger it —
 * that's one query with two columns, which the SQL agent already handles.
 */
export function detectMultiIntent(question: string): boolean {
  const q = question.trim();
  if (q.length < 40) return false;

  // Numbered/bulleted list of tasks: "1) ... 2) ..." or "- ... \n- ..."
  if (/(^|\n)\s*(\d+[).]|-|\*)\s+\S[\s\S]*(\n)\s*(\d+[).]|-|\*)\s+\S/.test(q)) return true;

  // Two or more explicit question marks with content between them.
  const qMarks = q.split("?").filter((part) => part.trim().length > 10);
  if ((q.match(/\?/g) || []).length >= 2 && qMarks.length >= 2) return true;

  // Explicit sequencing/addition connectors joining full clauses.
  const connectors = /\b(and\s+also|also\s+(show|tell|give|find|calculate|list)|then\s+(show|tell|give|find|calculate|list)|as\s+well\s+as\s+(the\s+)?(show|list|count|total|average|trend)|additionally|after\s+that)\b/i;
  return connectors.test(q);
}

function extractJsonArray(text: string): string[] | null {
  try {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = (fence ? fence[1] : text).trim();
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    const subs = parsed.map((s) => String(s).trim()).filter((s) => s.length > 5);
    return subs.length >= 2 ? subs.slice(0, MAX_SUB_QUESTIONS) : null;
  } catch {
    return null;
  }
}

/**
 * Decompose a multi-part question into self-contained sub-questions.
 * Returns null when the planner decides it's really one task (or fails) —
 * callers must treat null as "use the normal flow".
 */
export async function decomposeQuestion(
  question: string,
  schemaSummary: string,
  callLlm: (messages: { role: string; content: string }[], systemPrompt: string) => Promise<{ content: string }>
): Promise<string[] | null> {
  try {
    const systemPrompt =
      `You split a multi-part data question into independent sub-questions. Reply with ONLY a JSON array of strings.\n` +
      `Rules: each sub-question must be fully self-contained (repeat any filters/context it needs from the original). ` +
      `Return 2-${MAX_SUB_QUESTIONS} sub-questions. If the request is really ONE task (e.g. one query with several columns ` +
      `or one ranking), reply with the JSON array ["SINGLE"].\nSchema context:\n${schemaSummary.slice(0, 2000)}`;
    const resp = await callLlm([{ role: "user", content: question.slice(0, 1500) }], systemPrompt);
    const subs = extractJsonArray(resp.content);
    if (!subs || subs.some((s) => /^single$/i.test(s))) return null;
    return subs;
  } catch {
    return null;
  }
}

/** Render one combined markdown answer from per-part results. */
export function synthesizeParts(
  parts: { question: string; answerMarkdown: string }[]
): string {
  const sections = parts.map(
    (p, i) => `### Part ${i + 1}: ${p.question}\n\n${p.answerMarkdown.trim() || "_No result._"}`
  );
  return sections.join("\n\n---\n\n");
}

/** Compact markdown rendering of result rows for synthesized answers. */
export function rowsToMarkdownTable(rows: Record<string, unknown>[], maxRows = 15): string {
  if (!Array.isArray(rows) || rows.length === 0) return "_0 rows._";
  const cols = Object.keys(rows[0] || {});
  if (cols.length === 0) return "_0 columns._";
  const fmt = (v: unknown) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return String(v).slice(0, 60).replace(/\|/g, "\\|");
  };
  const lines = [
    `| ${cols.join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...rows.slice(0, maxRows).map((r) => `| ${cols.map((c) => fmt(r[c])).join(" | ")} |`),
  ];
  if (rows.length > maxRows) lines.push(`\n_…and ${rows.length - maxRows} more rows._`);
  return lines.join("\n");
}
