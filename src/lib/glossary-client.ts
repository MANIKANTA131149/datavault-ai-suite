// ─── Semantic Layer / Business Glossary Client (F9) ───────────────────────────
// Fetches the org-wide business glossary (term → governed definition / SQL
// expression) and builds a prompt block whenever a question mentions a defined
// term. The agent sees the team's official metric definitions BEFORE guessing
// from column names, so "revenue" means the same thing for every teammate.
// All fetching is best-effort and cached; failures degrade to no glossary.

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  sqlExpression: string | null;
  aliases: string[];
  datasetId: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { terms: GlossaryTerm[]; fetchedAt: number } | null = null;
let fetchDisabled = false;

async function fetchTerms(): Promise<GlossaryTerm[]> {
  if (fetchDisabled) return [];
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.terms;
  try {
    const { api } = await import("@/lib/api-client");
    const terms = await api.get<GlossaryTerm[]>("/glossary");
    cache = { terms: Array.isArray(terms) ? terms : [], fetchedAt: Date.now() };
    return cache.terms;
  } catch (err) {
    if (err instanceof Error && /unauthorized/i.test(err.message)) fetchDisabled = true;
    return cache?.terms ?? [];
  }
}

/** Invalidate the cache (call after creating/editing terms). */
export function invalidateGlossaryCache(): void {
  cache = null;
}

function termMatchesQuestion(t: GlossaryTerm, questionLower: string): boolean {
  const names = [t.term, ...(t.aliases || [])];
  return names.some((name) => {
    const n = name.trim().toLowerCase();
    if (n.length < 3) return false;
    // Whole-word match so "rev" doesn't fire on "review".
    const idx = questionLower.indexOf(n);
    if (idx === -1) return false;
    const before = idx === 0 ? " " : questionLower[idx - 1];
    const after = idx + n.length >= questionLower.length ? " " : questionLower[idx + n.length];
    return !/[a-z0-9_]/.test(before) && !/[a-z0-9_]/.test(after);
  });
}

/**
 * Build the BUSINESS GLOSSARY prompt block for a question. Only terms that
 * actually appear in the question (or their aliases) are injected, plus
 * dataset-scoped terms for the active dataset. Returns "" when nothing matches.
 */
export async function buildGlossaryBlock(question: string, datasetId?: string | null): Promise<string> {
  const terms = await fetchTerms();
  if (terms.length === 0) return "";

  const qLower = question.toLowerCase();
  const matched = terms.filter(
    (t) =>
      (t.datasetId == null || t.datasetId === datasetId) &&
      termMatchesQuestion(t, qLower)
  );
  if (matched.length === 0) return "";

  const lines = matched.slice(0, 10).map((t) => {
    const sqlPart = t.sqlExpression ? `\n  Official SQL definition: ${t.sqlExpression}` : "";
    return `- "${t.term}": ${t.definition}${sqlPart}`;
  });
  return (
    `BUSINESS GLOSSARY (official team definitions — these OVERRIDE any column-name guessing; ` +
    `do NOT ask the user to define these terms):\n${lines.join("\n")}`
  );
}
