// ─── Scheduled Query Engine (F3) ──────────────────────────────────────────────
// Users save a verified SQL query with an interval (hourly/daily/weekly).
// An EventBridge-cron Lambda (server/scheduler.js) executes due schedules
// server-side, stores the result in history and raises a notification.

const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { validateReadOnlySql } = require("../lib/sql-validator");
const { logAudit } = require("../middleware/auditLogger");
const { getPlanContext, canUseMetric } = require("../lib/plans");

const router = express.Router();
router.use(authMiddleware);

const INTERVALS = {
  hourly: 60 * 60 * 1000,
  every6h: 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

function computeNextRun(interval, fromTs = Date.now()) {
  return new Date(fromTs + (INTERVALS[interval] || INTERVALS.daily)).toISOString();
}

// F-AUTO: validate & normalize an optional "when → then" rule. Returns
// { condition, action } or { condition: null, action: null } when absent.
const COND_OPERATORS = new Set([">", ">=", "<", "<=", "=", "!=", "changed", "increased", "decreased", "any_rows", "no_rows"]);
const ACTION_TYPES = new Set(["notification", "webhook"]);
function sanitizeAutomation(body) {
  const c = body?.condition;
  const a = body?.action;
  let condition = null;
  let action = null;
  if (c && typeof c === "object" && COND_OPERATORS.has(c.operator)) {
    condition = {
      operator: c.operator,
      threshold: c.threshold !== undefined && c.threshold !== null && c.threshold !== "" ? Number(c.threshold) : null,
    };
  }
  if (condition && a && typeof a === "object" && ACTION_TYPES.has(a.type)) {
    if (a.type === "notification") {
      action = { type: "notification", message: String(a.message || "").slice(0, 500) };
    } else if (a.type === "webhook") {
      const url = String(a.url || "").trim();
      // Only accept http(s) URLs; the scheduler additionally enforces SSRF guard.
      if (/^https?:\/\//i.test(url)) action = { type: "webhook", url: url.slice(0, 500) };
    }
  }
  return { condition, action };
}

// ─── List schedules ───────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const schedules = await db.collection("schedules").find({ userId: req.userId }).sort({ createdAt: -1 }).toArray();
    res.json(schedules.map(({ _id, ...s }) => ({ id: _id, ...s })));
  } catch (err) {
    console.error("list schedules error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Create a schedule ────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { name, question, sql, datasetId, connectionId, sheetName, interval } = req.body || {};
    if (!sql || typeof sql !== "string") return res.status(400).json({ error: "sql is required" });
    if (!datasetId && !connectionId) return res.status(400).json({ error: "datasetId or connectionId is required" });
    if (!INTERVALS[interval]) return res.status(400).json({ error: `interval must be one of: ${Object.keys(INTERVALS).join(", ")}` });

    // Reject anything that isn't a single read-only statement up front.
    validateReadOnlySql(sql, connectionId ? "postgresql" : "duckdb");

    const db = await getDb();

    // Plan limit: automations = schedules + alerts combined.
    const planContext = await getPlanContext(db, req.userId);
    const autoCheck = canUseMetric(planContext.plan, "automations", planContext.usage.automations, 1);
    if (!autoCheck.allowed) return res.status(403).json(autoCheck.details);

    // Verify target ownership.
    if (datasetId) {
      const ds = await db.collection("datasets").findOne({ _id: datasetId, userId: req.userId }, { projection: { _id: 1 } });
      if (!ds) return res.status(404).json({ error: "Dataset not found" });
    }

    const doc = {
      _id: `sch_${crypto.randomBytes(8).toString("hex")}`,
      userId: req.userId,
      userEmail: req.userEmail || "",
      name: String(name || question || "Scheduled query").slice(0, 120),
      question: String(question || "").slice(0, 1000),
      sql: sql.slice(0, 5000),
      datasetId: datasetId || null,
      connectionId: connectionId || null,
      sheetName: sheetName || null,
      interval,
      enabled: true,
      lastRun: null,
      lastStatus: null,
      lastError: null,
      nextRun: computeNextRun(interval),
      runCount: 0,
      createdAt: new Date().toISOString(),
      // F-AUTO (optional): when→then rule. null for plain scheduled queries.
      ...sanitizeAutomation(req.body),
      lastValue: null,
    };
    await db.collection("schedules").insertOne(doc);

    const { _id, ...rest } = doc;
    res.status(201).json({ id: _id, ...rest });
    logAudit(req.userId, req.userEmail || "", "schedule.create", { id: _id, name: doc.name, interval }, "info");
  } catch (err) {
    if (/read-only|SELECT|statement/i.test(err.message)) return res.status(400).json({ error: err.message });
    console.error("create schedule error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Update (pause/resume/change interval) ────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const update = {};
    if (typeof req.body?.enabled === "boolean") update.enabled = req.body.enabled;
    if (typeof req.body?.name === "string") update.name = req.body.name.slice(0, 120);
    if (req.body?.interval) {
      if (!INTERVALS[req.body.interval]) return res.status(400).json({ error: "Invalid interval" });
      update.interval = req.body.interval;
      update.nextRun = computeNextRun(req.body.interval);
    }
    // F-AUTO: allow editing/clearing the when→then rule.
    if (req.body?.condition !== undefined || req.body?.action !== undefined) {
      const { condition, action } = sanitizeAutomation(req.body);
      update.condition = condition;
      update.action = action;
    }
    const result = await db.collection("schedules").updateOne({ _id: req.params.id, userId: req.userId }, { $set: update });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Schedule not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("update schedule error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Recent runs of one schedule ──────────────────────────────────────────────
router.get("/:id/runs", async (req, res) => {
  try {
    const db = await getDb();
    const runs = await db
      .collection("schedule_runs")
      .find({ scheduleId: req.params.id, userId: req.userId })
      .sort({ ts: -1 })
      .limit(30)
      .toArray();
    res.json(runs.map(({ _id, ...r }) => ({ id: _id.toString(), ...r })));
  } catch (err) {
    console.error("schedule runs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("schedules").deleteOne({ _id: req.params.id, userId: req.userId });
    res.json({ success: true });
    logAudit(req.userId, req.userEmail || "", "schedule.delete", { id: req.params.id }, "info");
  } catch (err) {
    console.error("delete schedule error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
module.exports.computeNextRun = computeNextRun;
module.exports.INTERVALS = INTERVALS;
