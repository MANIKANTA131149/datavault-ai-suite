const express = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { testLiveConnection } = require("../lib/live-db");

const router = express.Router();

// ─── Supported Database Types ──────────────────────────────────────────────────
const DB_TYPES = {
  mysql: {
    label: "MySQL",
    fields: ["host", "port", "database", "username", "password"],
    defaults: { port: 3306 },
    connectionType: "credentials",
  },
  postgresql: {
    label: "PostgreSQL",
    fields: ["host", "port", "database", "username", "password"],
    defaults: { port: 5432 },
    connectionType: "credentials",
  },
  sqlserver: {
    label: "SQL Server",
    fields: ["host", "database", "username", "password"],
    defaults: {},
    connectionType: "credentials",
  },
  oracle: {
    label: "Oracle DB",
    fields: ["host", "port", "serviceName", "username", "password"],
    defaults: { port: 1521 },
    connectionType: "credentials",
  },
  mariadb: {
    label: "MariaDB",
    fields: ["host", "port", "database", "username", "password"],
    defaults: { port: 3306 },
    connectionType: "credentials",
  },
  sqlite: {
    label: "SQLite",
    fields: ["filePath"],
    defaults: {},
    connectionType: "file",
  },
  mongodb: {
    label: "MongoDB Atlas",
    fields: ["connectionUri", "database"],
    defaults: {},
    connectionType: "uri",
  },
  snowflake: {
    label: "Snowflake",
    fields: ["account", "warehouse", "database", "schema", "username", "password"],
    defaults: {},
    connectionType: "credentials",
  },
  bigquery: {
    label: "BigQuery",
    fields: ["projectId", "serviceAccountJson"],
    defaults: {},
    connectionType: "service_account",
  },
  redshift: {
    label: "Redshift",
    fields: ["host", "port", "database", "username", "password"],
    defaults: { port: 5439 },
    connectionType: "credentials",
  },
  databricks: {
    label: "Databricks SQL",
    fields: ["serverHostname", "httpPath", "accessToken"],
    defaults: {},
    connectionType: "token",
  },
  clickhouse: {
    label: "ClickHouse",
    fields: ["host", "port", "database", "username", "password"],
    defaults: { port: 8123 },
    connectionType: "credentials",
  },
  duckdb: {
    label: "DuckDB",
    fields: ["filePath"],
    defaults: {},
    connectionType: "file",
  },
  elasticsearch: {
    label: "Elasticsearch / OpenSearch",
    fields: ["url", "username", "password", "apiKey"],
    defaults: {},
    connectionType: "credentials",
  },
};

// ─── GET /api/connections/types — list all supported db types ───────────────────
router.get("/types", authMiddleware, (_req, res) => {
  res.json({ types: DB_TYPES });
});

// ─── GET /api/connections — list user's connections ────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const connections = await db
      .collection("connections")
      .find({ userId: req.userId, deleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .toArray();

    // Redact sensitive fields before sending to client
    const safe = connections.map((conn) => ({
      ...conn,
      _id: conn._id.toString(),
      config: redactConfig(conn.config, conn.dbType),
    }));

    res.json({ connections: safe });
  } catch (err) {
    console.error("GET /connections error:", err);
    res.status(500).json({ error: "Failed to fetch connections" });
  }
});

// ─── GET /api/connections/:id — get single connection ──────────────────────────
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const conn = await db
      .collection("connections")
      .findOne({ _id: new ObjectId(req.params.id), userId: req.userId });

    if (!conn) return res.status(404).json({ error: "Connection not found" });

    res.json({
      connection: {
        ...conn,
        _id: conn._id.toString(),
        config: redactConfig(conn.config, conn.dbType),
      },
    });
  } catch (err) {
    console.error("GET /connections/:id error:", err);
    res.status(500).json({ error: "Failed to fetch connection" });
  }
});

// ─── POST /api/connections — create a new connection ──────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, dbType, config, description, tags } = req.body;

    if (!name || !dbType || !config) {
      return res.status(400).json({ error: "name, dbType, and config are required" });
    }

    if (!DB_TYPES[dbType]) {
      return res.status(400).json({ error: `Unsupported database type: ${dbType}` });
    }

    const db = await getDb();

    // Check for duplicate name for this user
    const existing = await db
      .collection("connections")
      .findOne({ userId: req.userId, name, deleted: { $ne: true } });
    if (existing) {
      return res.status(409).json({ error: `A connection named "${name}" already exists` });
    }

    const doc = {
      userId: req.userId,
      userEmail: req.userEmail,
      name: name.trim(),
      dbType,
      config,
      description: description?.trim() || "",
      tags: Array.isArray(tags) ? tags : [],
      status: "untested",
      lastTestedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
    };

    const result = await db.collection("connections").insertOne(doc);

    res.status(201).json({
      connection: {
        ...doc,
        _id: result.insertedId.toString(),
        config: redactConfig(doc.config, doc.dbType),
      },
    });
  } catch (err) {
    console.error("POST /connections error:", err);
    res.status(500).json({ error: "Failed to create connection" });
  }
});

