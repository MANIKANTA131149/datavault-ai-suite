import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./llm-client", () => ({
  callLLM: vi.fn(),
}));

import { runDatabaseAgent, runLegacyAgent } from "./agent";
import { callLLM } from "./llm-client";
import type { SheetData } from "./file-parser";

const workbookSheets: Record<string, SheetData> = {
  sales: {
    columns: [
      { name: "product", dtype: "string", nonNullCount: 4, uniqueCount: 3, sampleValues: ["A", "B", "C"] },
      { name: "revenue", dtype: "number", nonNullCount: 4, uniqueCount: 4, sampleValues: [100, 200, 150] },
      { name: "region", dtype: "string", nonNullCount: 4, uniqueCount: 2, sampleValues: ["East", "West"] },
    ],
    rows: [
      { product: "A", revenue: 100, region: "East" },
      { product: "B", revenue: 200, region: "West" },
      { product: "A", revenue: 150, region: "East" },
      { product: "C", revenue: 50, region: "West" },
    ],
  },
  employees: {
    columns: [
      { name: "department", dtype: "string", nonNullCount: 4, uniqueCount: 2, sampleValues: ["Engineering", "Finance"] },
      { name: "salary", dtype: "number", nonNullCount: 4, uniqueCount: 4, sampleValues: [120, 150, 90] },
    ],
    rows: [
      { department: "Engineering", salary: 120 },
      { department: "Engineering", salary: 150 },
      { department: "Finance", salary: 90 },
      { department: "Finance", salary: 110 },
    ],
  },
  engines: {
    columns: [
      { name: "Title", dtype: "string", nonNullCount: 4, uniqueCount: 3, sampleValues: ["Toyota", "Ford", "Honda"] },
      { name: "displacement_cc", dtype: "number", nonNullCount: 4, uniqueCount: 4, sampleValues: [12, 18, 14] },
    ],
    rows: [
      { Title: "Toyota", displacement_cc: 12 },
      { Title: "Toyota", displacement_cc: 15 },
      { Title: "Ford", displacement_cc: 18 },
      { Title: "Honda", displacement_cc: 14 },
    ],
  },
  titles: {
    columns: [
      { name: "title", dtype: "string", nonNullCount: 3, uniqueCount: 3, sampleValues: ["A", "B", "C"] },
      { name: "cast", dtype: "string", nonNullCount: 3, uniqueCount: 3, sampleValues: ["John Doe, Jane Roe", "John Doe, Sam Poe", "Jane Roe, John Doe"] },
      { name: "listed_in", dtype: "string", nonNullCount: 3, uniqueCount: 3, sampleValues: ["Drama, Mystery", "Drama, Action", "Mystery"] },
    ],
    rows: [
      { title: "A", cast: "John Doe, Jane Roe", listed_in: "Drama, Mystery" },
      { title: "B", cast: "John Doe, Sam Poe", listed_in: "Drama, Action" },
      { title: "C", cast: "Jane Roe, John Doe", listed_in: "Mystery" },
    ],
  },
};

const databaseTables = [
  {
    name: "orders",
    kind: "table",
    description: "Order fact table",
    rowCount: 4,
    columns: [
      { name: "order_id", dtype: "number", nonNullCount: 4, uniqueCount: 4, sampleValues: [1001, 1002, 1003] },
      { name: "status", dtype: "string", nonNullCount: 4, uniqueCount: 3, sampleValues: ["paid", "pending", "refunded"] },
      { name: "total_amount", dtype: "number", nonNullCount: 4, uniqueCount: 4, sampleValues: [120, 90, 240] },
    ],
    rows: [
      { order_id: 1001, status: "paid", total_amount: 120 },
      { order_id: 1002, status: "pending", total_amount: 90 },
      { order_id: 1003, status: "paid", total_amount: 240 },
      { order_id: 1004, status: "refunded", total_amount: 60 },
    ],
  },
  {
    name: "customers",
    kind: "table",
    description: "Customer dimension",
    rowCount: 3,
    columns: [
      { name: "customer_id", dtype: "number", nonNullCount: 3, uniqueCount: 3, sampleValues: [1, 2, 3] },
      { name: "customer_name", dtype: "string", nonNullCount: 3, uniqueCount: 3, sampleValues: ["Acme", "Bravo", "Cobalt"] },
    ],
    rows: [
      { customer_id: 1, customer_name: "Acme" },
      { customer_id: 2, customer_name: "Bravo" },
      { customer_id: 3, customer_name: "Cobalt" },
    ],
  },
];

