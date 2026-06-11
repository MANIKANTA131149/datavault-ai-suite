// ─── DuckDB-WASM SQL Engine ───────────────────────────────────────────────────
// In-browser analytical SQL over uploaded workbook sheets. This is the
// deterministic execution substrate for the SQL-first agent: the LLM writes
// plain DuckDB SQL (a language it knows deeply) instead of a bespoke operation
// DSL, and the engine produces exact, reproducible results.
//
// Everything is lazy: the ~5MB WASM bundle is only fetched the first time a
// file/sheet query actually runs. If init fails (CSP, offline, unsupported
// browser) callers fall back to the legacy operation-DSL agent.

import type { SheetData } from "@/lib/file-parser";

type WorkbookSheets = Record<string, SheetData>;

export interface SqlResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;        // rows returned (possibly truncated)
  totalRowCount: number;   // rows the query actually produced
  truncated: boolean;
}

export interface SqlError {
  error: string;
}

export interface RegisteredTable {
  sheetName: string;
  tableName: string;
  rowCount: number;
  columns: { name: string; sqlType: string }[];
}

// Singleton connection state. One DuckDB instance per app session; tables are
// (re)registered per workbook via loadWorkbook().
let dbPromise: Promise<any> | null = null;
let connPromise: Promise<any> | null = null;
let registeredTables: RegisteredTable[] = [];
let loadedWorkbookKey = "";

async function initDuckDB(): Promise<any> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const duckdb = await import("@duckdb/duckdb-wasm");
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);
    // Same-origin worker shim: the worker script lives on jsDelivr, so wrap it
    // in a blob that importScripts() the real URL.
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
    );
    const worker = new Worker(workerUrl);
    const logger = new duckdb.VoidLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    return db;
  })();
  dbPromise.catch(() => { dbPromise = null; }); // allow retry after a failed init
  return dbPromise;
}

async function getConnection(): Promise<any> {
  if (connPromise) return connPromise;
  connPromise = initDuckDB().then((db) => db.connect());
  connPromise.catch(() => { connPromise = null; });
  return connPromise;
}

/** True if the SQL engine has been successfully initialized at least once. */
export function isSqlEngineReady(): boolean {
  return dbPromise !== null;
}

// Sheet names like "Sales Data (2024)" become safe identifiers like sales_data_2024.
export function toTableName(sheetName: string, taken: Set<string>): string {
  let base = sheetName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  if (!base) base = "sheet";
  if (/^\d/.test(base)) base = `t_${base}`;
  let name = base;
  let i = 2;
  while (taken.has(name)) name = `${base}_${i++}`;
  taken.add(name);
  return name;
}

// Arrow → plain JS. BigInt/Date/etc. must become JSON-serializable values the
// rest of the app (tables, charts, LLM context) can consume.
function toPlainValue(v: any): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : v.toString();
  }
  // JSON-typed columns (mixed-type sheet data) serialize strings WITH their
  // quotes ('"7"') — unwrap so the user sees the original value.
  if (typeof v === "string" && v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v; }
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (typeof v.toJSON === "function") return v.toJSON();
    if (Array.isArray(v)) return v.map(toPlainValue);
    return String(v);
  }
  return v;
}

