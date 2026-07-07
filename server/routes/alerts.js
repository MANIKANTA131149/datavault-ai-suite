// ─── Natural Language Alerts (F11) ────────────────────────────────────────────
// "Notify me when monthly sales drop below 50k" → a stored threshold rule.
// The NL condition is translated ONCE (server-side LLM) into a check SQL that
// returns a single numeric value, plus an operator + threshold. The scheduler
// Lambda evaluates due alerts; dataset alerts are also evaluated on upload.

const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { validateReadOnlySql } = require("../lib/sql-validator");
const { logAudit } = require("../middleware/auditLogger");
const { getPlanContext, canUseMetric } = require("../lib/plans");

const router = express.Router();
router.use(authMiddleware);

const OPERATORS = new Set(["<", "<=", ">", ">=", "=", "!="]);

// ─── List alerts ──────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const alerts = await db.collection("alerts").find({ userId: req.userId }).sort({ createdAt: -1 }).toArray();
    res.json(alerts.map(({ _id, ...a }) => ({ id: _id, ...a })));
  } catch (err) {
    console.error("list alerts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Translate NL condition → structured rule (server-side LLM, one-time) ─────
router.post("/translate", async (req, res) => {
  try {
    const { condition, schemaDescription, dialect } = req.body || {};
    if (!condition || typeof condition !== "string") return res.status(400).json({ error: "condition is required" });

    const { serverChat } = require("../lib/server-llm");
    const prompt = [
      {
        role: "system",
        content:
          `You translate a natural-language data alert into a JSON rule. Reply with ONLY a JSON object:\n` +
          `{"metricSql": "<single ${dialect || "DuckDB"} SELECT returning exactly ONE numeric value (one row, one column)>", "operator": "<one of < <= > >= = !=>", "threshold": <number>, "label": "<short human label>"}\n` +
          `The alert FIRES when (metricSql result) <operator> <threshold> is TRUE.\n` +
          `Schema:\n${String(schemaDescription || "").slice(0, 4000)}`,
      },
      { role: "user", content: condition.slice(0, 500) },
    ];

    const { content } = await serverChat({ messages: prompt, userId: req.userId, purpose: "alert_translation", maxTokens: 600 });
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(422).json({ error: "Could not translate the condition. Try rephrasing it." });
    const rule = JSON.parse(jsonMatch[0]);
    if (!rule.metricSql || !OPERATORS.has(rule.operator) || typeof rule.threshold !== "number") {
      return res.status(422).json({ error: "Translation produced an invalid rule. Try rephrasing the condition." });
    }
    validateReadOnlySql(rule.metricSql, "duckdb");
    res.json(rule);
  } catch (err) {
    console.error("translate alert error:", err);
    res.status(500).json({ error: err.message || "Translation failed" });
  }
});

// ─── Create an alert ──────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { conditionNl, metricSql, operator, threshold, label, datasetId, connectionId, sheetName, checkInterval } = req.body || {};
    if (!metricSql || !OPERATORS.has(operator) || typeof threshold !== "number") {
      return res.status(400).json({ error: "metricSql, operator and numeric threshold are required (use /alerts/translate first)" });
    }
    if (!datasetId && !connectionId) return res.status(400).json({ error: "datasetId or connectionId is required" });
    validateReadOnlySql(metricSql, connectionId ? "postgresql" : "duckdb");

    const db = await getDb();

    // Plan limit: automations = schedules + alerts combined.
    const planContext = await getPlanContext(db, req.userId);
    const autoCheck = canUseMetric(planContext.plan, "automations", planContext.usage.automations, 1);
    if (!autoCheck.allowed) return res.status(403).json(autoCheck.details);

    const doc = {
      _id: `alr_${crypto.randomBytes(8).toString("hex")}`,
      userId: req.userId,
      userEmail: req.userEmail || "",
      label: String(label || conditionNl || "Data alert").slice(0, 120),
      conditionNl: String(conditionNl || "").slice(0, 500),
      metricSql: metricSql.slice(0, 5000),
      operator,
      threshold,
      datasetId: datasetId || null,
      connectionId: connectionId || null,
      sheetName: sheetName || null,
      checkInterval: ["hourly", "every6h", "daily"].includes(checkInterval) ? checkInterval : "daily",
      enabled: true,
      lastChecked: null,
      lastValue: null,
      lastFired: null,
      fireCount: 0,
      createdAt: new Date().toISOString(),
    };
    await db.collection("alerts").insertOne(doc);
    const { _id, ...rest } = doc;
    res.status(201).json({ id: _id, ...rest });
    logAudit(req.userId, req.userEmail || "", "alert.create", { id: _id, label: doc.label }, "info");
  } catch (err) {
    if (/read-only|SELECT|statement/i.test(err.message)) return res.status(400).json({ error: err.message });
    console.error("create alert error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Pause / resume / edit ────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const update = {};
    if (typeof req.body?.enabled === "boolean") update.enabled = req.body.enabled;
    if (typeof req.body?.label === "string") update.label = req.body.label.slice(0, 120);
    if (typeof req.body?.threshold === "number") update.threshold = req.body.threshold;
    if (OPERATORS.has(req.body?.operator)) update.operator = req.body.operator;
    const result = await db.collection("alerts").updateOne({ _id: req.params.id, userId: req.userId }, { $set: update });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Alert not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("update alert error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("alerts").deleteOne({ _id: req.params.id, userId: req.userId });
    res.json({ success: true });
  } catch (err) {
    console.error("delete alert error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
