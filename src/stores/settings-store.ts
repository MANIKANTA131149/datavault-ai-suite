import { create } from "zustand";
import { api } from "@/lib/api-client";
import { useAuthStore } from "./auth-store";

export type Theme = "dark" | "light" | "system";
export type CodeFont = "jetbrains" | "fira" | "cascadia";

interface SettingsState {
  theme: Theme;
  compactMode: boolean;
  codeFont: CodeFont;
  tracingEnabled: boolean;
  loading: boolean;
  hasFetched: boolean;

  // Selected Query Page Workspace preferences
  selectedDatasetId: string;
  selectedSheet: string;
  selectedTable: string;

  setTheme: (theme: Theme) => void;
  setCompactMode: (v: boolean) => void;
  setCodeFont: (font: CodeFont) => void;
  setTracingEnabled: (v: boolean) => void;

  setSelectedDatasetId: (id: string) => void;
  setSelectedSheet: (sheet: string) => void;
  setSelectedTable: (table: string) => void;

  fetchSettings: () => Promise<void>;
  saveSettings: (providerConfigs?: Record<string, unknown>) => Promise<void>;
  applyTheme: (theme: Theme) => void;
}

function applyThemeToDom(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.add(prefersDark ? "dark" : "light");
  } else {
    root.classList.add(theme);
  }
}

