/**
 * Converts the agent's structured table operations into database SQL.
 *
 * The JSON operation format is the agent/control protocol. It should not mean
 * "load rows into JavaScript"; for SQL databases, the work is pushed down here.
 */

const BACKTICK_IDENTIFIER_DBS = new Set(["mysql", "mariadb", "clickhouse", "databricks", "bigquery"]);
const DOUBLE_QUOTE_IDENTIFIER_DBS = new Set([
  "postgresql",
  "redshift",
  "snowflake",
  "sqlite",
  "duckdb",
  "oracle",
]);

function cleanIdentifierPart(value) {
  let text = String(value ?? "").trim();
  if (!text) return "";

  if (
    (text.startsWith("\"") && text.endsWith("\"")) ||
    (text.startsWith("`") && text.endsWith("`")) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    text = text.slice(1, -1);
  }

  return text.trim();
}

function splitQualifiedName(value) {
  return String(value ?? "")
    .split(".")
    .map(cleanIdentifierPart)
    .filter(Boolean);
}

function quoteIdentifierPart(part, dbType = "postgresql") {
  const text = cleanIdentifierPart(part);
  if (!text) throw new Error("Identifier part cannot be empty");

  if (dbType === "sqlserver") return `[${text.replace(/]/g, "]]")}]`;

  const quote = BACKTICK_IDENTIFIER_DBS.has(dbType) ? "`" : "\"";
  if (!BACKTICK_IDENTIFIER_DBS.has(dbType) && !DOUBLE_QUOTE_IDENTIFIER_DBS.has(dbType)) {
    return `${quote}${text.replaceAll(quote, quote + quote)}${quote}`;
  }

  return `${quote}${text.replaceAll(quote, quote + quote)}${quote}`;
}

function escapeIdentifier(name, dbType = "postgresql") {
  const parts = splitQualifiedName(name);
  if (parts.length === 0) throw new Error("Identifier cannot be empty");
  return parts.map((part) => quoteIdentifierPart(part, dbType)).join(".");
}

function escapeQualifiedIdentifier(name, dbType = "postgresql") {
  const parts = splitQualifiedName(name);
  if (parts.length === 0) throw new Error("Identifier cannot be empty");

  if (dbType === "bigquery") {
    return `\`${parts.join(".").replace(/`/g, "``")}\``;
  }

  return parts.map((part) => quoteIdentifierPart(part, dbType)).join(".");
}

function escapeString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function escapeLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return escapeString(value.toISOString());
  return escapeString(value);
}

function escapeLikePattern(value, mode) {
  const escaped = String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");

  if (mode === "contains") return `%${escaped}%`;
  if (mode === "starts_with") return `${escaped}%`;
  if (mode === "ends_with") return `%${escaped}`;
  return escaped;
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function normalizeLogic(logic) {
  return String(logic || "AND").toUpperCase() === "OR" ? "OR" : "AND";
}

function buildWhereClause(filter, dbType = "postgresql") {
  if (!filter || typeof filter !== "object") {
    throw new Error("filter operation requires a filter object");
  }

  if (Array.isArray(filter.filters)) {
    const where = buildCombinedWhereClause(filter.filters, filter.logic, dbType);
    if (!where) throw new Error("filter group requires at least one valid filter");
    return where;
  }

  if (!filter.column) {
    const entries = Object.entries(filter).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      throw new Error("filter operation requires a column");
    }

    return entries
      .map(([column, value]) => buildWhereClause({ column, operator: "==", value }, dbType))
      .map((part) => `(${part})`)
      .join(" AND ");
  }

  const column = escapeIdentifier(filter.column, dbType);
  const operator = String(filter.operator || "==").toLowerCase();
  const value = filter.value;

  switch (operator) {
    case "==":
    case "=":
      return value === null || value === undefined
        ? `${column} IS NULL`
        : `${column} = ${escapeLiteral(value)}`;
    case "!=":
    case "<>":
    case "not_equals":
      return value === null || value === undefined
        ? `${column} IS NOT NULL`
        : `${column} <> ${escapeLiteral(value)}`;
    case ">":
    case "<":
    case ">=":
    case "<=":
      return `${column} ${operator} ${escapeLiteral(value)}`;
    case "contains":
    case "starts_with":
    case "ends_with":
      return `${column} LIKE ${escapeString(escapeLikePattern(value, operator))} ESCAPE '\\'`;
    case "is_null":
      return `${column} IS NULL`;
    case "not_null":
      return `${column} IS NOT NULL`;
    case "in": {
      const values = Array.isArray(value) ? value : [value];
      if (values.length === 0) return "1 = 0";
      return `${column} IN (${values.map(escapeLiteral).join(", ")})`;
    }
    case "not_in": {
      const values = Array.isArray(value) ? value : [value];
      if (values.length === 0) return "1 = 1";
      return `${column} NOT IN (${values.map(escapeLiteral).join(", ")})`;
    }
    default:
      throw new Error(`Unsupported filter operator: ${filter.operator}`);
  }
}

