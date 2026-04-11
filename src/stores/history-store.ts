import { create } from "zustand";
import { persist } from "zustand/middleware";
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
  steps: AgentStep[];
  finalResult: any;
  date: string;
}

interface HistoryState {
  entries: HistoryEntry[];
  addEntry: (entry: Omit<HistoryEntry, "id" | "date">) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => ({
          entries: [
            { ...entry, id: crypto.randomUUID(), date: new Date().toISOString() },
            ...state.entries,
          ],
        })),
      clearHistory: () => set({ entries: [] }),
    }),
    { name: "datavault-history" }
  )
);