// ─── User-Scoped LocalStorage Query Cache Helpers ──────────────────────────
function getLocalQueryCache(userId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(`datavault-query-settings-${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalQueryCache(userId: string, data: Record<string, string>) {
  try {
    if (userId === "anonymous" || !userId) return;
    const current = getLocalQueryCache(userId);
    localStorage.setItem(
      `datavault-query-settings-${userId}`,
      JSON.stringify({ ...current, ...data })
    );
  } catch (err) {
    console.error("Failed to save local query cache:", err);
  }
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  theme: "dark",
  compactMode: false,
  codeFont: "jetbrains",
  tracingEnabled: false,
  loading: false,
  hasFetched: false,

  // Selected workspace settings
  selectedDatasetId: "",
  selectedSheet: "",
  selectedTable: "",

  applyTheme: applyThemeToDom,

  setTheme: (theme: Theme) => {
    set({ theme });
    applyThemeToDom(theme);
  },

  setCompactMode: (compactMode: boolean) => set({ compactMode }),
  setCodeFont: (codeFont: CodeFont) => set({ codeFont }),

  setTracingEnabled: (tracingEnabled: boolean) => {
    set({ tracingEnabled });
    // Persist to MongoDB in the background (consistent with workspace setters).
    import("./llm-store").then(({ useLLMStore }) => {
      get().saveSettings(useLLMStore.getState().providerConfigs).catch(() => {});
    });
  },

  setSelectedDatasetId: (selectedDatasetId: string) => {
    set({ selectedDatasetId });
    const userId = useAuthStore.getState().user?.id || "anonymous";
    if (userId !== "anonymous") {
      saveLocalQueryCache(userId, { selectedDatasetId });
    }
    // Sync to MongoDB in the background
    import("./llm-store").then(({ useLLMStore }) => {
      get().saveSettings(useLLMStore.getState().providerConfigs).catch(() => {});
    });
  },

  setSelectedSheet: (selectedSheet: string) => {
    set({ selectedSheet });
    const userId = useAuthStore.getState().user?.id || "anonymous";
    if (userId !== "anonymous") {
      saveLocalQueryCache(userId, { selectedSheet });
    }
    // Sync to MongoDB in the background
    import("./llm-store").then(({ useLLMStore }) => {
      get().saveSettings(useLLMStore.getState().providerConfigs).catch(() => {});
    });
  },

  setSelectedTable: (selectedTable: string) => {
    set({ selectedTable });
    const userId = useAuthStore.getState().user?.id || "anonymous";
    if (userId !== "anonymous") {
      saveLocalQueryCache(userId, { selectedTable });
    }
    // Sync to MongoDB in the background
    import("./llm-store").then(({ useLLMStore }) => {
      get().saveSettings(useLLMStore.getState().providerConfigs).catch(() => {});
    });
  },

  fetchSettings: async () => {
    set({ loading: true });
    try {
      const userId = useAuthStore.getState().user?.id || "anonymous";
      const { useLLMStore } = await import("./llm-store");
      const llm = useLLMStore.getState();

      // 1. Instant hydration from user-scoped localStorage cache
      if (userId !== "anonymous") {
        const cache = getLocalQueryCache(userId);
        set({
          selectedDatasetId: cache.selectedDatasetId || "",
          selectedSheet: cache.selectedSheet || "",
          selectedTable: cache.selectedTable || "",
        });

        if (cache.activeProvider) {
          llm.setActiveProvider(cache.activeProvider as any);
        }
        if (cache.activeModel) {
          llm.setActiveModel(cache.activeModel);
        }
        llm.hydrateSecrets(userId);
      }

      // 2. Fetch fresh settings from MongoDB server
      const data = await api.get<Record<string, any>>("/settings");

      // Re-hydrate local secrets to memory
      if (userId !== "anonymous") {
        llm.hydrateSecrets(userId);
      }

      if (data && Object.keys(data).length > 0) {
        const theme = (data.theme as Theme) || "dark";
        const selectedDatasetId = (data.selectedDatasetId as string) || "";
        const selectedSheet = (data.selectedSheet as string) || "";
        const selectedTable = (data.selectedTable as string) || "";

        set({
          theme,
          compactMode: (data.compactMode as boolean) ?? false,
          codeFont: (data.codeFont as CodeFont) || "jetbrains",
          tracingEnabled: (data.tracingEnabled as boolean) ?? false,
          selectedDatasetId,
          selectedSheet,
          selectedTable,
        });
        applyThemeToDom(theme);

        // Update local cache with MongoDB values
        if (userId !== "anonymous") {
          saveLocalQueryCache(userId, {
            selectedDatasetId,
            selectedSheet,
            selectedTable,
            activeProvider: (data.activeProvider as string) || llm.activeProvider,
            activeModel: (data.activeModel as string) || llm.activeModel,
          });
        }

        // Apply active provider and model from server
        if (data.activeProvider) {
          llm.setActiveProvider(data.activeProvider);
        }
        if (data.activeModel) {
          llm.setActiveModel(data.activeModel);
        }

        // Safely merge provider configs (API keys etc.) with server configs
        if (data.providerConfigs && typeof data.providerConfigs === "object") {
          const nextConfigs = { ...llm.providerConfigs };
          for (const [provider, config] of Object.entries(
            data.providerConfigs as Record<string, Record<string, string>>
          )) {
            nextConfigs[provider] = {
              ...(nextConfigs[provider] || {}),
              ...(config || {}),
            } as any;
          }
          llm.replaceProviderConfigs(nextConfigs);
        }
      }
      set({ hasFetched: true });
    } catch (err) {
      console.error("fetchSettings:", err);
    } finally {
      set({ loading: false });
    }
  },

  saveSettings: async (providerConfigs = {}) => {
    const { theme, compactMode, codeFont, tracingEnabled, selectedDatasetId, selectedSheet, selectedTable } = get();
    const userId = useAuthStore.getState().user?.id || "anonymous";
    const { useLLMStore } = await import("./llm-store");
    const llm = useLLMStore.getState();

    const activeProvider = llm.activeProvider;
    const activeModel = llm.activeModel;

    // Save to user-scoped local cache
    if (userId !== "anonymous") {
      saveLocalQueryCache(userId, {
        selectedDatasetId,
        selectedSheet,
        selectedTable,
        activeProvider,
        activeModel,
      });
    }

    // Save to MongoDB
    await api.put("/settings", {
      theme,
      compactMode,
      codeFont,
      tracingEnabled,
      providerConfigs,
      activeProvider,
      activeModel,
      selectedDatasetId,
      selectedSheet,
      selectedTable,
    });
  },
}));
