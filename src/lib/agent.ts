import { callLLM, type Provider, type LLMResponse } from "./llm-client";
import type { SheetData } from "./file-parser";

export interface AgentStep {
  turn: number;
  command: string;
  args: Record<string, any>;
  result: any;
  tokens: { input: number; output: number };
  durationMs: number;
  isFinal: boolean;
}

const SYSTEM_PROMPT = `You are a data analysis agent. You have access to a dataset. Answer the user's question by issuing commands.

Available commands (respond with EXACTLY one JSON object per turn):
1. {"command": "GetSheetDescription"} - Get overview of the dataset
2. {"command": "GetColumns"} - Get column names and types
3. {"command": "QuerySheet", "args": {"operation": "filter|sort|groupby|aggregate|select|head|unique|count", "params": {...}}} - Query the data
4. {"command": "ExecuteFinalQuery", "args": {"operation": "...", "params": {...}}} - Final query that produces the answer

Operation params:
- filter: {"column": "col", "operator": ">|<|==|!=|>=|<=|contains", "value": X}
- sort: {"column": "col", "order": "asc|desc", "limit": N}
- groupby: {"groupColumn": "col", "aggColumn": "col2", "aggFunction": "sum|count|mean|min|max"}
- aggregate: {"column": "col", "function": "sum|count|mean|min|max|median"}
- select: {"columns": ["col1", "col2"], "limit": N}
- head: {"n": N}
- unique: {"column": "col"}
- count: {}

Respond with ONLY the JSON command. No other text.`;

function executeOperation(data: Record<string, any>[], operation: string, params: Record<string, any>): any {
  switch (operation) {
    case "filter": {
      const { column, operator, value } = params;
      return data.filter((row) => {
        const v = row[column];
        switch (operator) {
          case ">": return v > value;
          case "<": return v < value;
          case ">=": return v >= value;
          case "<=": return v <= value;
          case "==": return v == value;
          case "!=": return v != value;
          case "contains": return String(v).toLowerCase().includes(String(value).toLowerCase());
          default: return true;
        }
      });
    }
    case "sort": {
      const { column, order = "asc", limit } = params;
      const sorted = [...data].sort((a, b) => {
        const av = a[column], bv = b[column];
        if (av == null) return 1;
        if (bv == null) return -1;
        return order === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
      });
      return limit ? sorted.slice(0, limit) : sorted;
    }
    case "groupby": {
      const { groupColumn, aggColumn, aggFunction } = params;
      const groups: Record<string, number[]> = {};
      for (const row of data) {
        const key = String(row[groupColumn] ?? "null");
        if (!groups[key]) groups[key] = [];
        if (aggColumn) groups[key].push(Number(row[aggColumn]) || 0);
      }
      return Object.entries(groups).map(([key, vals]) => {
        let agg: number;
        switch (aggFunction) {
          case "sum": agg = vals.reduce((s, v) => s + v, 0); break;
          case "count": agg = vals.length; break;
          case "mean": agg = vals.reduce((s, v) => s + v, 0) / vals.length; break;
          case "min": agg = Math.min(...vals); break;
          case "max": agg = Math.max(...vals); break;
          default: agg = vals.length;
        }
        return { [groupColumn]: key, [aggFunction || "count"]: agg };
      });
    }
    case "aggregate": {
      const { column, function: fn } = params;
      const nums = data.map((r) => Number(r[column])).filter((n) => !isNaN(n));
      if (nums.length === 0) return { result: 0 };
      switch (fn) {
        case "sum": return { result: nums.reduce((s, v) => s + v, 0) };
        case "count": return { result: nums.length };
        case "mean": return { result: nums.reduce((s, v) => s + v, 0) / nums.length };
        case "min": return { result: Math.min(...nums) };
        case "max": return { result: Math.max(...nums) };
        case "median": {
          const sorted = [...nums].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return { result: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 };
        }
        default: return { result: nums.length };
      }
    }
    case "select": {
      const { columns, limit = 50 } = params;
      return data.slice(0, limit).map((row) => {
        const obj: Record<string, any> = {};
        for (const c of columns) obj[c] = row[c];
        return obj;
      });
    }
    case "head":
      return data.slice(0, params.n || 10);
    case "unique": {
      const vals = [...new Set(data.map((r) => r[params.column]))];
      return vals.map((v) => ({ [params.column]: v }));
    }
    case "count":
      return { result: data.length };
    default:
      return { error: `Unknown operation: ${operation}` };
  }
}

function parseCommand(text: string): { command: string; args?: Record<string, any> } | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}
  return null;
}

export async function* runAgent(
  question: string,
  sheetData: SheetData,
  provider: Provider,
  model: string,
  apiKey: string,
  temperature: number,
  maxTokens: number,
  systemPromptOverride?: string
): AsyncGenerator<AgentStep> {
  const messages: { role: string; content: string }[] = [];
  const prompt = systemPromptOverride || SYSTEM_PROMPT;
  let turn = 0;
  const maxTurns = 8;

  messages.push({ role: "user", content: `Dataset has ${sheetData.rows.length} rows, columns: ${sheetData.columns.map((c) => `${c.name} (${c.dtype})`).join(", ")}.\n\nQuestion: ${question}` });

  while (turn < maxTurns) {
    turn++;
    const startTime = Date.now();

    let llmResponse: LLMResponse;
    try {
      llmResponse = await callLLM(provider, model, apiKey, messages, prompt, temperature, maxTokens);
    } catch (err: any) {
      yield {
        turn,
        command: "Error",
        args: {},
        result: err.message,
        tokens: { input: 0, output: 0 },
        durationMs: Date.now() - startTime,
        isFinal: true,
      };
      return;
    }

    const parsed = parseCommand(llmResponse.content);
    if (!parsed) {
      yield {
        turn,
        command: "FinalAnswer",
        args: {},
        result: llmResponse.content,
        tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
        durationMs: Date.now() - startTime,
        isFinal: true,
      };
      return;
    }

    const { command, args = {} } = parsed;
    let result: any;

    switch (command) {
      case "GetSheetDescription":
        result = {
          rowCount: sheetData.rows.length,
          columnCount: sheetData.columns.length,
          columns: sheetData.columns.map((c) => ({ name: c.name, type: c.dtype, unique: c.uniqueCount })),
        };
        break;
      case "GetColumns":
        result = sheetData.columns.map((c) => ({
          name: c.name,
          type: c.dtype,
          nonNull: c.nonNullCount,
          unique: c.uniqueCount,
          samples: c.sampleValues,
        }));
        break;
      case "QuerySheet":
      case "ExecuteFinalQuery":
        result = executeOperation(sheetData.rows, args.operation, args.params || {});
        break;
      default:
        result = { error: `Unknown command: ${command}` };
    }

    const isFinal = command === "ExecuteFinalQuery";
    const durationMs = Date.now() - startTime;

    yield {
      turn,
      command,
      args,
      result,
      tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
      durationMs,
      isFinal,
    };

    if (isFinal) return;

    messages.push({ role: "assistant", content: llmResponse.content });
    messages.push({
      role: "user",
      content: `Result: ${JSON.stringify(result).slice(0, 2000)}${JSON.stringify(result).length > 2000 ? "... (truncated)" : ""}\n\nContinue analysis or use ExecuteFinalQuery to provide the final answer.`,
    });
  }

  yield {
    turn,
    command: "MaxTurnsReached",
    args: {},
    result: "Agent reached maximum turns without a final answer.",
    tokens: { input: 0, output: 0 },
    durationMs: 0,
    isFinal: true,
  };
}
