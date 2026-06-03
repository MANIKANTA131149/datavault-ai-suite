function resolveColumn(row, name) {
  if (!row || typeof row !== "object" || !name) return name;
  if (name in row) return name;

  const lowerName = name.toLowerCase();
  const keys = Object.keys(row);

  // 1. Case-insensitive exact match
  for (const k of keys) {
    if (k.toLowerCase() === lowerName) return k;
  }

  // Normalization helper
  const normalize = (str) => {
    return str
      .toLowerCase()
      .replace(/\s*\((pk|fk)\)\s*/gi, "")
      .replace(/[^a-z0-9]/gi, "");
  };

  const normalizedName = normalize(name);

  // 2. Normalized match
  for (const k of keys) {
    if (normalize(k) === normalizedName) return k;
  }

  // 3. Substring match
  for (const k of keys) {
    if (k.toLowerCase().includes(lowerName) || lowerName.includes(k.toLowerCase())) return k;
  }

  return name;
}

function compareValues(left, operator, right) {
  switch (operator) {
    case ">": return left > right;
    case "<": return left < right;
    case ">=": return left >= right;
    case "<=": return left <= right;
    case "==": return left == right; // eslint-disable-line eqeqeq
    case "!=": return left != right; // eslint-disable-line eqeqeq
    case "contains": return String(left).toLowerCase().includes(String(right).toLowerCase());
    case "starts_with": return String(left).toLowerCase().startsWith(String(right).toLowerCase());
    case "ends_with": return String(left).toLowerCase().endsWith(String(right).toLowerCase());
    case "is_null": return left == null || left === ""; // eslint-disable-line eqeqeq
    case "not_null": return left != null && left !== ""; // eslint-disable-line eqeqeq
    default: return true;
  }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function executeOperation(data, operation, params = {}) {
  switch (operation) {
    case "filter":
      return data.filter((row) => compareValues(row[resolveColumn(row, params.column)], params.operator, params.value));
    case "sort": {
      const { column, order = "asc", limit } = params;
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, column);
      const sorted = [...data].sort((a, b) => {
        const av = a[actualCol];
        const bv = b[actualCol];
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av === bv) return 0;
        return order === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
      });
      return limit ? sorted.slice(0, Number(limit)) : sorted;
    }
    case "groupby": {
      const {
        groupColumn,
        aggColumn,
        aggFunction = "count",
        filter: filterParam,
        limit,
        order = "desc",
      } = params;
      let rows = data;
      if (filterParam) rows = executeOperation(rows, "filter", filterParam);

      const firstRow = data[0] || {};
      const actualGroupCol = resolveColumn(firstRow, groupColumn);
      const actualAggCol = aggColumn ? resolveColumn(firstRow, aggColumn) : undefined;

      const groups = new Map();
      for (const row of rows) {
        const key = String(row[actualGroupCol] ?? "null");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }

      const metricKey = String(aggFunction);
      const result = Array.from(groups.entries()).map(([key, rowsForGroup]) => {
        const values = aggColumn && actualAggCol
          ? rowsForGroup.map((row) => row[actualAggCol]).filter((value) => value != null && value !== "")
          : [];
        const numbers = values.map((value) => Number(value)).filter((value) => !Number.isNaN(value));

        let aggregateValue = 0;
        switch (aggFunction) {
          case "sum":
            aggregateValue = numbers.reduce((sum, value) => sum + value, 0);
            break;
          case "mean":
            aggregateValue = numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
            break;
          case "min":
            aggregateValue = numbers.length ? Math.min(...numbers) : 0;
            break;
          case "max":
            aggregateValue = numbers.length ? Math.max(...numbers) : 0;
            break;
          case "count_distinct":
            aggregateValue = new Set(values.map((value) => String(value))).size;
            break;
          case "count":
          default:
            aggregateValue = rowsForGroup.length;
            break;
        }

        return { [groupColumn]: key, [metricKey]: aggregateValue };
      });

      result.sort((a, b) => {
        const diff = Number(b[metricKey] ?? 0) - Number(a[metricKey] ?? 0);
        return order === "asc" ? -diff : diff;
      });
      return limit ? result.slice(0, Number(limit)) : result;
    }
    case "aggregate": {
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, params.column);
      const values = data
        .map((row) => row[actualCol])
        .filter((value) => value != null && value !== "");
      if (params.function === "count") return { result: values.length };
      if (params.function === "count_distinct") return { result: new Set(values.map((value) => String(value))).size };

      const numbers = values.map((value) => Number(value)).filter((value) => !Number.isNaN(value));
      if (!numbers.length) return { result: 0 };

      switch (params.function) {
        case "sum": return { result: numbers.reduce((sum, value) => sum + value, 0) };
        case "mean": return { result: numbers.reduce((sum, value) => sum + value, 0) / numbers.length };
        case "min": return { result: Math.min(...numbers) };
        case "max": return { result: Math.max(...numbers) };
        case "median": return { result: percentile(numbers, 50) };
        case "variance": {
          const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
          return { result: numbers.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / numbers.length };
        }
        case "std": {
          const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
          const variance = numbers.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / numbers.length;
          return { result: Math.sqrt(variance) };
        }
        default:
          return { result: numbers.length };
      }
    }
    case "select": {
      const { columns = [], limit = 50, filter: filterParam } = params;
      let rows = data;
      if (filterParam) {
        let normalizedFilter = filterParam;
        if (filterParam && typeof filterParam === "object" && !filterParam.column && !filterParam.filters) {
          const entries = Object.entries(filterParam);
          if (entries.length === 1) {
            const [colName, colValue] = entries[0];
            normalizedFilter = { column: colName, operator: "==", value: colValue };
          }
        }
        rows = executeOperation(rows, "filter", normalizedFilter);
      }
      return rows.slice(0, Number(limit)).map((row) => {
        const selected = {};
        for (const column of columns) {
          const actualCol = resolveColumn(row, column);
          selected[column] = row[actualCol];
        }
        return selected;
      });
    }
    case "head":
      return data.slice(0, Number(params.n || 10));
    case "unique": {
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, params.column);
      const values = [...new Set(data.map((row) => row[actualCol]))];
      return values.map((value) => ({ [params.column]: value }));
    }
    case "count":
      return { result: data.length };
    case "multi_filter": {
      const { filters = [], logic = "AND" } = params;
      return data.filter((row) => {
        const checks = filters.map((filter) => {
          const actualCol = resolveColumn(row, filter.column);
          return compareValues(row[actualCol], filter.operator, filter.value);
        });
        return logic === "OR" ? checks.some(Boolean) : checks.every(Boolean);
      });
    }
    case "percentile": {
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, params.column);
      const values = data
        .map((row) => Number(row[actualCol]))
        .filter((value) => !Number.isNaN(value))
        .sort((a, b) => a - b);
      const percentiles = params.percentiles || [25, 50, 75];
      const result = {};
      for (const p of percentiles) result[`p${p}`] = percentile(values, p);
      return result;
    }
    default:
      return { error: `Unsupported operation: ${operation}` };
  }
}

module.exports = {
  executeOperation,
};
