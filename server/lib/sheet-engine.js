// ─── Server-Side Sheet Execution Engine (F15) ─────────────────────────────────
// Executes SQL against uploaded workbook data (datasets.fileData) on the
// server — used by the scheduler, alerts and public API where no browser
// DuckDB-WASM is available.
//
// Engine selection (graceful degradation, never breaks deployment):
//   1. `duckdb` npm package if installed (optional — run `npm i duckdb` in
//      server/ to enable full SQL support; not in package.json on purpose so
//      the Lambda bundle stays small by default).
//   2. Built-in pure-JS mini engine covering the common analytical patterns
//      the agent generates: SELECT [DISTINCT] cols/aggregates FROM t
//      [WHERE ...] [GROUP BY ...] [ORDER BY ...] [LIMIT n].

let duckdbModule; // undefined = not probed, null = unavailable

function getDuckDb() {
  if (duckdbModule !== undefined) return duckdbModule;
  try {
    // eslint-disable-next-line global-require
    duckdbModule = require("duckdb");
  } catch {
    duckdbModule = null;
  }
  return duckdbModule;
}

function isEngineAvailable() {
  return true; // mini engine always present; duckdb upgrades capability
}

// ── DuckDB path ──────────────────────────────────────────────────────────────
async function executeWithDuckDb(rows, tableName, sql) {
  const duckdb = getDuckDb();
  const db = new duckdb.Database(":memory:");
  const conn = db.connect();
  const run = (q, ...params) =>
    new Promise((resolve, reject) =>
      conn.all(q, ...params, (err, res) => (err ? reject(err) : resolve(res)))
    );
  try {
    await run(`CREATE TABLE "${tableName.replace(/"/g, '""')}" AS SELECT * FROM read_json_auto(?)`,
      JSON.stringify(rows));
    const result = await run(sql);
    return result;
  } finally {
    try { conn.close(); db.close(); } catch { /* already closed */ }
  }
}

// ── Pure-JS mini engine ──────────────────────────────────────────────────────
// Supports: SELECT [DISTINCT] <cols|aggs> FROM <t> [WHERE <cond [AND cond]*>]
// [GROUP BY col[, col]] [ORDER BY col [ASC|DESC]] [LIMIT n]
// Conditions: col <op> value with =, !=, <>, >, >=, <, <=, LIKE, IN (...)
// Aggregates: COUNT(*|col), SUM, AVG, MIN, MAX [DISTINCT not in aggs].

function stripQuotes(s) {
  return s.replace(/^["'`[]|["'`\]]$/g, "");
}

function parseValue(raw) {
  const t = raw.trim();
  if (/^'(.*)'$/s.test(t)) return t.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true";
  if (/^null$/i.test(t)) return null;
  return stripQuotes(t);
}

function resolveColumn(row, name) {
  const clean = stripQuotes(name.trim());
  if (clean in row) return row[clean];
  const lower = clean.toLowerCase();
  for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k];
  return undefined;
}

function compileCondition(cond) {
  const inMatch = cond.match(/^\s*(.+?)\s+(NOT\s+)?IN\s*\((.+)\)\s*$/i);
  if (inMatch) {
    const [, col, not, list] = inMatch;
    const values = list.split(",").map((v) => parseValue(v));
    const set = new Set(values.map((v) => (typeof v === "string" ? v.toLowerCase() : v)));
    return (row) => {
      const v = resolveColumn(row, col);
      const hit = set.has(typeof v === "string" ? v.toLowerCase() : v);
      return not ? !hit : hit;
    };
  }
  const likeMatch = cond.match(/^\s*(.+?)\s+(NOT\s+)?LIKE\s+'(.*)'\s*$/i);
  if (likeMatch) {
    const [, col, not, pattern] = likeMatch;
    const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
    return (row) => {
      const v = resolveColumn(row, col);
      const hit = v !== null && v !== undefined && re.test(String(v));
      return not ? !hit : hit;
    };
  }
  const nullMatch = cond.match(/^\s*(.+?)\s+IS\s+(NOT\s+)?NULL\s*$/i);
  if (nullMatch) {
    const [, col, not] = nullMatch;
    return (row) => {
      const v = resolveColumn(row, col);
      const isNull = v === null || v === undefined || v === "";
      return not ? !isNull : isNull;
    };
  }
  const opMatch = cond.match(/^\s*(.+?)\s*(>=|<=|!=|<>|=|>|<)\s*(.+?)\s*$/);
  if (!opMatch) throw new Error(`Unsupported condition: ${cond}`);
  const [, col, op, rawVal] = opMatch;
  const val = parseValue(rawVal);
  return (row) => {
    let v = resolveColumn(row, col);
    if (v === undefined || v === null) return false;
    let cmp = val;
    if (typeof cmp === "number") v = Number(v);
    else if (typeof v === "string" && typeof cmp === "string") {
      v = v.toLowerCase();
      cmp = cmp.toLowerCase();
    }
    switch (op) {
      case "=": return v === cmp;
      case "!=": case "<>": return v !== cmp;
      case ">": return v > cmp;
      case ">=": return v >= cmp;
      case "<": return v < cmp;
      case "<=": return v <= cmp;
      default: return false;
    }
  };
}

const AGG_RE = /^(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(\*|[^)]+?)\s*\)(?:\s+AS\s+(\S+))?$/i;