const rnacentralTables = [
  {
    name: "rnacen.precompute_urs_accession",
    kind: "table",
    rowCount: 7553524,
    columns: [
      { name: "urs", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "accession", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "database", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "description", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "gene", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "species", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
    ],
    rows: [],
  },
  {
    name: "rnacen.rnc_rna_precomputed",
    kind: "table",
    rowCount: 108560352,
    columns: [
      { name: "id", dtype: "number", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "taxid", dtype: "number", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "description", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "upi", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "rna_type", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "has_coordinates", dtype: "boolean", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "databases", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "is_active", dtype: "boolean", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "last_release", dtype: "number", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "short_description", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "so_rna_type", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "assigned_so_rna_type", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
    ],
    rows: [],
  },
  {
    name: "rnacen.rna",
    kind: "table",
    rowCount: 49811528,
    columns: [
      { name: "id", dtype: "number", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "upi", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "len", dtype: "number", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "seq_short", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
      { name: "md5", dtype: "string", nonNullCount: 0, uniqueCount: 0, sampleValues: [] },
    ],
    rows: [],
  },
];

async function collectSteps() {
  const steps = [];
  for await (const step of runLegacyAgent(
    "What is the highest revenue product?",
    workbookSheets,
    "sales",
    "groq",
    "test-model",
    "test-key",
    0.1,
    512
  )) {
    steps.push(step);
  }
  return steps;
}

describe("runLegacyAgent", () => {
  beforeEach(() => {
    vi.mocked(callLLM).mockReset();
  });

  it("uses the raw question and supports workbook-level sheet discovery", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        content: '{"command":"GetSheetDescription","args":{}}',
        inputTokens: 12,
        outputTokens: 6,
      })
      .mockResolvedValueOnce({
        content: '{"command":"GetColumns","args":{"sheet_name":"sales"}}',
        inputTokens: 14,
        outputTokens: 7,
      })
      .mockResolvedValueOnce({
        content: '{"command":"ExecuteFinalQuery","args":{"sheet_name":"sales","operation":"aggregate","params":{"column":"revenue","function":"sum"}}}',
        inputTokens: 18,
        outputTokens: 10,
      });

    const steps = await collectSteps();

    expect(steps.map((step) => step.command)).toEqual([
      "GetSheetDescription",
      "GetColumns",
      "ExecuteFinalQuery",
    ]);
    expect(String(steps[0].result)).toContain("Sheet 'sales'");
    expect(String(steps[0].result)).toContain("Sheet 'employees'");
    expect(steps[2].result).toEqual({ result: 500 });

    const firstUserMessage = vi.mocked(callLLM).mock.calls[0][3][0].content;
    expect(firstUserMessage).toContain("Question: What is the highest revenue product?");
    expect(firstUserMessage).not.toContain("maximum revenue product");
  });

  it("supports legacy pandas-style filter plus aggregate queries", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: '{"command":"ExecuteFinalQuery","args":{"sheet_name":"employees","pandas_query":"df[df[\'department\']==\'Engineering\'][\'salary\'].max()"}}',
      inputTokens: 10,
      outputTokens: 6,
    });

    const steps = [];
    for await (const step of runLegacyAgent(
      "What is the max engineering salary?",
      workbookSheets,
      "employees",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps).toHaveLength(1);
    expect(steps[0].command).toBe("ExecuteFinalQuery");
    expect(steps[0].result).toEqual({ result: 150 });
    expect(steps[0].isFinal).toBe(true);
  });

  it("supports legacy pandas-style groupby ranking queries", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: '{"command":"ExecuteFinalQuery","args":{"sheet_name":"sales","pandas_query":"df.groupby(\'product\')[\'revenue\'].sum().sort_values(ascending=False).head(2)"}}',
      inputTokens: 10,
      outputTokens: 6,
    });

    const steps = [];
    for await (const step of runLegacyAgent(
      "What are the top 2 products by total revenue?",
      workbookSheets,
      "sales",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps).toHaveLength(1);
    expect(steps[0].result).toEqual([
      { product: "A", sum: 250 },
      { product: "B", sum: 200 },
    ]);
  });

  it("repairs grouped ranking questions when the model emits aggregate plus groupBy", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: '{"command":"ExecuteFinalQuery","args":{"sheet_name":"engines","operation":"aggregate","params":{"column":"displacement_cc","function":"min","groupBy":"Title"}}}',
      inputTokens: 14,
      outputTokens: 9,
    });

    const steps = [];
    for await (const step of runLegacyAgent(
      "Which manufacturer produces the most fuel-efficient engines?",
      workbookSheets,
      "engines",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps).toHaveLength(1);
    expect(steps[0].command).toBe("ExecuteFinalQuery");
    expect(steps[0].args).toMatchObject({
      sheet_name: "engines",
      operation: "groupby",
      params: {
        groupColumn: "Title",
        aggColumn: "displacement_cc",
        aggFunction: "min",
        limit: 1,
        order: "asc",
      },
    });
    expect(steps[0].result).toEqual([{ Title: "Toyota", min: 12 }]);
  });

  it("describes multi-value text columns so the agent can understand list-like cells", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        content: '{"command":"GetColumns","args":{"sheet_name":"titles"}}',
        inputTokens: 12,
        outputTokens: 6,
      })
      .mockResolvedValueOnce({
        content: '{"command":"Answer","args":{"value":"done"}}',
        inputTokens: 8,
        outputTokens: 4,
      });

    const steps = [];
    for await (const step of runLegacyAgent(
      "What columns are in this sheet?",
      workbookSheets,
      "titles",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps).toHaveLength(2);
    expect(String(steps[0].result)).toContain("meaning: multi-value list of people names");
    expect(String(steps[0].result)).toContain('list pattern: ","-separated items');
    expect(String(steps[0].result)).toContain("for individual item counts use split_frequency");
  });

  it("repairs actor frequency questions to use split_frequency on multi-value text columns", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: '{"command":"ExecuteFinalQuery","args":{"sheet_name":"titles","operation":"groupby","params":{"groupColumn":"cast","aggColumn":"cast","aggFunction":"count","order":"desc","limit":1}}}',
      inputTokens: 16,
      outputTokens: 10,
    });

    const steps = [];
    for await (const step of runLegacyAgent(
      "Which actors appear most frequently?",
      workbookSheets,
      "titles",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps).toHaveLength(1);
    expect(steps[0].args).toMatchObject({
      sheet_name: "titles",
      operation: "split_frequency",
      params: {
        column: "cast",
        delimiter: ",",
        limit: 1,
        order: "desc",
      },
    });
    expect(steps[0].result).toEqual([{ cast: "John Doe", count: 3 }]);
  });

  it("carries a successful intermediate sheet filter into the final select", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        content: '{"command":"GetColumns","args":{"sheet_name":"engines"}}',
        inputTokens: 12,
        outputTokens: 6,
      })
      .mockResolvedValueOnce({
        content: '{"command":"QuerySheet","args":{"sheet_name":"engines","operation":"aggregate","params":{"column":"displacement_cc","function":"max"}}}',
        inputTokens: 14,
        outputTokens: 7,
      })
      .mockResolvedValueOnce({
        content: '{"command":"QuerySheet","args":{"sheet_name":"engines","operation":"filter","params":{"column":"displacement_cc","operator":"==","value":18}}}',
        inputTokens: 16,
        outputTokens: 8,
      })
      .mockResolvedValueOnce({
        content: '{"command":"ExecuteFinalQuery","args":{"sheet_name":"engines","operation":"select","params":{"columns":["Title"],"limit":1}}}',
        inputTokens: 18,
        outputTokens: 9,
      });

    const steps = [];
    for await (const step of runLegacyAgent(
      "Which engine has the highest displacement?",
      workbookSheets,
      "engines",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps.map((step) => step.command)).toEqual([
      "GetColumns",
      "QuerySheet",
      "QuerySheet",
      "ExecuteFinalQuery",
    ]);
    expect(steps[3].args).toMatchObject({
      sheet_name: "engines",
      operation: "select",
      params: {
        columns: ["Title"],
        limit: 1,
        filter: { column: "displacement_cc", operator: "==", value: 18 },
      },
    });
    expect(steps[3].result).toEqual([{ Title: "Ford" }]);
  });

  it("supports executing multi_analysis to run multiple operations in a single command", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: '{"command":"ExecuteFinalQuery","args":{"sheet_name":"sales","operation":"multi_analysis","params":{"operations":[{"name":"total_rev","operation":"aggregate","params":{"column":"revenue","function":"sum"}},{"name":"prod_count","operation":"count","params":{}}]}}}',
      inputTokens: 12,
      outputTokens: 6,
    });

    const steps = [];
    for await (const step of runLegacyAgent(
      "Give me total sales and number of rows",
      workbookSheets,
      "sales",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps).toHaveLength(1);
    expect(steps[0].command).toBe("ExecuteFinalQuery");
    expect(steps[0].result).toEqual({
      total_rev: { result: 500 },
      prod_count: { result: 4 },
    });
  });
});

