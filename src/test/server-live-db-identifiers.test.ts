import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { assertSafeTableName } = require("../../server/lib/live-db.js");

describe("assertSafeTableName (SQL identifier injection boundary)", () => {
  it.each([
    "orders",
    "public.orders",
    "my_schema.my_table",
    "project.dataset.table", // BigQuery 3-part
    "Orders123",
    "_private",
  ])("accepts legitimate name: %s", (name) => {
    expect(() => assertSafeTableName(name)).not.toThrow();
  });

  it.each([
    'orders"; drop table users; --',
    "orders; select 1",
    "orders where 1=1",
    "orders union select * from secrets",
    "orders/*comment*/",
    "orders'--",
    "tab le", // internal whitespace (leading/trailing is trimmed, which is fine)
    "orders)",
    "",
  ])("rejects injection payload: %s", (name) => {
    expect(() => assertSafeTableName(name)).toThrow();
  });

  it("rejects an overly long name", () => {
    expect(() => assertSafeTableName("a".repeat(500))).toThrow();
  });

  it("tolerates UI-supplied surrounding quotes/brackets", () => {
    expect(() => assertSafeTableName('"orders"')).not.toThrow();
    expect(() => assertSafeTableName("[orders]")).not.toThrow();
    expect(() => assertSafeTableName("`orders`")).not.toThrow();
  });
});
