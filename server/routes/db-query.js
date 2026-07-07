const express = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const {
  listLiveTables,
  getLiveSchema,
  previewLiveTable,
  executeLiveOperation,
  executeLiveSql,
} = require("../lib/live-db");
const { buildSqlFromOperation } = require("../lib/sql-builder");
const { SQL_NATIVE_DB_TYPES, validateReadOnlySql } = require("../lib/sql-validator");
const { decryptConfig } = require("../lib/secret-crypto");

const router = express.Router();
const SQL_OPERATION_DB_TYPES = new Set([
  "postgresql",
  "redshift",
  "mysql",
  "mariadb",
  "sqlserver",
  "sqlite",
  "duckdb",
  "snowflake",
  "bigquery",
  "oracle",
  "databricks",
  "clickhouse",
]);

async function loadConnection(req) {
  // A malformed connectionId would make `new ObjectId()` throw and surface as a
  // 500. Treat an invalid id as "not found" (it can never match a real doc).
  if (!ObjectId.isValid(req.params.connectionId)) return null;
  const db = await getDb();
  const conn = await db
    .collection("connections")
    .findOne({ _id: new ObjectId(req.params.connectionId), userId: req.userId });
  if (!conn) return null;
  // Decrypt credentials for live use (encrypted at rest via secret-crypto).
  return { ...conn, config: decryptConfig(conn.config) };
}

router.get("/:connectionId/schema", authMiddleware, async (req, res) => {
  try {
    const conn = await loadConnection(req);
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const requestedTable = typeof req.query.table === "string" && req.query.table.trim()
      ? req.query.table.trim()
      : "";
    const tables = await getLiveSchema(conn, requestedTable
      ? { tableName: requestedTable, includeColumns: true, includeCounts: true }
      : { includeColumns: true, includeCounts: false });
    const dbName = conn.config.database || conn.config.projectId || conn.name;
    res.json({
      schema: {
        connectionId: conn._id.toString(),
        connectionName: conn.name,
        dbType: conn.dbType,
        database: dbName,
        host: conn.config.host || conn.config.url || conn.config.account || "",
        tables,
        ready: conn.status === "connected",
        message: requestedTable
          ? `Loaded schema metadata for ${requestedTable} from ${conn.name}.`
          : `Loaded database table summary from ${conn.name}.`,
      },
    });
  } catch (err) {
    console.error("GET /db-query/:id/schema error:", err);
    res.status(500).json({ error: "Failed to fetch live schema: " + err.message });
  }
});

router.post("/:connectionId/tables", authMiddleware, async (req, res) => {
  try {
    const conn = await loadConnection(req);
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const tables = await listLiveTables(conn);
    res.json({
      tables: tables.map((table) => ({
        name: table.name,
        kind: table.kind,
        rowCount: table.rowCount,
        columnCount: table.columns.length,
        description: table.description || "",
      })),
    });
  } catch (err) {
    console.error("POST /db-query/:id/tables error:", err);
    res.status(500).json({ error: "Failed to fetch table list: " + err.message });
  }
});

router.post("/:connectionId/execute", authMiddleware, async (req, res) => {
  try {
    const conn = await loadConnection(req);
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const { sql, operation, params = {} } = req.body;
    if (!sql && !operation) {
      return res.status(400).json({ error: "Either sql or operation+params is required" });
    }

    let result;
    let executedSql = sql;
    
    if (sql) {
      if (!SQL_NATIVE_DB_TYPES.has(conn.dbType)) {
        return res.status(400).json({
          error: `${conn.dbType} does not support database-native SQL mode. Use a SQL database connection.`,
        });
      }

      const validated = validateReadOnlySql(sql, conn.dbType);
      executedSql = validated.sql;
      result = await executeLiveSql(conn, executedSql);
      result = {
        ...result,
        sql: executedSql,
        executionTime: 0,
        message: `Executed read-only SQL against ${conn.name}.`,
        dbType: conn.dbType,
        connectionName: conn.name,
      };
    } else {
      const tableName = params.tableName || params.table_name || params.table || params.collection;
      if (!tableName) {
        return res.status(400).json({ error: "tableName is required for operation-based execution" });
      }

      if (operation === "preview_table") {
        const preview = await previewLiveTable(conn, tableName, params.limit || params.n || 100);
        result = {
          data: preview.rows,
          columns: preview.columns,
          rowCount: preview.rows.length,
          executionTime: 0,
          message: `Loaded live preview rows from ${tableName}.`,
          dbType: conn.dbType,
          connectionName: conn.name,
        };
      } else if (SQL_OPERATION_DB_TYPES.has(conn.dbType)) {
        try {
          executedSql = buildSqlFromOperation(tableName, operation, params, conn.dbType);
          result = await executeLiveSql(conn, executedSql);
          result = {
            ...result,
            sql: executedSql,
            executionTime: 0,
            message: `Executed ${operation} on ${tableName} via database.`,
            dbType: conn.dbType,
            connectionName: conn.name,
          };
        } catch (sqlBuilderErr) {
          throw new Error(
            `Database SQL execution failed for ${operation} on ${tableName}: ${sqlBuilderErr.message}`
          );
        }
      } else {
        const executed = await executeLiveOperation(conn, tableName, operation, params);
        result = {
          ...executed,
          executionTime: 0,
          dbType: conn.dbType,
          connectionName: conn.name,
        };
        executedSql = `${conn.dbType}:${operation}(${JSON.stringify(params)})`;
      }
    }

    const db = await getDb();
    await db.collection("query_logs").insertOne({
      userId: req.userId,
      connectionId: conn._id.toString(),
      connectionName: conn.name,
      dbType: conn.dbType,
      sql: executedSql,
      rowCount: Array.isArray(result.data) ? result.data.length : result.rowCount || 0,
      executedAt: new Date().toISOString(),
    });

    res.json(result);
  } catch (err) {
    console.error("POST /db-query/:id/execute error:", err);
    res.status(500).json({ error: "Query execution failed: " + err.message });
  }
});

module.exports = router;
