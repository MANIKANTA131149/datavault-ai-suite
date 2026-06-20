const express = require("express");
const crypto = require("crypto");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const {
  listLiveTables,
  getLiveSchema,
  previewLiveTable,
  executeLiveOperation,
  executeLiveSql,
} = require("../lib/live-db");
const { buildSqlFromOperation } = require("../lib/sql-builder");
const { SQL_NATIVE_DB_TYPES, validateReadOnlySql } = require("../lib/sql-validator");

const router = express.Router();

// ─── Supported Bedrock Signing Logic for Public Proxy ──────────────────────────
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

// ─── Per-deployment daily token budget ──────────────────────────────────────
// Public chat endpoints spend the deployer's LLM credentials with no logged-in
// user to rate-limit on. We cap total tokens per deployment per UTC day in a
// dedicated collection. Default is generous but finite; owners can override via
// snapshot.dailyTokenCap. A cap of 0 / null is treated as the default, never
// "unlimited" — public spend always has a ceiling.
const DEFAULT_PUBLIC_DAILY_TOKEN_CAP = 500000; // 500k tokens / deployment / day

function deploymentDayString() {
  return new Date().toISOString().split("T")[0]; // UTC YYYY-MM-DD
}

function resolveDeploymentTokenCap(snapshot) {
  const raw = Number(snapshot && snapshot.dailyTokenCap);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PUBLIC_DAILY_TOKEN_CAP;
}

// Returns { allowed, tokensUsed, cap }. Read-only check before the upstream call.
async function checkDeploymentTokenBudget(db, deployId, snapshot) {
  const cap = resolveDeploymentTokenCap(snapshot);
  const dateStr = deploymentDayString();
  const log = await db.collection("deployment_token_logs").findOne({ deployId, dateStr });
  const tokensUsed = log ? log.tokensUsed || 0 : 0;
  return { allowed: tokensUsed < cap, tokensUsed, cap };
}

// Records token spend after an upstream call. Fire-and-forget safe.
async function recordDeploymentTokens(db, deployId, promptTokens, completionTokens) {
  const total = (Number(promptTokens) || 0) + (Number(completionTokens) || 0);
  if (total <= 0) return;
  await db.collection("deployment_token_logs").updateOne(
    { deployId, dateStr: deploymentDayString() },
    {
      $inc: { tokensUsed: total, requests: 1 },
      $setOnInsert: { createdAt: new Date().toISOString() },
    },
    { upsert: true }
  );
}

// Helper to scrub API keys from returning back to client
function sanitizeSnapshot(snapshot) {
  if (!snapshot) return {};
  const scrubbedProviderConfigs = {};
  if (snapshot.providerConfigs) {
    for (const [provider, config] of Object.entries(snapshot.providerConfigs)) {
      if (config) {
        const { apiKey, secretAccessKey, ...rest } = config;
        scrubbedProviderConfigs[provider] = rest;
      }
    }
  }

  return {
    ...snapshot,
    providerConfigs: scrubbedProviderConfigs,
    connectionSnapshot: snapshot.connectionSnapshot ? {
      ...snapshot.connectionSnapshot,
      config: undefined, // completely scrub connection credentials
    } : undefined,
  };
}

// ─── AUTHENTICATED ROUTES ──────────────────────────────────────────────────────

