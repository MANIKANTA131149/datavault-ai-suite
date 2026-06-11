import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Provider } from "@/lib/llm-client";

export const PROVIDER_MODELS: Record<Provider, string[]> = {
  querify: [
    "deepseek.v3.2",
  ],
  groq: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  gemini: [
    "gemini-3-pro-preview",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ],
  anthropic: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"],
  bedrock: [
    "amazon.nova-lite-v1:0",
    "amazon.nova-micro-v1:0",
    "amazon.nova-pro-v1:0",
    "anthropic.claude-3-5-sonnet-20240620-v1:0",
    "anthropic.claude-3-haiku-20240307-v1:0",
    "amazon.titan-text-express-v1",
    "meta.llama3-70b-instruct-v1:0",
  ],
  azure: ["gpt-4o", "gpt-4-turbo"],
  cohere: ["command-r-plus", "command-r"],
  mistral: ["mistral-large", "mistral-medium", "open-mistral-7b"],
  together: ["Apriel-1.6-15b-Thinker", "mistralai/Mixtral-8x7B"],
  ollama: ["llama3", "mistral", "gemma"],
  huggingface: [
    "MiniMaxAI/MiniMax-M2.7:together",
    "zai-org/GLM-5.1:together",
    "openai/gpt-oss-120b:groq",
    "openai/gpt-oss-120b:together",
    "deepseek-ai/DeepSeek-R1:together",
    "openai/gpt-oss-20b:groq",
    "openai/gpt-oss-20b:together",
    "Qwen/Qwen2.5-7B-Instruct:together",
    "zai-org/GLM-5:together",
    "deepseek-ai/DeepSeek-V3:together",
    "Qwen/Qwen3-32B:groq",
    "Qwen/Qwen3-235B-A22B-Instruct-2507:together",
    "Qwen/Qwen3-Coder-480B-A35B-Instruct:together",
    "openai/gpt-oss-safeguard-20b:groq",
    "Qwen/Qwen3-Coder-Next-FP8:together",
    "meta-llama/Llama-4-Scout-17B-16E-Instruct:groq",
    "meta-llama/Llama-3.3-70B-Instruct:groq",
    "meta-llama/Llama-3.3-70B-Instruct:together",
    "deepseek-ai/DeepSeek-R1-0528:together",
    "deepseek-ai/DeepSeek-V3-0324:together",
    "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8:together",
    "deepseek-ai/DeepSeek-V3.1:together",
    "deepcogito/cogito-671b-v2.1:together",
    "deepcogito/cogito-671b-v2.1-FP8:together",
    "EssentialAI/rnj-1-instruct:together",
  ],
  alibaba: [
    // --- Qwen-Max Series ---
    "qwen3.7-max",
    "qwen3.7-max-2026-05-20",
    "qwen3.6-max-preview",
    "qwen3-max",
    "qwen3-max-preview",
    "qwen3-max-2025-09-23",
    "qwen3-max-2026-01-23",
    "qwen-max",
    "qwen-max-latest",
    "qwen-max-2025-01-25",
    "qwen-max-2024-09-19",
    // --- Qwen-Plus Series ---
    "qwen3.6-plus",
    "qwen3.6-plus-2026-04-02",
    "qwen3.5-plus",
    "qwen3.5-plus-2026-02-15",
    "qwen-plus",
    "qwen-plus-latest",
    "qwen-plus-2024-12-20",
    "qwen-plus-2025-01-25",
    "qwen-plus-us",
    "qwen-plus-2025-12-01-us",
    "qwen-plus-2025-12-01",
    // --- Qwen-Flash Series ---
    "qwen3.6-flash",
    "qwen3.6-flash-2026-04-16",
    "qwen3.5-flash",
    "qwen3.5-flash-2026-02-23",
    "qwen-flash",
    "qwen-flash-2025-07-28",
    "qwen-flash-us",
    "qwen-flash-2025-07-28-us",
    // --- Qwen-Turbo Series ---
    "qwen-turbo",
    "qwen-turbo-latest",
    "qwen-turbo-2024-11-01",
    "qwen-turbo-2025-04-28",
    // --- Qwen-Coder Series ---
    "qwen3-coder-plus",
    "qwen3-coder-plus-2025-07-22",
    "qwen3-coder-flash",
    "qwen3-coder-flash-2025-07-28",
    "qwen-coder-plus",
    "qwen-coder-plus-latest",
    "qwen-coder-plus-2024-11-06",
    "qwen-coder-turbo",
    "qwen-coder-turbo-latest",
    "qwen-coder-turbo-2024-09-19",
    // --- QwQ Series ---
    "qwq-plus",
    "qwq-plus-latest",
    "qwq-plus-2025-03-05",
    // --- Qwen-Math Series ---
    "qwen-math-plus",
    "qwen-math-plus-latest",
    "qwen-math-plus-2024-08-16",
    "qwen-math-turbo",
    "qwen-math-turbo-latest",
    "qwen-math-turbo-2024-09-19",
    // --- Open Source Models ---
    "qwen3.6-35b-a3b",
    "qwen3.5-397b-a17b",
    "qwen3.5-122b-a10b",
    "qwen3.5-27b",
    "qwen3.5-35b-a3b",
    "qwen3-next-80b-a3b-thinking",
    "qwen3-next-80b-a3b-instruct",
    "qwen3-235b-a22b-thinking-2507",
    "qwen3-235b-a22b-instruct-2507",
    "qwen3-30b-a3b-thinking-2507",
    "qwen3-30b-a3b-instruct-2507",
    "qwen3-235b-a22b",
    "qwen3-32b",
    "qwen3-30b-a3b",
    "qwen3-14b",
    "qwen3-8b",
    "qwen3-4b",
    "qwen3-1.7b",
    "qwen3-0.6b",
    "qwen2.5-14b-instruct-1m",
    "qwen2.5-7b-instruct-1m",
    "qwen2.5-72b-instruct",
    "qwen2.5-32b-instruct",
    "qwen2.5-14b-instruct",
    "qwen2.5-7b-instruct",
    "qwen2.5-3b-instruct",
    "qwen2.5-1.5b-instruct",
    "qwen2.5-0.5b-instruct"
  ],
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  querify: "Querify (Default Models)",
  groq: "Groq",
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic",
  bedrock: "AWS Bedrock",
  azure: "Azure OpenAI",
  cohere: "Cohere",
  mistral: "Mistral",
  together: "Together AI",
  ollama: "Ollama",
  huggingface: "Hugging Face",
  alibaba: "Alibaba DashScope (Qwen)",
};

