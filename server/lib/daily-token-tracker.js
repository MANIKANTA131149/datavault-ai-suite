const DAILY_LIMIT = 200000; // 200k tokens
const DAILY_QUERY_LIMIT = 25; // 25 queries

function getTodayString() {
  return new Date().toISOString().split("T")[0]; // UTC Date YYYY-MM-DD
}

/**
 * Gets the daily token and query usage details for a specific user
 * @param {any} db - MongoDB database instance
 * @param {string} userId - User identifier
 * @returns {Promise<{tokensUsed: number, limit: number, queriesUsed: number, queryLimit: number, percentage: number}>}
 */
async function getCurrentDailyUsage(db, userId) {
  const dateStr = getTodayString();
  const log = await db.collection("daily_token_logs").findOne({ userId, dateStr });
  
  const tokensUsed = log ? log.tokensUsed : 0;
  const queriesUsed = log ? (log.queriesUsed || 0) : 0;
  
  const tokenPercentage = (tokensUsed / DAILY_LIMIT) * 100;
  const queryPercentage = (queriesUsed / DAILY_QUERY_LIMIT) * 100;
  const percentage = Math.min(100, parseFloat(Math.max(tokenPercentage, queryPercentage).toFixed(2)));

  return {
    tokensUsed,
    limit: DAILY_LIMIT,
    queriesUsed,
    queryLimit: DAILY_QUERY_LIMIT,
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

  return totalTokens;
}

/**
 * Checks if a user's daily usage + proposed addition would exceed query or token limits
 * @param {any} db - MongoDB database instance
 * @param {string} userId - User identifier
 * @param {number} attempted - Estimated token addition
 * @returns {Promise<{allowed: boolean, tokensUsed: number, limit: number, queriesUsed: number, queryLimit: number, reason: string}>}
 */
async function checkDailyLimit(db, userId, attempted = 0) {
  const usage = await getCurrentDailyUsage(db, userId);
  const tokenAllowed = (usage.tokensUsed + attempted) <= DAILY_LIMIT;
  const queryAllowed = (usage.queriesUsed + 1) <= DAILY_QUERY_LIMIT;
  
  return {
    allowed: tokenAllowed && queryAllowed,
    tokensUsed: usage.tokensUsed,
    limit: DAILY_LIMIT,
    queriesUsed: usage.queriesUsed,
    queryLimit: DAILY_QUERY_LIMIT,
    reason: !queryAllowed ? "queries" : "tokens"
  };
}

module.exports = {
  DAILY_LIMIT,
  DAILY_QUERY_LIMIT,
  getCurrentDailyUsage,
  incrementDailyUsage,
  checkDailyLimit,
  getTodayString,
};
