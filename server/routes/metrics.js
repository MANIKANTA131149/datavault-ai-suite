// ─── Semantic / Certified Metrics Layer (F-SEM) ───────────────────────────────
// An org owner/admin defines certified business metrics ("Revenue = SUM(...)").
// The NL→SQL agent receives these as grounding context so "show revenue by
// month" maps to the certified definition instead of guessing. This is the
// accuracy + governance differentiator.
//
// Fully additive: a new `metrics` collection keyed on orgId. When the catalog is
// empty the agent behaves exactly as it does today.

const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { getOrgContext } = require("../lib/orgs");
const { validateReadOnlySql } = require("../lib/sql-validator");
const { logAudit } = require("../middleware/auditLogger");
const { getPlanContext, canUseMetric } = require("../lib/plans");

const router = express.Router();
router.use(authMiddleware);


// Attach org context (authMiddleware alone doesn't set req.orgId).
router.use(async (req, _res, next) => {
  try {
    const db = await getDb();
    const ctx = await getOrgContext(db, req.userId, req.userEmail);
    req.orgId = ctx.orgId;
    req.orgRole = ctx.role;
  } catch {
    req.orgId = `personal:${req.userId}`;
    req.orgRole = "owner";
  }
  next();
});

function canManage(role) {
  return role === "owner" || role === "admin";
}

function view(doc) {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

// ─── List metrics (any org member can read) ───────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const docs = await db.collection("metrics").find({ orgId: req.orgId }).sort({ createdAt: -1 }).toArray();
    res.json(docs.map(view));
  } catch (err) {
    console.error("list metrics error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Grounding context block for the client-side agent ───────────────────────
// QueryPage fetches this and appends it to the agent prompt context. Returns ""
// when the org has no metrics, so the agent is unchanged for those orgs.
router.get("/context", async (req, res) => {
  try {
    const db = await getDb();
    const block = await buildMetricsContext(db, req.orgId, {
      datasetId: req.query.datasetId,
      connectionId: req.query.connectionId,
    });
    res.json({ context: block, hasMetrics: block.length > 0 });
  } catch (err) {
    console.error("metrics context error:", err);
    res.json({ context: "", hasMetrics: false });
  }
});

// ─── Create a certified metric (owner/admin) ──────────────────────────────────
router.post("/", async (req, res) => {
  try {
    if (!canManage(req.orgRole)) {
      return res.status(403).json({ error: "Only an org owner or admin can define metrics", code: "ROLE_REQUIRED" });
    }
    const { name, expression, description, dimensions, datasetId, connectionId } = req.body || {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
    if (!expression || typeof expression !== "string") return res.status(400).json({ error: "expression is required" });

    const db = await getDb();

    // Plan limit: cap the number of certified metrics per plan.
    const planContext = await getPlanContext(db, req.userId);
    const metricCheck = canUseMetric(planContext.plan, "metrics", planContext.usage.metrics, 1);
    if (!metricCheck.allowed) return res.status(403).json(metricCheck.details);

    const doc = {
      _id: `met_${crypto.randomBytes(8).toString("hex")}`,
      orgId: req.orgId,
      name: name.slice(0, 80),
      // The SQL fragment, e.g. "SUM(net_amount)" or a full expression.
      expression: expression.slice(0, 1000),
      description: String(description || "").slice(0, 500),
      dimensions: Array.isArray(dimensions) ? dimensions.slice(0, 20).map((d) => String(d).slice(0, 60)) : [],
      datasetId: datasetId || null,
      connectionId: connectionId || null,
      certifiedBy: req.userEmail || req.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.collection("metrics").insertOne(doc);
    res.status(201).json(view(doc));
    logAudit(req.userId, req.userEmail || "", "metric.create", { id: doc._id, name: doc.name }, "info");
  } catch (err) {
    console.error("create metric error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Update a metric (owner/admin) ────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    if (!canManage(req.orgRole)) return res.status(403).json({ error: "Only an org owner or admin can edit metrics", code: "ROLE_REQUIRED" });
    const db = await getDb();
    const update = { updatedAt: new Date().toISOString() };
    if (typeof req.body?.name === "string" && req.body.name.trim()) update.name = req.body.name.slice(0, 80);
    if (typeof req.body?.expression === "string" && req.body.expression.trim()) update.expression = req.body.expression.slice(0, 1000);
    if (typeof req.body?.description === "string") update.description = req.body.description.slice(0, 500);
    if (Array.isArray(req.body?.dimensions)) update.dimensions = req.body.dimensions.slice(0, 20).map((d) => String(d).slice(0, 60));

    const result = await db.collection("metrics").updateOne({ _id: req.params.id, orgId: req.orgId }, { $set: update });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Metric not found" });
    res.json({ success: true });
    logAudit(req.userId, req.userEmail || "", "metric.update", { id: req.params.id }, "info");
  } catch (err) {
    console.error("update metric error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete a metric (owner/admin) ────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    if (!canManage(req.orgRole)) return res.status(403).json({ error: "Only an org owner or admin can delete metrics", code: "ROLE_REQUIRED" });
    const db = await getDb();
    const result = await db.collection("metrics").deleteOne({ _id: req.params.id, orgId: req.orgId });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Metric not found" });
    res.json({ success: true });
    logAudit(req.userId, req.userEmail || "", "metric.delete", { id: req.params.id }, "info");
  } catch (err) {
    console.error("delete metric error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Validate a metric expression against a target (owner/admin "Test" button) ─
router.post("/validate", async (req, res) => {
  try {
    const { expression, connectionId } = req.body || {};
    if (!expression) return res.status(400).json({ error: "expression is required" });
    // Best-effort: wrap as a SELECT and ensure it's read-only & parseable.
    const probe = `SELECT ${expression} AS metric_value LIMIT 1`;
    validateReadOnlySql(probe, connectionId ? "postgresql" : "duckdb");
    res.json({ valid: true });
  } catch (err) {
    res.status(400).json({ valid: false, error: err.message });
  }
});

module.exports = router;

// ─── Shared helper: build the certified-metrics grounding block ────────────────
// Used by the agent's server-side schema-description path (api-v1) and exposed
// for the client to fetch. Returns a compact, bounded text block (or "").
async function buildMetricsContext(db, orgId, { datasetId, connectionId, max = 30 } = {}) {
  try {
    const filter = { orgId };
    const docs = await db.collection("metrics").find(filter).limit(max).toArray();
    if (!docs.length) return "";
    // Prefer metrics bound to this target, but include unbound (global) ones too.
    const relevant = docs.filter(
      (m) => (!m.datasetId && !m.connectionId) ||
        (datasetId && m.datasetId === datasetId) ||
        (connectionId && m.connectionId === connectionId)
    );
    const use = (relevant.length ? relevant : docs).slice(0, max);
    if (!use.length) return "";
    const lines = use.map((m) => {
      const dims = m.dimensions?.length ? ` (dimensions: ${m.dimensions.join(", ")})` : "";
      const desc = m.description ? ` — ${m.description}` : "";
      return `- ${m.name}: ${m.expression}${dims}${desc}`;
    });
    return `\nCertified metrics (prefer these exact definitions when the question references them):\n${lines.join("\n")}\n`;
  } catch {
    return "";
  }
}

module.exports.buildMetricsContext = buildMetricsContext;
