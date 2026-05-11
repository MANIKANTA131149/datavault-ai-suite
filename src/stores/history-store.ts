import { create } from "zustand";
import { api } from "@/lib/api-client";
import type { AgentStep } from "@/lib/agent";
import type { Provider } from "@/lib/llm-client";

const HISTORY_FINAL_RESULT_LIMIT = 24000;
const HISTORY_STEP_ARGS_LIMIT = 4000;
const HISTORY_STEP_RESULT_LIMIT = 8000;
const HISTORY_STEP_SQL_LIMIT = 8000;

export interface HistoryStep {
  turn: number;
  command: string;
  argsText: string | null;
  resultText: string | null;
  sql: string | null;
  tokens: { input: number; output: number };
  durationMs: number;
  isFinal: boolean;
}

export interface HistoryEntry {
  id: string;
  query: string;
  datasetName: string;
  provider: Provider;
  model: string;
  turns: number;
  totalTokens: number;
  durationMs: number;
  status: "success" | "error";
  steps: HistoryStep[];
  finalResult: string | null;
  date: string;
}

interface NewHistoryEntry extends Omit<HistoryEntry, "id" | "date" | "steps" | "finalResult"> {
  steps: AgentStep[];
  finalResult: unknown;
}

interface HistoryState {
  entries: HistoryEntry[];
  loading: boolean;
  fetchHistory: () => Promise<void>;
  addEntry: (entry: NewHistoryEntry) => Promise<void>;
  clearHistory: () => Promise<void>;
  clearEntries: () => void;
}

function serializeHistoryText(value: unknown, limit: number, label: string): string | null {
  if (value === null || value === undefined) return null;

  const text = typeof value === "string"
    ? value
    : JSON.stringify(value, null, 2);

  if (!text) return null;

  return text.length > limit
    ? `${text.slice(0, limit)}\n\n...[${label} truncated]`
    : text;
}

function normalizeHistoryStep(step: Partial<HistoryStep> & Record<string, any>): HistoryStep {
  return {
    turn: Number(step.turn) || 0,
    command: String(step.command || "Unknown"),
    argsText: typeof step.argsText === "string"
      ? step.argsText
      : serializeHistoryText(step.args, HISTORY_STEP_ARGS_LIMIT, "step args"),
    resultText: typeof step.resultText === "string"
      ? step.resultText
      : serializeHistoryText(step.result, HISTORY_STEP_RESULT_LIMIT, "step result"),
    sql: typeof step.sql === "string"
      ? step.sql
      : null,
    tokens: {
      input: Number(step.tokens?.input) || 0,
      output: Number(step.tokens?.output) || 0,
    },
    durationMs: Number(step.durationMs) || 0,
    isFinal: Boolean(step.isFinal),
  };
}

function toHistorySteps(steps: AgentStep[]): HistoryStep[] {
  return steps.map((step) => normalizeHistoryStep({
    turn: step.turn,
    command: step.command,
    args: step.args,
    result: step.result,
    sql: serializeHistoryText(step.sql, HISTORY_STEP_SQL_LIMIT, "step sql"),
    tokens: step.tokens,
    durationMs: step.durationMs,
    isFinal: step.isFinal,
  }));
}

export const useHistoryStore = create<HistoryState>()((set) => ({
  entries: [],
  loading: false,

  fetchHistory: async () => {
    set({ loading: true });
    try {
      const remote = await api.get<HistoryEntry[]>("/history");
      const entries: HistoryEntry[] = remote.map((entry) => ({
        ...entry,
        steps: Array.isArray(entry.steps) ? entry.steps.map((step) => normalizeHistoryStep(step)) : [],
        finalResult: typeof entry.finalResult === "string"
          ? entry.finalResult
          : serializeHistoryText(entry.finalResult, HISTORY_FINAL_RESULT_LIMIT, "answer"),
      }));
      set({ entries });
    } catch (err) {
      console.error("fetchHistory:", err);
    } finally {
      set({ loading: false });
    }
  },

  addEntry: async (entry) => {
    const id = crypto.randomUUID();
    const date = new Date().toISOString();
    const full: HistoryEntry = {
      ...entry,
      id,
      date,
      steps: toHistorySteps(entry.steps),
      finalResult: serializeHistoryText(entry.finalResult, HISTORY_FINAL_RESULT_LIMIT, "answer"),
    };

    set((state) => ({ entries: [full, ...state.entries] }));

    try {
      await api.post("/history", {
        id,
        query: entry.query,
        datasetName: entry.datasetName,
        provider: entry.provider,
        model: entry.model,
        turns: entry.turns,
        totalTokens: entry.totalTokens,
        durationMs: entry.durationMs,
        status: entry.status,
        date,
        steps: full.steps,
        finalResult: full.finalResult,
      });
    } catch (err) {
      console.error("Failed to save history entry to MongoDB:", err);
      set((state) => ({ entries: state.entries.filter((item) => item.id !== id) }));
      throw err;
    }
  },

  clearHistory: async () => {
    set({ entries: [] });
    try {
      await api.delete("/history");
    } catch (err) {
      console.error("Failed to clear history from MongoDB:", err);
    }
  },

  clearEntries: () => set({ entries: [] }),
}));
