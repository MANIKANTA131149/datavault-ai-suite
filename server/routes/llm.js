const express = require("express");
const crypto = require("crypto");

const router = express.Router();

const HUGGINGFACE_ROUTER_CHAT_URL = "https://router.huggingface.co/v1/chat/completions";
const BEDROCK_SERVICE = "bedrock";
const BEDROCK_DEFAULT_REGION = "us-east-1";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function getSignatureKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function getAmzDates(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function toBedrockPrompt(messages) {
  return messages
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n\n") + "\n\nAssistant:";
}

function splitSystemMessages(messages) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .filter(Boolean)
    .join("\n\n");
  const chatMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));
  return { system, chatMessages };
}

function buildNovaInvokePayload(messages, temperature = 0.1, maxTokens = 1024) {
  const { system, chatMessages } = splitSystemMessages(messages);
  return {
    operation: "invoke",
    body: {
      ...(system ? { system: [{ text: system }] } : {}),
      messages: chatMessages.map((message) => ({
        role: message.role,
        content: [{ text: message.content }],
      })),
      inferenceConfig: {
        max_new_tokens: maxTokens,
        temperature,
      },
    },
    parser: (data) => ({
      content: data.output?.message?.content?.[0]?.text || "",
      inputTokens: data.usage?.inputTokens || 0,
      outputTokens: data.usage?.outputTokens || 0,
    }),
  };
}

function buildConversePayload(messages, temperature = 0.1, maxTokens = 1024) {
  const { system, chatMessages } = splitSystemMessages(messages);
  return {
    body: {
      messages: chatMessages.map((message) => ({
        role: message.role,
        content: [{ text: message.content }],
      })),
      ...(system ? { system: [{ text: system }] } : {}),
      inferenceConfig: {
        maxTokens,
        temperature,
      },
    },
    parser: (data) => ({
      content: data.output?.message?.content?.[0]?.text || "",
      inputTokens: data.usage?.inputTokens || 0,
      outputTokens: data.usage?.outputTokens || 0,
    }),
  };
}

function buildBedrockPayload(model, messages, temperature = 0.1, maxTokens = 1024) {
  const { system, chatMessages } = splitSystemMessages(messages);
  const lowerModel = model.toLowerCase();

  if (lowerModel.includes("amazon.nova")) {
    return buildNovaInvokePayload(messages, temperature, maxTokens);
  }

  if (lowerModel.includes("anthropic.claude")) {
    return {
      operation: "invoke",
      body: {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        temperature,
        ...(system ? { system } : {}),
        messages: chatMessages.map((message) => ({
          role: message.role,
          content: [{ type: "text", text: message.content }],
        })),
      },
      parser: (data) => ({
        content: data.content?.[0]?.text || "",
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      }),
    };
  }

  if (lowerModel.includes("amazon.titan")) {
    return {
      operation: "invoke",
      body: {
        inputText: [system, toBedrockPrompt(chatMessages)].filter(Boolean).join("\n\n"),
        textGenerationConfig: {
          maxTokenCount: maxTokens,
          temperature,
        },
      },
      parser: (data) => ({
        content: data.results?.[0]?.outputText || "",
        inputTokens: data.inputTextTokenCount || 0,
        outputTokens: data.results?.[0]?.tokenCount || 0,
      }),
    };
  }

  if (lowerModel.includes("meta.llama")) {
    return {
      operation: "invoke",
      body: {
        prompt: [system, toBedrockPrompt(chatMessages)].filter(Boolean).join("\n\n"),
        max_gen_len: maxTokens,
        temperature,
      },
      parser: (data) => ({
        content: data.generation || "",
        inputTokens: data.prompt_token_count || 0,
        outputTokens: data.generation_token_count || 0,
      }),
    };
  }

  if (lowerModel.includes("mistral")) {
    return {
      operation: "invoke",
      body: {
        prompt: [system, toBedrockPrompt(chatMessages)].filter(Boolean).join("\n\n"),
        max_tokens: maxTokens,
        temperature,
      },
      parser: (data) => ({
        content: data.outputs?.[0]?.text || "",
        inputTokens: 0,
        outputTokens: 0,
      }),
    };
  }

  if (lowerModel.includes("cohere.command")) {
    const lastMessage = chatMessages[chatMessages.length - 1]?.content || "";
    return {
      operation: "invoke",
      body: {
        message: lastMessage,
        chat_history: chatMessages.slice(0, -1).map((message) => ({
          role: message.role === "assistant" ? "CHATBOT" : "USER",
          message: message.content,
        })),
        max_tokens: maxTokens,
        temperature,
      },
      parser: (data) => ({
        content: data.text || "",
        inputTokens: data.meta?.billed_units?.input_tokens || 0,
        outputTokens: data.meta?.billed_units?.output_tokens || 0,
      }),
    };
  }

  return {
    ...buildConversePayload(messages, temperature, maxTokens),
    operation: "converse",
  };
}

