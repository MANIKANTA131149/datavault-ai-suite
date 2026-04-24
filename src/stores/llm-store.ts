import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Provider } from "@/lib/llm-client";

export const PROVIDER_MODELS: Record<Provider, string[]> = {
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
};

export const PROVIDER_LABELS: Record<Provider, string> = {
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
}

function stripProviderSecrets(configs: Partial<Record<Provider, ProviderConfig>> = {}) {
  return Object.fromEntries(
    Object.entries(configs).map(([provider, config]) => {
      const { apiKey: _apiKey, secretAccessKey: _secretAccessKey, ...safeConfig } = config || {};
      return [provider, safeConfig];
    })
  ) as Partial<Record<Provider, ProviderConfig>>;
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
        set({
          activeProvider: provider,
          activeModel: getValidModel(provider, existing) || models[0],
        });
      },
      setActiveModel: (model) => set({ activeModel: model }),
      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      setProviderConfig: (provider, config) =>
        set((state) => ({
          providerConfigs: {
            ...state.providerConfigs,
            [provider]: { ...state.providerConfigs[provider], ...config } as ProviderConfig,
          },
        })),
      replaceProviderConfigs: (providerConfigs) => set({ providerConfigs }),
      clearProviderConfigs: () => set({ providerConfigs: {} }),
      clearProviderApiKeys: () =>
        set((state) => ({
          providerConfigs: stripProviderSecrets(state.providerConfigs),
        })),
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
        state?.clearProviderApiKeys();
        if (state) state.setActiveModel(getValidModel(state.activeProvider, state.activeModel));
      },
    }
  )
);
