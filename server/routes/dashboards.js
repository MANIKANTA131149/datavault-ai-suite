// ─── Conversational Dashboard Builder (F22) ───────────────────────────────────
// Stores agent-generated dashboard specs: a named collection of panels, each
// holding a question, its verified SQL, a chart type and layout hints. Panels
// are (re)executed by clients (DuckDB-WASM) or the scheduler (server engine).

const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { recordLineage } = require("../lib/lineage");
const { logAudit } = require("../middleware/auditLogger");

const router = express.Router();
router.use(authMiddleware);

const MAX_DASHBOARDS = 30;
const MAX_PANELS = 12;
const CHART_TYPES = new Set(["bar", "line", "area", "pie", "table", "metric"]);

function sanitizePanels(panels) {
  if (!Array.isArray(panels)) return [];
  return panels.slice(0, MAX_PANELS).map((p, i) => ({
    id: typeof p?.id === "string" ? p.id.slice(0, 40) : `panel_${i}`,
    title: String(p?.title || `Panel ${i + 1}`).slice(0, 120),
    question: String(p?.question || "").slice(0, 1000),
    sql: String(p?.sql || "").slice(0, 5000),
    chartType: CHART_TYPES.has(p?.chartType) ? p.chartType : "table",
    layout: {
      w: Math.min(Math.max(Number(p?.layout?.w) || 6, 2), 12),
      h: Math.min(Math.max(Number(p?.layout?.h) || 4, 2), 12),
    },
  }));
}

// ─── List dashboards ──────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const dashboards = await db.collection("dashboards").find({ userId: req.userId }).sort({ updatedAt: -1 }).toArray();
    res.json(dashboards.map(({ _id, ...d }) => ({ id: _id, ...d })));
  } catch (err) {
    console.error("list dashboards error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get one ──────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection("dashboards").findOne({ _id: req.params.id, userId: req.userId });
    if (!doc) return res.status(404).json({ error: "Dashboard not found" });
    const { _id, ...rest } = doc;
    res.json({ id: _id, ...rest });
  } catch (err) {
    console.error("get dashboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Create (from agent spec or manual) ───────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const db = await getDb();
    const count = await db.collection("dashboards").countDocuments({ userId: req.userId });
    if (count >= MAX_DASHBOARDS) return res.status(403).json({ error: `Maximum of ${MAX_DASHBOARDS} dashboards reached` });

    const doc = {
      _id: `dsh_${crypto.randomBytes(8).toString("hex")}`,
      userId: req.userId,
      name: name.slice(0, 120),
      description: String(req.body?.description || "").slice(0, 500),
      datasetId: req.body?.datasetId || null,
      connectionId: req.body?.connectionId || null,
      sheetName: req.body?.sheetName || null,
      panels: sanitizePanels(req.body?.panels),
      sourceQuestion: String(req.body?.sourceQuestion || "").slice(0, 1000),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.collection("dashboards").insertOne(doc);

    if (doc.datasetId) {
      recordLineage({
        userId: req.userId,
        sourceId: doc.datasetId,
        sourceType: "dataset",
        targetId: doc._id,
        targetType: "dashboard",
        relation: "used_in",
        meta: { name: doc.name },
      });
    }

    const { _id, ...rest } = doc;
    res.status(201).json({ id: _id, ...rest });
    logAudit(req.userId, req.userEmail || "", "dashboard.create", { id: _id, name: doc.name, panels: doc.panels.length }, "info");
  } catch (err) {
    console.error("create dashboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Update (rename, edit panels) ─────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const update = { updatedAt: new Date().toISOString() };
    if (typeof req.body?.name === "string" && req.body.name.trim()) update.name = req.body.name.slice(0, 120);
    if (typeof req.body?.description === "string") update.description = req.body.description.slice(0, 500);
    if (req.body?.panels !== undefined) update.panels = sanitizePanels(req.body.panels);
    // Bind a dataset after the fact (the agent doesn't know dataset ids; the
    // viewer asks the user once, then persists the choice here).
    if (typeof req.body?.datasetId === "string" && req.body.datasetId) {
      const ds = await db.collection("datasets").findOne({ _id: req.body.datasetId, userId: req.userId }, { projection: { _id: 1 } });
      if (ds) update.datasetId = req.body.datasetId;
    }

    const result = await db.collection("dashboards").updateOne({ _id: req.params.id, userId: req.userId }, { $set: update });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Dashboard not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("update dashboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("dashboards").deleteOne({ _id: req.params.id, userId: req.userId });
    res.json({ success: true });
    logAudit(req.userId, req.userEmail || "", "dashboard.delete", { id: req.params.id }, "info");
  } catch (err) {
    console.error("delete dashboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
