import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./llm-client", () => ({
  callLLM: vi.fn(),
}));

import { runLegacyAgent } from "./agent";
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
});
