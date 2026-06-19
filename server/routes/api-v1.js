// ─── Public REST API v1 (F7) ──────────────────────────────────────────────────
// Programmatic access to Querify's NL→SQL engine, authenticated via API keys.
//
//   POST /api/v1/query   { question, datasetId | connectionId, sheetName? }
//     → NL→SQL (server-side LLM) → validate read-only → execute → JSON result
//   POST /api/v1/sql     { sql, datasetId | connectionId, sheetName? }
//     → validate read-only → execute → JSON result
//   GET  /api/v1/datasets      → list the key owner's datasets
//   GET  /api/v1/connections   → list the key owner's connections (no creds)

const express = require("express");
const { getDb } = require("../db");
const { apiKeyAuth } = require("../lib/api-keys");
const { runStoredQuery, describeTarget } = require("../lib/query-runner");
const { recordUsage } = require("../lib/metering");
const { serverChat, extractSql } = require("../lib/server-llm");
const { validateReadOnlySql } = require("../lib/sql-validator");

const router = express.Router();
router.use(apiKeyAuth());

function meterCall(req, endpoint, extra = {}) {
  recordUsage({
    userId: req.userId,
    orgId: req.orgId,
    eventType: "api_call",
    units: 1,
    metadata: { endpoint, keyId: req.apiKey?._id, ...extra },
  });
}

// ─── NL → SQL → result ────────────────────────────────────────────────────────
router.post("/query", async (req, res) => {
  try {
    const { question, datasetId, connectionId, sheetName } = req.body || {};
    if (!question || typeof question !== "string") return res.status(400).json({ error: "question is required" });
    if (!datasetId && !connectionId) return res.status(400).json({ error: "datasetId or connectionId is required" });

    const db = await getDb();
    const target = { datasetId, connectionId, sheetName };
    const schema = await describeTarget(db, req.userId, target);

    const tableHint = schema.tableName ? ` The table name is "${schema.tableName}".` : "";
    // F-SEM: ground the model on certified metrics for this org/target (no-op
    // when the org has defined none — identical behavior to before).
    let metricsBlock = "";
    try {
      const { buildMetricsContext } = require("./metrics");
      metricsBlock = await buildMetricsContext(db, req.orgId, { datasetId, connectionId });
    } catch { /* non-fatal */ }
    // Cache key: identical question + schema + metrics → identical SQL. Cuts
    // tokens/latency on repeats; a miss falls straight through to a live call.
    const { getCached, setCached } = require("../lib/llm-cache");
    const cacheParts = { p: "v1_query", q: question.slice(0, 1000), schema: schema.description.slice(0, 6000), metricsBlock, dialect: schema.dialect };
    let sql = await getCached(cacheParts);

    if (!sql) {
      const { content } = await serverChat({
        userId: req.userId,
        orgId: req.orgId,
        purpose: "public_api_query",
        maxTokens: 1000,
        messages: [
          {
            role: "system",
            content:
              `You convert a natural-language question into a single read-only ${schema.dialect} SELECT statement.` +
              ` Reply with ONLY the SQL — no explanation, no markdown.${tableHint}\nSchema:\n${schema.description.slice(0, 6000)}${metricsBlock}`,
          },
          { role: "user", content: question.slice(0, 1000) },
        ],
      });
      sql = extractSql(content);
      if (sql) setCached(cacheParts, sql);
    }
    if (!sql) return res.status(422).json({ error: "Could not generate SQL for that question" });
    validateReadOnlySql(sql, connectionId ? "postgresql" : "duckdb");

    const result = await runStoredQuery(db, req.userId, { ...target, sql });
    meterCall(req, "query", { datasetId, connectionId });
    res.json({ question, sql, rowCount: result.rowCount, rows: result.rows, source: result.source });
  } catch (err) {
    console.error("v1 query error:", err.message);
    const status = /not found/i.test(err.message) ? 404 : /read-only|SELECT|blocked/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message || "Query failed" });
  }
});

// ─── Direct SQL execution ─────────────────────────────────────────────────────
router.post("/sql", async (req, res) => {
  try {
    const { sql, datasetId, connectionId, sheetName } = req.body || {};
    if (!sql || typeof sql !== "string") return res.status(400).json({ error: "sql is required" });
    if (!datasetId && !connectionId) return res.status(400).json({ error: "datasetId or connectionId is required" });

    const db = await getDb();
    const result = await runStoredQuery(db, req.userId, { datasetId, connectionId, sheetName, sql });
    meterCall(req, "sql", { datasetId, connectionId });
    res.json({ sql, rowCount: result.rowCount, rows: result.rows, source: result.source });
  } catch (err) {
    console.error("v1 sql error:", err.message);
    const status = /not found/i.test(err.message) ? 404 : /read-only|SELECT|blocked|statement/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message || "Execution failed" });
  }
});

// ─── Resource discovery ───────────────────────────────────────────────────────
router.get("/datasets", async (req, res) => {
  try {
    const db = await getDb();
    const datasets = await db
      .collection("datasets")
      .find({ userId: req.userId, archived: { $ne: true } }, { projection: { fileData: 0 } })
      .sort({ uploadDate: -1 })
      .toArray();
    meterCall(req, "datasets");
    res.json(
      datasets.map((d) => ({
        id: d._id,
        fileName: d.fileName,
        displayName: d.displayName || "",
        sheetNames: d.sheetNames || [],
        rowCounts: d.rowCounts || {},
        uploadDate: d.uploadDate,
      }))
    );
  } catch (err) {
    console.error("v1 datasets error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/connections", async (req, res) => {
  try {
    const db = await getDb();
    const conns = await db.collection("connections").find({ userId: req.userId }).toArray();
    meterCall(req, "connections");
    res.json(
      conns.map((c) => ({
        id: c._id.toString(),
        name: c.name,
        dbType: c.dbType,
        status: c.status || "unknown",
      }))
    );
  } catch (err) {
    console.error("v1 connections error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
