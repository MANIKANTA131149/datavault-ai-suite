import { create } from "zustand";
import { api } from "@/lib/api-client";
import type { AgentStep } from "@/lib/agent";
import type { Provider } from "@/lib/llm-client";

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
  steps: AgentStep[];     // in-memory only — not persisted (large)
  finalResult: any;       // in-memory only — not persisted (large)
  date: string;
}

interface HistoryState {
  entries: HistoryEntry[];
  loading: boolean;
  /** Load history from MongoDB (called after login) */
  fetchHistory: () => Promise<void>;
  addEntry: (entry: Omit<HistoryEntry, "id" | "date">) => Promise<void>;
  clearHistory: () => Promise<void>;
  /** Clear in-memory state on logout */
  clearEntries: () => void;
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  entries: [],
  loading: false,

  // ─── Fetch from MongoDB ───────────────────────────────────────────────────
  fetchHistory: async () => {
    set({ loading: true });
    try {
      const remote = await api.get<Omit<HistoryEntry, "steps" | "finalResult">[]>("/history");
      // steps and finalResult are session-only; initialize as empty for reloaded entries
      const entries: HistoryEntry[] = remote.map((e) => ({
        ...e,
        steps: [],
        finalResult: null,
      }));
      set({ entries });
    } catch (err) {
      console.error("fetchHistory:", err);
    } finally {
      set({ loading: false });
    }
  },

  // ─── Add entry — persist lightweight metadata, keep heavy data in memory ──
  addEntry: async (entry) => {
    const id = crypto.randomUUID();
    const date = new Date().toISOString();
    const full: HistoryEntry = { ...entry, id, date };

    // Prepend to in-memory list (includes steps + finalResult for current session)
    set((state) => ({ entries: [full, ...state.entries] }));

    // Save only lightweight fields to MongoDB
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
      });
    } catch (err) {
      console.error("Failed to save history entry to MongoDB:", err);
      set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }));
      throw err;
    }
  },

  // ─── Clear all ────────────────────────────────────────────────────────────
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
