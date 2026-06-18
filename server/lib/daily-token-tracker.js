const DAILY_LIMIT = 200000; // 200k tokens — Free tier daily allowance (fallback default)

function getTodayString() {
  return new Date().toISOString().split("T")[0]; // UTC Date YYYY-MM-DD
}

// A limit of null/undefined means "unlimited" (Enterprise). Internally we use
// Infinity for the math so percentage = 0 and nothing is ever blocked.
function resolveLimit(limit) {
  if (limit === null || limit === undefined) return Infinity;
  const n = Number(limit);
  return Number.isFinite(n) && n > 0 ? n : DAILY_LIMIT;
}

/**
 * Gets the daily token usage details for a specific user. Usage is gated on
 * tokens only — the query-count cap was removed. `queriesUsed` is still
 * returned (informational) for analytics/back-compat, but no longer limits.
 * @param {any} db - MongoDB database instance
 * @param {string} userId - User identifier
 * @param {number|null} [dailyLimit] - The tier's daily token cap; null = unlimited. Defaults to Free's 200k.
 * @returns {Promise<{tokensUsed: number, limit: number, queriesUsed: number, percentage: number}>}
 */
async function getCurrentDailyUsage(db, userId, dailyLimit = DAILY_LIMIT) {
  const dateStr = getTodayString();
  const log = await db.collection("daily_token_logs").findOne({ userId, dateStr });

  const tokensUsed = log ? log.tokensUsed : 0;
  const queriesUsed = log ? (log.queriesUsed || 0) : 0;

  const limit = resolveLimit(dailyLimit);
  const percentage = Number.isFinite(limit)
    ? Math.min(100, parseFloat(((tokensUsed / limit) * 100).toFixed(2)))
    : 0;

  return {
    tokensUsed,
    // Report null for unlimited tiers so the client renders "Unlimited".
    limit: Number.isFinite(limit) ? limit : null,
    queriesUsed,
    percentage,
  };
}

/**
 * Increments the daily token & query usage and appends a detailed transaction log
 * @param {any} db - MongoDB database instance
 * @param {string} userId - User identifier
 * @param {string} model - Bedrock LLM model name
 * @param {number} promptTokens - Input tokens used
 * @param {number} completionTokens - Output tokens generated
 */
async function incrementDailyUsage(db, userId, model, promptTokens, completionTokens) {
  const dateStr = getTodayString();
  const totalTokens = (promptTokens || 0) + (completionTokens || 0);

  const logItem = {
    timestamp: new Date().toISOString(),
    model,
    promptTokens: promptTokens || 0,
    completionTokens: completionTokens || 0,
    totalTokens,
  };

  await db.collection("daily_token_logs").updateOne(
    { userId, dateStr },
    {
      $inc: { tokensUsed: totalTokens, queriesUsed: 1 },
      $push: { logs: logItem },
      $setOnInsert: { createdAt: new Date().toISOString() }
    },
    { upsert: true }
  );

  // Usage metering (F20): mirror every token charge into the append-only
  // usage_events ledger. Fire-and-forget — never blocks the LLM response.
  try {
    const { recordUsage } = require("./metering");
    recordUsage({ userId, eventType: "llm_tokens", units: totalTokens, metadata: { model } });
  } catch { /* non-fatal */ }

  return totalTokens;
}

/**
 * Checks if a user's daily token usage + proposed addition would exceed their
 * tier's daily token limit. Token-only — there is no query-count cap. An
 * unlimited tier (dailyLimit null) is always allowed.
 * @param {any} db - MongoDB database instance
 * @param {string} userId - User identifier
 * @param {number} attempted - Estimated token addition
 * @param {number|null} [dailyLimit] - The tier's daily token cap; null = unlimited. Defaults to Free's 200k.
 * @returns {Promise<{allowed: boolean, tokensUsed: number, limit: number|null, queriesUsed: number, reason: string}>}
 */
async function checkDailyLimit(db, userId, attempted = 0, dailyLimit = DAILY_LIMIT) {
  const usage = await getCurrentDailyUsage(db, userId, dailyLimit);
  const limit = resolveLimit(dailyLimit);
  const tokenAllowed = (usage.tokensUsed + attempted) <= limit;

  return {
    allowed: tokenAllowed,
    tokensUsed: usage.tokensUsed,
    limit: usage.limit,
    queriesUsed: usage.queriesUsed,
    reason: "tokens"
  };
}

module.exports = {
  DAILY_LIMIT,
  getCurrentDailyUsage,
  incrementDailyUsage,
  checkDailyLimit,
  getTodayString,
};
