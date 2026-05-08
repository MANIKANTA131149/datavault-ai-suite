const { MongoClient, ObjectId } = require("mongodb");

const MAX_DB_SCAN_ROWS = 10000;
const configuredSchemaTableLimit = Number(process.env.DB_SCHEMA_TABLE_LIMIT || 1000);
const MAX_SCHEMA_TABLES = Number.isFinite(configuredSchemaTableLimit) && configuredSchemaTableLimit > 0
  ? configuredSchemaTableLimit
  : 1000;
const SCHEMA_METADATA_CONCURRENCY = 8;
const BIGQUERY_MAX_DATASETS = 50;
const DATABRICKS_MAX_CATALOGS = 25;

function sanitizeValue(value) {
  if (value == null) return value;
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ObjectId) return value.toString();
  if (
    typeof value === "object" &&
    value.constructor &&
    value.constructor !== Object &&
    typeof value.toJSON === "function"
  ) {
    const jsonValue = value.toJSON();
    if (jsonValue !== value) return sanitizeValue(jsonValue);
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === "object") {
    const normalized = {};
    for (const [key, nested] of Object.entries(value)) normalized[key] = sanitizeValue(nested);
    return normalized;
  }
  return value;
}

function sanitizeRows(rows) {
  return rows.map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) normalized[key] = sanitizeValue(value);
    return normalized;
  });
}

function detectDtype(values) {
  const nonNull = values.filter((value) => value != null && value !== "");
  if (!nonNull.length) return "string";

  let booleanCount = 0;
  let numberCount = 0;
  let dateCount = 0;
  for (const value of nonNull.slice(0, 100)) {
    if (typeof value === "boolean") booleanCount += 1;
    else if (typeof value === "number" || (!Number.isNaN(Number(value)) && value !== "")) numberCount += 1;
    else if (!Number.isNaN(Date.parse(String(value))) && String(value).length > 4) dateCount += 1;
  }

  const total = Math.max(nonNull.slice(0, 100).length, 1);
  if (booleanCount > total * 0.8) return "boolean";
  if (numberCount > total * 0.8) return "number";
  if (dateCount > total * 0.8) return "date";
  return "string";
}

function buildColumnInfo(rows, hints = {}) {
  if (!rows.length) {
    return Object.entries(hints).map(([name, dtype]) => ({
      name,
      dtype: dtype || "string",
      nonNullCount: 0,
      uniqueCount: 0,
      sampleValues: [],
    }));
  }

  const keys = new Set(Object.keys(hints));
  for (const row of rows) {
    Object.keys(row).forEach((key) => keys.add(key));
  }

  return Array.from(keys).map((name) => {
    const values = rows.map((row) => row[name]);
    const nonNull = values.filter((value) => value != null && value !== "");
    return {
      name,
      dtype: hints[name] || detectDtype(values),
      nonNullCount: nonNull.length,
      uniqueCount: new Set(nonNull.map((value) => JSON.stringify(value))).size,
      sampleValues: nonNull.slice(0, 5),
    };
  });
}