// ─── GET /api/deployments — load user deployments ──────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const list = await db
      .collection("deployments")
      .find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      deployments: list.map((item) => ({
        ...item,
        snapshot: sanitizeSnapshot(item.snapshot),
      })),
    });
  } catch (err) {
    console.error("List deployments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/deployments — create a deployment snapshot ───────────────────────
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, description, snapshot } = req.body;
    if (!name || !snapshot) {
      return res.status(400).json({ error: "Name and snapshot config are required" });
    }

    const db = await getDb();

    // Enrich snapshot with dataset or connection metadata
    const enrichedSnapshot = { ...snapshot };
    const sourceId = snapshot.selectedDatasetId;

    if (sourceId) {
      if (sourceId.startsWith("conn:")) {
        const connId = sourceId.slice(5);
        const connection = ObjectId.isValid(connId)
          ? await db
              .collection("connections")
              .findOne({ _id: new ObjectId(connId), userId: req.userId })
          : null;
        if (connection) {
          enrichedSnapshot.sourceType = "connection";
          enrichedSnapshot.connectionSnapshot = {
            name: connection.name,
            dbType: connection.dbType,
            config: connection.config, // stored in secure snapshot in MongoDB
          };
        }
      } else {
        const dataset = await db
          .collection("datasets")
          .findOne({ _id: sourceId, userId: req.userId });
        if (dataset) {
          enrichedSnapshot.sourceType = "dataset";
          enrichedSnapshot.datasetSnapshot = {
            fileName: dataset.fileName,
            fileType: dataset.fileType,
            sheetNames: dataset.sheetNames,
            rowCounts: dataset.rowCounts,
            columnCounts: dataset.columnCounts,
            displayName: dataset.displayName,
          };
        }
      }
    }

    const deployId = crypto.randomUUID();
    const doc = {
      _id: deployId,
      userId: req.userId,
      name: name.trim(),
      description: description?.trim() || "",
      status: "active",
      statusReason: "",
      chatsCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      snapshot: enrichedSnapshot,
    };

    await db.collection("deployments").insertOne(doc);

    res.status(201).json({
      success: true,
      deployment: {
        ...doc,
        snapshot: sanitizeSnapshot(doc.snapshot),
      },
    });
  } catch (err) {
    console.error("Create deployment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /api/deployments/:id — edit deployment metadata ───────────────────────
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;
    const db = await getDb();

    const result = await db.collection("deployments").updateOne(
      { _id: req.params.id, userId: req.userId },
      {
        $set: {
          ...(name && { name: name.trim() }),
          ...(description !== undefined && { description: description.trim() }),
          updatedAt: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Deployment not found" });
    }

    const doc = await db.collection("deployments").findOne({ _id: req.params.id });
    res.json({
      success: true,
      deployment: {
        ...doc,
        snapshot: sanitizeSnapshot(doc.snapshot),
      },
    });
  } catch (err) {
    console.error("Update deployment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/deployments/:id/redeploy — update/re-snapshot deployment ────────
router.post("/:id/redeploy", authMiddleware, async (req, res) => {
  try {
    const { snapshot } = req.body;
    if (!snapshot) {
      return res.status(400).json({ error: "Snapshot config is required" });
    }

    const db = await getDb();
    const existing = await db
      .collection("deployments")
      .findOne({ _id: req.params.id, userId: req.userId });

    if (!existing) {
      return res.status(404).json({ error: "Deployment not found" });
    }

    // Enrich snapshot with dataset or connection metadata
    const enrichedSnapshot = { ...snapshot };
    const sourceId = snapshot.selectedDatasetId;

    if (sourceId) {
      if (sourceId.startsWith("conn:")) {
        const connId = sourceId.slice(5);
        const connection = ObjectId.isValid(connId)
          ? await db
              .collection("connections")
              .findOne({ _id: new ObjectId(connId), userId: req.userId })
          : null;
        if (connection) {
          enrichedSnapshot.sourceType = "connection";
          enrichedSnapshot.connectionSnapshot = {
            name: connection.name,
            dbType: connection.dbType,
            config: connection.config,
          };
        }
      } else {
        const dataset = await db
          .collection("datasets")
          .findOne({ _id: sourceId, userId: req.userId });
        if (dataset) {
          enrichedSnapshot.sourceType = "dataset";
          enrichedSnapshot.datasetSnapshot = {
            fileName: dataset.fileName,
            fileType: dataset.fileType,
            sheetNames: dataset.sheetNames,
            rowCounts: dataset.rowCounts,
            columnCounts: dataset.columnCounts,
            displayName: dataset.displayName,
          };
        }
      }
    }

    await db.collection("deployments").updateOne(
      { _id: req.params.id },
      {
        $set: {
          status: "active",
          statusReason: "",
          snapshot: enrichedSnapshot,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    const doc = await db.collection("deployments").findOne({ _id: req.params.id });

    res.json({
      success: true,
      deployment: {
        ...doc,
        snapshot: sanitizeSnapshot(doc.snapshot),
      },
    });
  } catch (err) {
    console.error("Redeploy error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /api/deployments/:id — delete deployment ───────────────────────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const result = await db
      .collection("deployments")
      .deleteOne({ _id: req.params.id, userId: req.userId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Deployment not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Delete deployment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/deployments/check-dependency — check before delete ────────────────
router.get("/check-dependency", authMiddleware, async (req, res) => {
  try {
    const { type, id } = req.query;
    if (!type || !id) {
      return res.status(400).json({ error: "Type and id are required query params" });
    }

    const db = await getDb();
    const searchId = type === "connection" ? `conn:${id}` : id;

    // Find active or warning deployments using this resource
    const activeDeployments = await db
      .collection("deployments")
      .find({
        userId: req.userId,
        "snapshot.selectedDatasetId": searchId,
        status: { $in: ["active", "warning"] },
      })
      .project({ _id: 1, name: 1, status: 1 })
      .toArray();

    res.json({
      inUse: activeDeployments.length > 0,
      deployments: activeDeployments,
    });
  } catch (err) {
    console.error("Check dependency error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUBLIC ANONYMOUS ROUTERS ──────────────────────────────────────────────────

// ─── GET /api/deployments/public/:id — load shared chatbot details ─────────────
router.get("/public/:id", async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection("deployments").findOne({ _id: req.params.id });
    if (!doc) {
      return res.status(404).json({ error: "Deployment not found" });
    }

    // Track page views separately from actual chats. chatsCount is incremented
    // per real chat message in the /chat handler, not on every page load.
    await db.collection("deployments").updateOne(
      { _id: req.params.id },
      { $inc: { viewsCount: 1 } }
    );

    res.json({
      _id: doc._id,
      name: doc.name,
      description: doc.description,
      status: doc.status,
      statusReason: doc.statusReason,
      createdAt: doc.createdAt,
      snapshot: sanitizeSnapshot(doc.snapshot),
    });
  } catch (err) {
    console.error("Load public deployment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/deployments/public/:id/dataset-data/:datasetId — dataset proxy ────
router.get("/public/:id/dataset-data/:datasetId", async (req, res) => {
  try {
    const db = await getDb();
    // Validate deployment exists and uses this datasetId
    const deployment = await db.collection("deployments").findOne({ _id: req.params.id });
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });

    if (deployment.snapshot.selectedDatasetId !== req.params.datasetId) {
      return res.status(403).json({ error: "Unauthorized access to dataset" });
    }

    const dataset = await db
      .collection("datasets")
      .findOne({ _id: req.params.datasetId }, { projection: { fileData: 1 } });

    if (!dataset) return res.status(404).json({ error: "Dataset not found" });
    res.json(dataset.fileData);
  } catch (err) {
    console.error("Public dataset data error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/deployments/public/:id/chat — LLM proxy ─────────────────────────
router.post("/public/:id/chat", async (req, res) => {
  try {
    const db = await getDb();
    const deployment = await db.collection("deployments").findOne({ _id: req.params.id });
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });

    // Kill-switch: a deployment the owner disabled/broke must not spend their
    // LLM credentials. (The /execute sibling already enforced this; /chat did not.)
    if (deployment.status !== "active") {
      return res.status(403).json({
        error: deployment.statusReason || "This chat has been disabled by its owner.",
      });
    }

    const snapshot = deployment.snapshot;
    const provider = snapshot.activeProvider;
    const model = snapshot.activeModel;

    const providerConfig = snapshot.providerConfigs?.[provider];
    if (!providerConfig) {
      return res.status(400).json({ error: `Provider ${provider} is not configured in snapshot` });
    }

    const { messages, temperature = 0.1, max_tokens = 1024 } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // Per-deployment daily token budget: bounds public spend even when the
    // per-IP rate limit is evaded by distributed callers.
    const budget = await checkDeploymentTokenBudget(db, req.params.id, snapshot);
    if (!budget.allowed) {
      return res.status(429).json({
        error: "This chat has reached its daily usage limit. Please try again tomorrow.",
        code: "DEPLOYMENT_DAILY_LIMIT_REACHED",
      });
    }

    // Count an actual chat message (page views are tracked separately as viewsCount).
    db.collection("deployments")
      .updateOne({ _id: req.params.id }, { $inc: { chatsCount: 1 } })
      .catch(() => {});

    // Call upstream provider based on snapshotted key
    if (provider === "bedrock") {
      const accessKeyId = providerConfig.apiKey;
      const secretAccessKey = providerConfig.secretAccessKey;
      const region = providerConfig.region || BEDROCK_DEFAULT_REGION;

      if (!accessKeyId || !secretAccessKey) {
        return res.status(400).json({ error: "AWS Bedrock credentials are incomplete in snapshot" });
      }

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
        return res.send(text);
      }

      const data = JSON.parse(text || "{}");
      const parsed = parser(data);
      await recordDeploymentTokens(db, req.params.id, parsed.inputTokens, parsed.outputTokens);
      return res.json({
        choices: [{ message: { role: "assistant", content: parsed.content } }],
        usage: {
          prompt_tokens: parsed.inputTokens,
          completion_tokens: parsed.outputTokens,
        },
      });
    }

    // OpenAI Compatible endpoints
    const PROVIDER_ENDPOINTS = {
      groq: "https://api.groq.com/openai/v1/chat/completions",
      openai: "https://api.openai.com/v1/chat/completions",
      gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      mistral: "https://api.mistral.ai/v1/chat/completions",
      together: "https://api.together.xyz/v1/chat/completions",
      huggingface: HUGGINGFACE_ROUTER_CHAT_URL,
      alibaba: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    };

    let endpoint = PROVIDER_ENDPOINTS[provider];
    const apiKey = providerConfig.apiKey;

    if (provider === "anthropic") {
      endpoint = "https://api.anthropic.com/v1/messages";
      const systemMessages = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const userMessages = messages.filter((m) => m.role !== "system").map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-api-key": apiKey || "",
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          system: systemMessages || undefined,
          messages: userMessages,
          temperature,
          max_tokens,
        }),
      });

      const text = await upstream.text();
      if (!upstream.ok) {
        res.status(upstream.status);
        return res.send(text);
      }

      const data = JSON.parse(text || "{}");
      await recordDeploymentTokens(db, req.params.id, data.usage?.input_tokens, data.usage?.output_tokens);
      return res.json({
        choices: [{ message: { role: "assistant", content: data.content?.[0]?.text || "" } }],
        usage: {
          prompt_tokens: data.usage?.input_tokens || 0,
          completion_tokens: data.usage?.output_tokens || 0,
        },
      });
    }

    if (provider === "cohere") {
      endpoint = "https://api.cohere.ai/v1/chat";
      const lastMsg = messages[messages.length - 1]?.content || "";
      const chatHistory = messages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "CHATBOT" : "USER",
        message: m.content,
      }));

      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          message: lastMsg,
          chat_history: chatHistory,
          temperature,
          max_tokens,
        }),
      });

      const text = await upstream.text();
      if (!upstream.ok) {
        res.status(upstream.status);
        return res.send(text);
      }

      const data = JSON.parse(text || "{}");
      await recordDeploymentTokens(db, req.params.id, data.meta?.tokens?.input_tokens, data.meta?.tokens?.output_tokens);
      return res.json({
        choices: [{ message: { role: "assistant", content: data.text || "" } }],
        usage: {
          prompt_tokens: data.meta?.tokens?.input_tokens || 0,
          completion_tokens: data.meta?.tokens?.output_tokens || 0,
        },
      });
    }

    if (!endpoint) {
      return res.status(400).json({ error: `Provider ${provider} is not supported by public proxy` });
    }

    const isHuggingFace = provider === "huggingface";

    const headers = {
      "Content-Type": "application/json",
      ...(isHuggingFace
        ? { "X-Provider-Api-Key": apiKey || "" }
        : { Authorization: `Bearer ${apiKey || ""}` }),
    };

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
        stream: false,
      }),
    });

    const text = await upstream.text();
    if (upstream.ok) {
      try {
        const usage = JSON.parse(text || "{}").usage;
        await recordDeploymentTokens(db, req.params.id, usage?.prompt_tokens, usage?.completion_tokens);
      } catch { /* non-JSON or no usage — skip metering, don't fail the response */ }
    }
    res.status(upstream.status);
    res.type(upstream.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch (err) {
    console.error("Public LLM chat proxy error:", err);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

// ─── POST /api/deployments/public/:id/execute — DB executor proxy ─────────────
router.post("/public/:id/execute", async (req, res) => {
  try {
    const db = await getDb();
    const deployment = await db.collection("deployments").findOne({ _id: req.params.id });
    if (!deployment) return res.status(404).json({ error: "Deployment not found" });

    if (deployment.status === "broken" || deployment.status === "deleted") {
      return res.status(400).json({ error: `Deployment database connection is broken: ${deployment.statusReason}` });
    }

    const connectionSnapshot = deployment.snapshot.connectionSnapshot;
    if (!connectionSnapshot) {
      return res.status(400).json({ error: "No connection configuration snapshot found in deployment" });
    }

    const { sql, operation, params = {} } = req.body;
    if (!sql && !operation) {
      return res.status(400).json({ error: "Either sql or operation+params is required" });
    }

    const mockConn = {
      dbType: connectionSnapshot.dbType,
      config: connectionSnapshot.config,
      name: connectionSnapshot.name,
    };

    let result;
    let executedSql = sql;

    if (sql) {
      if (!SQL_NATIVE_DB_TYPES.has(mockConn.dbType)) {
        return res.status(400).json({
          error: `${mockConn.dbType} does not support database-native SQL mode. Use a SQL database connection.`,
        });
      }

      const validated = validateReadOnlySql(sql, mockConn.dbType);
      executedSql = validated.sql;
      result = await executeLiveSql(mockConn, executedSql);
      result = {
        ...result,
        sql: executedSql,
        executionTime: 0,
        message: `Executed read-only SQL against ${mockConn.name}.`,
        dbType: mockConn.dbType,
        connectionName: mockConn.name,
      };
    } else {
      const tableName = params.tableName || params.table_name || params.table || params.collection;
      if (!tableName) {
        return res.status(400).json({ error: "tableName is required for operation-based execution" });
      }

      const SQL_OPERATION_DB_TYPES = new Set([
        "postgresql", "redshift", "mysql", "mariadb", "sqlserver", "sqlite", "duckdb", "snowflake", "bigquery", "oracle", "databricks", "clickhouse",
      ]);

      if (operation === "preview_table") {
        const preview = await previewLiveTable(mockConn, tableName, params.limit || params.n || 100);
        result = {
          data: preview.rows,
          columns: preview.columns,
          rowCount: preview.rows.length,
          executionTime: 0,
          message: `Loaded live preview rows from ${tableName}.`,
          dbType: mockConn.dbType,
          connectionName: mockConn.name,
        };
      } else if (SQL_OPERATION_DB_TYPES.has(mockConn.dbType)) {
        try {
          executedSql = buildSqlFromOperation(tableName, operation, params, mockConn.dbType);
          result = await executeLiveSql(mockConn, executedSql);
          result = {
            ...result,
            sql: executedSql,
            executionTime: 0,
            message: `Executed ${operation} on ${tableName} via database.`,
            dbType: mockConn.dbType,
            connectionName: mockConn.name,
          };
        } catch (sqlBuilderErr) {
          throw new Error(
            `Database SQL execution failed for ${operation} on ${tableName}: ${sqlBuilderErr.message}`
          );
        }
      } else {
        const executed = await executeLiveOperation(mockConn, tableName, operation, params);
        result = {
          ...executed,
          executionTime: 0,
          dbType: mockConn.dbType,
          connectionName: mockConn.name,
        };
        executedSql = `${mockConn.dbType}:${operation}(${JSON.stringify(params)})`;
      }
    }

    res.json(result);
  } catch (err) {
    console.error("Public DB proxy execute error:", err);
    res.status(500).json({ error: "Query execution failed: " + err.message });
  }
});

module.exports = router;