describe("runDatabaseAgent", () => {
  beforeEach(() => {
    vi.mocked(callLLM).mockReset();
  });

  it("supports database schema inspection and table aggregation", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        content: '{"command":"GetSchema","args":{}}',
        inputTokens: 12,
        outputTokens: 6,
      })
      .mockResolvedValueOnce({
        content: '{"command":"GetColumns","args":{"table_name":"orders"}}',
        inputTokens: 14,
        outputTokens: 7,
      })
      .mockResolvedValueOnce({
        content: '{"command":"ExecuteFinalQuery","args":{"table_name":"orders","operation":"aggregate","params":{"column":"total_amount","function":"sum"}}}',
        inputTokens: 18,
        outputTokens: 10,
      });

    const steps = [];
    for await (const step of runDatabaseAgent(
      "What is the total order amount?",
      databaseTables,
      "orders",
      "PostgreSQL",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps.map((step) => step.command)).toEqual([
      "GetSchema",
      "GetColumns",
      "ExecuteFinalQuery",
    ]);
    expect(String(steps[0].result)).toContain("Table 'orders'");
    expect(String(steps[0].result)).toContain("Table 'customers'");
    expect(steps[2].result).toEqual({ result: 510 });
  });

  it("executes database-native SQL through the SQL tool", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        content: '{"command":"GetSchema","args":{}}',
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        content: '{"command":"ExecuteSQL","args":{"sql":"SELECT status, SUM(total_amount) AS total_amount FROM orders GROUP BY status LIMIT 10"}}',
        inputTokens: 18,
        outputTokens: 10,
      });

    const executeSql = vi.fn().mockResolvedValueOnce({
      data: [{ status: "paid", total_amount: 360 }],
      sql: "SELECT status, SUM(total_amount) AS total_amount FROM orders GROUP BY status LIMIT 10",
    });

    const steps = [];
    for await (const step of runDatabaseAgent(
      "Show revenue by order status",
      databaseTables,
      "orders",
      "PostgreSQL",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512,
      undefined,
      undefined,
      {},
      { executeSql }
    )) {
      steps.push(step);
    }

    expect(steps.map((step) => step.command)).toEqual(["GetSchema", "ExecuteSQL"]);
    expect(executeSql).toHaveBeenCalledWith({
      sql: "SELECT status, SUM(total_amount) AS total_amount FROM orders GROUP BY status LIMIT 10",
      isFinal: true,
    });
    expect(steps[1].sql).toBe("SELECT status, SUM(total_amount) AS total_amount FROM orders GROUP BY status LIMIT 10");
    expect(steps[1].result).toEqual([{ status: "paid", total_amount: 360 }]);
  });

  it("includes DB-specific context in the first model message", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: '{"command":"Answer","args":{"value":"done"}}',
      inputTokens: 8,
      outputTokens: 4,
    });

    const steps = [];
    for await (const step of runDatabaseAgent(
      "Show me the schema",
      databaseTables,
      "orders",
      "Snowflake",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps).toHaveLength(1);
    const firstUserMessage = vi.mocked(callLLM).mock.calls[0][3][0].content;
    expect(firstUserMessage).toContain('Database type: Snowflake');
    expect(firstUserMessage).toContain('Current selected table: "orders"');
  });

  it("does not report unloaded database table metadata as zero rows", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        content: '{"command":"GetSchema","args":{}}',
        inputTokens: 8,
        outputTokens: 4,
      })
      .mockResolvedValueOnce({
        content: '{"command":"Answer","args":{"value":"done"}}',
        inputTokens: 8,
        outputTokens: 4,
      });

    const steps = [];
    for await (const step of runDatabaseAgent(
      "Show schema",
      [{
        name: "rnacen.cpat_results",
        kind: "table",
        columns: [],
        rows: [],
      }],
      "rnacen.cpat_results",
      "PostgreSQL",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(String(steps[0].result)).toContain("row count not loaded");
    expect(String(steps[0].result)).toContain("columns not loaded yet");
    expect(String(steps[0].result)).not.toContain("0 rows");
  });

  it("adds routing hints when a database identifier column is explicitly mentioned", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        content: '{"command":"GetSchema","args":{}}',
        inputTokens: 8,
        outputTokens: 4,
      })
      .mockResolvedValueOnce({
        content: '{"command":"Answer","args":{"value":"done"}}',
        inputTokens: 8,
        outputTokens: 4,
      });

    const steps = [];
    for await (const step of runDatabaseAgent(
      "give me details of upi URS0001771A69",
      rnacentralTables,
      "rnacen.precompute_urs_accession",
      "PostgreSQL",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(String(steps[0].result)).toContain('User explicitly mentioned column "upi"');
    expect(String(steps[0].result)).toContain("rnacen.rnc_rna_precomputed");
    expect(String(steps[0].result)).toContain("Do not replace an explicitly mentioned identifier column");
  });

  it("repairs an explicit upi lookup when the model incorrectly filters urs", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        content: '{"command":"GetColumns","args":{"table_name":"rnacen.precompute_urs_accession"}}',
        inputTokens: 12,
        outputTokens: 6,
      })
      .mockResolvedValueOnce({
        content: '{"command":"ExecuteFinalQuery","args":{"table_name":"rnacen.precompute_urs_accession","operation":"select","params":{"columns":["urs","accession","database","description"],"filter":{"column":"urs","operator":"==","value":"URS0001771A69"}}}}',
        inputTokens: 16,
        outputTokens: 9,
      });

    const executeTableOperation = vi.fn().mockResolvedValueOnce({
      data: [{ upi: "URS0001771A69", taxid: 9606, description: "example RNA" }],
      sql: "SELECT * FROM \"rnacen\".\"rnc_rna_precomputed\" WHERE \"upi\" = 'URS0001771A69' LIMIT 50",
    });

    const steps = [];
    for await (const step of runDatabaseAgent(
      "give me details of upi URS0001771A69",
      rnacentralTables,
      "rnacen.precompute_urs_accession",
      "PostgreSQL",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512,
      undefined,
      undefined,
      {},
      { executeTableOperation }
    )) {
      steps.push(step);
    }

    expect(steps.map((step) => step.command)).toEqual(["GetColumns", "ExecuteFinalQuery"]);
    expect(executeTableOperation).toHaveBeenCalledTimes(1);
    expect(executeTableOperation.mock.calls[0][0]).toMatchObject({
      tableName: "rnacen.rnc_rna_precomputed",
      operation: "select",
      params: {
        filter: { column: "upi", operator: "==", value: "URS0001771A69" },
      },
    });
    expect(executeTableOperation.mock.calls[0][0].params.columns).toContain("upi");
    expect(executeTableOperation.mock.calls[0][0].params.columns).toContain("taxid");
    expect(executeTableOperation.mock.calls[0][0].params.columns).not.toContain("urs");
    expect(steps[1].args.table_name).toBe("rnacen.rnc_rna_precomputed");
    expect(steps[1].args.params.filter.column).toBe("upi");
  });

  it("carries a successful intermediate lookup filter into the final database query", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        content: '{"command":"GetColumns","args":{"table_name":"orders"}}',
        inputTokens: 12,
        outputTokens: 6,
      })
      .mockResolvedValueOnce({
        content: '{"command":"QueryTable","args":{"table_name":"orders","operation":"filter","params":{"column":"status","operator":"==","value":"paid"}}}',
        inputTokens: 14,
        outputTokens: 8,
      })
      .mockResolvedValueOnce({
        content: '{"command":"ExecuteFinalQuery","args":{"table_name":"orders","operation":"select","params":{"columns":["order_id","status"],"limit":10}}}',
        inputTokens: 16,
        outputTokens: 9,
      });

    const executeTableOperation = vi.fn()
      .mockResolvedValueOnce({
        data: [{ order_id: 1001, status: "paid" }],
        sql: "SELECT * FROM \"orders\" WHERE \"status\" = 'paid' LIMIT 1000",
      })
      .mockResolvedValueOnce({
        data: [{ order_id: 1001, status: "paid" }],
        sql: "SELECT \"order_id\", \"status\" FROM \"orders\" WHERE \"status\" = 'paid' LIMIT 10",
      });

    const steps = [];
    for await (const step of runDatabaseAgent(
      "Give me details for paid orders",
      databaseTables,
      "orders",
      "PostgreSQL",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512,
      undefined,
      undefined,
      {},
      { executeTableOperation }
    )) {
      steps.push(step);
    }

    expect(steps.map((step) => step.command)).toEqual([
      "GetColumns",
      "QueryTable",
      "ExecuteFinalQuery",
    ]);
    expect(executeTableOperation).toHaveBeenCalledTimes(2);
    expect(executeTableOperation.mock.calls[1][0].params).toMatchObject({
      columns: ["order_id", "status"],
      limit: 10,
      filter: { column: "status", operator: "==", value: "paid" },
    });
    expect(steps[1].sql).toContain("WHERE \"status\" = 'paid'");
    expect(steps[2].sql).toContain("WHERE \"status\" = 'paid'");
    expect(steps[2].result).toEqual([{ order_id: 1001, status: "paid" }]);
    expect(steps[2].args.params.filter).toEqual({ column: "status", operator: "==", value: "paid" });
  });
});

