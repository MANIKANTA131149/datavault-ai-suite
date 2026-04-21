import { create } from "zustand";
import { api } from "@/lib/api-client";
import { PLAN_DEFINITIONS, PLAN_TIERS, getPlanDefinition, planAllowsExport, type ExportFormat, type PlanContext } from "@/lib/plans";

interface PlanState {
  context: PlanContext | null;
  loading: boolean;
  fetchPlan: () => Promise<PlanContext | null>;
  checkMetric: (metric: keyof PlanContext["usage"], attempted?: number) => Promise<boolean>;
  checkExport: (format: ExportFormat) => Promise<boolean>;
  clearPlan: () => void;
}

function showLimitMessage(err: any) {
  const message = err?.message || "This action is not available on your current plan.";
  return message;
}

function formatExportName(format: ExportFormat) {
  const names: Record<ExportFormat, string> = {
    csv: "CSV",
    json: "JSON",
    markdown: "Markdown",
    html: "HTML",
    pdf: "PDF",
    audit: "Audit",
    history: "History",
  };
  return names[format];
}

function exportLockMessage(format: ExportFormat) {
  const plans = PLAN_TIERS
    .map((tier) => PLAN_DEFINITIONS[tier])
    .filter((plan) => planAllowsExport(plan, format))
    .map((plan) => plan.name);
  const allowedPlans = plans.length <= 1
    ? plans[0] || "a higher"
    : `${plans.slice(0, -1).join(", ")} or ${plans[plans.length - 1]}`;
  return `${formatExportName(format)} export requires ${allowedPlans} plan`;
}

export const usePlanStore = create<PlanState>()((set, get) => ({
  context: null,
  loading: false,

  fetchPlan: async () => {
    set({ loading: true });
    try {
      const context = await api.get<PlanContext>("/plans/me");
      set({ context });
      return context;
    } catch (err) {
      const fallback: PlanContext = {
        plan: getPlanDefinition("free"),
        usage: { monthlyQueries: 0, monthlyTokens: 0, datasets: 0, insights: 0, members: 0 },
        planStatus: "active",
        planSource: "manual",
      };
      set({ context: fallback });
      return fallback;
    } finally {
      set({ loading: false });
    }
  },

  checkMetric: async (metric, attempted = 1) => {
    try {
      await api.post("/plans/check", { metric, attempted });
      return true;
    } catch (err: any) {
      throw new Error(showLimitMessage(err));
    }
  },

  checkExport: async (format) => {
    try {
      const context = get().context || await get().fetchPlan();
      if (context && !planAllowsExport(context.plan, format)) {
        throw new Error(exportLockMessage(format));
      }
      await api.post("/plans/exports/check", { format });
      return true;
    } catch (err: any) {
      if (err?.message === "Export format is not available on this plan") {
        throw new Error(exportLockMessage(format));
      }
      throw new Error(showLimitMessage(err));
    }
  },

  clearPlan: () => set({ context: null }),
}));