// ─── PUT /api/connections/:id — update a connection ───────────────────────────
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { name, config, description, tags, status } = req.body;
    const db = await getDb();

    const existing = await db
      .collection("connections")
      .findOne({ _id: new ObjectId(req.params.id), userId: req.userId });

    if (!existing) return res.status(404).json({ error: "Connection not found" });

    // If name changed, check for duplicate
    if (name && name.trim() !== existing.name) {
      const dup = await db.collection("connections").findOne({
        userId: req.userId,
        name: name.trim(),
        _id: { $ne: new ObjectId(req.params.id) },
        deleted: { $ne: true },
      });
      if (dup) {
        return res.status(409).json({ error: `A connection named "${name}" already exists` });
      }
    }

    const update = {
      ...(name !== undefined && { name: name.trim() }),
      ...(config !== undefined && { config }),
      ...(description !== undefined && { description: description.trim() }),
      ...(tags !== undefined && { tags }),
      ...(status !== undefined && { status }),
      updatedAt: new Date().toISOString(),
    };

    await db
      .collection("connections")
      .updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });

    const updated = await db
      .collection("connections")
      .findOne({ _id: new ObjectId(req.params.id) });

    res.json({
      connection: {
        ...updated,
        _id: updated._id.toString(),
        config: redactConfig(updated.config, updated.dbType),
      },
    });
  } catch (err) {
    console.error("PUT /connections/:id error:", err);
    res.status(500).json({ error: "Failed to update connection" });
  }
});

// ─── POST /api/connections/:id/test — test a connection ───────────────────────
router.post("/:id/test", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const conn = await db
      .collection("connections")
      .findOne({ _id: new ObjectId(req.params.id), userId: req.userId });

    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const typeInfo = DB_TYPES[conn.dbType];
    if (!typeInfo) {
      await db.collection("connections").updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: "error", lastTestedAt: new Date().toISOString() } }
      );
      return res.json({ success: false, message: "Unknown database type" });
    }

    // Validate required fields are present
    const missingFields = typeInfo.fields.filter((f) => {
      const val = conn.config[f];
      return val === undefined || val === null || val === "";
    });

    if (missingFields.length > 0) {
      await db.collection("connections").updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: "error", lastTestedAt: new Date().toISOString() } }
      );
      return res.json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    await testLiveConnection(conn);

    await db.collection("connections").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: "connected", lastTestedAt: new Date().toISOString() } }
    );

    res.json({ success: true, message: `Successfully connected to ${typeInfo.label}` });
  } catch (err) {
    // A failed connection test is almost always a user-input problem (wrong
    // host/port/credentials), not a server fault — so log it quietly and return
    // 200 with success:false, matching the other failure branches above. This
    // keeps the frontend handling uniform and avoids noisy 500 stack traces.
    const message = friendlyDbError(err);
    console.warn(`Connection test failed for ${req.params.id}: ${message}`);
    try {
      const db = await getDb();
      await db.collection("connections").updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: "error", lastTestedAt: new Date().toISOString() } }
      );
    } catch { /* status update is best-effort */ }
    res.json({ success: false, message });
  }
});

// Map raw driver errors to a clear, user-facing explanation.
function friendlyDbError(err) {
  const code = err?.code;
  const raw = err?.message || "Connection test failed";
  switch (code) {
    case "ENOTFOUND":
      return `Host not found: "${err.hostname || "unknown"}". Check the hostname/server address.`;
    case "ECONNREFUSED":
      return "Connection refused. Check the port and that the database accepts remote connections.";
    case "ETIMEDOUT":
    case "ESOCKETTIMEDOUT":
      return "Connection timed out. Check the host, port, and firewall/security-group rules.";
    case "ER_ACCESS_DENIED_ERROR":
    case "ELOGIN":
      return "Access denied. Check the username and password.";
    case "ER_BAD_DB_ERROR":
    case "3D000":
      return "Database not found. Check the database name.";
    default:
      return raw;
  }
}

// ─── DELETE /api/connections/:id — soft-delete a connection ───────────────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const conn = await db
      .collection("connections")
      .findOne({ _id: new ObjectId(req.params.id), userId: req.userId });
    if (conn) {
      await db.collection("deployments").updateMany(
        { userId: req.userId, "snapshot.selectedDatasetId": `conn:${req.params.id}` },
        {
          $set: {
            status: "broken",
            statusReason: `Database connection "${conn.name}" was deleted`,
            updatedAt: new Date().toISOString(),
          },
        }
      );
    }

    const result = await db.collection("connections").updateOne(
      { _id: new ObjectId(req.params.id), userId: req.userId },
      { $set: { deleted: true, updatedAt: new Date().toISOString() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Connection not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /connections/:id error:", err);
    res.status(500).json({ error: "Failed to delete connection" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function redactConfig(config, dbType) {
  if (!config) return {};

  const sensitiveFields = [
    "password",
    "accessToken",
    "apiKey",
    "serviceAccountJson",
    "connectionUri",
  ];

  const redacted = { ...config };
  for (const field of sensitiveFields) {
    if (redacted[field]) {
      const val = String(redacted[field]);
      if (val.length > 8) {
        redacted[field] = "••••" + val.slice(-4);
      } else if (val.length > 0) {
        redacted[field] = "••••";
      }
    }
  }
  return redacted;
}

module.exports = router;
