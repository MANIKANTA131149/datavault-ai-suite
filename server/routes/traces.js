// ─── Agent Trace Observability (F-OBS) ────────────────────────────────────────
// Read API over the append-only `agent_traces` collection written by
// lib/trace-writer.js. Lets users inspect WHY an answer happened: the ordered
// agent steps, the SQL run, and token/cost/latency. Scoped to the caller's own
// traces. Fully additive — no existing route or collection changes.

const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { recordTrace } = require("../lib/trace-writer");

const router = express.Router();
router.use(authMiddleware);

// ─── Record a trace (client posts the completed agent run) ────────────────────
// The agent runs client-side (DuckDB-WASM), so the client owns the step list.
// This endpoint persists it. Fire-and-forget on the client — a failure here
// must never affect the user's answer.
router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    const id = await recordTrace({
      userId: req.userId,
      orgId: req.orgId,
      question: b.question,
      steps: b.steps,
      totalTokens: b.totalTokens,
      costUsd: b.costUsd,
      latencyMs: b.latencyMs,
      model: b.model,
      provider: b.provider,
      status: b.status,
      datasetId: b.datasetId,
      connectionId: b.connectionId,
    });
    res.status(201).json({ id });
  } catch (err) {
    console.error("record trace error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── List recent traces (paginated, filterable) ───────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const skip = (page - 1) * limit;

    const filter = { userId: req.userId };
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.from || req.query.to) {
      filter.ts = {};
      if (req.query.from) filter.ts.$gte = String(req.query.from);
      if (req.query.to) filter.ts.$lte = String(req.query.to);
    }

    const [traces, total] = await Promise.all([
      db.collection("agent_traces")
        .find(filter, {
          // List view omits the heavy `steps` array for speed.
          projection: { steps: 0 },
        })
        .sort({ ts: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection("agent_traces").countDocuments(filter),
    ]);

    res.json({
      traces: traces.map(({ _id, ...t }) => ({ id: _id, ...t })),
      total,
      page,
      limit,
    });
  } catch (err) {
    console.error("list traces error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Trace summary stats (for the observability header cards) ─────────────────
router.get("/stats", async (req, res) => {
  try {
    const db = await getDb();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows = await db.collection("agent_traces").aggregate([
      { $match: { userId: req.userId, day: { $gte: since } } },
      {
        $group: {
          _id: null,
          runs: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          totalCostUsd: { $sum: "$costUsd" },
          avgLatencyMs: { $avg: "$latencyMs" },
          errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
        },
      },
    ]).toArray();

    const s = rows[0] || { runs: 0, totalTokens: 0, totalCostUsd: 0, avgLatencyMs: 0, errors: 0 };
    res.json({
      windowDays: 7,
      runs: s.runs,
      totalTokens: s.totalTokens,
      totalCostUsd: Number((s.totalCostUsd || 0).toFixed(4)),
      avgLatencyMs: Math.round(s.avgLatencyMs || 0),
      errors: s.errors,
      successRate: s.runs ? Number((((s.runs - s.errors) / s.runs) * 100).toFixed(1)) : 100,
    });
  } catch (err) {
    console.error("trace stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get one full trace (with steps) ──────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection("agent_traces").findOne({ _id: req.params.id, userId: req.userId });
    if (!doc) return res.status(404).json({ error: "Trace not found" });
    const { _id, ...rest } = doc;
    res.json({ id: _id, ...rest });
  } catch (err) {
    console.error("get trace error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