function buildCombinedWhereClause(filters = [], logic = "AND", dbType = "postgresql") {
  if (!Array.isArray(filters) || filters.length === 0) return "";
  const joiner = ` ${normalizeLogic(logic)} `;
  return filters
    .map((filter) => buildWhereClause(filter, dbType))
    .filter(Boolean)
    .map((part) => `(${part})`)
    .join(joiner);
}

function buildWhereFromParams(params = {}, dbType = "postgresql", inheritedWhere = "") {
  const parts = [];
  if (inheritedWhere) parts.push(inheritedWhere);
  if (params.filter) parts.push(buildWhereClause(params.filter, dbType));
  if (params.filters) {
    const combined = buildCombinedWhereClause(params.filters, params.logic, dbType);
    if (combined) parts.push(combined);
  }
  return parts.filter(Boolean).join(" AND ");
}

function buildSelectClause(columns, dbType = "postgresql") {
  if (!Array.isArray(columns) || columns.length === 0) return "*";
  return columns.map((column) => escapeIdentifier(column, dbType)).join(", ");
}

function buildLimitClause(limit, offset = 0, dbType = "postgresql") {
  const safeLimit = toPositiveInteger(limit);
  const safeOffset = toPositiveInteger(offset) || 0;
  if (!safeLimit) return "";

  if (dbType === "sqlserver") return "";
  if (dbType === "oracle") {
    return safeOffset
      ? `OFFSET ${safeOffset} ROWS FETCH NEXT ${safeLimit} ROWS ONLY`
      : `FETCH FIRST ${safeLimit} ROWS ONLY`;
  }

  return `LIMIT ${safeLimit}${safeOffset ? ` OFFSET ${safeOffset}` : ""}`;
}