function computeAggregate(fn, col, rows) {
  if (fn === "COUNT" && col === "*") return rows.length;
  const nums = rows
    .map((r) => (col === "*" ? 1 : resolveColumn(r, col)))
    .filter((v) => v !== null && v !== undefined && v !== "");
  if (fn === "COUNT") return nums.length;
  const numeric = nums.map(Number).filter((n) => Number.isFinite(n));
  if (numeric.length === 0) return null;
  switch (fn) {
    case "SUM": return numeric.reduce((a, b) => a + b, 0);
    case "AVG": return numeric.reduce((a, b) => a + b, 0) / numeric.length;
    case "MIN": return Math.min(...numeric);
    case "MAX": return Math.max(...numeric);
    default: return null;
  }
}

function executeWithMiniEngine(rows, tableName, sql) {
  const clean = sql.replace(/\s+/g, " ").replace(/;+\s*$/, "").trim();
  const m = clean.match(
    /^SELECT\s+(DISTINCT\s+)?(.+?)\s+FROM\s+(\S+)(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i
  );
  if (!m) throw new Error("MINI_ENGINE_UNSUPPORTED");
  const [, distinct, selectList, fromTable, whereClause, groupBy, orderBy, limitStr] = m;

  const from = stripQuotes(fromTable);
  if (from.toLowerCase() !== String(tableName).toLowerCase()) {
    throw new Error(`Unknown table "${from}" — expected "${tableName}"`);
  }

  let working = rows;
  if (whereClause) {
    // Split on top-level AND only (no OR/parens support → punt to error)
    if (/\bOR\b|\(/i.test(whereClause.replace(/'[^']*'/g, ""))) throw new Error("MINI_ENGINE_UNSUPPORTED");
    const preds = whereClause.split(/\s+AND\s+/i).map(compileCondition);
    working = working.filter((r) => preds.every((p) => p(r)));
  }

  const selects = selectList.split(",").map((s) => s.trim());
  const isStarOnly = selects.length === 1 && selects[0] === "*";
  const aggSelects = selects.map((s) => s.match(AGG_RE)).filter(Boolean);

  let out;
  if (groupBy) {
    const groupCols = groupBy.split(",").map((s) => stripQuotes(s.trim()));
    const groups = new Map();
    for (const row of working) {
      const key = groupCols.map((c) => String(resolveColumn(row, c))).join("");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    out = [];
    for (const groupRows of groups.values()) {
      const rec = {};
      for (const s of selects) {
        const agg = s.match(AGG_RE);
        if (agg) {
          const [, fn, col, alias] = agg;
          rec[alias || s] = computeAggregate(fn.toUpperCase(), stripQuotes(col), groupRows);
        } else {
          const aliasMatch = s.match(/^(.+?)\s+AS\s+(\S+)$/i);
          const colName = stripQuotes((aliasMatch ? aliasMatch[1] : s).trim());
          rec[aliasMatch ? stripQuotes(aliasMatch[2]) : colName] = resolveColumn(groupRows[0], colName);
        }
      }
      out.push(rec);
    }
  } else if (aggSelects.length > 0) {
    const rec = {};
    for (const s of selects) {
      const agg = s.match(AGG_RE);
      if (!agg) throw new Error("MINI_ENGINE_UNSUPPORTED"); // mixed agg + plain col without GROUP BY
      const [, fn, col, alias] = agg;
      rec[alias || s] = computeAggregate(fn.toUpperCase(), stripQuotes(col), working);
    }
    out = [rec];
  } else if (isStarOnly) {
    out = working.map((r) => ({ ...r }));
  } else {
    out = working.map((row) => {
      const rec = {};
      for (const s of selects) {
        const aliasMatch = s.match(/^(.+?)\s+AS\s+(\S+)$/i);
        const colName = stripQuotes((aliasMatch ? aliasMatch[1] : s).trim());
        rec[aliasMatch ? stripQuotes(aliasMatch[2]) : colName] = resolveColumn(row, colName);
      }
      return rec;
    });
  }

  if (distinct) {
    const seen = new Set();
    out = out.filter((r) => {
      const key = JSON.stringify(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (orderBy) {
    const parts = orderBy.split(",").map((s) => {
      const om = s.trim().match(/^(.+?)(?:\s+(ASC|DESC))?$/i);
      return { col: stripQuotes(om[1].trim()), desc: /desc/i.test(om[2] || "") };
    });
    out.sort((a, b) => {
      for (const { col, desc } of parts) {
        const av = resolveColumn(a, col);
        const bv = resolveColumn(b, col);
        if (av === bv) continue;
        const an = Number(av);
        const bn = Number(bv);
        const cmp = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(av).localeCompare(String(bv));
        if (cmp !== 0) return desc ? -cmp : cmp;
      }
      return 0;
    });
  }

  if (limitStr) out = out.slice(0, parseInt(limitStr, 10));
  return out;
}

/**
 * Execute SQL against one sheet of a stored workbook.
 * @param {object} fileData - the dataset's stored fileData
 * @param {string} sheetName - which sheet (defaults to first)
 * @param {string} sql - SELECT statement; the table name should match the sheet
 * @returns {Promise<{ rows: object[], engine: "duckdb"|"mini" }>}
 */
async function executeSheetSql(fileData, sheetName, sql) {
  const sheets = fileData?.sheets && typeof fileData.sheets === "object" ? fileData.sheets : fileData;
  if (!sheets || typeof sheets !== "object") throw new Error("Dataset has no stored file data");
  const name = sheetName || Object.keys(sheets)[0];
  const sheet = sheets[name];
  if (!sheet || !Array.isArray(sheet.rows)) throw new Error(`Sheet "${name}" not found in dataset`);

  // Normalize the table identifier the SQL refers to: allow "data", the sheet
  // name, or a quoted variant. We pass the actual sheet name as table name.
  const tableName = name;
  const normalizedSql = sql.replace(/\bFROM\s+("?)data\1\b/i, `FROM "${tableName.replace(/"/g, '""')}"`);

  if (getDuckDb()) {
    const rows = await executeWithDuckDb(sheet.rows, tableName, normalizedSql);
    return { rows, engine: "duckdb" };
  }
  try {
    const rows = executeWithMiniEngine(sheet.rows, tableName, normalizedSql);
    return { rows, engine: "mini" };
  } catch (err) {
    if (err.message === "MINI_ENGINE_UNSUPPORTED") {
      throw new Error(
        "This SQL shape needs the full server engine. Install the optional 'duckdb' package in server/ to enable it, or simplify the query (single-table SELECT with WHERE/GROUP BY/ORDER BY/LIMIT)."
      );
    }
    throw err;
  }
}

module.exports = { executeSheetSql, isEngineAvailable, executeWithMiniEngine };
