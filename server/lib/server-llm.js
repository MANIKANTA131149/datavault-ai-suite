// ─── Server-Side LLM Invocation ───────────────────────────────────────────────
// Lets backend features (public REST API, scheduler, alert translation) call
// an LLM without a browser in the loop. Uses the platform's admin Bedrock
// credentials (same ones the free tier uses) and the signing code from
// routes/llm.js. Token usage is metered against the owning user.

const { signedBedrockInvoke, buildBedrockPayload } = require("../routes/llm");
const { recordUsage } = require("./metering");

const DEFAULT_MODEL = process.env.SERVER_LLM_MODEL || "amazon.nova-pro-v1:0";

/**
 * One-shot chat completion via Bedrock with platform credentials.
 * @returns {Promise<{ content: string, inputTokens: number, outputTokens: number }>}
 */
async function serverChat({ messages, model = DEFAULT_MODEL, temperature = 0.1, maxTokens = 1500, userId, orgId, purpose = "api_call" }) {
  const accessKeyId = process.env.VITE_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.VITE_AWS_SECRET_ACCESS_KEY;
  const region = process.env.VITE_AWS_REGION || "us-east-1";
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Server LLM unavailable: platform AWS credentials are not configured");
  }

  const { body, operation, parser } = buildBedrockPayload(model, messages, temperature, maxTokens);
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
    throw new Error(`Bedrock error (${upstream.status}): ${text.slice(0, 300)}`);
  }
  const parsed = parser(JSON.parse(text || "{}"));

  if (userId) {
    recordUsage({
      userId,
      orgId,
      eventType: "llm_tokens",
      units: (parsed.inputTokens || 0) + (parsed.outputTokens || 0),
      metadata: { model, purpose },
    });
  }

  return {
    content: parsed.content || "",
    inputTokens: parsed.inputTokens || 0,
    outputTokens: parsed.outputTokens || 0,
  };
}

/** Extract the first SQL statement from an LLM reply (handles ``` fences). */
function extractSql(text) {
  if (!text) return "";
  const fence = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  const candidate = (fence ? fence[1] : text).trim();
  const stmt = candidate.match(/(SELECT|WITH)[\s\S]*/i);
  return (stmt ? stmt[0] : candidate).trim().replace(/;+\s*$/, "");
}

module.exports = { serverChat, extractSql, DEFAULT_MODEL };
