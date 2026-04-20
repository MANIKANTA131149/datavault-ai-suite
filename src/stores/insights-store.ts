import { create } from "zustand";
import { api } from "@/lib/api-client";

export interface Insight {
  id: string;
  query: string;
  datasetName: string;
  result: any;
  label: string;
  notes: string;
  color: "blue" | "purple" | "green" | "amber" | "red" | "pink";
  tags: string[];
  createdAt: string;
}

interface InsightsState {
  insights: Insight[];
  loading: boolean;
  fetchInsights: () => Promise<void>;
  addInsight: (insight: Omit<Insight, "id" | "createdAt">) => Promise<void>;
  updateInsight: (id: string, updates: Partial<Pick<Insight, "label" | "notes" | "color" | "tags">>) => Promise<void>;
  removeInsight: (id: string) => Promise<void>;
  clearInsights: () => void;
}

export const useInsightsStore = create<InsightsState>()((set, get) => ({
  insights: [],
  loading: false,

  fetchInsights: async () => {
    set({ loading: true });
    try {
      const remote = await api.get<Insight[]>("/insights");
      set({ insights: remote });
    } catch (err) {
      console.error("fetchInsights:", err);
    } finally {
      set({ loading: false });
    }
  },

  addInsight: async (insight) => {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const full: Insight = { ...insight, id, createdAt };
    set((state) => ({ insights: [full, ...state.insights] }));
    try {
      await api.post("/insights", full);
    } catch (err) {
      console.error("Failed to save insight:", err);
    }
  },

  updateInsight: async (id, updates) => {
    set((state) => ({
      insights: state.insights.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }));
    try {
      await api.put(`/insights/${id}`, updates);
    } catch (err) {
      console.error("Failed to update insight:", err);
    }
  },

  removeInsight: async (id) => {
    set((state) => ({ insights: state.insights.filter((i) => i.id !== id) }));
    try {
      await api.delete(`/insights/${id}`);
    } catch (err) {
      console.error("Failed to delete insight:", err);
    }
  },

  clearInsights: () => set({ insights: [] }),
}));