function buildSelectQuery({
  table,
  select = "*",
  where = "",
  order = "",
  limit,
  offset = 0,
  dbType = "postgresql",
}) {
  const safeLimit = toPositiveInteger(limit);
  const selectText = String(select || "*");
  const isDistinct = selectText.trimStart().toUpperCase().startsWith("DISTINCT ");
  const top = dbType === "sqlserver" && safeLimit ? `TOP (${safeLimit}) ` : "";
  const selectClause = isDistinct && top
    ? `DISTINCT ${top}${selectText.trimStart().slice("DISTINCT ".length)}`
    : `${top}${selectText}`;
  const whereClause = where ? `WHERE ${where}` : "";
  const limitClause = buildLimitClause(safeLimit, offset, dbType);
  return [`SELECT ${selectClause}`, `FROM ${table}`, whereClause, order, limitClause]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildOrderByClause(column, order = "desc", dbType = "postgresql") {
  if (!column) return "";
  const direction = String(order).toLowerCase() === "asc" ? "ASC" : "DESC";
  return `ORDER BY ${escapeIdentifier(column, dbType)} ${direction}`;
}

function buildAggregateExpression(column, fn = "count", dbType = "postgresql") {
  const normalizedFn = String(fn || "count").toLowerCase();

  if (normalizedFn === "count_distinct") {
    if (!column) throw new Error("count_distinct requires a column");
    return `COUNT(DISTINCT ${escapeIdentifier(column, dbType)})`;
  }

  if (normalizedFn === "median") {
    if (!column) throw new Error("median requires a column");
    const quotedColumn = escapeIdentifier(column, dbType);
    if (dbType === "bigquery") return `APPROX_QUANTILES(${quotedColumn}, 2)[OFFSET(1)]`;
    if (dbType === "clickhouse") return `quantile(0.5)(${quotedColumn})`;
    return `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${quotedColumn})`;
  }

  const functionMap = {
    sum: "SUM",
    mean: "AVG",
    avg: "AVG",
    min: "MIN",
    max: "MAX",
    count: "COUNT",
    std: dbType === "sqlserver" ? "STDEV" : "STDDEV",
    variance: "VARIANCE",
  };
  const sqlFunction = functionMap[normalizedFn] || "COUNT";

  if (normalizedFn === "count" && !column) return "COUNT(*)";
  return column ? `${sqlFunction}(${escapeIdentifier(column, dbType)})` : `${sqlFunction}(*)`;
}

function buildDateTruncExpression(dateColumn, period = "month", dbType = "postgresql") {
  const column = escapeIdentifier(dateColumn, dbType);
  const normalizedPeriod = String(period || "month").toLowerCase();

  if (dbType === "bigquery") {
    const periodMap = { day: "DAY", week: "WEEK", month: "MONTH", quarter: "QUARTER", year: "YEAR" };
    return `DATE_TRUNC(DATE(${column}), ${periodMap[normalizedPeriod] || "MONTH"})`;
  }

  if (dbType === "mysql" || dbType === "mariadb") {
    const formatMap = {
      day: "%Y-%m-%d",
      week: "%x-%v-1",
      month: "%Y-%m-01",
      quarter: "%Y-01-01",
      year: "%Y-01-01",
    };
    return `DATE_FORMAT(${column}, ${escapeString(formatMap[normalizedPeriod] || "%Y-%m-01")})`;
  }

  if (dbType === "sqlserver") {
    if (normalizedPeriod === "day") return `CAST(${column} AS date)`;
    if (normalizedPeriod === "week") return `DATEADD(week, DATEDIFF(week, 0, ${column}), 0)`;
    if (normalizedPeriod === "quarter") {
      return `DATEFROMPARTS(YEAR(${column}), ((DATEPART(quarter, ${column}) - 1) * 3) + 1, 1)`;
    }
    if (normalizedPeriod === "year") return `DATEFROMPARTS(YEAR(${column}), 1, 1)`;
    return `DATEFROMPARTS(YEAR(${column}), MONTH(${column}), 1)`;
  }

  if (dbType === "oracle") {
    const periodMap = { day: "DD", week: "IW", month: "MM", quarter: "Q", year: "YYYY" };
    return `TRUNC(${column}, ${escapeString(periodMap[normalizedPeriod] || "MM")})`;
  }

  if (dbType === "clickhouse") {
    const functionMap = {
      day: "toDate",
      week: "toStartOfWeek",
      month: "toStartOfMonth",
      quarter: "toStartOfQuarter",
      year: "toStartOfYear",
    };
    return `${functionMap[normalizedPeriod] || "toStartOfMonth"}(${column})`;
  }

  if (dbType === "databricks") {
    return `date_trunc(${escapeString(normalizedPeriod.toUpperCase())}, ${column})`;
  }

  return `DATE_TRUNC(${escapeString(normalizedPeriod)}, ${column})`;
}

function normalizePipelineOperations(operations, dbType = "postgresql") {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("pipeline requires at least one operation");
  }

  const filters = [];
  let terminal = null;

  for (const item of operations) {
    if (!item || typeof item.operation !== "string") continue;
    const operation = item.operation.trim();
    const params = item.params || {};

    if (operation === "filter") {
      filters.push(buildWhereClause(params, dbType));
      continue;
    }

    if (operation === "multi_filter") {
      const where = buildCombinedWhereClause(params.filters || [], params.logic, dbType);
      if (where) filters.push(where);
      continue;
    }

    if (terminal) {
      throw new Error("SQL pipeline currently supports filters followed by one terminal operation");
    }
    terminal = { operation, params };
  }

  return {
    where: filters.filter(Boolean).join(" AND "),
    terminal: terminal || { operation: "select", params: {} },
  };
}