function getBedrockRuntimePath(model, operation) {
  const encodedModel = encodeURIComponent(model);
  return operation === "converse"
    ? `/model/${encodedModel}/converse`
    : `/model/${encodedModel}/invoke`;
}

function getCanonicalPath(pathname) {
  return pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function signedBedrockInvoke({ accessKeyId, secretAccessKey, region, model, body, operation = "invoke" }) {
  const endpoint = new URL(`https://bedrock-runtime.${region}.amazonaws.com${getBedrockRuntimePath(model, operation)}`);
  const payload = JSON.stringify(body);
  const payloadHash = sha256Hex(payload);
  const { amzDate, dateStamp } = getAmzDates();

  const canonicalHeaders = [
    ["content-type", "application/json"],
    ["host", endpoint.host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
  ];
  const signedHeaders = canonicalHeaders.map(([key]) => key).join(";");
  const canonicalRequest = [
    "POST",
    getCanonicalPath(endpoint.pathname),
    "",
    canonicalHeaders.map(([key, value]) => `${key}:${value}`).join("\n") + "\n",
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${BEDROCK_SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, BEDROCK_SERVICE);
  const signature = hmac(signingKey, stringToSign, "hex");

  return fetch(endpoint.href, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Amz-Content-Sha256": payloadHash,
      "X-Amz-Date": amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: payload,
  });
}

router.post("/huggingface/chat", async (req, res) => {
  const apiKey = req.header("x-provider-api-key");
  if (!apiKey) {
    return res.status(400).json({ error: "Hugging Face API key is missing" });
  }

  const { model, messages, temperature, max_tokens, stream = false } = req.body || {};
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Model and messages are required" });
  }

  try {
    const upstream = await fetch(HUGGINGFACE_ROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
        stream,
      }),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.type(upstream.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Hugging Face router request failed",
    });
  }
});

router.post("/bedrock/chat", async (req, res) => {
  const accessKeyId = req.header("x-aws-access-key-id");
  const secretAccessKey = req.header("x-aws-secret-access-key");
  const region = req.header("x-aws-region") || BEDROCK_DEFAULT_REGION;

  if (!accessKeyId) {
    return res.status(400).json({ error: "AWS access key ID is missing" });
  }
  if (!secretAccessKey) {
    return res.status(400).json({ error: "AWS secret access key is missing" });
  }

  const { model, messages, temperature, max_tokens } = req.body || {};
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Model and messages are required" });
  }

  try {
    const { body, operation, parser } = buildBedrockPayload(model, messages, temperature, max_tokens);
    const upstream = await signedBedrockInvoke({
      accessKeyId,
      secretAccessKey,
      region,
      model,
      body,
      operation,
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      res.status(upstream.status);
      res.type(upstream.headers.get("content-type") || "application/json");
      return res.send(text);
    }

    const data = JSON.parse(text || "{}");
    const parsed = parser(data);
    return res.json({
      choices: [{ message: { role: "assistant", content: parsed.content } }],
      usage: {
        prompt_tokens: parsed.inputTokens,
        completion_tokens: parsed.outputTokens,
      },
    });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "AWS Bedrock request failed",
    });
  }
});

module.exports = router;
