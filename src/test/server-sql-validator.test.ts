import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { validateReadOnlySql } = require("../../server/lib/sql-validator.js");

describe("validateReadOnlySql", () => {
  it("allows a plain SELECT", () => {
    expect(validateReadOnlySql("select * from orders", "postgresql").readOnly).toBe(true);
  });

  it("allows a CTE (WITH ...)", () => {
    expect(validateReadOnlySql("with t as (select 1) select * from t", "postgresql").readOnly).toBe(true);
  });

  it("strips a trailing semicolon but allows the statement", () => {
    expect(validateReadOnlySql("select 1;", "postgresql").sql).toBe("select 1");
  });

  it("rejects stacked statements", () => {
    expect(() => validateReadOnlySql("select 1; drop table users", "postgresql")).toThrow();
  });

  it.each([
    "insert into t values (1)",
    "update t set x = 1",
    "delete from t",
    "drop table t",
    "alter table t add column x int",
    "create table t (x int)",
    "truncate t",
    "grant all on t to public",
  ])("rejects write/DDL: %s", (sql) => {
    expect(() => validateReadOnlySql(sql, "postgresql")).toThrow();
  });

  it("rejects file-access keywords (COPY / LOAD / ATTACH)", () => {
    expect(() => validateReadOnlySql("copy t to stdout", "postgresql")).toThrow();
    expect(() => validateReadOnlySql("load data infile 'x' into table t", "mysql")).toThrow();
    expect(() => validateReadOnlySql("attach 'evil.db' as e", "duckdb")).toThrow();
  });

  it("rejects SELECT ... INTO OUTFILE", () => {
    expect(() => validateReadOnlySql("select * into outfile '/tmp/x' from t", "mysql")).toThrow();
  });

  it("does not let a keyword inside a string literal trigger a false positive", () => {
    // 'drop' appears only inside a string — should still be allowed.
    expect(validateReadOnlySql("select 'drop table' as label from t", "postgresql").readOnly).toBe(true);
  });

  it("rejects an empty query", () => {
    expect(() => validateReadOnlySql("   ", "postgresql")).toThrow();
  });

  it("rejects an unsupported db type", () => {
    expect(() => validateReadOnlySql("select 1", "elasticsearch")).toThrow();
  });
});
