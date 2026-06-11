// ─── Per-Dataset Agent Memory ─────────────────────────────────────────────────
// Long-term learning store for the SQL-first agent, keyed by dataset. Two kinds
// of knowledge accumulate across sessions (localStorage, user's own browser):
//
//   1. Glossary — clarification answers the user already gave ("by torque I
//      mean torque_output"). Injected into every future prompt so the agent
//      never asks the same question twice.
//   2. Solved examples — (question → verified SQL) pairs that passed the
//      verification turn. The most relevant past examples are injected as
//      few-shot guidance, so the agent reuses proven cast/filter patterns
//      instead of re-deriving them. The agent gets better with every query.
//
// Retrieval is plain word-overlap ranking — deterministic, instant, offline.

interface SolvedExample {
  question: string;
  sql: string;
  ts: number;
}

interface GlossaryEntry {
  asked: string;   // what the agent asked
  answer: string;  // what the user replied
  ts: number;
}

interface DatasetMemory {
  glossary: GlossaryEntry[];
  examples: SolvedExample[];
}

const MAX_EXAMPLES = 25;
const MAX_GLOSSARY = 15;
const STORAGE_PREFIX = "qfy-agent-memory:";

// Dataset keys embed row counts which change on re-upload; hash to keep the
// localStorage key short and stable for the same workbook shape.
function storageKey(datasetKey: string): string {
  let h = 0;
  for (let i = 0; i < datasetKey.length; i++) h = ((h << 5) - h + datasetKey.charCodeAt(i)) | 0;
  return `${STORAGE_PREFIX}${Math.abs(h).toString(36)}`;
}

function loadMemory(datasetKey: string): DatasetMemory {
  try {
    const raw = localStorage.getItem(storageKey(datasetKey));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        glossary: Array.isArray(parsed.glossary) ? parsed.glossary : [],
        examples: Array.isArray(parsed.examples) ? parsed.examples : [],
      };
    }
  } catch { /* corrupt or unavailable storage — start fresh */ }
  return { glossary: [], examples: [] };
}

function saveMemory(datasetKey: string, mem: DatasetMemory): void {
  try {
    localStorage.setItem(storageKey(datasetKey), JSON.stringify(mem));
  } catch {
    // Quota exceeded — drop the oldest half of examples and retry once.
    try {
      mem.examples = mem.examples.slice(-Math.floor(MAX_EXAMPLES / 2));
      localStorage.setItem(storageKey(datasetKey), JSON.stringify(mem));
    } catch { /* storage unavailable — memory is best-effort */ }
  }
}

/** Remember a (question → verified SQL) pair for future few-shot retrieval. */
export function recordSolvedExample(datasetKey: string, question: string, sql: string): void {
  const q = question.trim();
  const s = sql.trim();
  if (!q || !s) return;
  const mem = loadMemory(datasetKey);
  const norm = q.toLowerCase();
  mem.examples = mem.examples.filter((e) => e.question.toLowerCase() !== norm);
  mem.examples.push({ question: q.slice(0, 500), sql: s.slice(0, 2000), ts: Date.now() });
  if (mem.examples.length > MAX_EXAMPLES) mem.examples = mem.examples.slice(-MAX_EXAMPLES);
  saveMemory(datasetKey, mem);
}

/** Remember a clarification the user answered so it is never asked again. */
export function recordClarification(datasetKey: string, asked: string, answer: string): void {
  const a = asked.trim();
  const ans = answer.trim();
  if (!a || !ans) return;
  const mem = loadMemory(datasetKey);
  const norm = a.toLowerCase();
  mem.glossary = mem.glossary.filter((g) => g.asked.toLowerCase() !== norm);
  mem.glossary.push({ asked: a.slice(0, 300), answer: ans.slice(0, 300), ts: Date.now() });
  if (mem.glossary.length > MAX_GLOSSARY) mem.glossary = mem.glossary.slice(-MAX_GLOSSARY);
  saveMemory(datasetKey, mem);
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "for", "to", "and", "or", "is", "are",
  "all", "with", "by", "from", "what", "which", "show", "me", "give", "find",
  "list", "get", "how", "many", "much", "that", "this", "where", "when",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / Math.sqrt(a.size * b.size);
}

/**
 * Build the LEARNED MEMORY prompt block for a new question: the full glossary
 * plus the top-3 most similar solved examples. Returns "" when nothing useful
 * is stored yet.
 */
export function buildMemoryBlock(datasetKey: string, question: string): string {
  const mem = loadMemory(datasetKey);
  if (mem.glossary.length === 0 && mem.examples.length === 0) return "";

  const parts: string[] = [];

  if (mem.glossary.length > 0) {
    const lines = mem.glossary.map((g) => `- Asked: "${g.asked}" → User answered: "${g.answer}"`);
    parts.push(`Definitions the user already gave (do NOT ask these again):\n${lines.join("\n")}`);
  }

  if (mem.examples.length > 0) {
    const qTokens = tokenize(question);
    const ranked = mem.examples
      .map((e) => ({ e, score: overlapScore(qTokens, tokenize(e.question)) }))
      .filter((r) => r.score > 0.1)
      .sort((a, b) => b.score - a.score || b.e.ts - a.e.ts)
      .slice(0, 3);
    if (ranked.length > 0) {
      const lines = ranked.map(({ e }) => `- Q: "${e.question}"\n  Verified SQL: ${e.sql}`);
      parts.push(`Previously VERIFIED queries on this dataset (reuse their cast/filter patterns where relevant):\n${lines.join("\n")}`);
    }
  }

  if (parts.length === 0) return "";
  return `LEARNED MEMORY for this dataset:\n${parts.join("\n\n")}`;
}
