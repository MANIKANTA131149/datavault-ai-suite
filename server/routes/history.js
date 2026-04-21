const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { getPlanContext, canUseMetric } = require("../lib/plans");

const router = express.Router();
router.use(authMiddleware); // all history routes require auth

// ─── Get history entries for current user ────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const entries = await db
      .collection("history")
      .find({ userId: req.userId })
      .sort({ date: -1 })
      .limit(100)
      .toArray();

    res.json(entries.map(({ _id, ...rest }) => ({ id: rest.id ?? _id.toString(), ...rest })));
  } catch (err) {
    console.error("get history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Save a history entry (lightweight metadata only) ────────────────────────
router.post("/", async (req, res) => {
  try {
    const { id, query, datasetName, provider, model, turns, totalTokens, durationMs, status, date } =
      req.body;

    if (!query) return res.status(400).json({ error: "query is required" });

    const db = await getDb();
    const planContext = await getPlanContext(db, req.userId);
    const queryCheck = canUseMetric(planContext.plan, "monthlyQueries", planContext.usage.monthlyQueries, 1);
    if (!queryCheck.allowed) return res.status(403).json(queryCheck.details);

    const tokenCheck = canUseMetric(planContext.plan, "monthlyTokens", planContext.usage.monthlyTokens, Number(totalTokens) || 0);
    if (!tokenCheck.allowed) return res.status(403).json(tokenCheck.details);

    await db.collection("history").insertOne({
      id, // keep client-generated UUID for frontend keying
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
      // NOTE: steps and finalResult are intentionally NOT stored (too large)
    });

    res.status(201).json({ success: true });
  } catch (err) {
    console.error("save history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Clear all history for current user ──────────────────────────────────────
router.delete("/", async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.collection("history").deleteMany({ userId: req.userId });
    console.log(`🗑️  Deleted ${result.deletedCount} history entries for ${req.userEmail}`);
    res.json({ success: true });
  } catch (err) {
    console.error("clear history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
