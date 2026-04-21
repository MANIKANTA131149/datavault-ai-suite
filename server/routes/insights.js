const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { getPlanContext, canUseMetric } = require("../lib/plans");

const router = express.Router();
router.use(authMiddleware);

// ─── Get all insights for current user ────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const insights = await db
      .collection("insights")
      .find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    res.json(insights.map(({ _id, ...rest }) => ({ id: rest.id ?? _id.toString(), ...rest })));
  } catch (err) {
    console.error("get insights error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Save an insight ──────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { id, query, datasetName, result, label, notes, color, tags, createdAt } = req.body;
    if (!query || !label) return res.status(400).json({ error: "query and label are required" });

    const db = await getDb();
    const planContext = await getPlanContext(db, req.userId);
    const insightCheck = canUseMetric(planContext.plan, "insights", planContext.usage.insights, 1);
    if (!insightCheck.allowed) return res.status(403).json(insightCheck.details);

    await db.collection("insights").insertOne({
      id,
      userId: req.userId,
      query,
      datasetName,
      result: typeof result === "string" ? result : JSON.stringify(result).slice(0, 8000),
      label,
      notes: notes || "",
      color: color || "blue",
      tags: tags || [],
      createdAt,
    });

    res.status(201).json({ success: true });
  } catch (err) {
    console.error("save insight error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Update an insight ────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const { label, notes, color, tags } = req.body;
    const db = await getDb();
    const update = {};
    if (label !== undefined) update.label = label;
    if (notes !== undefined) update.notes = notes;
    if (color !== undefined) update.color = color;
    if (tags !== undefined) update.tags = tags;

    await db.collection("insights").updateOne(
      { id: req.params.id, userId: req.userId },
      { $set: update }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("update insight error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete an insight ────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("insights").deleteOne({ id: req.params.id, userId: req.userId });
    res.json({ success: true });
  } catch (err) {
    console.error("delete insight error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