// Best-effort conversion of any date representation (JS Date, ISO/locale text,
// Excel serial number, YYYYMMDD, epoch ms) to "YYYY-MM-DD". Returns null when
// the value doesn't look like a date at all.
function toISODate(v: any): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 1e11) { const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); } // epoch ms
    if (v >= 19000101 && v <= 21001231 && Number.isInteger(v)) { // YYYYMMDD as a number
      const s = String(v);
      const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    if (v > 20000 && v < 80000) { // Excel serial day (1954–2118)
      const d = new Date(Math.round((v - 25569) * 86400000));
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    return null;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (/^\d{8}$/.test(s)) {
      const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

// Timestamp/date columns arrive from Arrow as epoch milliseconds — render them
// as readable ISO strings ("2025-06-01"), never as 1,748,736,000,000.
function epochToISO(v: any): any {
  if (v === null || v === undefined) return null;
  const ms = typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(ms)) return toPlainValue(v);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return toPlainValue(v);
  const iso = d.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
}

/**
 * Register all sheets of a workbook as DuckDB tables. Idempotent per workbook:
 * passing the same workbookKey twice is a no-op; a new key drops and reloads.
 * Data is loaded via JSON registration so DuckDB infers proper column types
 * (numbers stay numbers, "230 Nm" stays text for TRY_CAST extraction).
 */
export async function loadWorkbook(sheets: WorkbookSheets, workbookKey: string): Promise<RegisteredTable[]> {
  const conn = await getConnection();
  if (workbookKey && workbookKey === loadedWorkbookKey && registeredTables.length > 0) {
    return registeredTables;
  }
  const db = await initDuckDB();

  // Drop previous workbook's tables
  for (const t of registeredTables) {
    try { await conn.query(`DROP TABLE IF EXISTS "${t.tableName}"`); } catch { /* ignore */ }
  }
  registeredTables = [];

  const taken = new Set<string>();
  for (const [sheetName, sheet] of Object.entries(sheets)) {
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    const tableName = toTableName(sheetName, taken);
    const fileName = `${tableName}.json`;
    try {
      // Normalize mixed-type columns before ingestion. A column holding both
      // 7 and "7" would otherwise become a DuckDB JSON column, which renders
      // string values with literal quotes and breaks TRY_CAST math. Coerce
      // each column to its declared dtype so types are uniform.
      const colTypes = new Map((sheet?.columns ?? []).map((c) => [c.name, c.dtype]));
      // Metadata names can drift from row keys (trimming, casing) — also index
      // by trimmed name so a mismatch doesn't silently skip normalization.
      for (const c of sheet?.columns ?? []) {
        const t = c.name.trim();
        if (t !== c.name && !colTypes.has(t)) colTypes.set(t, c.dtype);
      }
      // Independent mixed-type scan: any column observed holding BOTH numbers
      // and strings is forced to string, regardless of metadata. This is what
      // prevents DuckDB JSON columns (whose string values render as '"7"').
      const sawNum = new Set<string>(); const sawStr = new Set<string>();
      for (const r of rows.slice(0, 500)) {
        for (const k of Object.keys(r ?? {})) {
          const v = r[k];
          if (typeof v === "number") sawNum.add(k);
          else if (typeof v === "string" && v !== "") sawStr.add(k);
        }
      }
      const forcedString = new Set([...sawNum].filter((k) => sawStr.has(k)));
      // Date-like columns: declared dtype "date", or a date-ish name whose
      // sampled values overwhelmingly parse as dates (catches "OrderDate"
      // stored as "20230315" numbers or locale text the parser typed string).
      const dateLikeCols = new Set<string>();
      for (const c of sheet?.columns ?? []) {
        if (c.dtype === "date") { dateLikeCols.add(c.name); continue; }
        if (!/date|time|_at$|_on$/i.test(c.name)) continue;
        let seen = 0, parsed = 0;
        for (const r of rows) {
          const v = r?.[c.name];
          if (v === null || v === undefined || v === "") continue;
          seen++;
          if (toISODate(v) !== null) parsed++;
          if (seen >= 20) break;
        }
        if (seen > 0 && parsed / seen >= 0.9) dateLikeCols.add(c.name);
      }
      const normalized = rows.map((r) => {
        const out: Record<string, any> = {};
        for (const k of Object.keys(r ?? {})) {
          const v = r[k];
          if (v === null || v === undefined || v === "") { out[k] = null; continue; }
          if (dateLikeCols.has(k)) {
            const iso = toISODate(v);
            out[k] = iso ?? (typeof v === "string" ? v : String(v));
            continue;
          }
          const dtype = colTypes.get(k) ?? colTypes.get(k.trim());
          if (dtype === undefined && forcedString.has(k)) { out[k] = String(v); continue; }
          if (dtype === "number") {
            if (typeof v === "number") { out[k] = v; continue; }
            // Unparseable text in a numeric column ("N/A") → NULL, keeping the
            // column uniformly numeric so SQL aggregates stay correct.
            const n = parseFloat(String(v).replace(/,/g, ""));
            out[k] = Number.isFinite(n) ? n : null;
            continue;
          }
          if (dtype === "string") { out[k] = typeof v === "string" ? v : String(v); continue; }
          out[k] = v;
        }
        return out;
      });
      await db.registerFileText(fileName, JSON.stringify(normalized));
      // union_by_name handles rows with missing keys; sample everything so
      // type inference sees the whole sheet, not the first 100 rows.
      await conn.query(
        `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_json_auto('${fileName}', sample_size=-1, union_by_name=true)`
      );
      const desc = await conn.query(`DESCRIBE "${tableName}"`);
      const columns = desc.toArray().map((r: any) => {
        const o = typeof r.toJSON === "function" ? r.toJSON() : r;
        return { name: String(o.column_name), sqlType: String(o.column_type) };
      });
      registeredTables.push({ sheetName, tableName, rowCount: rows.length, columns });
    } catch (err: any) {
      console.error(`sql-engine: failed to register sheet "${sheetName}":`, err);
    } finally {
      try { await db.dropFile(fileName); } catch { /* ignore */ }
    }
  }
  loadedWorkbookKey = workbookKey;
  if (registeredTables.length === 0) {
    throw new Error("No sheets could be registered as SQL tables.");
  }
  return registeredTables;
}

const WRITE_PATTERN = /^\s*(insert|update|delete|drop|alter|create|attach|copy|export|import|install|load|set|pragma|call|vacuum|truncate)\b/i;

/**
 * Run a read-only SQL query against the registered tables.
 * Returns rows as plain objects (max `maxRows`, default 5000).
 */
export async function runSQL(sql: string, maxRows = 5000): Promise<SqlResult | SqlError> {
  const trimmed = (sql || "").trim().replace(/;+\s*$/, "");
  if (!trimmed) return { error: "Empty SQL statement." };
  if (WRITE_PATTERN.test(trimmed)) {
    return { error: "Only read-only SELECT/WITH queries are allowed. Rewrite the statement as a SELECT." };
  }
  let conn: any;
  try {
    conn = await getConnection();
  } catch (err: any) {
    return { error: `SQL engine unavailable: ${err?.message || String(err)}` };
  }
  try {
    const table = await conn.query(trimmed);
    const columns: string[] = table.schema.fields.map((f: any) => String(f.name));
    // Date/timestamp columns need epoch→ISO conversion (Arrow hands back millis).
    const isTemporal = new Map<string, boolean>(
      table.schema.fields.map((f: any) => [String(f.name), /timestamp|date/i.test(String(f.type))])
    );
    const all = table.toArray();
    const totalRowCount = all.length;
    const truncated = totalRowCount > maxRows;
    const slice = truncated ? all.slice(0, maxRows) : all;
    const rows: Record<string, any>[] = slice.map((r: any) => {
      const o = typeof r.toJSON === "function" ? r.toJSON() : r;
      const out: Record<string, any> = {};
      for (const c of columns) out[c] = isTemporal.get(c) ? epochToISO(o[c]) : toPlainValue(o[c]);
      return out;
    });
    return { columns, rows, rowCount: rows.length, totalRowCount, truncated };
  } catch (err: any) {
    return { error: `SQL error: ${err?.message || String(err)}` };
  }
}

/**
 * Compact schema block for the agent prompt: tables, types, sample values.
 * Low-cardinality text columns get their COMPLETE distinct value list so the
 * model filters on values that actually exist instead of hallucinating them.
 */
export function buildSqlSchemaBlock(tables: RegisteredTable[], sheets: WorkbookSheets): string {
  const parts: string[] = [];
  for (const t of tables) {
    const sheet = sheets[t.sheetName];
    const rows = sheet?.rows ?? [];
    const lines = t.columns.map((c) => {
      const meta = sheet?.columns?.find((sc) => sc.name === c.name);
      // Categorical column: enumerate every distinct value (grounding for filters).
      if (meta && meta.dtype === "string" && meta.uniqueCount > 0 && meta.uniqueCount <= 24) {
        const distinct = new Set<string>();
        for (const r of rows) {
          const v = r?.[c.name];
          if (v !== null && v !== undefined && v !== "") distinct.add(String(v).slice(0, 60));
          if (distinct.size > 24) break;
        }
        if (distinct.size > 0 && distinct.size <= 24) {
          return `  "${c.name}" ${c.sqlType} — ALL values: ${[...distinct].map((v) => JSON.stringify(v)).join(", ")}`;
        }
      }
      const samples = meta?.sampleValues?.slice(0, 3).map((v) => JSON.stringify(v)).join(", ");
      return `  "${c.name}" ${c.sqlType}${samples ? ` — sample: ${samples}` : ""}`;
    });
    parts.push(`Table "${t.tableName}" (from sheet "${t.sheetName}", ${t.rowCount.toLocaleString()} rows):\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}