export function getModelDisplayName(model: string) {
  const [modelPath, routerProvider] = model.split(":");
  const shortName = modelPath.split("/").pop() || modelPath;
  if (!routerProvider) return shortName;

  const providerName = routerProvider.charAt(0).toUpperCase() + routerProvider.slice(1);
  return `${shortName} (${providerName})`;
}

export interface ProviderConfig {
  apiKey?: string;
  secretAccessKey?: string;
  region?: string;
  model?: string;
  enabled?: boolean;
}

interface LLMState {
  activeProvider: Provider;
  activeModel: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  providerConfigs: Partial<Record<Provider, ProviderConfig>>;
  setActiveProvider: (provider: Provider) => void;
  setActiveModel: (model: string) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number) => void;
  setSystemPrompt: (prompt: string) => void;
  setProviderConfig: (provider: Provider, config: Partial<ProviderConfig>) => void;
  replaceProviderConfigs: (configs: Partial<Record<Provider, ProviderConfig>>) => void;
  clearProviderConfigs: () => void;
  clearProviderApiKeys: () => void;
  getApiKey: (provider: Provider) => string;
  hydrateSecrets: (userId: string) => void;
}

function stripProviderSecrets(configs: Partial<Record<Provider, ProviderConfig>> = {}) {
  return Object.fromEntries(
    Object.entries(configs).map(([provider, config]) => {
      const { apiKey: _apiKey, secretAccessKey: _secretAccessKey, ...safeConfig } = config || {};
      return [provider, safeConfig];
    })
  ) as Partial<Record<Provider, ProviderConfig>>;
}

import { useAuthStore } from "./auth-store";

function getUserId(): string {
  try {
    return useAuthStore.getState().user?.id || "anonymous";
  } catch {
    return "anonymous";
  }
}

