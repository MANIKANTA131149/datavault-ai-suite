import { create } from "zustand";
import { api } from "@/lib/api-client";

export type Theme = "dark" | "light" | "system";
export type CodeFont = "jetbrains" | "fira" | "cascadia";

interface SettingsState {
  theme: Theme;
  compactMode: boolean;
  codeFont: CodeFont;
  loading: boolean;

  setTheme: (theme: Theme) => void;
  setCompactMode: (v: boolean) => void;
  setCodeFont: (font: CodeFont) => void;

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

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  theme: "dark",
  compactMode: false,
  codeFont: "jetbrains",
  loading: false,

  applyTheme: applyThemeToDom,

  setTheme: (theme: Theme) => {
    set({ theme });
    applyThemeToDom(theme);
  },

  setCompactMode: (compactMode: boolean) => set({ compactMode }),
  setCodeFont: (codeFont: CodeFont) => set({ codeFont }),

  fetchSettings: async () => {
    set({ loading: true });
    try {
      const data = await api.get<Record<string, unknown>>("/settings");
      const { useLLMStore } = await import("./llm-store");
      const llm = useLLMStore.getState();
      llm.replaceProviderConfigs({});

      if (data && Object.keys(data).length > 0) {
        const theme = (data.theme as Theme) || "dark";
        set({
          theme,
          compactMode: (data.compactMode as boolean) ?? false,
          codeFont: (data.codeFont as CodeFont) || "jetbrains",
        });
        applyThemeToDom(theme);

        // Hydrate LLM store only with this user's saved provider config.
        if (data.providerConfigs && typeof data.providerConfigs === "object") {
          const nextConfigs: Record<string, Record<string, string>> = {};
          for (const [provider, config] of Object.entries(
            data.providerConfigs as Record<string, Record<string, string>>
          )) {
            nextConfigs[provider] = config || {};
          }
          llm.replaceProviderConfigs(nextConfigs as Parameters<typeof llm.replaceProviderConfigs>[0]);
        }
      }
    } catch (err) {
      console.error("fetchSettings:", err);
    } finally {
      set({ loading: false });
    }
  },

  saveSettings: async (providerConfigs = {}) => {
    const { theme, compactMode, codeFont } = get();
    await api.put("/settings", { theme, compactMode, codeFont, providerConfigs });
  },
}));
