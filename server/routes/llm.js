const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { verifyToken } = require("@clerk/backend");
const { getDb } = require("../db");
const { authMiddleware, JWT_SECRET } = require("../middleware/auth");

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const {
  getCurrentDailyUsage,
  incrementDailyUsage,
  checkDailyLimit,
} = require("../lib/daily-token-tracker");
const { getPlanContext } = require("../lib/plans");

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

async function signedBedrockInvoke({ accessKeyId, secretAccessKey, sessionToken, region, model, body, operation = "invoke" }) {
  // Permanent IAM credentials (starting with AKIA) must never include a session token.
  // Including an invalid/expired or empty session token with permanent keys causes AWS to return a 403.
  const isPermanentCred = accessKeyId && accessKeyId.startsWith("AKIA");
  const activeSessionToken = isPermanentCred ? undefined : sessionToken;

  const endpoint = new URL(`https://bedrock-runtime.${region}.amazonaws.com${getBedrockRuntimePath(model, operation)}`);
  const payload = JSON.stringify(body);
  const payloadHash = sha256Hex(payload);
  const { amzDate, dateStamp } = getAmzDates();

  const canonicalHeaders = [
    ["content-type", "application/json"],
    ["host", endpoint.host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
    ...(activeSessionToken ? [["x-amz-security-token", activeSessionToken]] : []),
  ];
  canonicalHeaders.sort((a, b) => a[0].localeCompare(b[0]));

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

  const headers = {
    "Content-Type": "application/json",
    "X-Amz-Content-Sha256": payloadHash,
    "X-Amz-Date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (activeSessionToken) {
    headers["X-Amz-Security-Token"] = activeSessionToken;
  }

  return fetch(endpoint.href, {
    method: "POST",
    headers,
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

// Optional auth: returns the Clerk user id when a valid Clerk session token is
// present, else null. Auth migrated to Clerk, so this verifies the token the
// same way authMiddleware does (Clerk `verifyToken`, user id in `sub`) instead
// of the legacy custom JWT — a Clerk token never validated against JWT_SECRET,
// which previously caused a false 401 on free-tier Bedrock daily-limit checks.
async function getOptionalUserId(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
      return payload.sub;
    } catch (e) {
      // Ignore token verification errors — this check is optional.
    }
  }
  return null;
}

router.get("/token-usage", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const usage = await getCurrentDailyUsage(db, req.userId);
    res.json(usage);
  } catch (err) {
    console.error("Failed to fetch token usage:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bedrock/chat", async (req, res) => {
  const { model, messages, temperature, max_tokens } = req.body || {};
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Model and messages are required" });
  }

  // Platform-served default Querify models: use admin AWS creds + enforce the daily free limit.
  // Keep in sync with the querify list in src/stores/llm-store.ts and history.js/plans.js.
  const isFreeBedrockModel = [
    "amazon.nova-pro-v1:0",
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "google.gemma-3-12b-it",
    "openai.gpt-oss-120b-1:0",
    "meta.llama3-3-70b-instruct-v1:0",
    "amazon.nova-premier-v1:0",
    "deepseek.v3.2",
    "deepseek.r1-v1:0",
    "qwen.qwen3-next-80b-a3b",
    "nvidia.nemotron-super-3-120b",
    "moonshot.kimi-k2-thinking",
  ].includes(model);
  let isFreeUser = true;
  let userId = null;

  try {
    const db = await getDb();
    userId = await getOptionalUserId(req);
    if (userId) {
      const planContext = await getPlanContext(db, userId);
      if (planContext && planContext.plan.tier !== "free") {
        isFreeUser = false;
      }
    }
  } catch (dbErr) {
    console.error("Failed to load user plan context for limit check:", dbErr);
  }

  // If this is a free user executing a default free Bedrock model, enforce daily limit checks
  if (isFreeBedrockModel && isFreeUser) {
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized — missing token required for daily limit tracking" });
    }
    try {
      const db = await getDb();
      const limitCheck = await checkDailyLimit(db, userId);
      if (!limitCheck.allowed) {
        const errorMsg = limitCheck.reason === "queries"
          ? "Daily free query limit of 25 queries has been exhausted. Please upgrade your plan for higher limits."
          : "Daily free token limit of 200k tokens has been exhausted. Please upgrade your plan for higher limits.";
        return res.status(403).json({
          error: errorMsg,
          code: "DAILY_TOKEN_LIMIT_EXHAUSTED",
        });
      }
    } catch (limitErr) {
      console.error("Limit checking failed:", limitErr);
    }
  }

  // Load access key details
  let accessKeyId = req.header("x-aws-access-key-id");
  let secretAccessKey = req.header("x-aws-secret-access-key");
  let region = req.header("x-aws-region") || BEDROCK_DEFAULT_REGION;
  let sessionToken = req.header("x-aws-session-token");

  // For free default Bedrock models, use system configured admin credentials if user settings are placeholders/missing
  if (isFreeBedrockModel && (!accessKeyId || accessKeyId === "free-bedrock-token")) {
    accessKeyId = process.env.VITE_AWS_ACCESS_KEY_ID;
    secretAccessKey = process.env.VITE_AWS_SECRET_ACCESS_KEY;
    region = process.env.VITE_AWS_REGION || BEDROCK_DEFAULT_REGION;
    sessionToken = process.env.AWS_SESSION_TOKEN;
  }

  if (!accessKeyId || accessKeyId === "free-bedrock-token") {
    return res.status(400).json({ error: "AWS access key ID is missing" });
  }
  if (!secretAccessKey || secretAccessKey === "free-bedrock-secret") {
    return res.status(400).json({ error: "AWS secret access key is missing" });
  }

  try {
    const { body, operation, parser } = buildBedrockPayload(model, messages, temperature, max_tokens);
    const upstream = await signedBedrockInvoke({
      accessKeyId,
      secretAccessKey,
      sessionToken,
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

    // Track usage if it's a free user utilizing Nova models
    let dailyUsage = null;
    if (isFreeBedrockModel && isFreeUser && userId) {
      try {
        const db = await getDb();
        await incrementDailyUsage(db, userId, model, parsed.inputTokens, parsed.outputTokens);
        const usage = await getCurrentDailyUsage(db, userId);
        dailyUsage = {
          used: usage.tokensUsed,
          limit: usage.limit,
          percentage: usage.percentage,
          warning: usage.tokensUsed >= 150000 || usage.queriesUsed >= 18,
        };
      } catch (usageLogErr) {
        console.error("Failed to log daily token usage:", usageLogErr);
      }
    }

    return res.json({
      choices: [{ message: { role: "assistant", content: parsed.content } }],
      usage: {
        prompt_tokens: parsed.inputTokens,
        completion_tokens: parsed.outputTokens,
      },
      ...(dailyUsage ? { dailyUsage } : {}),
    });
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "AWS Bedrock request failed",
    });
  }
});

router.post("/alibaba/chat", async (req, res) => {
  const apiKey = req.header("x-provider-api-key");
  if (!apiKey) {
    return res.status(400).json({ error: "Alibaba DashScope API key is missing" });
  }

  const { model, messages, temperature, max_tokens, stream = false } = req.body || {};
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Model and messages are required" });
  }

  try {
    const upstream = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", {
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
      error: error instanceof Error ? error.message : "Alibaba DashScope request failed",
    });
  }
});

module.exports = router;
// Named exports so server-side features (public API, scheduler) can invoke
// Bedrock with the platform's admin credentials without duplicating signing.
module.exports.signedBedrockInvoke = signedBedrockInvoke;
module.exports.buildBedrockPayload = buildBedrockPayload;