function getSessionSecrets(): Record<string, { apiKey?: string; secretAccessKey?: string }> {
  try {
    const userId = getUserId();
    const raw = localStorage.getItem(`datavault-llm-secrets-${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSessionSecrets(configs: Partial<Record<Provider, ProviderConfig>>) {
  try {
    const userId = getUserId();
    if (userId === "anonymous") return;
    const secrets: Record<string, { apiKey?: string; secretAccessKey?: string }> = {};
    Object.entries(configs).forEach(([provider, config]) => {
      if (config?.apiKey || config?.secretAccessKey) {
        secrets[provider] = {
          ...(config.apiKey ? { apiKey: config.apiKey } : {}),
          ...(config.secretAccessKey ? { secretAccessKey: config.secretAccessKey } : {}),
        };
      }
    });
    localStorage.setItem(`datavault-llm-secrets-${userId}`, JSON.stringify(secrets));
  } catch (err) {
    console.error("Failed to save secrets to localStorage:", err);
  }
}

function getValidModel(provider: Provider, model?: string) {
  const models = PROVIDER_MODELS[provider] || [];
  if (provider === "bedrock" && model?.trim()) return model;
  return model && models.includes(model) ? model : models[0];
}

export const useLLMStore = create<LLMState>()(
  persist(
    (set, get) => ({
      activeProvider: "groq",
      activeModel: "llama-3.3-70b-versatile",
      temperature: 0.1,
      maxTokens: 1024,
      systemPrompt: "",
      providerConfigs: {},
      setActiveProvider: (provider) => {
        const models = PROVIDER_MODELS[provider];
        const existing = get().providerConfigs[provider]?.model;
        const newModel = getValidModel(provider, existing) || models[0];
        set({
          activeProvider: provider,
          activeModel: newModel,
        });

        // Sync to local query cache and server settings in the background
        try {
          const userId = getUserId();
          if (userId !== "anonymous") {
            const cacheKey = `datavault-query-settings-${userId}`;
            const currentCache = localStorage.getItem(cacheKey);
            const cacheObj = currentCache ? JSON.parse(currentCache) : {};
            localStorage.setItem(
              cacheKey,
              JSON.stringify({ ...cacheObj, activeProvider: provider, activeModel: newModel })
            );

            // Import useSettingsStore dynamically to prevent circular dependencies
            import("./settings-store").then(({ useSettingsStore }) => {
              const settings = useSettingsStore.getState();
              if (settings.hasFetched) {
                settings.saveSettings(get().providerConfigs).catch(() => {});
              }
            });
          }
        } catch (err) {
          console.error("Failed to sync activeProvider:", err);
        }
      },
      setActiveModel: (model) => {
        set({ activeModel: model });

        // Sync to local query cache and server settings in the background
        try {
          const userId = getUserId();
          if (userId !== "anonymous") {
            const cacheKey = `datavault-query-settings-${userId}`;
            const currentCache = localStorage.getItem(cacheKey);
            const cacheObj = currentCache ? JSON.parse(currentCache) : {};
            localStorage.setItem(
              cacheKey,
              JSON.stringify({ ...cacheObj, activeModel: model })
            );

            // Import useSettingsStore dynamically to prevent circular dependencies
            import("./settings-store").then(({ useSettingsStore }) => {
              const settings = useSettingsStore.getState();
              if (settings.hasFetched) {
                settings.saveSettings(get().providerConfigs).catch(() => {});
              }
            });
          }
        } catch (err) {
          console.error("Failed to sync activeModel:", err);
        }
      },
      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      setProviderConfig: (provider, config) =>
        set((state) => {
          const nextConfigs = {
            ...state.providerConfigs,
            [provider]: { ...state.providerConfigs[provider], ...config } as ProviderConfig,
          };
          saveSessionSecrets(nextConfigs);
          return { providerConfigs: nextConfigs };
        }),
      replaceProviderConfigs: (providerConfigs) => {
        saveSessionSecrets(providerConfigs);
        set({ providerConfigs });
      },
      clearProviderConfigs: () => {
        try {
          const userId = getUserId();
          localStorage.removeItem(`datavault-llm-secrets-${userId}`);
        } catch {}
        set({ providerConfigs: {} });
      },
      hydrateSecrets: (userId) => {
        try {
          const raw = localStorage.getItem(`datavault-llm-secrets-${userId}`);
          const secrets = raw ? JSON.parse(raw) : {};
          if (Object.keys(secrets).length > 0) {
            const nextConfigs = { ...get().providerConfigs };
            Object.entries(secrets).forEach(([provider, secretObj]) => {
              const p = provider as Provider;
              nextConfigs[p] = {
                ...(nextConfigs[p] || {}),
                ...(secretObj as any),
              } as ProviderConfig;
            });
            set({ providerConfigs: nextConfigs });
          }
        } catch (err) {
          console.error("Failed to hydrate secrets:", err);
        }
      },
      clearProviderApiKeys: () =>
        set((state) => {
          const nextConfigs = stripProviderSecrets(state.providerConfigs);
          saveSessionSecrets(nextConfigs);
          return { providerConfigs: nextConfigs };
        }),
      getApiKey: (provider) => get().providerConfigs[provider]?.apiKey || "",
    }),
    {
      name: "datavault-llm",
      version: 3,
      partialize: (state) => ({
        activeProvider: state.activeProvider,
        activeModel: state.activeModel,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        systemPrompt: state.systemPrompt,
        providerConfigs: stripProviderSecrets(state.providerConfigs),
      }),
      migrate: (persistedState: any) => {
        const activeProvider = (persistedState?.activeProvider || "groq") as Provider;
        return {
          ...persistedState,
          activeProvider,
          activeModel: getValidModel(activeProvider, persistedState?.activeModel),
          providerConfigs: stripProviderSecrets(persistedState?.providerConfigs),
        };
      },
      onRehydrateStorage: () => (state) => {
        // Read secrets from sessionStorage to restore them in-memory
        const sessionSecrets = getSessionSecrets();
        if (state && Object.keys(sessionSecrets).length > 0) {
          const nextConfigs = { ...state.providerConfigs };
          Object.entries(sessionSecrets).forEach(([provider, secrets]) => {
            const p = provider as Provider;
            nextConfigs[p] = {
              ...(nextConfigs[p] || {}),
              ...secrets,
            } as ProviderConfig;
          });
          state.replaceProviderConfigs(nextConfigs);
        } else {
          state?.clearProviderApiKeys();
        }
        if (state) state.setActiveModel(getValidModel(state.activeProvider, state.activeModel));
      },
    }
  )
);
