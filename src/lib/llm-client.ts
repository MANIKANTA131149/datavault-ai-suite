import { getApiBaseUrl } from "@/lib/api-base";

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export type Provider =
  | "groq" | "openai" | "gemini" | "anthropic" | "bedrock"
  | "azure" | "cohere" | "mistral" | "together" | "ollama" | "huggingface";

export interface LLMProviderOptions {
  secretAccessKey?: string;
  region?: string;
}

const PROVIDER_ENDPOINTS: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  together: "https://api.together.xyz/v1/chat/completions",
  huggingface: `${getApiBaseUrl()}/llm/huggingface/chat`,
};

async function callBedrock(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number
): Promise<LLMResponse> {
  const res = await fetch(`${getApiBaseUrl()}/llm/bedrock/chat`, {
    method: "POST",
    headers: {
      "X-AWS-Access-Key-Id": accessKeyId,
      "X-AWS-Secret-Access-Key": secretAccessKey,
      "X-AWS-Region": region,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AWS Bedrock error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number
): Promise<LLMResponse> {
  const isLocalHuggingFaceProxy = endpoint.endsWith("/llm/huggingface/chat");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...(isLocalHuggingFaceProxy ? { "X-Provider-Api-Key": apiKey } : { Authorization: `Bearer ${apiKey}` }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
  });

  if (!res.ok) {
    const text = await res.text();
    const providerHint = isLocalHuggingFaceProxy
      ? "Hugging Face router error. Make sure the backend was restarted and the model uses the full router ID, for example zai-org/GLM-5.1:together."
      : "Provider API error.";
    throw new Error(`${providerHint} (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  systemPrompt: string,
  temperature: number,
  maxTokens: number
): Promise<LLMResponse> {
  const userMessages = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: userMessages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    content: data.content?.[0]?.text || "",
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

async function callCohere(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number
): Promise<LLMResponse> {
  const lastMsg = messages[messages.length - 1]?.content || "";
  const chatHistory = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "CHATBOT" : "USER",
    message: m.content,
  }));

  const res = await fetch("https://api.cohere.ai/v1/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      message: lastMsg,
      chat_history: chatHistory,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cohere error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    content: data.text || "",
    inputTokens: data.meta?.tokens?.input_tokens || 0,
    outputTokens: data.meta?.tokens?.output_tokens || 0,
  };
}

async function callOllama(
  model: string,
  messages: { role: string; content: string }[],
  temperature: number
): Promise<LLMResponse> {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature } }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    content: data.message?.content || "",
    inputTokens: data.prompt_eval_count || 0,
    outputTokens: data.eval_count || 0,
  };
}

export async function callLLM(
  provider: Provider,
  model: string,
  apiKey: string,
  messages: { role: string; content: string }[],
  systemPrompt: string,
  temperature = 0.1,
  maxTokens = 1024,
  providerOptions: LLMProviderOptions = {}
): Promise<LLMResponse> {
  const allMessages = [{ role: "system", content: systemPrompt }, ...messages];

  if (provider === "bedrock") {
    if (!apiKey) throw new Error("AWS Bedrock access key is missing.");
    if (!providerOptions.secretAccessKey) throw new Error("AWS Bedrock secret access key is missing.");
    return callBedrock(
      apiKey,
      providerOptions.secretAccessKey,
      providerOptions.region || "us-east-1",
      model,
      allMessages,
      temperature,
      maxTokens
    );
  }

  if (provider === "azure") {
    throw new Error("Azure OpenAI requires resource name and deployment configuration. Please configure in Settings.");
  }

  if (provider === "anthropic") {
    return callAnthropic(apiKey, model, messages, systemPrompt, temperature, maxTokens);
  }

  if (provider === "cohere") {
    return callCohere(apiKey, model, allMessages, temperature, maxTokens);
  }

  if (provider === "ollama") {
    return callOllama(model, allMessages, temperature);
  }

  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) throw new Error(`Unknown provider: ${provider}`);
  return callOpenAICompatible(endpoint, apiKey, model, allMessages, temperature, maxTokens);
}

export async function testProviderConnection(
  provider: Provider,
  model: string,
  apiKey: string,
  providerOptions: LLMProviderOptions = {}
): Promise<LLMResponse> {
  return callLLM(
    provider,
    model,
    apiKey,
    [{ role: "user", content: "Reply with the single word ok." }],
    "You are a connection health check.",
    0,
    8,
    providerOptions
  );
}
