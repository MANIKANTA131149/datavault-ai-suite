// ─── Dataset Lineage API (F12) ────────────────────────────────────────────────
const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { getLineageGraph } = require("../lib/lineage");

const router = express.Router();
router.use(authMiddleware);

// ─── Lineage subgraph around a node ───────────────────────────────────────────
router.get("/:nodeId", async (req, res) => {
  try {
    const db = await getDb();
    const graph = await getLineageGraph(db, req.userId, req.params.nodeId);
    res.json(graph);
  } catch (err) {
    console.error("lineage graph error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