function buildSqlFromOperationInternal(
  tableName,
  operation,
  params = {},
  dbType = "postgresql",
  inheritedWhere = ""
) {
  const table = escapeQualifiedIdentifier(tableName, dbType);
  const normalizedOperation = String(operation || "").trim();

  switch (normalizedOperation) {
    case "filter": {
      const where = buildWhereClause(params, dbType);
      return buildSelectQuery({
        table,
        where,
        limit: params.limit || 1000,
        dbType,
      });
    }

    case "multi_filter": {
      const where = buildCombinedWhereClause(params.filters || [], params.logic, dbType);
      if (!where) throw new Error("multi_filter operation requires valid filters");
      return buildSelectQuery({
        table,
        where,
        limit: params.limit || 1000,
        dbType,
      });
    }

    case "select": {
      return buildSelectQuery({
        table,
        select: buildSelectClause(params.columns, dbType),
        where: buildWhereFromParams(params, dbType, inheritedWhere),
        limit: params.limit || 50,
        offset: params.offset || 0,
        dbType,
      });
    }

    case "head": {
      return buildSelectQuery({
        table,
        where: buildWhereFromParams(params, dbType, inheritedWhere),
        limit: params.n || params.limit || 10,
        dbType,
      });
    }

    case "count": {
      return buildSelectQuery({
        table,
        select: "COUNT(*) as count",
        where: buildWhereFromParams(params, dbType, inheritedWhere),
        dbType,
      });
    }

    case "unique": {
      if (!params.column) throw new Error("unique operation requires column");
      return buildSelectQuery({
        table,
        select: `DISTINCT ${escapeIdentifier(params.column, dbType)}`,
        where: buildWhereFromParams(params, dbType, inheritedWhere),
        limit: params.limit || 100,
        dbType,
      });
    }

    case "sort": {
      if (!params.column) throw new Error("sort operation requires column");
      return buildSelectQuery({
        table,
        where: buildWhereFromParams(params, dbType, inheritedWhere),
        order: buildOrderByClause(params.column, params.order || "asc", dbType),
        limit: params.limit || 50,
        dbType,
      });
    }

    case "aggregate": {
      const aggregate = buildAggregateExpression(params.column, params.function, dbType);
      return buildSelectQuery({
        table,
        select: `${aggregate} as result`,
        where: buildWhereFromParams(params, dbType, inheritedWhere),
        dbType,
      });
    }

    case "groupby": {
      if (!params.groupColumn) throw new Error("groupby operation requires groupColumn");
      const groupColumn = escapeIdentifier(params.groupColumn, dbType);
      const aggregate = buildAggregateExpression(params.aggColumn, params.aggFunction || "count", dbType);
      const safeLimit = toPositiveInteger(params.limit || 50);
      const top = dbType === "sqlserver" && safeLimit ? `TOP (${safeLimit}) ` : "";
      const order = params.order === "none"
        ? ""
        : `ORDER BY agg_result ${String(params.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC"}`;
      const limit = buildLimitClause(safeLimit, 0, dbType);
      const where = buildWhereFromParams(params, dbType, inheritedWhere);
      return [
        `SELECT ${top}${groupColumn}, ${aggregate} as agg_result`,
        `FROM ${table}`,
        where ? `WHERE ${where}` : "",
        `GROUP BY ${groupColumn}`,
        order,
        limit,
      ].filter(Boolean).join(" ").trim();
    }

    case "percentile": {
      if (!params.column) throw new Error("percentile operation requires column");
      const column = escapeIdentifier(params.column, dbType);
      const percentiles = Array.isArray(params.percentiles) && params.percentiles.length
        ? params.percentiles
        : [25, 50, 75];
      const expressions = percentiles.map((percentile) => {
        const safePercentile = Number(percentile);
        if (!Number.isFinite(safePercentile) || safePercentile < 0 || safePercentile > 100) {
          throw new Error(`Invalid percentile: ${percentile}`);
        }
        if (dbType === "bigquery") {
          return `APPROX_QUANTILES(${column}, 100)[OFFSET(${safePercentile})] as p${safePercentile}`;
        }
        if (dbType === "clickhouse") {
          return `quantile(${safePercentile / 100})(${column}) as p${safePercentile}`;
        }
        return `PERCENTILE_CONT(${safePercentile / 100}) WITHIN GROUP (ORDER BY ${column}) as p${safePercentile}`;
      }).join(", ");

      return buildSelectQuery({
        table,
        select: expressions,
        where: buildWhereFromParams(params, dbType, inheritedWhere),
        dbType,
      });
    }

    case "correlation": {
      if (!params.column1 || !params.column2) {
        throw new Error("correlation operation requires column1 and column2");
      }
      const column1 = escapeIdentifier(params.column1, dbType);
      const column2 = escapeIdentifier(params.column2, dbType);
      return buildSelectQuery({
        table,
        select: `CORR(${column1}, ${column2}) as correlation`,
        where: buildWhereFromParams(params, dbType, inheritedWhere),
        dbType,
      });
    }

    case "date_trunc": {
      if (!params.dateColumn) throw new Error("date_trunc operation requires dateColumn");
      const truncated = buildDateTruncExpression(params.dateColumn, params.period || "month", dbType);
      const aggregate = buildAggregateExpression(params.aggColumn, params.aggFunction || "count", dbType);
      const where = buildWhereFromParams(params, dbType, inheritedWhere);
      return [
        `SELECT ${truncated} as period, ${aggregate} as agg_result`,
        `FROM ${table}`,
        where ? `WHERE ${where}` : "",
        `GROUP BY ${truncated}`,
        "ORDER BY period",
      ].filter(Boolean).join(" ").trim();
    }

    case "pipeline": {
      const { where, terminal } = normalizePipelineOperations(params.operations, dbType);
      return buildSqlFromOperationInternal(
        tableName,
        terminal.operation,
        terminal.params,
        dbType,
        [inheritedWhere, where].filter(Boolean).join(" AND ")
      );
    }

    default:
      throw new Error(`Unsupported SQL operation: ${normalizedOperation}`);
  }
}

function buildSqlFromOperation(tableName, operation, params = {}, dbType = "postgresql") {
  return buildSqlFromOperationInternal(tableName, operation, params, dbType);
}

module.exports = {
  buildSqlFromOperation,
  escapeIdentifier,
  escapeQualifiedIdentifier,
  escapeString,
  buildWhereClause,
};
