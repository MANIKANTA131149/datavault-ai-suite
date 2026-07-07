// ─── Shared Server-Side Query Runner ──────────────────────────────────────────
// One entry point for executing a stored/verified SQL statement against either
// a live database connection or an uploaded dataset. Used by the scheduler
// (F3), alert evaluator (F11) and public REST API (F7). Always read-only.

const { ObjectId } = require("mongodb");
const { executeLiveSql } = require("./live-db");
const { validateReadOnlySql, SQL_NATIVE_DB_TYPES } = require("./sql-validator");
const { executeSheetSql } = require("./sheet-engine");
const { decryptConfig } = require("./secret-crypto");

const MAX_RESULT_ROWS = 1000;

/**
 * Execute read-only SQL against a target owned by userId.
 * @param {object} db - Mongo Db
 * @param {string} userId
 * @param {object} target - { connectionId?, datasetId?, sheetName?, sql }
 * @returns {Promise<{ rows: object[], rowCount: number, source: string, engine?: string }>}
 */
async function runStoredQuery(db, userId, target) {
  const { connectionId, datasetId, sheetName, sql } = target || {};
  if (!sql || typeof sql !== "string") throw new Error("sql is required");

  if (connectionId) {
    const conn = await db.collection("connections").findOne({
      _id: typeof connectionId === "string" && ObjectId.isValid(connectionId) ? new ObjectId(connectionId) : connectionId,
      userId,
    });
    if (!conn) throw new Error("Connection not found");
    if (!SQL_NATIVE_DB_TYPES.has(conn.dbType)) {
      throw new Error(`${conn.dbType} does not support SQL execution`);
    }
    const validated = validateReadOnlySql(sql, conn.dbType);
    const result = await executeLiveSql({ ...conn, config: decryptConfig(conn.config) }, validated.sql);
    const rows = (result.data || result.rows || []).slice(0, MAX_RESULT_ROWS);
    return { rows, rowCount: rows.length, source: `connection:${conn.name}`, dbType: conn.dbType };
  }

  if (datasetId) {
    const dataset = await db.collection("datasets").findOne({ _id: datasetId, userId });
    if (!dataset) throw new Error("Dataset not found");
    if (!dataset.fileData) throw new Error("Dataset has no stored file data — re-upload it with file storage enabled");
    const validated = validateReadOnlySql(sql, "duckdb");
    const { rows, engine } = await executeSheetSql(dataset.fileData, sheetName, validated.sql);
    return {
      rows: rows.slice(0, MAX_RESULT_ROWS),
      rowCount: Math.min(rows.length, MAX_RESULT_ROWS),
      source: `dataset:${dataset.fileName}`,
      engine,
    };
  }

  throw new Error("Either connectionId or datasetId is required");
}

/** Compact schema description of a target (for server-side NL→SQL prompts). */
async function describeTarget(db, userId, target) {
  const { connectionId, datasetId, sheetName } = target || {};

  if (datasetId) {
    const dataset = await db.collection("datasets").findOne({ _id: datasetId, userId });
    if (!dataset) throw new Error("Dataset not found");
    const sheets = dataset.fileData?.sheets || dataset.fileData || {};
    const name = sheetName || Object.keys(sheets)[0];
    const sheet = sheets[name];
    if (!sheet) throw new Error(`Sheet not found in dataset`);
    const cols = (sheet.columns || []).map((c) => {
      const n = typeof c === "string" ? c : c?.name;
      const t = typeof c === "object" ? c?.dtype || c?.type || "" : "";
      return t ? `"${n}" (${t})` : `"${n}"`;
    });
    return {
      tableName: name,
      description: `Table "${name}" with ${sheet.rows?.length ?? "?"} rows. Columns: ${cols.join(", ")}`,
      dialect: "DuckDB",
    };
  }

  if (connectionId) {
    const { getLiveSchema } = require("./live-db");
    const conn = await db.collection("connections").findOne({
      _id: typeof connectionId === "string" && ObjectId.isValid(connectionId) ? new ObjectId(connectionId) : connectionId,
      userId,
    });
    if (!conn) throw new Error("Connection not found");
    const tables = await getLiveSchema({ ...conn, config: decryptConfig(conn.config) }, { includeColumns: true, includeCounts: false });
    const lines = (tables || []).slice(0, 40).map((t) => {
      const cols = (t.columns || []).slice(0, 60).map((c) => `"${c.name}" (${c.dtype || c.type || "?"})`).join(", ");
      return `Table "${t.name}": ${cols}`;
    });
    return {
      tableName: null,
      description: lines.join("\n"),
      dialect: conn.dbType,
    };
  }

  throw new Error("Either connectionId or datasetId is required");
}

module.exports = { runStoredQuery, describeTarget, MAX_RESULT_ROWS };
