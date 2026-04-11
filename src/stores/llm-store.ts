import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Provider } from "@/lib/llm-client";

export const PROVIDER_MODELS: Record<Provider, string[]> = {
  groq: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"],
  bedrock: ["anthropic.claude-3-5-sonnet", "amazon.titan-text-express", "meta.llama3-70b"],
  azure: ["gpt-4o", "gpt-4-turbo"],
  cohere: ["command-r-plus", "command-r"],
  mistral: ["mistral-large", "mistral-medium", "open-mistral-7b"],
  together: ["meta-llama/Llama-3-70b", "mistralai/Mixtral-8x7B"],
  ollama: ["llama3", "mistral", "gemma"],
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  groq: "Groq",
  openai: "OpenAI",
  anthropic: "Anthropic",
  bedrock: "AWS Bedrock",
  azure: "Azure OpenAI",
  cohere: "Cohere",
  mistral: "Mistral",
  together: "Together AI",
  ollama: "Ollama",
};

interface ProviderConfig {
  apiKey: string;
  model: string;
  enabled: boolean;
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
  getApiKey: (provider: Provider) => string;
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
          activeModel: existing || models[0],
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
      getApiKey: (provider) => get().providerConfigs[provider]?.apiKey || "",
    }),
    { name: "datavault-llm" }
  )
);
