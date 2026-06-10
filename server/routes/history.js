const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { getPlanContext, canUseMetric } = require("../lib/plans");

const router = express.Router();
router.use(authMiddleware);

const MAX_HISTORY_STEPS = 50;
const MAX_HISTORY_RESULT_LENGTH = 24000;
const MAX_HISTORY_STEP_ARGS_LENGTH = 4000;
const MAX_HISTORY_STEP_RESULT_LENGTH = 8000;
const MAX_HISTORY_SQL_LENGTH = 8000;

function trimText(value, limit) {
  if (typeof value !== "string") return null;
  return value.length > limit ? value.slice(0, limit) : value;
}

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const entries = await db
      .collection("history")
      .find({ userId: req.userId })
      .sort({ date: -1 })
      .limit(10000)
      .toArray();

    res.json(entries.map(({ _id, ...rest }) => ({ id: rest.id ?? _id.toString(), ...rest })));
  } catch (err) {
    console.error("get history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      id,
      query,
      datasetName,
      provider,
      model,
      turns,
      totalTokens,
      durationMs,
      status,
      date,
      steps,
      finalResult,
    } = req.body;

    if (!query) return res.status(400).json({ error: "query is required" });

    const db = await getDb();
    const planContext = await getPlanContext(db, req.userId);

    // Platform-served free Querify models are governed by the daily free limit, not the
    // monthly plan quota. Keep in sync with llm.js/plans.js and the querify list in llm-store.ts.
    const isFreeNovaModel = [
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
    ].includes(model) && planContext.plan.tier === "free";

    if (!isFreeNovaModel) {
      const queryCheck = canUseMetric(planContext.plan, "monthlyQueries", planContext.usage.monthlyQueries, 1);
      if (!queryCheck.allowed) return res.status(403).json(queryCheck.details);

      const tokenCheck = canUseMetric(
        planContext.plan,
        "monthlyTokens",
        planContext.usage.monthlyTokens,
        Number(totalTokens) || 0
      );
      if (!tokenCheck.allowed) return res.status(403).json(tokenCheck.details);
    }

    const storedSteps = Array.isArray(steps)
      ? steps.slice(0, MAX_HISTORY_STEPS).map((step) => ({
        turn: Number(step?.turn) || 0,
        command: String(step?.command || "Unknown"),
        argsText: trimText(step?.argsText, MAX_HISTORY_STEP_ARGS_LENGTH),
        resultText: trimText(step?.resultText, MAX_HISTORY_STEP_RESULT_LENGTH),
        sql: trimText(step?.sql, MAX_HISTORY_SQL_LENGTH),
        tokens: {
          input: Number(step?.tokens?.input) || 0,
          output: Number(step?.tokens?.output) || 0,
        },
        durationMs: Number(step?.durationMs) || 0,
        isFinal: Boolean(step?.isFinal),
      }))
      : [];

    const storedResult = trimText(finalResult, MAX_HISTORY_RESULT_LENGTH);

    await db.collection("history").insertOne({
      id,
      userId: req.userId,
      query,
      datasetName,
      provider,
      model,
      turns,
      totalTokens,
      durationMs,
      status,
      date,
      steps: storedSteps,
      finalResult: storedResult,
    });

    res.status(201).json({ success: true });
  } catch (err) {
    console.error("save history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/", async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.collection("history").deleteMany({ userId: req.userId });
    console.log(`Deleted ${result.deletedCount} history entries for ${req.userEmail}`);
    res.json({ success: true });
  } catch (err) {
    console.error("clear history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
