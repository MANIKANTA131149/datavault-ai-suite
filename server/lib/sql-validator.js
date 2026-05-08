const SQL_NATIVE_DB_TYPES = new Set([
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

function stripSqlComments(sql) {
  const text = String(sql || "");
  let output = "";
  let quote = "";
  let bracketQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quote) {
      output += char;
      if (quote === "'" && char === "'" && next === "'") {
        output += next;
        index += 1;
        continue;
      }
      if (char === quote) quote = "";
      continue;
    }

    if (bracketQuote) {
      output += char;
      if (char === "]") bracketQuote = false;
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      output += char;
      continue;
    }

    if (char === "[") {
      bracketQuote = true;
      output += char;
      continue;
    }

    if (char === "-" && next === "-") {
      while (index < text.length && text[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
      index += 1;
      output += " ";
      continue;
    }

    output += char;
  }

  return output;
}

function hasNonTrailingSemicolon(sql) {
  const text = String(sql || "");
  let quote = "";
  let bracketQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quote) {
      if (quote === "'" && char === "'" && next === "'") {
        index += 1;
        continue;
      }
      if (char === quote) quote = "";
      continue;
    }

    if (bracketQuote) {
      if (char === "]") bracketQuote = false;
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "[") {
      bracketQuote = true;
      continue;
    }

    if (char === ";" && text.slice(index + 1).replace(/;\s*/g, "").trim()) {
      return true;
    }
  }

  return false;
}

function stripTrailingSemicolons(sql) {
  return String(sql || "").replace(/(?:\s*;)+\s*$/g, "").trim();
}

function maskQuotedText(sql) {
  const text = String(sql || "");
  let output = "";
  let quote = "";
  let bracketQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quote) {
      output += " ";
      if (quote === "'" && char === "'" && next === "'") {
        output += " ";
        index += 1;
        continue;
      }
      if (char === quote) quote = "";
      continue;
    }

    if (bracketQuote) {
      output += " ";
      if (char === "]") bracketQuote = false;
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      output += " ";
      continue;
    }

    if (char === "[") {
      bracketQuote = true;
      output += " ";
      continue;
    }

    output += char;
  }

  return output;
}

function validateReadOnlySql(sql, dbType = "postgresql") {
  if (!SQL_NATIVE_DB_TYPES.has(dbType)) {
    throw new Error(`${dbType} does not support database-native SQL mode. Use the native adapter mode for this source.`);
  }

  const withoutComments = stripSqlComments(sql).trim();
  if (!withoutComments) throw new Error("SQL query is empty.");
  if (hasNonTrailingSemicolon(withoutComments)) {
    throw new Error("Only one SQL statement is allowed.");
  }

  const normalizedSql = stripTrailingSemicolons(withoutComments);
  const masked = maskQuotedText(normalizedSql)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!/^(select|with)\b/.test(masked)) {
    throw new Error("Only read-only SELECT or WITH queries are allowed.");
  }

  const blockedKeyword = masked.match(/\b(insert|update|delete|drop|alter|create|truncate|merge|call|exec|execute|grant|revoke|commit|rollback|savepoint|copy|load|unload|vacuum|attach|detach|pragma)\b/);
  if (blockedKeyword) {
    throw new Error(`Read-only SQL mode blocked keyword: ${blockedKeyword[1].toUpperCase()}.`);
  }

  if (/\binto\s+(outfile|dumpfile)\b/.test(masked) || /\bselect\b[\s\S]*?\binto\b[\s\S]*?\bfrom\b/.test(masked)) {
    throw new Error("SELECT INTO / INTO OUTFILE is not allowed in read-only SQL mode.");
  }

  return {
    sql: normalizedSql,
    readOnly: true,
  };
}

module.exports = {
  SQL_NATIVE_DB_TYPES,
  validateReadOnlySql,
};
