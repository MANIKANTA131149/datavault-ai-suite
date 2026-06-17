import { getApiBaseUrl } from "@/lib/api-base";
import { useAuthStore } from "@/stores/auth-store";

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  dailyUsage?: {
    used: number;
    limit: number;
    percentage: number;
    warning: boolean;
  };
}

export type Provider =
  | "groq" | "openai" | "gemini" | "anthropic" | "bedrock"
  | "azure" | "cohere" | "mistral" | "together" | "ollama" | "huggingface" | "alibaba" | "querify";

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
  alibaba: `${getApiBaseUrl()}/llm/alibaba/chat`,
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
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    "X-AWS-Access-Key-Id": accessKeyId,
    "X-AWS-Secret-Access-Key": secretAccessKey,
    "X-AWS-Region": region,
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${getApiBaseUrl()}/llm/bedrock/chat`, {
    method: "POST",
    headers,
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
    dailyUsage: data.dailyUsage,
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
  const isAlibabaProxy = endpoint.endsWith("/llm/alibaba/chat");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...(isLocalHuggingFaceProxy || isAlibabaProxy
        ? { "X-Provider-Api-Key": apiKey }
        : { Authorization: `Bearer ${apiKey}` }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
  });

  if (!res.ok) {
    const text = await res.text();
    const providerHint = isLocalHuggingFaceProxy
      ? "Hugging Face router error. Make sure the backend was restarted and the model uses the full router ID, for example zai-org/GLM-5.1:together."
      : isAlibabaProxy
        ? "Alibaba DashScope router error."
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
  maxTokens = 2048,
  providerOptions: LLMProviderOptions = {}
): Promise<LLMResponse> {
  const allMessages = [{ role: "system", content: systemPrompt }, ...messages];

  if (provider === "querify") {
    return callBedrock(
      "free-bedrock-token",
      "free-bedrock-secret",
      "us-east-1",
      model,
      allMessages,
      temperature,
      maxTokens
    );
  }

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

// ─── Streaming (additive) ──────────────────────────────────────────────────
// Providers that expose a token stream we can read directly in the browser.
// Bedrock/querify and the backend proxies (huggingface/alibaba) are NOT here —
// callLLMStream gracefully no-ops to the non-streaming callLLM for them, so the
// existing default-tier behavior is unchanged.
const STREAMING_PROVIDERS = new Set<Provider>([
  "anthropic", "openai", "groq", "gemini", "mistral", "together",
]);

export function providerSupportsStreaming(provider: Provider): boolean {
  return STREAMING_PROVIDERS.has(provider);
}

// Parse an SSE byte stream line-by-line, invoking onEvent for each `data:` JSON.
async function consumeSSE(
  res: Response,
  onEvent: (json: any) => void
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep the trailing partial line
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try { onEvent(JSON.parse(payload)); } catch { /* ignore keep-alives / partials */ }
    }
  }
}

async function callAnthropicStream(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  systemPrompt: string,
  temperature: number,
  maxTokens: number,
  onToken?: (delta: string) => void
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
    body: JSON.stringify({ model, system: systemPrompt, messages: userMessages, temperature, max_tokens: maxTokens, stream: true }),
  });
  if (!res.ok) throw new Error(`Anthropic error (${res.status}): ${await res.text()}`);

  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;
  await consumeSSE(res, (ev) => {
    if (ev.type === "message_start") {
      inputTokens = ev.message?.usage?.input_tokens ?? inputTokens;
    } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
      const t = ev.delta.text || "";
      content += t;
      if (t) onToken?.(t);
    } else if (ev.type === "message_delta") {
      outputTokens = ev.usage?.output_tokens ?? outputTokens;
    }
  });
  return { content, inputTokens, outputTokens };
}

async function callOpenAICompatibleStream(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number,
  onToken?: (delta: string) => void
): Promise<LLMResponse> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true } }),
  });
  if (!res.ok) throw new Error(`Provider API error (${res.status}): ${await res.text()}`);

  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;
  await consumeSSE(res, (ev) => {
    const delta = ev.choices?.[0]?.delta?.content;
    if (delta) { content += delta; onToken?.(delta); }
    if (ev.usage) {
      inputTokens = ev.usage.prompt_tokens ?? inputTokens;
      outputTokens = ev.usage.completion_tokens ?? outputTokens;
    }
  });
  return { content, inputTokens, outputTokens };
}

/**
 * Streaming variant of callLLM. Same arguments plus an optional `onToken`
 * callback invoked with each text delta as it arrives. For providers that
 * can't stream in the browser (querify/bedrock proxy, cohere, ollama, etc.)
 * it transparently falls back to the non-streaming callLLM — onToken simply
 * isn't called, so callers behave exactly as before on those providers.
 */
export async function callLLMStream(
  provider: Provider,
  model: string,
  apiKey: string,
  messages: { role: string; content: string }[],
  systemPrompt: string,
  temperature = 0.1,
  maxTokens = 2048,
  providerOptions: LLMProviderOptions = {},
  onToken?: (delta: string) => void
): Promise<LLMResponse> {
  if (!providerSupportsStreaming(provider)) {
    return callLLM(provider, model, apiKey, messages, systemPrompt, temperature, maxTokens, providerOptions);
  }
  try {
    if (provider === "anthropic") {
      return await callAnthropicStream(apiKey, model, messages, systemPrompt, temperature, maxTokens, onToken);
    }
    const endpoint = PROVIDER_ENDPOINTS[provider];
    if (!endpoint) throw new Error(`Unknown provider: ${provider}`);
    const allMessages = [{ role: "system", content: systemPrompt }, ...messages];
    return await callOpenAICompatibleStream(endpoint, apiKey, model, allMessages, temperature, maxTokens, onToken);
  } catch (err) {
    // Streaming failed (CORS, unsupported, network) — never let that break the
    // agent: fall back to the proven non-streaming path.
    console.warn("[llm-client] streaming failed, falling back to non-streaming:", err);
    return callLLM(provider, model, apiKey, messages, systemPrompt, temperature, maxTokens, providerOptions);
  }
}

// ─── Native tool-use (additive) ─────────────────────────────────────────────
// A tool schema in the Anthropic Messages shape (also what we translate to
// Bedrock toolSpec and OpenAI function form on the way out).
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

// LLMResponse plus an optional structured tool call when the model chose one.
export interface LLMToolResponse extends LLMResponse {
  toolCall?: { name: string; args: Record<string, any> };
}

// Providers that support native function/tool calling through this client.
// querify + bedrock go through the Bedrock Converse proxy (toolConfig).
const NATIVE_TOOL_PROVIDERS = new Set<Provider>(["querify", "bedrock", "anthropic", "openai"]);

export function providerSupportsNativeTools(provider: Provider): boolean {
  return NATIVE_TOOL_PROVIDERS.has(provider);
}

async function callBedrockTools(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number,
  tools: ToolSchema[]
): Promise<LLMToolResponse> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    "X-AWS-Access-Key-Id": accessKeyId,
    "X-AWS-Secret-Access-Key": secretAccessKey,
    "X-AWS-Region": region,
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${getApiBaseUrl()}/llm/bedrock/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false, tools }),
  });
  if (!res.ok) throw new Error(`AWS Bedrock error (${res.status}): ${await res.text()}`);

  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  return {
    content: msg.content || "",
    toolCall: msg.toolCall,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    dailyUsage: data.dailyUsage,
  };
}

async function callAnthropicTools(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  systemPrompt: string,
  temperature: number,
  maxTokens: number,
  tools: ToolSchema[]
): Promise<LLMToolResponse> {
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
      model, system: systemPrompt, messages: userMessages, temperature, max_tokens: maxTokens,
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
      tool_choice: { type: "any" },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error (${res.status}): ${await res.text()}`);

  const data = await res.json();
  const blocks: any[] = data.content || [];
  const toolBlock = blocks.find((b) => b.type === "tool_use");
  const textBlock = blocks.find((b) => b.type === "text");
  return {
    content: textBlock?.text || "",
    toolCall: toolBlock ? { name: toolBlock.name, args: toolBlock.input || {} } : undefined,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

async function callOpenAITools(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number,
  tools: ToolSchema[]
): Promise<LLMToolResponse> {
  const res = await fetch(PROVIDER_ENDPOINTS.openai, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, messages, temperature, max_tokens: maxTokens,
      tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      tool_choice: "required",
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error (${res.status}): ${await res.text()}`);

  const data = await res.json();
  const message = data.choices?.[0]?.message || {};
  const call = message.tool_calls?.[0];
  let args: Record<string, any> = {};
  if (call?.function?.arguments) {
    try { args = JSON.parse(call.function.arguments); } catch { args = {}; }
  }
  return {
    content: message.content || "",
    toolCall: call ? { name: call.function.name, args } : undefined,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

/**
 * Tool-use variant of callLLM. The model must respond by calling exactly one of
 * the supplied tools; the chosen tool name + parsed args come back as `toolCall`.
 * Only used for providers in NATIVE_TOOL_PROVIDERS — callers must gate on
 * providerSupportsNativeTools() and keep the prompt-JSON path as the fallback.
 */
export async function callLLMTools(
  provider: Provider,
  model: string,
  apiKey: string,
  messages: { role: string; content: string }[],
  systemPrompt: string,
  tools: ToolSchema[],
  temperature = 0.1,
  maxTokens = 2048,
  providerOptions: LLMProviderOptions = {}
): Promise<LLMToolResponse> {
  const allMessages = [{ role: "system", content: systemPrompt }, ...messages];

  if (provider === "querify") {
    return callBedrockTools("free-bedrock-token", "free-bedrock-secret", "us-east-1", model, allMessages, temperature, maxTokens, tools);
  }
  if (provider === "bedrock") {
    if (!apiKey) throw new Error("AWS Bedrock access key is missing.");
    if (!providerOptions.secretAccessKey) throw new Error("AWS Bedrock secret access key is missing.");
    return callBedrockTools(apiKey, providerOptions.secretAccessKey, providerOptions.region || "us-east-1", model, allMessages, temperature, maxTokens, tools);
  }
  if (provider === "anthropic") {
    return callAnthropicTools(apiKey, model, messages, systemPrompt, temperature, maxTokens, tools);
  }
  if (provider === "openai") {
    return callOpenAITools(apiKey, model, allMessages, temperature, maxTokens, tools);
  }
  throw new Error(`Provider ${provider} does not support native tools`);
}