function splitQualifiedName(value, fallbackSchema = "") {
  const cleaned = String(value || "").replace(/[`"'[\]]/g, "").trim();
  if (!cleaned) return { schema: fallbackSchema, name: "" };
  const parts = cleaned.split(".");
  if (parts.length === 1) return { schema: fallbackSchema, name: parts[0] };
  return {
    schema: parts.slice(0, -1).join("."),
    name: parts[parts.length - 1],
  };
}

function splitNameParts(value) {
  return String(value || "")
    .replace(/[`"'[\]]/g, "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

function quoteIdentifier(identifier, quote = "\"") {
  if (!identifier) return identifier;
  const escaped = String(identifier).replaceAll(quote, quote + quote);
  return `${quote}${escaped}${quote}`;
}

function quotePath(parts, quote = "\"") {
  return parts.filter(Boolean).map((part) => quoteIdentifier(part, quote)).join(".");
}

function quoteBigQueryPath(parts) {
  return `\`${parts.filter(Boolean).join(".")}\``;
}

function withSchemaName(schema, name, quote = "\"") {
  return schema
    ? `${quoteIdentifier(schema, quote)}.${quoteIdentifier(name, quote)}`
    : quoteIdentifier(name, quote);
}

function escapeSqlString(value) {
  return String(value || "").replace(/'/g, "''");
}

function toNumber(value) {
  if (value == null || value === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function pickRowValue(row, keys) {
  if (!row || typeof row !== "object") return undefined;

  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }

  const entries = Object.entries(row);
  for (const key of keys) {
    const normalizedKey = String(key).toLowerCase();
    const match = entries.find(([name]) => name.toLowerCase() === normalizedKey);
    if (match) return match[1];
  }

  return undefined;
}

function isTopLevelMissingModule(error, name) {
  if (!error || error.code !== "MODULE_NOT_FOUND") return false;
  const message = String(error.message || "");
  return message.includes(`'${name}'`) || message.includes(`"${name}"`) || message.endsWith(name);
}

async function loadModule(name) {
  try {
    return require(name);
  } catch (error) {
    const installHint = `Missing package "${name}". Run "npm --prefix server install" or "cd server && npm install", then restart the backend.`;
    if (error.code === "ERR_REQUIRE_ESM") {
      try {
        return await import(name);
      } catch (importError) {
        if (importError.code === "ERR_MODULE_NOT_FOUND") {
          throw new Error(installHint);
        }
        throw importError;
      }
    }

    if (isTopLevelMissingModule(error, name)) {
      throw new Error(installHint);
    }

    throw error;
  }
}

function parseServiceAccountJson(raw) {
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function mapSqlType(type = "") {
  const normalized = String(type).toLowerCase();
  if (
    normalized.includes("int") ||
    normalized.includes("decimal") ||
    normalized.includes("numeric") ||
    normalized.includes("float") ||
    normalized.includes("double") ||
    normalized.includes("real")
  ) return "number";
  if (normalized.includes("bool")) return "boolean";
  if (normalized.includes("date") || normalized.includes("time")) return "date";
  return "string";
}

function flattenBigQueryFields(fields = [], prefix = "") {
  const columns = [];
  for (const field of fields) {
    const name = prefix ? `${prefix}.${field.name}` : field.name;
    columns.push({
      name,
      dtype: mapSqlType(field.type || field.fieldType || "string"),
    });
    if (Array.isArray(field.fields) && field.fields.length) {
      columns.push(...flattenBigQueryFields(field.fields, name));
    }
  }
  return columns;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(Number(limit) || 1, 1), Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function createPostgresLikeAdapter(config) {
  const { Client } = await loadModule("pg");
  const client = new Client({
    host: config.host,
    port: Number(config.port || 5432),
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  return {
    async close() {
      await client.end();
    },
    async testConnection() {
      await client.query("select 1");
      return { success: true };
    },
    async listTables() {
      let tableRows;
      try {
        const result = await client.query(`
          select
            n.nspname as table_schema,
            c.relname as table_name,
            case when c.reltuples > 0 then c.reltuples::bigint else null::bigint end as row_count
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where c.relkind in ('r', 'p')
            and n.nspname not in ('information_schema', 'pg_catalog')
            and n.nspname not like 'pg_toast%'
          order by n.nspname, c.relname
        `);
        tableRows = result.rows;
      } catch (_error) {
        const result = await client.query(`
          select table_schema, table_name, null::bigint as row_count
          from information_schema.tables
          where table_type = 'BASE TABLE'
            and table_schema not in ('information_schema', 'pg_catalog')
          order by table_schema, table_name
        `);
        tableRows = result.rows;
      }

      let columnRows = [];
      try {
        const result = await client.query(`
          select
            n.nspname as table_schema,
            c.relname as table_name,
            a.attname as column_name,
            format_type(a.atttypid, a.atttypmod) as data_type
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid
          where c.relkind in ('r', 'p')
            and a.attnum > 0
            and not a.attisdropped
            and n.nspname not in ('information_schema', 'pg_catalog')
            and n.nspname not like 'pg_toast%'
          order by n.nspname, c.relname, a.attnum
        `);
        columnRows = result.rows;
      } catch (_error) {
        columnRows = [];
      }

      const columnsByTable = new Map();
      for (const row of columnRows) {
        const key = `${row.table_schema}.${row.table_name}`;
        const existing = columnsByTable.get(key) || [];
        existing.push({ name: row.column_name, dtype: mapSqlType(row.data_type) });
        columnsByTable.set(key, existing);
      }

      return tableRows.map((row) => {
        const key = `${row.table_schema}.${row.table_name}`;
        return {
          name: row.table_schema === "public" ? row.table_name : `${row.table_schema}.${row.table_name}`,
          schema: row.table_schema,
          kind: "table",
          rowCount: toNumber(row.row_count),
          columns: columnsByTable.get(key) || [],
        };
      });
    },
    async getColumns(tableName) {
      const parts = splitQualifiedName(tableName, "public");
      const schema = parts.schema || "public";
      try {
        const result = await client.query(`
          select
            a.attname as column_name,
            format_type(a.atttypid, a.atttypmod) as data_type
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid
          where n.nspname = $1
            and c.relname = $2
            and c.relkind in ('r', 'p')
            and a.attnum > 0
            and not a.attisdropped
          order by a.attnum
        `, [schema, parts.name]);
        if (result.rows.length) {
          return result.rows.map((row) => ({ name: row.column_name, dtype: mapSqlType(row.data_type) }));
        }
      } catch (_error) {
        // Fall back to information_schema below for Postgres-compatible engines with limited pg_catalog access.
      }

      const fallback = await client.query(`
        select column_name, data_type
        from information_schema.columns
        where table_schema = $1 and table_name = $2
        order by ordinal_position
      `, [schema, parts.name]);
      return fallback.rows.map((row) => ({ name: row.column_name, dtype: mapSqlType(row.data_type) }));
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      const parts = splitQualifiedName(tableName, "public");
      const sql = `select * from ${withSchemaName(parts.schema || "public", parts.name)} limit ${Number(limit)}`;
      const result = await client.query(sql);
      return sanitizeRows(result.rows);
    },
    async countTable(tableName) {
      const parts = splitQualifiedName(tableName, "public");
      const sql = `select count(*)::bigint as count from ${withSchemaName(parts.schema || "public", parts.name)}`;
      const result = await client.query(sql);
      return Number(result.rows[0]?.count || 0);
    },
    async executeSql(sql) {
      const result = await client.query(sql);
      const rows = sanitizeRows(result.rows || []);
      return {
        rows,
        columns: buildColumnInfo(rows),
      };
    },
  };
}

async function createMySqlAdapter(config) {
  const mysql = await loadModule("mysql2/promise");
  const connection = await mysql.createConnection({
    host: config.host,
    port: Number(config.port || 3306),
    database: config.database,
    user: config.username,
    password: config.password,
  });

  return {
    async close() {
      await connection.end();
    },
    async testConnection() {
      await connection.query("select 1");
      return { success: true };
    },
    async listTables() {
      const [rows] = await connection.query(`
        select table_schema, table_name, table_rows
        from information_schema.tables
        where table_type = 'BASE TABLE'
          and table_schema = database()
        order by table_name
      `);
      return rows.map((row) => ({
        name: row.TABLE_SCHEMA && row.TABLE_SCHEMA !== config.database ? `${row.TABLE_SCHEMA}.${row.TABLE_NAME}` : row.TABLE_NAME,
        schema: row.TABLE_SCHEMA,
        kind: "table",
        rowCount: toNumber(row.TABLE_ROWS),
      }));
    },
    async getColumns(tableName) {
      const parts = splitQualifiedName(tableName, config.database);
      const [rows] = await connection.query(`
        select column_name, data_type
        from information_schema.columns
        where table_schema = ? and table_name = ?
        order by ordinal_position
      `, [parts.schema || config.database, parts.name]);
      return rows.map((row) => ({ name: row.COLUMN_NAME, dtype: mapSqlType(row.DATA_TYPE) }));
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      const parts = splitQualifiedName(tableName, config.database);
      const [rows] = await connection.query(`select * from ${withSchemaName(parts.schema, parts.name, "`")} limit ?`, [Number(limit)]);
      return sanitizeRows(rows);
    },
    async countTable(tableName) {
      const parts = splitQualifiedName(tableName, config.database);
      const [rows] = await connection.query(`select count(*) as count from ${withSchemaName(parts.schema, parts.name, "`")}`);
      return Number(rows[0]?.count || 0);
    },
    async executeSql(sql) {
      const [rows] = await connection.query(sql);
      const normalized = Array.isArray(rows) ? sanitizeRows(rows) : [];
      return { rows: normalized, columns: buildColumnInfo(normalized) };
    },
  };
}

async function createSqlServerAdapter(config) {
  const sql = await loadModule("mssql");
  const pool = await sql.connect({
    server: config.host,
    database: config.database,
    user: config.username,
    password: config.password,
    options: {
      trustServerCertificate: true,
      encrypt: false,
    },
  });

  return {
    async close() {
      await pool.close();
    },
    async testConnection() {
      await pool.request().query("select 1 as ok");
      return { success: true };
    },
    async listTables() {
      const result = await pool.request().query(`
        select
          s.name as table_schema,
          t.name as table_name,
          sum(p.rows) as row_count
        from sys.tables t
        join sys.schemas s on s.schema_id = t.schema_id
        left join sys.partitions p on p.object_id = t.object_id and p.index_id in (0, 1)
        group by s.name, t.name
        order by s.name, t.name
      `);
      return result.recordset.map((row) => ({
        name: row.table_schema === "dbo" ? row.table_name : `${row.table_schema}.${row.table_name}`,
        schema: row.table_schema,
        kind: "table",
        rowCount: toNumber(row.row_count),
      }));
    },
    async getColumns(tableName) {
      const parts = splitQualifiedName(tableName, "dbo");
      const request = pool.request();
      request.input("schema", sql.VarChar, parts.schema || "dbo");
      request.input("table", sql.VarChar, parts.name);
      const result = await request.query(`
        select column_name as column_name, data_type as data_type
        from information_schema.columns
        where table_schema = @schema and table_name = @table
        order by ordinal_position
      `);
      return result.recordset.map((row) => ({ name: row.column_name, dtype: mapSqlType(row.data_type) }));
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      const parts = splitQualifiedName(tableName, "dbo");
      const result = await pool.request().query(`select top (${Number(limit)}) * from ${withSchemaName(parts.schema || "dbo", parts.name, "\"")}`);
      return sanitizeRows(result.recordset || []);
    },
    async countTable(tableName) {
      const parts = splitQualifiedName(tableName, "dbo");
      const result = await pool.request().query(`select count(*) as count from ${withSchemaName(parts.schema || "dbo", parts.name, "\"")}`);
      return Number(result.recordset?.[0]?.count || 0);
    },
    async executeSql(sqlText) {
      const result = await pool.request().query(sqlText);
      const rows = sanitizeRows(result.recordset || []);
      return { rows, columns: buildColumnInfo(rows) };
    },
  };
}

async function createSqliteAdapter(config) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(config.filePath);
  return {
    async close() {
      db.close();
    },
    async testConnection() {
      db.prepare("select 1").get();
      return { success: true };
    },
    async listTables() {
      const rows = db.prepare(`select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name`).all();
      return rows.map((row) => ({ name: row.name, schema: "", kind: "table" }));
    },
    async getColumns(tableName) {
      const rows = db.prepare(`pragma table_info(${quoteIdentifier(tableName, "\"")})`).all();
      return rows.map((row) => ({ name: row.name, dtype: mapSqlType(row.type) }));
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      const rows = db.prepare(`select * from ${quoteIdentifier(tableName, "\"")} limit ${Number(limit)}`).all();
      return sanitizeRows(rows);
    },
    async countTable(tableName) {
      const row = db.prepare(`select count(*) as count from ${quoteIdentifier(tableName, "\"")}`).get();
      return Number(row?.count || 0);
    },
    async executeSql(sql) {
      const rows = db.prepare(sql).all();
      const normalized = sanitizeRows(rows);
      return { rows: normalized, columns: buildColumnInfo(normalized) };
    },
  };
}

async function createMongoAdapter(config) {
  const client = new MongoClient(config.connectionUri);
  await client.connect();
  const db = client.db();

  return {
    async close() {
      await client.close();
    },
    async testConnection() {
      await db.command({ ping: 1 });
      return { success: true };
    },
    async listTables() {
      const collections = await db.listCollections().toArray();
      return collections.map((collection) => ({
        name: collection.name,
        schema: "",
        kind: "collection",
      }));
    },
    async getColumns(tableName) {
      const rows = sanitizeRows(await db.collection(tableName).find({}).limit(50).toArray());
      return buildColumnInfo(rows);
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      const rows = await db.collection(tableName).find({}).limit(Number(limit)).toArray();
      return sanitizeRows(rows);
    },
    async countTable(tableName) {
      return db.collection(tableName).countDocuments({});
    },
  };
}

async function createElasticAdapter(config) {
  const { Client } = await loadModule("@elastic/elasticsearch");
  const client = new Client({
    node: config.url,
    auth: config.apiKey
      ? { apiKey: config.apiKey }
      : (config.username || config.password)
        ? { username: config.username, password: config.password }
        : undefined,
  });

  return {
    async close() {},
    async testConnection() {
      await client.info();
      return { success: true };
    },
    async listTables() {
      const raw = await client.cat.indices({ format: "json" });
      const response = raw.body || raw;
      return response.map((row) => ({ name: row.index, schema: "", kind: "index" }));
    },
    async getColumns(tableName) {
      const raw = await client.indices.getMapping({ index: tableName });
      const mapping = raw.body || raw;
      const properties = mapping[tableName]?.mappings?.properties || {};
      return Object.entries(properties).map(([name, info]) => ({
        name,
        dtype: mapSqlType(info.type),
      }));
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      const raw = await client.search({
        index: tableName,
        size: Number(limit),
        query: { match_all: {} },
      });
      const response = raw.body || raw;
      return sanitizeRows(response.hits.hits.map((hit) => hit._source || {}));
    },
    async countTable(tableName) {
      const raw = await client.count({ index: tableName });
      const response = raw.body || raw;
      return Number(response.count || 0);
    },
  };
}

async function createClickHouseAdapter(config) {
  const protocol = config.secure === "true" ? "https" : "http";
  const baseUrl = `${protocol}://${config.host}:${config.port || 8123}`;

  async function query(sql) {
    const url = new URL("/", baseUrl);
    if (config.database) url.searchParams.set("database", config.database);
    url.searchParams.set("default_format", "JSON");
    url.searchParams.set("output_format_json_quote_64bit_integers", "0");

    const headers = {};
    if (config.username) headers["X-ClickHouse-User"] = config.username;
    if (config.password) headers["X-ClickHouse-Key"] = config.password;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: `${sql.trim().replace(/;+\s*$/, "")} FORMAT JSON`,
    });

    if (!response.ok) {
      throw new Error(`ClickHouse error: ${await response.text()}`);
    }

    const payload = await response.json();
    return sanitizeRows(payload.data || []);
  }

  return {
    async close() {},
    async testConnection() {
      await query("select 1 as ok");
      return { success: true };
    },
    async listTables() {
      const rows = await query(`select name, total_rows from system.tables where database = currentDatabase() order by name`);
      return rows.map((row) => ({
        name: row.name,
        schema: "",
        kind: "table",
        rowCount: toNumber(row.total_rows),
      }));
    },
    async getColumns(tableName) {
      const rows = await query(`select name, type from system.columns where database = currentDatabase() and table = '${escapeSqlString(tableName)}' order by position`);
      return rows.map((row) => ({ name: row.name, dtype: mapSqlType(row.type) }));
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      return query(`select * from ${quoteIdentifier(tableName, "`")} limit ${Number(limit)}`);
    },
    async countTable(tableName) {
      const rows = await query(`select count() as count from ${quoteIdentifier(tableName, "`")}`);
      return Number(rows[0]?.count || 0);
    },
    async executeSql(sql) {
      const rows = await query(sql);
      return { rows, columns: buildColumnInfo(rows) };
    },
  };
}

async function createSnowflakeAdapter(config) {
  const snowflakeModule = await loadModule("snowflake-sdk");
  const snowflake = snowflakeModule.default || snowflakeModule;
  const connection = snowflake.createConnection({
    account: config.account,
    username: config.username,
    password: config.password,
    warehouse: config.warehouse,
    database: config.database,
    schema: config.schema || undefined,
  });

  await new Promise((resolve, reject) => {
    connection.connect((err, conn) => {
      if (err) reject(err);
      else resolve(conn);
    });
  });

  function parseTableName(tableName) {
    const parts = splitNameParts(tableName);
    if (parts.length >= 2) {
      return { schema: parts[parts.length - 2], name: parts[parts.length - 1] };
    }
    return { schema: config.schema || "PUBLIC", name: parts[0] || "" };
  }

  async function query(sqlText) {
    return new Promise((resolve, reject) => {
      connection.execute({
        sqlText,
        complete(err, _stmt, rows) {
          if (err) reject(err);
          else resolve(sanitizeRows(rows || []));
        },
      });
    });
  }

  return {
    includeSchemaCounts: false,
    async close() {
      await new Promise((resolve, reject) => {
        connection.destroy((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    async testConnection() {
      await query("select 1 as ok");
      return { success: true };
    },
    async listTables() {
      const rows = await query(`
        select table_schema, table_name, row_count
        from information_schema.tables
        where table_type = 'BASE TABLE'
          and table_schema <> 'INFORMATION_SCHEMA'
        order by table_schema, table_name
      `);
      return rows.map((row) => ({
        name: row.TABLE_SCHEMA === (config.schema || "PUBLIC")
          ? row.TABLE_NAME
          : `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`,
        schema: row.TABLE_SCHEMA,
        kind: "table",
        rowCount: toNumber(row.ROW_COUNT),
      }));
    },
    async getColumns(tableName) {
      const parts = parseTableName(tableName);
      const rows = await query(`
        select column_name, data_type
        from information_schema.columns
        where table_schema = '${escapeSqlString(parts.schema)}'
          and table_name = '${escapeSqlString(parts.name)}'
        order by ordinal_position
      `);
      return rows.map((row) => ({
        name: row.COLUMN_NAME,
        dtype: mapSqlType(row.DATA_TYPE),
      }));
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      const parts = parseTableName(tableName);
      return query(`select * from ${quotePath([parts.schema, parts.name])} limit ${Number(limit)}`);
    },
    async countTable(tableName) {
      const parts = parseTableName(tableName);
      const rows = await query(`select count(*) as count from ${quotePath([parts.schema, parts.name])}`);
      return toNumber(pickRowValue(rows[0], ["count", "COUNT"])) || 0;
    },
    async executeSql(sql) {
      const rows = await query(sql);
      return { rows, columns: buildColumnInfo(rows) };
    },
  };
}

async function createBigQueryAdapter(config) {
  const bigQueryModule = await loadModule("@google-cloud/bigquery");
  const BigQuery = bigQueryModule.BigQuery || bigQueryModule.default?.BigQuery || bigQueryModule.default;
  const credentials = parseServiceAccountJson(config.serviceAccountJson);
  const bigquery = new BigQuery({
    projectId: config.projectId,
    credentials,
  });

  function parseTableName(tableName) {
    const parts = splitNameParts(tableName);
    if (parts.length === 3) {
      return { projectId: parts[0], datasetId: parts[1], tableId: parts[2] };
    }
    if (parts.length === 2) {
      return { projectId: config.projectId, datasetId: parts[0], tableId: parts[1] };
    }
    throw new Error(`BigQuery table names must be dataset.table or project.dataset.table. Received: ${tableName}`);
  }

  async function query(sqlText, location) {
    const [rows] = await bigquery.query({
      query: sqlText,
      useLegacySql: false,
      ...((location || config.location) ? { location: location || config.location } : {}),
    });
    return sanitizeRows(rows || []);
  }

  async function getTableMetadata(tableName) {
    const parts = parseTableName(tableName);
    const table = bigquery.dataset(parts.datasetId).table(parts.tableId);
    const [metadata] = await table.getMetadata();
    return { parts, table, metadata };
  }

  return {
    includeSchemaCounts: false,
    async close() {},
    async testConnection() {
      await query("select 1 as ok");
      return { success: true };
    },
    async listTables() {
      const [datasets] = await bigquery.getDatasets({
        autoPaginate: false,
        maxResults: BIGQUERY_MAX_DATASETS,
      });

      const tables = [];
      for (const dataset of datasets) {
        if (tables.length >= MAX_SCHEMA_TABLES) break;

        const datasetId = dataset.id || dataset.name || dataset.metadata?.datasetReference?.datasetId;
        if (!datasetId) continue;

        const [datasetTables] = await dataset.getTables({
          autoPaginate: false,
          maxResults: Math.max(MAX_SCHEMA_TABLES - tables.length, 1),
        });

        for (const table of datasetTables) {
          if (tables.length >= MAX_SCHEMA_TABLES) break;

          let metadata = {};
          try {
            [metadata] = await table.getMetadata();
          } catch (_error) {
            metadata = {};
          }

          const resolvedDatasetId = metadata.tableReference?.datasetId || datasetId;
          const tableId = metadata.tableReference?.tableId || table.id || table.name;
          if (!resolvedDatasetId || !tableId) continue;

          tables.push({
            name: `${resolvedDatasetId}.${tableId}`,
            schema: resolvedDatasetId,
            kind: String(metadata.type || "table").toLowerCase(),
            rowCount: toNumber(metadata.numRows),
            description: metadata.description || "",
            columns: flattenBigQueryFields(metadata.schema?.fields || []),
          });
        }
      }

      return tables;
    },
    async getColumns(tableName) {
      const { metadata } = await getTableMetadata(tableName);
      return flattenBigQueryFields(metadata.schema?.fields || []);
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      const { parts, metadata } = await getTableMetadata(tableName);
      return query(
        `select * from ${quoteBigQueryPath([parts.projectId, parts.datasetId, parts.tableId])} limit ${Number(limit)}`,
        metadata.location
      );
    },
    async countTable(tableName) {
      const { parts, metadata } = await getTableMetadata(tableName);
      const metadataCount = toNumber(metadata.numRows);
      if (metadataCount != null) return metadataCount;
      const rows = await query(
        `select count(*) as count from ${quoteBigQueryPath([parts.projectId, parts.datasetId, parts.tableId])}`,
        metadata.location
      );
      return toNumber(pickRowValue(rows[0], ["count", "COUNT"])) || 0;
    },
    async executeSql(sql) {
      const rows = await query(sql);
      return { rows, columns: buildColumnInfo(rows) };
    },
  };
}

async function createOracleAdapter(config) {
  const oracledbModule = await loadModule("oracledb");
  const oracledb = oracledbModule.default || oracledbModule;
  const connection = await oracledb.getConnection({
    user: config.username,
    password: config.password,
    connectString: `${config.host}:${Number(config.port || 1521)}/${config.serviceName}`,
  });

  const systemOwners = [
    "ANONYMOUS",
    "APPQOSSYS",
    "AUDSYS",
    "CTXSYS",
    "DBSNMP",
    "DIP",
    "GSMADMIN_INTERNAL",
    "MDSYS",
    "OJVMSYS",
    "OLAPSYS",
    "ORDDATA",
    "ORDSYS",
    "OUTLN",
    "SYS",
    "SYSTEM",
    "WMSYS",
    "XDB",
  ];

  function parseTableName(tableName) {
    const parts = splitNameParts(tableName);
    if (parts.length >= 2) {
      return {
        schema: parts[parts.length - 2].toUpperCase(),
        name: parts[parts.length - 1].toUpperCase(),
      };
    }

    return {
      schema: "",
      name: (parts[0] || "").toUpperCase(),
    };
  }

  async function query(sql, binds = []) {
    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    return sanitizeRows(result.rows || []);
  }

  function resolveQualifiedTable(parts) {
    if (parts.schema) return quotePath([parts.schema, parts.name]);
    return quoteIdentifier(parts.name);
  }

  return {
    includeSchemaCounts: false,
    async close() {
      await connection.close();
    },
    async testConnection() {
      await query("select 1 as ok from dual");
      return { success: true };
    },
    async listTables() {
      const bindNames = systemOwners.map((_, index) => `:owner${index}`);
      const binds = systemOwners.reduce((acc, owner, index) => {
        acc[`owner${index}`] = owner;
        return acc;
      }, {});
      const rows = await query(`
        select owner, table_name, num_rows
        from all_tables
        where owner not in (${bindNames.join(", ")})
        order by owner, table_name
      `, binds);
      const currentUser = String(config.username || "").toUpperCase();
      return rows.map((row) => ({
        name: row.OWNER === currentUser ? row.TABLE_NAME : `${row.OWNER}.${row.TABLE_NAME}`,
        schema: row.OWNER,
        kind: "table",
        rowCount: toNumber(row.NUM_ROWS),
      }));
    },
    async getColumns(tableName) {
      const parts = parseTableName(tableName);
      if (parts.schema) {
        const rows = await query(`
          select column_name, data_type
          from all_tab_columns
          where owner = :owner and table_name = :table
          order by column_id
        `, {
          owner: parts.schema,
          table: parts.name,
        });
        return rows.map((row) => ({ name: row.COLUMN_NAME, dtype: mapSqlType(row.DATA_TYPE) }));
      }

      const rows = await query(`
        select column_name, data_type
        from user_tab_columns
        where table_name = :table
        order by column_id
      `, { table: parts.name });
      return rows.map((row) => ({ name: row.COLUMN_NAME, dtype: mapSqlType(row.DATA_TYPE) }));
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      const parts = parseTableName(tableName);
      return query(`select * from ${resolveQualifiedTable(parts)} fetch first ${Number(limit)} rows only`);
    },
    async countTable(tableName) {
      const parts = parseTableName(tableName);
      const rows = await query(`select count(*) as count from ${resolveQualifiedTable(parts)}`);
      return toNumber(pickRowValue(rows[0], ["count", "COUNT"])) || 0;
    },
    async executeSql(sql) {
      const rows = await query(sql);
      return { rows, columns: buildColumnInfo(rows) };
    },
  };
}

async function createDatabricksAdapter(config) {
  const databricksModule = await loadModule("@databricks/sql");
  const DBSQLClient = databricksModule.DBSQLClient || databricksModule.default?.DBSQLClient || databricksModule.default;
  const client = await new DBSQLClient().connect({
    host: config.serverHostname,
    path: config.httpPath,
    token: config.accessToken,
  });
  const session = await client.openSession();

  async function fetchOperationRows(openOperation) {
    const operation = await openOperation();
    try {
      const rows = await operation.fetchAll();
      return sanitizeRows(rows || []);
    } finally {
      await operation.close?.();
    }
  }

  async function runSql(sqlText) {
    return fetchOperationRows(() => session.executeStatement(sqlText, { runAsync: true }));
  }

  async function getSessionContext() {
    const rows = await runSql("select current_catalog() as catalog, current_database() as schema");
    return {
      catalog: pickRowValue(rows[0], ["catalog", "CATALOG", "current_catalog()", "CURRENT_CATALOG()"]) || "spark_catalog",
      schema: pickRowValue(rows[0], ["schema", "SCHEMA", "current_database()", "CURRENT_DATABASE()"]) || "default",
    };
  }

  function parseTableName(tableName, context) {
    const parts = splitNameParts(tableName);
    if (parts.length >= 3) {
      return { catalog: parts[0], schema: parts[1], name: parts.slice(2).join(".") };
    }
    if (parts.length === 2) {
      return { catalog: context.catalog, schema: parts[0], name: parts[1] };
    }
    return { catalog: context.catalog, schema: context.schema, name: parts[0] || "" };
  }

  function resolveTableReference(parts) {
    return quotePath([parts.catalog, parts.schema, parts.name], "`");
  }

  return {
    includeSchemaCounts: false,
    async close() {
      await session.close();
      await client.close();
    },
    async testConnection() {
      await runSql("select 1 as ok");
      return { success: true };
    },
    async listTables() {
      const tables = [];
      let catalogRows = [];

      try {
        catalogRows = await fetchOperationRows(() => session.getCatalogs({}));
      } catch (_error) {
        const context = await getSessionContext();
        catalogRows = [{ TABLE_CAT: context.catalog }];
      }

      for (const catalogRow of catalogRows.slice(0, DATABRICKS_MAX_CATALOGS)) {
        if (tables.length >= MAX_SCHEMA_TABLES) break;

        const catalog = pickRowValue(catalogRow, ["TABLE_CAT", "table_cat", "catalog", "CATALOG"]);
        if (!catalog) continue;

        let schemaRows = [];
        try {
          schemaRows = await fetchOperationRows(() => session.getSchemas({ catalogName: catalog }));
        } catch (_error) {
          const context = await getSessionContext();
          schemaRows = [{ TABLE_SCHEM: context.schema }];
        }

        for (const schemaRow of schemaRows) {
          if (tables.length >= MAX_SCHEMA_TABLES) break;

          const schema = pickRowValue(schemaRow, ["TABLE_SCHEM", "table_schem", "schema", "SCHEMA"]);
          if (!schema) continue;

          const tableRows = await fetchOperationRows(() => session.getTables({
            catalogName: catalog,
            schemaName: schema,
          }));

          for (const tableRow of tableRows) {
            if (tables.length >= MAX_SCHEMA_TABLES) break;
            const tableName = pickRowValue(tableRow, ["TABLE_NAME", "table_name", "name", "NAME"]);
            if (!tableName) continue;
            const tableType = String(pickRowValue(tableRow, ["TABLE_TYPE", "table_type", "type", "TYPE"]) || "table").toLowerCase();
            tables.push({
              name: `${catalog}.${schema}.${tableName}`,
              schema: `${catalog}.${schema}`,
              kind: tableType,
            });
          }
        }
      }

      return tables;
    },
    async getColumns(tableName) {
      const context = await getSessionContext();
      const parts = parseTableName(tableName, context);
      const rows = await runSql(`describe table ${resolveTableReference(parts)}`);
      return rows
        .filter((row) => {
          const name = String(pickRowValue(row, ["col_name", "column_name", "name", "NAME"]) || "").trim();
          return Boolean(name) && !name.startsWith("#");
        })
        .map((row) => ({
          name: pickRowValue(row, ["col_name", "column_name", "name", "NAME"]),
          dtype: mapSqlType(pickRowValue(row, ["data_type", "type", "TYPE", "dtype"])),
        }));
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      const context = await getSessionContext();
      const parts = parseTableName(tableName, context);
      return runSql(`select * from ${resolveTableReference(parts)} limit ${Number(limit)}`);
    },
    async countTable(tableName) {
      const context = await getSessionContext();
      const parts = parseTableName(tableName, context);
      const rows = await runSql(`select count(*) as count from ${resolveTableReference(parts)}`);
      return toNumber(pickRowValue(rows[0], ["count", "COUNT"])) || 0;
    },
    async executeSql(sql) {
      const rows = await runSql(sql);
      return { rows, columns: buildColumnInfo(rows) };
    },
  };
}

async function createDuckDbAdapter(config) {
  const duckdbModule = await loadModule("@duckdb/node-api");
  const DuckDBInstance = duckdbModule.DuckDBInstance || duckdbModule.default?.DuckDBInstance;
  if (!DuckDBInstance) {
    throw new Error("The installed DuckDB package does not expose DuckDBInstance.");
  }

  const instance = await DuckDBInstance.create(config.filePath);
  const connection = await instance.connect();

  async function query(sql) {
    const reader = await connection.runAndReadAll(sql);
    const rawRows = reader.getRows ? reader.getRows() : [];
    const columnNames = reader.columnNames ? reader.columnNames() : [];
    const rows = Array.isArray(rawRows) && rawRows.length && Array.isArray(rawRows[0])
      ? rawRows.map((row) => Object.fromEntries(columnNames.map((name, index) => [name, row[index]])))
      : rawRows;
    return sanitizeRows(rows || []);
  }

  return {
    async close() {
      connection.closeSync?.();
      connection.disconnectSync?.();
      instance.closeSync?.();
    },
    async testConnection() {
      await connection.run("select 1 as ok");
      return { success: true };
    },
    async listTables() {
      const rows = await query(`
        select table_schema, table_name, table_type
        from information_schema.tables
        where table_schema not in ('information_schema', 'pg_catalog')
        order by table_schema, table_name
      `);
      return rows.map((row) => ({
        name: row.table_schema === "main" ? row.table_name : `${row.table_schema}.${row.table_name}`,
        schema: row.table_schema,
        kind: String(row.table_type || "table").toLowerCase(),
      }));
    },
    async getColumns(tableName) {
      const parts = splitQualifiedName(tableName, "main");
      const rows = await query(`
        select column_name, data_type
        from information_schema.columns
        where table_schema = '${escapeSqlString(parts.schema || "main")}'
          and table_name = '${escapeSqlString(parts.name)}'
        order by ordinal_position
      `);
      return rows.map((row) => ({ name: row.column_name, dtype: mapSqlType(row.data_type) }));
    },
    async fetchRows(tableName, limit = MAX_DB_SCAN_ROWS) {
      const parts = splitQualifiedName(tableName, "main");
      return query(`select * from ${withSchemaName(parts.schema || "main", parts.name)} limit ${Number(limit)}`);
    },
    async countTable(tableName) {
      const parts = splitQualifiedName(tableName, "main");
      const rows = await query(`select count(*) as count from ${withSchemaName(parts.schema || "main", parts.name)}`);
      return toNumber(pickRowValue(rows[0], ["count", "COUNT"])) || 0;
    },
    async executeSql(sql) {
      const rows = await query(sql);
      return { rows, columns: buildColumnInfo(rows) };
    },
  };
}

async function createAdapter(conn) {
  switch (conn.dbType) {
    case "postgresql":
    case "redshift":
      return createPostgresLikeAdapter(conn.config);
    case "mysql":
    case "mariadb":
      return createMySqlAdapter(conn.config);
    case "sqlserver":
      return createSqlServerAdapter(conn.config);
    case "sqlite":
      return createSqliteAdapter(conn.config);
    case "mongodb":
      return createMongoAdapter(conn.config);
    case "clickhouse":
      return createClickHouseAdapter(conn.config);
    case "elasticsearch":
      return createElasticAdapter(conn.config);
    case "snowflake":
      return createSnowflakeAdapter(conn.config);
    case "bigquery":
      return createBigQueryAdapter(conn.config);
    case "oracle":
      return createOracleAdapter(conn.config);
    case "databricks":
      return createDatabricksAdapter(conn.config);
    case "duckdb":
      return createDuckDbAdapter(conn.config);
    default:
      throw new Error(`Real querying is not implemented yet for ${conn.dbType}.`);
  }
}

async function withAdapter(conn, work) {
  const adapter = await createAdapter(conn);
  try {
    return await work(adapter);
  } finally {
    await adapter.close?.();
  }
}

async function testLiveConnection(conn) {
  return withAdapter(conn, (adapter) => adapter.testConnection());
}

async function listLiveTables(conn) {
  return withAdapter(conn, async (adapter) => {
    const tables = await adapter.listTables();
    return tables.slice(0, MAX_SCHEMA_TABLES).map((table) => ({
      name: table.name,
      kind: table.kind || "table",
      description: table.description || "",
      rowCount: typeof table.rowCount === "number" ? table.rowCount : undefined,
      columns: Array.isArray(table.columns)
        ? table.columns.map((column) => ({
            name: column.name,
            dtype: column.dtype || "string",
            nonNullCount: 0,
            uniqueCount: 0,
            sampleValues: [],
          }))
        : [],
      rows: [],
    }));
  });
}

async function getLiveSchema(conn, options = {}) {
  const {
    tableName,
    includeColumns = true,
    includeCounts = false,
  } = options;

  return withAdapter(conn, async (adapter) => {
    const listedTables = await adapter.listTables();
    const filteredTables = tableName
      ? listedTables.filter((table) => table.name === tableName)
      : listedTables.slice(0, MAX_SCHEMA_TABLES);

    const tables = tableName && filteredTables.length === 0
      ? [{ name: tableName, kind: "table", description: "", rowCount: undefined }]
      : filteredTables;

    const enriched = await mapWithConcurrency(tables, SCHEMA_METADATA_CONCURRENCY, async (table) => {
      const summaryColumns = Array.isArray(table.columns) ? table.columns : [];
      const shouldFetchColumns = includeColumns && summaryColumns.length === 0 && adapter.getColumns;
      const rowCountPromise = typeof table.rowCount === "number"
        ? Promise.resolve(table.rowCount)
        : includeCounts && adapter.countTable && adapter.includeSchemaCounts !== false
          ? adapter.countTable(table.name).catch(() => undefined)
          : Promise.resolve(undefined);

      const [columns, rowCount] = await Promise.all([
        shouldFetchColumns ? adapter.getColumns(table.name).catch(() => []) : Promise.resolve([]),
        rowCountPromise,
      ]);
      const resolvedColumns = columns.length ? columns : summaryColumns;

      return {
        name: table.name,
        kind: table.kind || "table",
        description: table.description || "",
        rowCount,
        columns: resolvedColumns.length ? resolvedColumns.map((column) => ({
          name: column.name,
          dtype: column.dtype || "string",
          nonNullCount: 0,
          uniqueCount: 0,
          sampleValues: [],
        })) : [],
        rows: [],
      };
    });

    return enriched;
  });
}

async function previewLiveTable(conn, tableName, limit = 100) {
  return withAdapter(conn, async (adapter) => {
    const rowCountPromise = adapter.countTable
      ? adapter.countTable(tableName).catch(() => undefined)
      : Promise.resolve(undefined);

    const [rows, columns, rowCount] = await Promise.all([
      adapter.fetchRows(tableName, limit),
      adapter.getColumns(tableName).catch(() => []),
      rowCountPromise,
    ]);

    return {
      rows,
      rowCount,
      columns: buildColumnInfo(rows, Object.fromEntries(columns.map((column) => [column.name, column.dtype]))),
    };
  });
}

async function executeLiveOperation(conn, tableName, operation, params = {}) {
  return withAdapter(conn, async (adapter) => {
    if (adapter.executeOperation) {
      return adapter.executeOperation(tableName, operation, params);
    }

    if (operation === "preview_table") {
      const preview = await previewLiveTable(conn, tableName, params.limit || params.n || 100);
      return {
        data: preview.rows,
        columns: preview.columns,
        rowCount: preview.rows.length,
        message: `Returned ${preview.rows.length} preview rows from ${tableName}.`,
      };
    }

    if (operation === "head") {
      const preview = await previewLiveTable(conn, tableName, params.n || params.limit || 10);
      return {
        data: preview.rows,
        columns: preview.columns,
        rowCount: preview.rows.length,
        message: `Returned ${preview.rows.length} rows from ${tableName}.`,
      };
    }

    if (operation === "count" && adapter.countTable) {
      const count = await adapter.countTable(tableName);
      const countResult = { result: count };
      return {
        data: countResult,
        columns: buildColumnInfo([countResult]),
        rowCount: 1,
        message: `Counted ${count} rows in ${tableName}.`,
      };
    }

    throw new Error(
      `${conn.dbType} does not yet have a native translator for '${operation}'. ` +
      "Refusing to load database rows into memory for workbook-style execution."
    );
  });
}

async function executeLiveSql(conn, sql) {
  return withAdapter(conn, async (adapter) => {
    if (!adapter.executeSql) {
      throw new Error(`${conn.dbType} does not support raw SQL execution in this release.`);
    }
    const result = await adapter.executeSql(sql);
    return {
      data: result.rows,
      columns: result.columns,
      rowCount: result.rows.length,
      message: `Executed SQL against ${conn.name}.`,
    };
  });
}

module.exports = {
  testLiveConnection,
  listLiveTables,
  getLiveSchema,
  previewLiveTable,
  executeLiveOperation,
  executeLiveSql,
};