describe("runLegacyAgent - Cross-Sheet Operations", () => {
  beforeEach(() => {
    vi.mocked(callLLM).mockReset();
  });

  const testSheets: Record<string, SheetData> = {
    sales: {
      columns: [
        { name: "product", dtype: "string" },
        { name: "revenue", dtype: "number" }
      ],
      rows: [
        { product: "A", revenue: 100 },
        { product: "B", revenue: 200 }
      ]
    },
    inventory: {
      columns: [
        { name: "item", dtype: "string" },
        { name: "stock", dtype: "number" }
      ],
      rows: [
        { item: "A", stock: 10 },
        { item: "B", stock: 20 }
      ]
    }
  };

  it("supports join_sheets and subsequent operations on cross_sheet", async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        content: '{"command":"QuerySheet","args":{"sheet_name":"cross_sheet","operation":"join_sheets","params":{"sheet1":"sales","sheet2":"inventory","key1":"product","key2":"item","joinType":"inner"}}}',
        inputTokens: 12,
        outputTokens: 6,
      })
      .mockResolvedValueOnce({
        content: '{"command":"ExecuteFinalQuery","args":{"sheet_name":"cross_sheet","operation":"groupby","params":{"groupColumn":"product","aggColumn":"revenue","aggFunction":"sum"}}}',
        inputTokens: 14,
        outputTokens: 7,
      });

    const steps = [];
    for await (const step of runLegacyAgent(
      "Join sales and inventory, then show sum of revenue by product",
      testSheets,
      "sales",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps.map((step) => step.command)).toEqual([
      "QuerySheet",
      "ExecuteFinalQuery",
    ]);

    expect(steps[0].result).toHaveLength(2);
    expect(steps[0].result[0]).toHaveProperty("product", "A");
    expect(steps[0].result[0]).toHaveProperty("stock", 10);

    expect(steps[1].result).toEqual([
      { product: "B", sum: 200 },
      { product: "A", sum: 100 }
    ]);
  });

  it("supports compare_sheets for comparing revenue in sales", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: '{"command":"ExecuteFinalQuery","args":{"sheet_name":"cross_sheet","operation":"compare_sheets","params":{"sheet1":"sales","sheet2":"sales","key1":"product","key2":"product","compareColumn1":"revenue","compareColumn2":"revenue"}}}',
      inputTokens: 12,
      outputTokens: 6,
    });

    const steps = [];
    for await (const step of runLegacyAgent(
      "Compare revenue",
      testSheets,
      "sales",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps[0].command).toBe("ExecuteFinalQuery");
    expect(steps[0].result[0]).toMatchObject({
      product: "A",
      sales_revenue: 100,
      difference: 0,
      pct_change: "0.00%",
    });
  });

  it("supports union_sheets to merge sheets vertically", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: '{"command":"ExecuteFinalQuery","args":{"sheet_name":"cross_sheet","operation":"union_sheets","params":{"sheets":["sales","sales"]}}}',
      inputTokens: 12,
      outputTokens: 6,
    });

    const steps = [];
    for await (const step of runLegacyAgent(
      "Union sales",
      testSheets,
      "sales",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps[0].command).toBe("ExecuteFinalQuery");
    expect(steps[0].result).toHaveLength(4);
    expect(steps[0].result[0]).toHaveProperty("_source_sheet", "sales");
  });

  it("supports self-join on sheets and prefixes columns properly without collision", async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: '{"command":"ExecuteFinalQuery","args":{"sheet_name":"cross_sheet","operation":"join_sheets","params":{"sheet1":"sales","sheet2":"sales","key1":"product","key2":"product","joinType":"inner"}}}',
      inputTokens: 15,
      outputTokens: 8,
    });

    const steps = [];
    for await (const step of runLegacyAgent(
      "Join sales with sales",
      testSheets,
      "sales",
      "groq",
      "test-model",
      "test-key",
      0.1,
      512
    )) {
      steps.push(step);
    }

    expect(steps[0].command).toBe("ExecuteFinalQuery");
    expect(steps[0].result[0]).toHaveProperty("sales_1_revenue");
    expect(steps[0].result[0]).toHaveProperty("sales_2_revenue");
    expect(steps[0].result[0]).toHaveProperty("product");
  });
});

