// ─── Evaluation Pipeline / Golden Questions (F-EVAL) ──────────────────────────
// An admin curates a suite of {question, target, expectation} cases. Running the
// suite sends each question through the SAME server-side NL→SQL path the public
// API uses, executes the SQL read-only, and scores the result against the
// expectation. This is the prerequisite for safely changing models/prompts.
//
// Fully additive: `eval_cases` + `eval_runs` collections. Metered like any other
// LLM use; bounded concurrency so a run can't blow the token budget.

const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { getPlanContext, isPlanOwner } = require("../lib/plans");
const { runStoredQuery, describeTarget } = require("../lib/query-runner");
const { serverChat, extractSql } = require("../lib/server-llm");
const { validateReadOnlySql } = require("../lib/sql-validator");
const { logAudit } = require("../middleware/auditLogger");

const router = express.Router();
router.use(authMiddleware);

const MAX_CASES = 100;
const MAX_CASES_PER_RUN = 50;

async function requireAdmin(req, res, next) {
  try {
    const db = await getDb();
    const ctx = await getPlanContext(db, req.userId);
    const isAdmin = ctx.user.role === "admin" || isPlanOwner(ctx.user, ctx.planOwner);
    if (!isAdmin || !ctx.plan.adminPage) {
      return res.status(403).json({ error: "Evaluation requires an admin of a paid organization", code: "PLAN_FEATURE_LOCKED" });
    }
    next();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

function view(doc) {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

// ─── List eval cases ──────────────────────────────────────────────────────────
router.get("/cases", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const docs = await db.collection("eval_cases").find({ userId: req.userId }).sort({ createdAt: -1 }).toArray();
    res.json(docs.map(view));
  } catch (err) {
    console.error("list eval cases error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Create an eval case ──────────────────────────────────────────────────────
router.post("/cases", requireAdmin, async (req, res) => {
  try {
    const { question, datasetId, connectionId, sheetName, expectation } = req.body || {};
    if (!question || typeof question !== "string") return res.status(400).json({ error: "question is required" });
    if (!datasetId && !connectionId) return res.status(400).json({ error: "datasetId or connectionId is required" });

    const db = await getDb();
    const count = await db.collection("eval_cases").countDocuments({ userId: req.userId });
    if (count >= MAX_CASES) return res.status(403).json({ error: `Maximum of ${MAX_CASES} eval cases reached` });

    // expectation: { minRows?, maxRows?, expectRows?, containsColumns?[], expectedSqlContains?[] }
    const exp = expectation && typeof expectation === "object" ? expectation : {};
    const doc = {
      _id: `evc_${crypto.randomBytes(8).toString("hex")}`,
      userId: req.userId,
      question: question.slice(0, 1000),
      datasetId: datasetId || null,
      connectionId: connectionId || null,
      sheetName: sheetName || null,
      expectation: {
        minRows: Number.isFinite(exp.minRows) ? exp.minRows : undefined,
        maxRows: Number.isFinite(exp.maxRows) ? exp.maxRows : undefined,
        expectRows: Number.isFinite(exp.expectRows) ? exp.expectRows : undefined,
        containsColumns: Array.isArray(exp.containsColumns) ? exp.containsColumns.slice(0, 20).map((c) => String(c)) : [],
        expectedSqlContains: Array.isArray(exp.expectedSqlContains) ? exp.expectedSqlContains.slice(0, 10).map((c) => String(c)) : [],
      },
      createdAt: new Date().toISOString(),
    };
    await db.collection("eval_cases").insertOne(doc);
    res.status(201).json(view(doc));
  } catch (err) {
    console.error("create eval case error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete an eval case ──────────────────────────────────────────────────────
router.delete("/cases/:id", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.collection("eval_cases").deleteOne({ _id: req.params.id, userId: req.userId });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Case not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Score one result against a case's expectation ────────────────────────────
function scoreCase(exp, sql, result) {
  const reasons = [];
  let pass = true;
  const rowCount = result?.rowCount ?? (Array.isArray(result?.rows) ? result.rows.length : 0);
  const cols = result?.rows?.length ? Object.keys(result.rows[0]) : [];
  const lowerSql = (sql || "").toLowerCase();

  if (Number.isFinite(exp?.expectRows) && rowCount !== exp.expectRows) {
    pass = false; reasons.push(`expected ${exp.expectRows} rows, got ${rowCount}`);
  }
  if (Number.isFinite(exp?.minRows) && rowCount < exp.minRows) {
    pass = false; reasons.push(`expected ≥${exp.minRows} rows, got ${rowCount}`);
  }
  if (Number.isFinite(exp?.maxRows) && rowCount > exp.maxRows) {
    pass = false; reasons.push(`expected ≤${exp.maxRows} rows, got ${rowCount}`);
  }
  for (const c of exp?.containsColumns || []) {
    if (!cols.some((k) => k.toLowerCase() === String(c).toLowerCase())) {
      pass = false; reasons.push(`missing column "${c}"`);
    }
  }
  for (const frag of exp?.expectedSqlContains || []) {
    if (!lowerSql.includes(String(frag).toLowerCase())) {
      pass = false; reasons.push(`SQL missing "${frag}"`);
    }
  }
  return { pass, reasons, rowCount, columns: cols };
}

// ─── Run the suite (or a subset) ──────────────────────────────────────────────
router.post("/run", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const caseIds = Array.isArray(req.body?.caseIds) ? req.body.caseIds : null;
    const filter = { userId: req.userId };
    if (caseIds) filter._id = { $in: caseIds.slice(0, MAX_CASES_PER_RUN) };

    const cases = await db.collection("eval_cases").find(filter).limit(MAX_CASES_PER_RUN).toArray();
    if (!cases.length) return res.status(400).json({ error: "No eval cases to run" });

    const started = Date.now();
    const results = [];
    let tokensUsed = 0;

    // Sequential execution keeps token spend predictable and avoids hammering
    // the LLM/provider rate limits. (Bounded by MAX_CASES_PER_RUN.)
    for (const c of cases) {
      const target = { datasetId: c.datasetId, connectionId: c.connectionId, sheetName: c.sheetName };
      try {
        const schema = await describeTarget(db, req.userId, target);
        const tableHint = schema.tableName ? ` The table name is "${schema.tableName}".` : "";
        const { content, inputTokens, outputTokens } = await serverChat({
          userId: req.userId,
          purpose: "eval_run",
          maxTokens: 1000,
          messages: [
            { role: "system", content: `You convert a natural-language question into a single read-only ${schema.dialect} SELECT statement. Reply with ONLY the SQL — no explanation, no markdown.${tableHint}\nSchema:\n${schema.description.slice(0, 6000)}` },
            { role: "user", content: c.question.slice(0, 1000) },
          ],
        });
        tokensUsed += (inputTokens || 0) + (outputTokens || 0);
        const sql = extractSql(content);
        if (!sql) {
          results.push({ caseId: c._id, question: c.question, pass: false, reasons: ["no SQL generated"], sql: null });
          continue;
        }
        validateReadOnlySql(sql, c.connectionId ? "postgresql" : "duckdb");
        const result = await runStoredQuery(db, req.userId, { ...target, sql });
        const score = scoreCase(c.expectation, sql, result);
        results.push({ caseId: c._id, question: c.question, sql, ...score });
      } catch (err) {
        results.push({ caseId: c._id, question: c.question, pass: false, reasons: [err.message], sql: null });
      }
    }

    const passed = results.filter((r) => r.pass).length;
    const runDoc = {
      _id: `evr_${crypto.randomBytes(8).toString("hex")}`,
      userId: req.userId,
      total: results.length,
      passed,
      failed: results.length - passed,
      passRate: results.length ? Number(((passed / results.length) * 100).toFixed(1)) : 0,
      tokensUsed,
      durationMs: Date.now() - started,
      results,
      ts: new Date().toISOString(),
    };
    await db.collection("eval_runs").insertOne(runDoc);
    // Per-call token usage is already metered inside serverChat; no extra
    // recordUsage here (would double-count).
    logAudit(req.userId, req.userEmail || "", "eval.run", { total: runDoc.total, passRate: runDoc.passRate }, "info");

    res.json(view(runDoc));
  } catch (err) {
    console.error("eval run error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── List past runs ───────────────────────────────────────────────────────────
router.get("/runs", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const docs = await db.collection("eval_runs")
      .find({ userId: req.userId }, { projection: { results: 0 } })
      .sort({ ts: -1 }).limit(30).toArray();
    res.json(docs.map(view));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get one run with full results ────────────────────────────────────────────
router.get("/runs/:id", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection("eval_runs").findOne({ _id: req.params.id, userId: req.userId });
    if (!doc) return res.status(404).json({ error: "Run not found" });
    res.json(view(doc));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
