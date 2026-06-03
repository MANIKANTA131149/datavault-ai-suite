import { callLLM, type Provider, type LLMProviderOptions, type LLMResponse } from "./llm-client";
import type { SheetData } from "./file-parser";
import { isClarificationAnswer, mergeClarificationOptions, isGreetingQuery } from "./clarification-options";

export interface AgentStep {
  turn: number;
  command: string;
  args: Record<string, any>;
  result: any;
  sql?: string;
  tokens: { input: number; output: number };
  durationMs: number;
  isFinal: boolean;
  hitlKind?: "clarification" | "approval";
  hitlPrompt?: string;
}

export interface HitlController {
  waitForHuman: (
    prompt: string,
    kind: "clarification" | "approval",
    details?: { rowCount?: number; operation?: string; sql?: string; options?: string[] }
  ) => Promise<string>;
}

export interface ConversationContext {
  question: string;
  answer: any;
}

export interface DatabaseTableData extends SheetData {
  name: string;
  kind?: string;
  description?: string;
  rowCount?: number;
}

interface DatabaseAgentTools {
  executeTableOperation?: (input: {
    tableName: string;
    operation: string;
    params: Record<string, any>;
    isFinal: boolean;
  }) => Promise<any>;
  executeSql?: (input: {
    sql: string;
    isFinal: boolean;
  }) => Promise<any>;
  loadTableSchema?: (tableName: string) => Promise<DatabaseTableData | null>;
}

// ─── Enterprise System Prompt ─────────────────────────────────────────────────
// Designed to guide even small/weak LLMs to produce correct, structured JSON
// by providing exhaustive examples, intent categories, and a strict decision tree.
const SYSTEM_PROMPT = `You are an enterprise-grade data analysis agent. Your ONLY job is to convert a natural language question about a dataset into exactly ONE JSON command. You must NEVER output prose — only valid JSON.

═══════════════════════════════════════════════════════
COMMAND REFERENCE (output exactly one of these)
═══════════════════════════════════════════════════════

1. Direct answer, clarification, or final interpretation after an intermediate result:
   {"command":"Answer","args":{"value": <string|number|array>}}

2. Single local operation that fully returns the final answer:
   {"command":"ExecuteFinalQuery","args":{"operation":"<op>","params":{...}}}

3. Intermediate query when the question needs analysis of an operation result:
   {"command":"QuerySheet","args":{"operation":"<op>","params":{...}}}

4. Fetch schema before writing a query:
   {"command":"GetColumns"}
   {"command":"GetSheetDescription"}

═══════════════════════════════════════════════════════
OPERATIONS & PARAMS (for ExecuteFinalQuery / QuerySheet)
═══════════════════════════════════════════════════════

filter        {"column":"col","operator":"==|!=|>|<|>=|<=|contains|starts_with|ends_with|is_null|not_null","value":X}
sort          {"column":"col","order":"asc|desc","limit":N}
remove_nulls  {"column":"col"} or {} to remove all null rows
groupby       {"groupColumn":"col","aggColumn":"col2","aggFunction":"sum|count|count_distinct|mean|min|max","limit":N,"order":"desc|asc","filter":{optional},"transformColumn":{optional},"transformFunction":{optional},"removeOutliers":{optional},"removeNulls":{true|false}}
aggregate     {"column":"col","function":"sum|count|mean|min|max|median|std|variance"}
select        {"columns":["col1","col2"],"limit":N}
head          {"n":N}
transform_column {"column":"col","function":"extract_number|to_lower|to_upper|trim","skipNulls":true}
unique        {"column":"col"}
count         {}
percentile    {"column":"col","percentiles":[25,50,75]}
correlation   {"column1":"col1","column2":"col2"}
topN_groupby  {"groupColumn":"col","rankColumn":"col2","n":3,"order":"desc|asc"}
date_trunc    {"dateColumn":"col","period":"day|week|month|quarter|year","aggColumn":"col2","aggFunction":"count|sum|mean"}
outlier_detect{"column":"col","method":"zscore|iqr","threshold":2}
filter_outliers {"column":"col","method":"zscore|iqr","threshold":1.5}
multi_filter  {"filters":[{"column":"col","operator":"==","value":X}],"logic":"AND|OR"}
pivot         {"rowColumn":"col","colColumn":"col2","valueColumn":"col3","aggFunction":"sum|count|mean"}
pipeline      {"operations":[{"operation":"filter","params":{...}},{"operation":"transform_column","params":{...}},...]}
multi_analysis{"operations":[{"name":"label1","operation":"groupby","params":{...}},{"name":"label2","operation":"aggregate","params":{...}}]} to execute multiple independent parallel operations on the original dataset

═══════════════════════════════════════════════════════
INTENT → OPERATION MAPPING (memorize this)
═══════════════════════════════════════════════════════

COUNTING / HOW MANY
  "how many rows"            → count {}
  "how many X"               → filter on X, then use count result; OR groupby+count
  "how many distinct/unique" → unique {column}
  "distinct/unique/diverse X by Y" → groupby {groupColumn:Y, aggColumn:X, aggFunction:"count_distinct"}
  "total count of"           → count {}

AGGREGATION / MATH
  "total / sum of"           → aggregate {function:"sum"} ONLY when asking for one overall metric value
  "average / mean / avg"     → aggregate {function:"mean"} ONLY when asking for one overall metric value
  "maximum / highest / most" → aggregate {function:"max"} OR sort {order:"desc",limit:1} ONLY for one row/value, not a category comparison
  "minimum / lowest / least" → aggregate {function:"min"} OR sort {order:"asc",limit:1} ONLY for one row/value, not a category comparison
  "median"                   → aggregate {function:"median"}
  "std / standard deviation" → aggregate {function:"std"}
  "variance"                 → aggregate {function:"variance"}

RANKING / TOP / BOTTOM
  "which X has highest/lowest average Y" → groupby {groupColumn:X, aggColumn:Y, aggFunction:"mean", limit:1}
  "which X has highest/lowest total Y"   → groupby {groupColumn:X, aggColumn:Y, aggFunction:"sum", limit:1}
  "which X has most diverse Y"           → groupby {groupColumn:X, aggColumn:Y, aggFunction:"count_distinct", limit:1}
  "which X gives highest performance"    → groupby by X, aggregate the performance metric, usually mean, limit:1
  "which type/category/manufacturer/fuel has/gives most/common/best/highest Y" → groupby, NOT aggregate
  "top N / best N"           → sort {order:"desc", limit:N}
  "bottom N / worst N"       → sort {order:"asc",  limit:N}
  "top N per group/category" → topN_groupby

FILTERING / FINDING
  "where / which / that"     → filter or multi_filter
  "greater than / over"      → filter {operator:">"}
  "less than / under / below"→ filter {operator:"<"}
  "equal to / is / called"   → filter {operator:"=="}
  "not equal / exclude"      → filter {operator:"!="}
  "contains / includes"      → filter {operator:"contains"}
  "starts with"              → filter {operator:"starts_with"}
  "ends with"                → filter {operator:"ends_with"}
  "missing / null / empty"   → filter {operator:"is_null"}
  "both X and Y condition"   → multi_filter {logic:"AND"}
  "either X or Y condition"  → multi_filter {logic:"OR"}

DISTRIBUTION / BREAKDOWN
  "breakdown / distribution" → groupby {aggFunction:"count"}
  "by category / by type"    → groupby
  "each / per / for every"   → groupby
  "pivot / cross-tab"        → pivot

TIME SERIES / TREND
  "over time / trend"        → date_trunc {period:"month"}
  "by day/week/month/year"   → date_trunc {period: matching}
  "growth / change"          → date_trunc then interpret trend

STATISTICAL
  "percentile / quartile"    → percentile
  "correlation / relationship between" → correlation
  "outlier / anomaly / unusual" → outlier_detect
  "spread / distribution"    → percentile or aggregate std

SCHEMA / METADATA (Answer directly — no data scan)
  "how many columns"         → Answer {value: <count>}
  "what columns / fields"    → Answer {value: [col names]}
  "column types / data types"→ Answer {value: {col:type}}
  "show me the data / preview" → head {n:10}
  "sample rows"              → head {n:5}

DATA CLEANING / PREPROCESSING (Critical for messy data)
  "extract numbers from text" → use transformColumn:"col", transformFunction:"extract_number" in filter/groupby
  "remove outliers before avg/mean" → use removeOutliers:{method:"iqr",threshold:1.5} in groupby/aggregate
  "filter for specific type AND calculate mean" → use filter:{} + transformColumn + removeOutliers all in groupby
  "duration/minutes embedded in text" → ALWAYS use transformFunction:"extract_number" on the duration column
  "average per category but only movies" → groupby with filter:{column:"type",operator:"==",value:"Movie"}
  "mean of text-formatted numbers" → groupby with transformFunction:"extract_number"
  "remove empty/null values" → removeNulls:true (DEFAULT in groupby) OR use remove_nulls operation explicitly
  "clean data before calculation" → groupby automatically removes nulls, transforms, and cleans NaN values

═══════════════════════════════════════════════════════
COLUMN MATCHING RULES (critical for accuracy)
═══════════════════════════════════════════════════════

1. Case-insensitive match: "Sales" == "sales" == "SALES"
2. Fuzzy synonyms: "revenue"→"sales", "date"→"created_at"/"order_date", "name"→"customer_name"/"product_name"
3. Always use the EXACT column name from the schema provided, not the user's phrasing
4. If the user says "price" and you see "unit_price" and "total_price", pick the most contextually relevant one
5. NEVER invent column names. If unsure, pick the closest match from the schema.

═══════════════════════════════════════════════════════
VALUE INFERENCE RULES
═══════════════════════════════════════════════════════

1. Numbers: "one hundred" → 100, "50k" → 50000, "1M" → 1000000
2. Booleans: "yes/true/active/enabled" → true, "no/false/inactive" → false
3. Comparisons: "more than 5" → {operator:">", value:5}
4. Date ranges: "last year" → filter by year, "this month" → filter by current month
5. Percentages in questions: "what percent" → compute groupby count, then note ratio in result
6. "recent / latest / newest" → sort {order:"desc", limit:N} on date column
7. "oldest / earliest / first" → sort {order:"asc",  limit:1} on date column

═══════════════════════════════════════════════════════
DECISION TREE (follow in order)
═══════════════════════════════════════════════════════

Step 1: Do you need column names, column types, or sample values before writing a query?
  YES → GetColumns first.

Step 2: Is the question about schema/metadata only?
  YES → Answer command with value derived from column list.

Step 3: Is the user request ambiguous, underspecified, or missing the target column/metric?
  YES → Answer with one concise clarification question and an "options" array (2–6 concrete choices). Do not guess.
  Example: {"command":"Answer","args":{"value":"Which column should count as revenue?","options":["total_sales","net_revenue","gross_amount"]}}

Step 4: Does the question need ONE supported operation to produce the final answer?
  YES → ExecuteFinalQuery with the right operation.

Step 5: Does the question ask for MULTIPLE pieces of information, comparisons (e.g. highest AND lowest), full analysis, or multiple metrics?
  YES → Use the "multi_analysis" operation with ExecuteFinalQuery to run all the sub-queries in parallel in a single turn. You can also use separate QuerySheet operations across multiple turns if they must be evaluated sequentially.
  Examples of multi-part questions: "highest and lowest salary", "analyze the data", "give me a summary", "compare X and Y", "show high, low, average", "complete analysis", "statistics overview".

Step 6: Does the question require aggregation first and then interpretation, comparison, ranking, ratio, percentage, change, or explanation?
  YES → QuerySheet first. On the next turn, use Answer to interpret the returned result, or ExecuteFinalQuery only if another full-data operation is truly needed.

Step 7: Is sheet info missing entirely?
  YES → GetColumns, then proceed.

═══════════════════════════════════════════════════════
WORKED EXAMPLES (few-shot — study these carefully)
═══════════════════════════════════════════════════════

Q: "How many records are there?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"count","params":{}}}

Q: "What is the average salary?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"aggregate","params":{"column":"salary","function":"mean"}}}

Q: "Show me the top 5 customers by revenue"
A: {"command":"ExecuteFinalQuery","args":{"operation":"sort","params":{"column":"revenue","order":"desc","limit":5}}}

Q: "Which products have sales greater than 1000?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"filter","params":{"column":"sales","operator":">","value":1000}}}

Q: "What is the total sales by region?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"groupby","params":{"groupColumn":"region","aggColumn":"sales","aggFunction":"sum"}}}

Q: "Show me orders from customers in New York who spent more than 500"
A: {"command":"ExecuteFinalQuery","args":{"operation":"multi_filter","params":{"filters":[{"column":"city","operator":"==","value":"New York"},{"column":"amount","operator":">","value":500}],"logic":"AND"}}}

Q: "What are the monthly trends in revenue?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"date_trunc","params":{"dateColumn":"order_date","period":"month","aggColumn":"revenue","aggFunction":"sum"}}}

Q: "Who are the top 3 sellers in each category?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"topN_groupby","params":{"groupColumn":"category","rankColumn":"sales","n":3,"order":"desc"}}}

Q: "Is there a correlation between age and salary?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"correlation","params":{"column1":"age","column2":"salary"}}}

Q: "Find outliers in the price column"
A: {"command":"ExecuteFinalQuery","args":{"operation":"outlier_detect","params":{"column":"price","method":"iqr","threshold":1.5}}}

Q: "What is the 25th, 50th, and 75th percentile of scores?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"percentile","params":{"column":"scores","percentiles":[25,50,75]}}}

Q: "How many columns does the dataset have?"
A: {"command":"Answer","args":{"value":12}}

Q: "What are the column names?"
A: {"command":"Answer","args":{"value":["id","name","sales","region","date"]}}

Q: "Show me a pivot of sales by region and product"
A: {"command":"ExecuteFinalQuery","args":{"operation":"pivot","params":{"rowColumn":"region","colColumn":"product","valueColumn":"sales","aggFunction":"sum"}}}

Q: "Which rows have missing email addresses?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"filter","params":{"column":"email","operator":"is_null","value":null}}}

Q: "What are the unique categories?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"unique","params":{"column":"category"}}}

Q: "Give me a preview of the data"
A: {"command":"ExecuteFinalQuery","args":{"operation":"head","params":{"n":10}}}

Q: "What is the highest revenue product?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"sort","params":{"column":"revenue","order":"desc","limit":1}}}

Q: "Count orders by status"
A: {"command":"ExecuteFinalQuery","args":{"operation":"groupby","params":{"groupColumn":"status","aggColumn":"status","aggFunction":"count"}}}

Q: "Which region has the highest total sales?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"groupby","params":{"groupColumn":"region","aggColumn":"sales","aggFunction":"sum","limit":1}}}

Q: "Which manufacturer has the highest average torque?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"groupby","params":{"groupColumn":"manufacturer","aggColumn":"torque_output","aggFunction":"mean","limit":1}}}

Q: "Which fuel type gives the highest performance?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"groupby","params":{"groupColumn":"fuel_type","aggColumn":"power_output_hp","aggFunction":"mean","limit":1}}}

Q: "Which engine configuration is most common?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"groupby","params":{"groupColumn":"engine_configuration","aggColumn":"engine_configuration","aggFunction":"count","limit":1}}}

Q: "Which manufacturer has the most diverse engine types?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"groupby","params":{"groupColumn":"manufacturer","aggColumn":"engine_type","aggFunction":"count_distinct","limit":1}}}

Q: "Which rating category has the longest average movie duration?"
A: {"command":"ExecuteFinalQuery","args":{"operation":"groupby","params":{"groupColumn":"rating","aggColumn":"duration","aggFunction":"mean","filter":{"column":"type","operator":"==","value":"Movie"},"transformColumn":"duration","transformFunction":"extract_number","removeOutliers":{"method":"iqr","threshold":1.5}}}}

Q: "Which category contributes the largest share of revenue?"
A: {"command":"QuerySheet","args":{"operation":"groupby","params":{"groupColumn":"category","aggColumn":"revenue","aggFunction":"sum"}}}

Q: "Filter movies, extract duration numbers, remove outliers, then average duration by country"
A: {"command":"ExecuteFinalQuery","args":{"operation":"pipeline","params":{"operations":[{"operation":"filter","params":{"column":"type","operator":"==","value":"Movie"}},{"operation":"transform_column","params":{"column":"duration","function":"extract_number"}},{"operation":"filter_outliers","params":{"column":"duration","method":"iqr","threshold":1.5}},{"operation":"groupby","params":{"groupColumn":"country","aggColumn":"duration","aggFunction":"mean"}}]}}}

Q: "Give me the average salary, min and max salary, and a department breakdown" (multiple independent questions in a single request -> use multi_analysis to execute in parallel in a single turn)
A: {"command":"ExecuteFinalQuery","args":{"operation":"multi_analysis","params":{"operations":[{"name":"average_salary","operation":"aggregate","params":{"column":"salary","function":"mean"}},{"name":"min_salary","operation":"aggregate","params":{"column":"salary","function":"min"}},{"name":"max_salary","operation":"aggregate","params":{"column":"salary","function":"max"}},{"name":"department_breakdown","operation":"groupby","params":{"groupColumn":"department","aggColumn":"salary","aggFunction":"mean"}}]}}}

Q: "Which employee has the highest and lowest salary?" (multi-part → use QuerySheet for each part, then Answer)
Turn 1: {"command":"QuerySheet","args":{"operation":"sort","params":{"column":"salary","order":"desc","limit":1}}}
Turn 2: {"command":"QuerySheet","args":{"operation":"sort","params":{"column":"salary","order":"asc","limit":1}}}
Turn 3: {"command":"Answer","args":{"value":"Highest salary: Henry Allen ($95,000). Lowest salary: ..."}} (combines both results)

Q: "Analyze the employee data" or "Give me a complete analysis" (broad analysis → multiple QuerySheet then Answer)
Turn 1: {"command":"QuerySheet","args":{"operation":"count","params":{}}}
Turn 2: {"command":"QuerySheet","args":{"operation":"aggregate","params":{"column":"salary","function":"mean"}}}
Turn 3: {"command":"QuerySheet","args":{"operation":"groupby","params":{"groupColumn":"department","aggColumn":"salary","aggFunction":"mean"}}}
Turn 4: {"command":"Answer","args":{"value":"Dataset has N records. Average salary is $X. Department breakdown: ..."}} (combines all)

Q: "Show sales"
A: {"command":"Answer","args":{"value":"Do you want total sales, sales by a category, or sales over time?"}}

═══════════════════════════════════════════════════════
STRICT RULES — NEVER VIOLATE
═══════════════════════════════════════════════════════

✅ You have FULL READ-ACCESS to all tables/sheets in the workbook/database. You can perform ANY supported operation, filtering, sorting, pipeline, or search to retrieve the results. Never state that you cannot access the data or refuse a query.
✅ Be completely dynamic: combine filters, groupbys, and transformations freely to answer the user's natural language question accurately based on the data.
✅ Output ONLY valid JSON — no prose, no markdown, no explanation
✅ Use EXACT column names from the schema
✅ Call GetColumns before QuerySheet or ExecuteFinalQuery if the current turn has not already shown the schema
✅ Use ExecuteFinalQuery when one supported operation fully answers the question
✅ Use QuerySheet when the answer requires interpreting an intermediate result
✅ When the user asks for MULTIPLE things (e.g. "highest AND lowest", "analyze", "summary", "compare", "statistics"), prefer using the "multi_analysis" operation to execute all parts in a single turn, OR use separate QuerySheet operations for sequential multi-turn evaluation, then combine all results in a final Answer.
✅ Use Answer for metadata, clarification questions, and final interpretation after QuerySheet
✅ If the user asks "which/what/who <category> has/gives highest/lowest/best/most <metric>", use groupby with limit:1
✅ If the user asks for "most diverse", "most unique", or "most distinct" values within a category, use groupby with aggFunction:"count_distinct"
✅ If the user says "manufacturer", the groupColumn must be the manufacturer/make/brand column, not Title, name, or id
✅ Use aggregate only for overall dataset metrics like "what is the average torque", never for comparing categories
✅ Use multi_filter when multiple conditions are mentioned
✅ Use date_trunc for any time-based trend question
✅ When grouping by a category AND averaging a numeric column, ALWAYS check if the numeric column needs transformation (e.g., "90 min" → extract_number)
✅ When a question mentions "average/mean" AND the column contains text (like duration with "min"), add transformColumn + transformFunction to groupby
✅ When a question implies filtering (e.g., "movies only", "for 2020+"), use the filter parameter in groupby, NOT a separate filter operation
✅ When calculating mean/average, ALWAYS consider adding removeOutliers to avoid extreme values distorting results
✅ Null values are AUTOMATICALLY REMOVED from BOTH groupColumn AND aggColumn before aggregation (removeNulls=true by default)
✅ Results will NOT include a "null" category — all rows with null grouping values are excluded
✅ If the numeric column has NaN/invalid values, null removal + transformation will ensure accurate results with no 0 averages
✅ Use remove_nulls operation to explicitly clean data before other operations if needed
✅ Use topN_groupby for "top N per group/category" questions
✅ Use outlier_detect for "anomaly/outlier/unusual values"
✅ Use correlation for "relationship between two numeric columns"
❌ NEVER output text outside of JSON
❌ NEVER invent column names not in the schema
❌ Do not use ExecuteFinalQuery for ambiguous requests that need clarification
❌ Do not use QuerySheet when a single ExecuteFinalQuery operation fully answers the question
❌ Do not skip schema inspection before writing a query`;


// ─── Intent Normalizer ─────────────────────────────────────────────────────────
// Pre-processes the user's question to resolve ambiguities BEFORE sending to LLM.
// This dramatically improves accuracy for small/weak models.
function normalizeQuestion(question: string, columns: SheetData["columns"]): string {
  let q = question.trim();

  // Normalize numeric shorthand
  q = q.replace(/\b(\d+(?:\.\d+)?)k\b/gi, (_, n) => String(parseFloat(n) * 1000));
  q = q.replace(/\b(\d+(?:\.\d+)?)m\b/gi, (_, n) => String(parseFloat(n) * 1000000));
  q = q.replace(/\b(\d+(?:\.\d+)?)b\b/gi, (_, n) => String(parseFloat(n) * 1000000000));

  // Normalize common phrasings → canonical forms
  const phraseMap: [RegExp, string][] = [
    [/\bhow many rows\b/gi, "what is the total count of rows"],
    [/\btotal number of\b/gi, "count of"],
    [/\bon average\b/gi, "average"],
    [/\bmean of\b/gi, "average of"],
    [/\bmost recent\b/gi, "latest"],
    [/\bnewest\b/gi, "latest"],
    [/\boldest\b/gi, "earliest"],
    [/\bhighest\b/gi, "maximum"],
    [/\blowest\b/gi, "minimum"],
    [/\bbest\b/gi, "top"],
    [/\bworst\b/gi, "bottom"],
    [/\bbreakdown\b/gi, "distribution grouped"],
    [/\bover time\b/gi, "trend by month"],
    [/\bmonthly trend\b/gi, "trend by month"],
    [/\byearly trend\b/gi, "trend by year"],
    [/\bweekly trend\b/gi, "trend by week"],
    [/\bany null\b/gi, "missing values"],
    [/\bmissing\b/gi, "null values"],
    [/\bunusual\b/gi, "outlier"],
    [/\banomaly\b/gi, "outlier"],
    [/\brelationship between\b/gi, "correlation between"],
    [/\bconnected to\b/gi, "correlation between"],
    [/\bwhat percent\b/gi, "percentage distribution of"],
    [/\bshow me\b/gi, "display"],
    [/\bgive me\b/gi, "display"],
    [/\blist\b/gi, "display"],
    [/\btell me\b/gi, "what is"],
  ];

  for (const [pattern, replacement] of phraseMap) {
    q = q.replace(pattern, replacement);
  }

  return q;
}

// ─── Column Hint Injector ──────────────────────────────────────────────────────
// Finds the best matching column(s) for words in the question and adds
// a disambiguation hint so small models don't guess wrong column names.
function buildColumnHints(question: string, columns: SheetData["columns"]): string {
  const qLower = question.toLowerCase();
  const matched: string[] = [];

  for (const col of columns) {
    const colLower = col.name.toLowerCase();
    const colWords = colLower.split(/[_\s-]+/);

    // Direct containment or word-level match
    if (
      qLower.includes(colLower) ||
      colWords.some((w) => w.length > 3 && qLower.includes(w))
    ) {
      matched.push(col.name);
    }
  }

  // Semantic synonym hints — map common natural language terms to column name patterns
  const synonymMap: Record<string, RegExp> = {
    revenue: /revenue|sales|amount|total|income|earning/i,
    date: /date|time|created|updated|ordered|timestamp/i,
    name: /name|title|label|description/i,
    category: /category|type|class|group|segment|kind/i,
    price: /price|cost|value|amount|fee|charge/i,
    quantity: /quantity|qty|count|number|volume|units/i,
    status: /status|state|stage|phase|condition/i,
    id: /id|key|identifier|code|number/i,
    region: /region|area|zone|territory|location|city|country|state/i,
    manufacturer: /manufacturer|make|maker|brand|company|vendor|oem/i,
    fuel: /fuel|gas|diesel|petrol|electric|hybrid|energy/i,
    engine: /engine|motor|configuration|cylinder/i,
    diversity: /diverse|diversity|variety|distinct|unique/i,
    performance: /performance|power|horsepower|hp|torque|acceleration|speed|output/i,
    age: /age|years|duration|tenure/i,
    score: /score|rating|rank|grade|mark|point/i,
  };

  for (const [semantic, pattern] of Object.entries(synonymMap)) {
    if (pattern.test(qLower)) {
      const candidates = columns.filter((c) => pattern.test(c.name));
      for (const c of candidates) {
        if (!matched.includes(c.name)) matched.push(c.name);
      }
    }
  }

  if (matched.length === 0) return "";
  return `\n\nRelevant columns for this question: ${matched.map((n) => `"${n}"`).join(", ")} — use EXACT names as shown.`;
}

// ─── Query Plan Classifier ─────────────────────────────────────────────────────
// Detects question intent and injects a focused hint into the prompt.
// Helps weak models pick the right operation without guessing.
function classifyIntent(question: string): string {
  const q = question.toLowerCase();

  const intents: Array<[RegExp, string]> = [
    [/\banalyze|analysis|statistics|overview|summary|multiple (metrics|operations|questions|parts)|highest (and|or) lowest|max (and|or) min|high (and|or) low\b/i, "INTENT: comprehensive multi-part analysis → use the 'multi_analysis' operation inside ExecuteFinalQuery to execute multiple independent operations (e.g. groupby, aggregate, percentile, outlier_detect) on the dataset in parallel in a single turn. Structure it as {\"operation\":\"multi_analysis\",\"params\":{\"operations\":[{\"name\":\"label1\",\"operation\":\"groupby\",\"params\":{...}},...]}}"],
    [/\b(which|what|who)\b.+\b(diverse|diversity|variety|distinct|unique)\b/i, "INTENT: grouped diversity ranking → use groupby with aggFunction count_distinct; groupColumn is the entity/category being compared, aggColumn is the thing whose diversity is counted; use limit:1 for most/least"],
    [/\b(which|what|who)\b.+\b(maximum|max|highest|largest|most|top|best|minimum|min|lowest|smallest|least|bottom|worst|common)\b/i, "INTENT: category comparison/ranking → if a category/type/entity is mentioned, use groupby with the category as groupColumn and limit:1; do not use aggregate unless asking for one overall dataset value"],
    [/\boutlier|anomal|unusual|abnormal\b/i, "INTENT: outlier detection → use outlier_detect operation"],
    [/\bcorrelat|relationship between|related to\b/i, "INTENT: correlation analysis → use correlation operation"],
    [/\bpercent|percentile|quartile\b/i, "INTENT: percentile/distribution → use percentile operation"],
    [/\bpivot|cross.?tab|cross.?tabulation\b/i, "INTENT: pivot table → use pivot operation"],
    [/\btop \d+ per |best \d+ per |top \d+ in each\b/i, "INTENT: top-N per group → use topN_groupby operation"],
    [/\bby (day|week|month|quarter|year)|over time|trend|time.?series\b/i, "INTENT: time series → use date_trunc operation"],
    [/\b(and|both).+(and|both).+condition|multiple filter\b/i, "INTENT: multiple conditions → use multi_filter with logic AND"],
    [/\b(or|either).+condition\b/i, "INTENT: OR conditions → use multi_filter with logic OR"],
    [/\bgrouped? by|break.?down|by (category|type|region|status|group)\b/i, "INTENT: aggregation by group → use groupby operation"],
    [/\bunique|distinct|different values\b/i, "INTENT: distinct values → use unique operation"],
    [/\bmissing|null|empty|blank\b/i, "INTENT: missing data → use filter with operator is_null"],
    [/\baverage|mean|avg\b/i, "INTENT: average → use aggregate with function mean"],
    [/\btotal|sum\b/i, "INTENT: sum → use aggregate with function sum"],
    [/\bmaximum|max|highest|largest|most\b/i, "INTENT: maximum value → use aggregate with function max OR sort desc limit 1"],
    [/\bminimum|min|lowest|smallest|least\b/i, "INTENT: minimum value → use aggregate with function min OR sort asc limit 1"],
    [/\btop \d+|best \d+\b/i, "INTENT: top-N ranking → use sort with order desc and limit N"],
    [/\bbottom \d+|worst \d+\b/i, "INTENT: bottom-N ranking → use sort with order asc and limit N"],
    [/\bhow many|count|total number\b/i, "INTENT: counting → use count or aggregate with function count"],
    [/\bpreview|sample|first (few|rows?|records?)|show data\b/i, "INTENT: data preview → use head operation"],
    [/\bcolumns?|fields?|schema|structure\b/i, "INTENT: schema question → use Answer command with column names from metadata"],
  ];

  for (const [pattern, hint] of intents) {
    if (pattern.test(q)) return `\n\n${hint}.`;
  }
  return "";
}

// ─── Execute Operations ─────────────────────────────────────────────────────────
// ALL ORIGINAL FUNCTIONS PRESERVED — DO NOT MODIFY
function normalizeColumnName(name: string) {
  return name.toLowerCase().replace(/[_\-\s]+/g, " ").trim();
}

function columnHasNumericText(column: SheetData["columns"][number]) {
  return column.dtype === "string" && column.sampleValues.some((value) => /\d/.test(String(value)));
}

function findColumnByPattern(columns: SheetData["columns"], pattern: RegExp) {
  return columns.find((column) => pattern.test(normalizeColumnName(column.name)));
}

function findMentionedColumnByName(question: string, columns: SheetData["columns"]) {
  const q = question.toLowerCase();
  return columns.find((column) => {
    const normalized = normalizeColumnName(column.name);
    if (q.includes(normalized)) return true;
    return normalized.split(/\s+/).some((word) => word.length > 2 && new RegExp(`\\b${word}\\b`, "i").test(q));
  });
}

function buildGroupedRankingFallback(
  question: string,
  columns: SheetData["columns"]
): { command: string; args: Record<string, any> } | null {
  const q = question.toLowerCase();
  const isGroupedRanking =
    /\b(which|what|who)\b/.test(q) &&
    /\b(highest|maximum|max|largest|top|best|lowest|minimum|min|smallest|bottom|worst|most|common)\b/.test(q);

  if (!isGroupedRanking) return null;

  const groupColumn =
    /\bmanufacturer|make|maker|brand|company|vendor|oem\b/.test(q)
      ? findColumnByPattern(columns, /manufacturer|make|maker|brand|company|vendor|oem/)
      : /\bfuel\b/.test(q)
        ? findColumnByPattern(columns, /fuel/)
        : /\bengine\b/.test(q)
          ? findColumnByPattern(columns, /engine.*(configuration|type)|configuration|engine/)
          : undefined;

  const metricColumn =
    /\btorque\b/.test(q)
      ? findColumnByPattern(columns, /torque/)
      : /\bfuel.?efficien|fuel economy|mileage|mpg|km\/l|kmpl|mi\/gal|consumption|economy\b/.test(q)
        ? findColumnByPattern(columns, /fuel.?efficien|economy|mileage|mpg|kmpl|km\/l|mi\/gal|consumption/)
      : /\bhorsepower|power|hp|performance\b/.test(q)
        ? findColumnByPattern(columns, /horsepower|power|hp|performance|output/)
        : findMentionedColumnByName(q, columns.filter((column) => column.dtype === "number" || columnHasNumericText(column)));

  if (!groupColumn || !metricColumn) return null;

  const aggFunction =
    /\baverage|mean|avg\b/.test(q) ? "mean" :
      /\btotal|sum\b/.test(q) ? "sum" :
        /\bcommon|count\b/.test(q) ? "count" :
          "mean";

  const params: Record<string, any> = {
    groupColumn: groupColumn.name,
    aggColumn: metricColumn.name,
    aggFunction,
    limit: 1,
    order:
      /\bconsumption|l\/100|liters per 100|litres per 100\b/.test(normalizeColumnName(metricColumn.name))
        ? "asc"
        : /\blowest|minimum|min|smallest|bottom|worst\b/.test(q) ? "asc" : "desc",
  };

  if (aggFunction !== "count" && columnHasNumericText(metricColumn)) {
    params.transformColumn = metricColumn.name;
    params.transformFunction = "extract_number";
  }

  return { command: "ExecuteFinalQuery", args: { operation: "groupby", params } };
}

function resolveColumnName(columns: SheetData["columns"], hint: unknown) {
  if (typeof hint !== "string") return undefined;
  const trimmed = hint.trim();
  if (!trimmed) return undefined;

  const exact = columns.find((column) => column.name === trimmed);
  if (exact) return exact.name;

  const normalizedHint = normalizeColumnName(trimmed);
  return columns.find((column) => normalizeColumnName(column.name) === normalizedHint)?.name;
}

function inferGroupedOrder(question: string, metricColumnName?: string, aggFunction?: string) {
  const q = question.toLowerCase();
  const normalizedMetric = metricColumnName ? normalizeColumnName(metricColumnName) : "";

  if (
    /\bconsumption|l\/100|liters per 100|litres per 100\b/.test(q) ||
    /\bconsumption|l\/100|liters per 100|litres per 100\b/.test(normalizedMetric)
  ) {
    return "asc";
  }

  if (/\blowest|minimum|min|smallest|bottom|worst|least\b/.test(q)) {
    return "asc";
  }

  if (/\bhighest|maximum|max|largest|top|best\b/.test(q)) {
    return "desc";
  }

  if (aggFunction === "min") return "asc";
  if (aggFunction === "max") return "desc";
  return /\bmost\b/.test(q) ? "desc" : "desc";
}

type MultiValueTextProfile = {
  delimiter: string;
  hitRate: number;
  averageItemsPerCell: number;
  maxItemsPerCell: number;
  sampleItems: string[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitDelimitedText(value: any, delimiter: string) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (value == null) return [];
  return String(value)
    .split(new RegExp(`\\s*${escapeRegExp(delimiter)}\\s*`))
    .map((item) => item.trim())
    .filter(Boolean);
}

function getColumnValues(rows: Record<string, any>[], columnName: string) {
  return rows.map((row) => row[columnName]);
}

function detectMultiValueTextProfile(values: any[], columnName = ""): MultiValueTextProfile | null {
  const stringValues = values
    .filter((value) => typeof value === "string" && value.trim())
    .slice(0, 150) as string[];

  if (stringValues.length < 3) return null;

  const normalizedName = normalizeColumnName(columnName);
  const semanticBoost =
    /cast|actor|actors|actress|starring|director|writer|author|artist|genre|listed|category|categories|tag|tags|keyword|country|countries|language|languages|member|members|participant|participants|skill|skills/.test(normalizedName);

  let best: (MultiValueTextProfile & { hits: number; repeatedItems: boolean; averageItemLength: number }) | null = null;

  for (const delimiter of [",", ";", "|"]) {
    let hits = 0;
    let totalItems = 0;
    let totalChars = 0;
    let maxItemsPerCell = 0;
    const sampleItems: string[] = [];
    const itemCounts = new Map<string, number>();

    for (const value of stringValues) {
      const parts = splitDelimitedText(value, delimiter);
      if (parts.length < 2) continue;

      hits++;
      totalItems += parts.length;
      maxItemsPerCell = Math.max(maxItemsPerCell, parts.length);

      for (const part of parts) {
        totalChars += part.length;
        const normalized = part.toLowerCase();
        itemCounts.set(normalized, (itemCounts.get(normalized) || 0) + 1);
        if (sampleItems.length < 5 && !sampleItems.some((existing) => existing.toLowerCase() === normalized)) {
          sampleItems.push(part);
        }
      }
    }

    if (hits === 0 || totalItems === 0) continue;

    const profile = {
      delimiter,
      hitRate: hits / stringValues.length,
      averageItemsPerCell: totalItems / hits,
      maxItemsPerCell,
      sampleItems,
      hits,
      repeatedItems: Array.from(itemCounts.values()).some((count) => count >= 2),
      averageItemLength: totalChars / totalItems,
    };

    if (!best || profile.hits > best.hits || (profile.hits === best.hits && profile.averageItemsPerCell > best.averageItemsPerCell)) {
      best = profile;
    }
  }

  if (!best) return null;

  const minimumHits = semanticBoost ? 2 : Math.max(3, Math.ceil(stringValues.length * 0.35));
  if (best.hits < minimumHits) return null;
  if (!semanticBoost && !best.repeatedItems) return null;
  if (!semanticBoost && best.averageItemLength > 40) return null;

  return {
    delimiter: best.delimiter,
    hitRate: best.hitRate,
    averageItemsPerCell: best.averageItemsPerCell,
    maxItemsPerCell: best.maxItemsPerCell,
    sampleItems: best.sampleItems,
  };
}

function detectListLikeColumn(sheetData: SheetData, columnName: string) {
  return detectMultiValueTextProfile(getColumnValues(sheetData.rows, columnName), columnName);
}

function extractTopN(question: string) {
  const match = question.toLowerCase().match(/\btop\s+(\d+)\b/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function inferFrequencyOrder(question: string) {
  return /\bleast|lowest|fewest|rarest\b/i.test(question) ? "asc" : "desc";
}

function buildSplitFrequencyFallback(
  question: string,
  sheetData: SheetData
): { command: string; args: Record<string, any> } | null {
  const q = question.toLowerCase();
  const asksItemFrequency =
    /\bmost frequent|most frequently|most common|appear(?:s)? most|appear(?:s)? most frequently|occur(?:s)? most|show(?:s)? up most|top\b|fewest|least frequent|rarest|common\b/.test(q) ||
    (/\b(which|what|who)\b/.test(q) && /\bappear|appears|appearing|frequency|frequent|common|count\b/.test(q));

  if (!asksItemFrequency) return null;

  const profiledColumns = sheetData.columns
    .map((column) => ({
      column,
      profile: detectMultiValueTextProfile(getColumnValues(sheetData.rows, column.name), column.name),
    }))
    .filter((entry): entry is { column: SheetData["columns"][number]; profile: MultiValueTextProfile } => Boolean(entry.profile));

  if (profiledColumns.length === 0) return null;

  const semanticMappings: Array<{ questionPattern: RegExp; columnPattern: RegExp }> = [
    { questionPattern: /\bactor|actors|actress|cast|starring|star\b/, columnPattern: /cast|actor|actors|actress|starring|star/ },
    { questionPattern: /\bdirector|directors|writer|writers|author|authors|artist|artists\b/, columnPattern: /director|writer|author|artist/ },
    { questionPattern: /\bgenre|genres|category|categories|tag|tags|listed\b/, columnPattern: /genre|listed|category|categories|tag|tags/ },
    { questionPattern: /\bcountry|countries|language|languages|location|locations\b/, columnPattern: /country|language|location/ },
  ];

  let chosen = null as { column: SheetData["columns"][number]; profile: MultiValueTextProfile } | null;
  for (const mapping of semanticMappings) {
    if (!mapping.questionPattern.test(q)) continue;
    chosen = profiledColumns.find((entry) => mapping.columnPattern.test(normalizeColumnName(entry.column.name))) || null;
    if (chosen) break;
  }

  if (!chosen) {
    const mentioned = findMentionedColumnByName(question, profiledColumns.map((entry) => entry.column));
    chosen = mentioned ? profiledColumns.find((entry) => entry.column.name === mentioned.name) || null : null;
  }

  if (!chosen && profiledColumns.length === 1) {
    chosen = profiledColumns[0];
  }

  if (!chosen) return null;

  return {
    command: "ExecuteFinalQuery",
    args: {
      operation: "split_frequency",
      params: {
        column: chosen.column.name,
        delimiter: chosen.profile.delimiter,
        limit: extractTopN(question) ?? (/\bwhich|what|who\b/.test(q) ? 1 : 10),
        order: inferFrequencyOrder(question),
      },
    },
  };
}

function repairLegacyCommandForQuestion(
  parsed: { command: string; args?: Record<string, any> },
  question: string,
  sheetData: SheetData
) {
  const columns = sheetData.columns;
  const args = parsed.args || {};
  if (parsed.command !== "QuerySheet" && parsed.command !== "ExecuteFinalQuery") {
    return parsed;
  }

  const splitFrequencyFallback = buildSplitFrequencyFallback(question, sheetData);
  const params = args.params || {};
  const referencedColumns = [
    params.column,
    params.groupColumn,
    params.groupBy,
    params.groupby,
    params.group_column,
    params.aggColumn,
  ]
    .map((hint) => resolveColumnName(columns, hint))
    .filter((value): value is string => Boolean(value));

  if (splitFrequencyFallback && args.operation !== "split_frequency") {
    const referencesListLikeColumn = referencedColumns.some((columnName) => Boolean(detectListLikeColumn(sheetData, columnName)));
    if (referencesListLikeColumn || /\bactor|actors|actress|cast|genre|genres|tag|tags|listed|country|countries|language|languages\b/i.test(question)) {
      return {
        command: parsed.command,
        args: {
          ...splitFrequencyFallback.args,
          sheet_name: args.sheet_name,
        },
      };
    }
  }

  const fallback = buildGroupedRankingFallback(question, columns);
  if (args.operation === "groupby") {
    return repairCommandForQuestion(parsed, question, columns);
  }

  const hintedGroupColumn = resolveColumnName(
    columns,
    params.groupColumn ?? params.groupBy ?? params.groupby ?? params.group_column
  );
  const hintedMetricColumn = resolveColumnName(columns, params.column ?? params.aggColumn);
  const hintedAggFunction =
    typeof params.aggFunction === "string" && params.aggFunction.trim()
      ? params.aggFunction.trim().toLowerCase()
      : typeof params.function === "string" && params.function.trim()
        ? params.function.trim().toLowerCase()
        : undefined;
  const hasIgnoredGroupingHint =
    Boolean(hintedGroupColumn);
  const asksForManufacturerRanking =
    /\b(which|what|who)\b/i.test(question) &&
    /\bmanufacturer|make|maker|brand|company|vendor|oem\b/i.test(question);

  if (fallback && (args.operation === "aggregate" || hasIgnoredGroupingHint || asksForManufacturerRanking)) {
    return {
      command: parsed.command,
      args: {
        ...fallback.args,
        sheet_name: args.sheet_name,
      },
    };
  }

  if (args.operation === "aggregate" && hintedGroupColumn && hintedMetricColumn) {
    return {
      command: parsed.command,
      args: {
        sheet_name: args.sheet_name,
        operation: "groupby",
        params: {
          groupColumn: hintedGroupColumn,
          aggColumn: hintedMetricColumn,
          aggFunction: hintedAggFunction || "count",
          limit: 1,
          order: inferGroupedOrder(question, hintedMetricColumn, hintedAggFunction),
        },
      },
    };
  }

  return parsed;
}

function repairCommandForQuestion(
  parsed: { command: string; args?: Record<string, any> },
  question: string,
  columns: SheetData["columns"]
) {
  const args = parsed.args || {};
  if ((parsed.command !== "QuerySheet" && parsed.command !== "ExecuteFinalQuery") || args.operation !== "groupby") {
    return parsed;
  }

  const fallback = buildGroupedRankingFallback(question, columns);
  if (!fallback) return parsed;

  const params = args.params || {};
  const groupColumn = String(params.groupColumn || "");
  const groupLooksWrong =
    /\bmanufacturer|make|maker|brand|company|vendor|oem\b/i.test(question) &&
    !/manufacturer|make|maker|brand|company|vendor|oem/i.test(normalizeColumnName(groupColumn));
  const missingColumns =
    !columns.some((column) => column.name === params.groupColumn) ||
    !columns.some((column) => column.name === params.aggColumn);
  return groupLooksWrong || missingColumns ? fallback : parsed;
}

function resolveColumn(row: Record<string, any>, name: string): string {
  if (!row || typeof row !== "object" || !name) return name;
  if (name in row) return name;

  const lowerName = name.toLowerCase();
  const keys = Object.keys(row);

  // 1. Case-insensitive exact match
  for (const k of keys) {
    if (k.toLowerCase() === lowerName) return k;
  }

  // Normalization helper
  const normalize = (str: string) => {
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

function executeOperation(data: Record<string, any>[], operation: string, params: Record<string, any>): any {
  switch (operation) {
    case "filter": {
      let normalizedParams = params;
      if (params && typeof params === "object" && !params.column && !params.filters) {
        const entries = Object.entries(params);
        if (entries.length === 1) {
          const [column, value] = entries[0];
          normalizedParams = { column, operator: "==", value };
        }
      }

      const { column, operator = "==", value } = normalizedParams;
      return data.filter((row) => {
        const actualCol = resolveColumn(row, column);
        const v = row[actualCol];
        switch (operator) {
          case ">": return v > value;
          case "<": return v < value;
          case ">=": return v >= value;
          case "<=": return v <= value;
          case "==": return v == value;
          case "!=": return v != value;
          case "contains": return String(v).toLowerCase().includes(String(value).toLowerCase());
          case "starts_with": return String(v).toLowerCase().startsWith(String(value).toLowerCase());
          case "ends_with": return String(v).toLowerCase().endsWith(String(value).toLowerCase());
          case "is_null": return v == null || v === "";
          case "not_null": return v != null && v !== "";
          default: return true;
        }
      });
    }
    case "sort": {
      const { column, order = "asc", limit } = params;
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, column);
      const sorted = [...data].sort((a, b) => {
        const av = a[actualCol], bv = b[actualCol];
        if (av == null) return 1;
        if (bv == null) return -1;
        return order === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
      });
      return limit ? sorted.slice(0, limit) : sorted;
    }
    case "groupby": {
      const { groupColumn, aggColumn, aggFunction, filter: filterParam, transformColumn, transformFunction, removeOutliers, removeNulls = true, limit, order = "desc" } = params;
      const aggregateKey = String(aggFunction || "count");
      
      const firstRow = data[0] || {};
      const actualGroupCol = resolveColumn(firstRow, groupColumn);
      const actualAggCol = aggColumn ? resolveColumn(firstRow, aggColumn) : undefined;

      // Step 1: Remove null values from BOTH groupColumn and aggColumn if requested (enabled by default)
      let filtered = data;
      if (removeNulls) {
        filtered = data.filter((row) => {
          // Remove rows where groupColumn is null/empty
          const groupVal = row[actualGroupCol];
          if (groupVal == null || groupVal === "") return false;
          
          // Remove rows where aggColumn is null/empty/NaN
          if (aggColumn && actualAggCol) {
            const aggVal = row[actualAggCol];
            if (aggVal == null || aggVal === "") return false;
            if (typeof aggVal === "number" && isNaN(aggVal)) return false;
          }
          
          return true;
        });
      }
      
      // Step 2: Apply filter if provided
      if (filterParam) {
        filtered = executeOperation(filtered, "filter", filterParam);
      }
      
      // Step 3: Transform column if needed (e.g., extract numbers from "90 min")
      if (transformColumn && transformFunction) {
        filtered = executeOperation(filtered, "transform_column", { column: transformColumn, function: transformFunction });
      }
      
      // Step 4: Remove NaN values created by transformation
      filtered = filtered.filter((row) => {
        if (!aggColumn || !actualAggCol) return true;
        const val = row[actualAggCol];
        return val != null && val !== "" && (aggregateKey === "count" || !(typeof val === "number" && isNaN(val)));
      });
      
      // Step 5: Remove outliers if requested
      if (removeOutliers && aggColumn) {
        filtered = executeOperation(filtered, "filter_outliers", {
          column: aggColumn,
          method: removeOutliers.method || "iqr",
          threshold: removeOutliers.threshold || 1.5
        });
      }
      
      // Step 6: Group and aggregate
      const groups: Record<string, any[]> = {};
      for (const row of filtered) {
        const key = String(row[actualGroupCol] ?? "null");
        if (!groups[key]) groups[key] = [];
        if (aggregateKey === "count") {
          groups[key].push(1);
        } else if ((aggregateKey === "count_distinct" || aggregateKey === "distinct_count") && aggColumn && actualAggCol) {
          groups[key].push(row[actualAggCol]);
        } else if (aggColumn && actualAggCol) {
          const val = Number(row[actualAggCol]);
          if (!isNaN(val)) groups[key].push(val);
        }
      }
      
      const result: Array<Record<string, string | number>> = Object.entries(groups).map(([key, vals]) => {
        let agg: number;
        if (vals.length === 0) agg = 0;
        else {
          switch (aggregateKey) {
            case "sum": agg = vals.reduce((s, v) => s + Number(v), 0); break;
            case "count": agg = vals.length; break;
            case "count_distinct":
            case "distinct_count":
              agg = new Set(vals.filter((v) => v != null && v !== "").map((v) => String(v))).size;
              break;
            case "mean": agg = vals.reduce((s, v) => s + Number(v), 0) / vals.length; break;
            case "min": agg = Math.min(...vals.map(Number)); break;
            case "max": agg = Math.max(...vals.map(Number)); break;
            default: agg = vals.length;
          }
        }
        return { [groupColumn]: key, [aggregateKey]: agg };
      });
      
      // Sort by aggregate descending by default
      const sorted = result.sort((a, b) => {
        const diff = Number(b[aggregateKey] ?? 0) - Number(a[aggregateKey] ?? 0);
        return order === "asc" ? -diff : diff;
      });
      return limit ? sorted.slice(0, Number(limit)) : sorted;
    }
    case "aggregate": {
      const { column, function: fn } = params;
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, column);
      const values = data.map((row) => row[actualCol]).filter((value) => value != null && value !== "");
      if (fn === "count") return { result: values.length };
      if (fn === "count_distinct" || fn === "distinct_count") {
        return { result: new Set(values.map((value) => String(value))).size };
      }
      const nums = values.map((value) => Number(value)).filter((n) => !isNaN(n));
      if (nums.length === 0) return { result: 0 };
      switch (fn) {
        case "sum": return { result: nums.reduce((s, v) => s + v, 0) };
        case "mean": return { result: nums.reduce((s, v) => s + v, 0) / nums.length };
        case "min": return { result: Math.min(...nums) };
        case "max": return { result: Math.max(...nums) };
        case "median": {
          const sorted = [...nums].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return { result: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 };
        }
        case "std": {
          const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
          const variance = nums.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / nums.length;
          return { result: Math.sqrt(variance) };
        }
        case "variance": {
          const m = nums.reduce((s, v) => s + v, 0) / nums.length;
          return { result: nums.reduce((s, v) => s + Math.pow(v - m, 2), 0) / nums.length };
        }
        default: return { result: nums.length };
      }
    }
    case "split_frequency": {
      const {
        column,
        delimiter,
        limit,
        order = "desc",
        filter: filterParam,
        caseSensitive = false,
        uniquePerRow = true,
      } = params;

      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, column);
      const filtered = filterParam ? executeOperation(data, "filter", filterParam) : data;
      const resolvedDelimiter =
        typeof delimiter === "string" && delimiter
          ? delimiter
          : detectMultiValueTextProfile(getColumnValues(filtered, actualCol), actualCol)?.delimiter || ",";

      const counts = new Map<string, { label: string; count: number }>();
      for (const row of filtered) {
        const parts = splitDelimitedText(row[actualCol], resolvedDelimiter);
        if (parts.length === 0) continue;

        const seenInRow = new Set<string>();
        for (const part of parts) {
          const normalized = caseSensitive ? part : part.toLowerCase();
          if (uniquePerRow && seenInRow.has(normalized)) continue;
          seenInRow.add(normalized);

          const existing = counts.get(normalized);
          if (existing) {
            existing.count += 1;
          } else {
            counts.set(normalized, { label: part, count: 1 });
          }
        }
      }

      const result = Array.from(counts.values()).map(({ label, count }) => ({ [column]: label, count }));
      result.sort((a, b) => {
        const diff = Number(b.count) - Number(a.count);
        if (diff !== 0) return order === "asc" ? -diff : diff;
        return String(a[column] ?? "").localeCompare(String(b[column] ?? ""));
      });
      return limit ? result.slice(0, Number(limit)) : result;
    }
    case "select": {
      const { columns, filter: filterParam, filters, logic = "AND", limit = 50 } = params;
      let rows = data;
      if (filterParam) {
        rows = executeOperation(rows, "filter", filterParam);
      }
      if (Array.isArray(filters) && filters.length > 0) {
        rows = executeOperation(rows, "multi_filter", { filters, logic });
      }

      return rows.slice(0, limit).map((row) => {
        const obj: Record<string, any> = {};
        for (const c of columns) {
          const actualCol = resolveColumn(row, c);
          obj[c] = row[actualCol];
        }
        return obj;
      });
    }
    case "head":
      return data.slice(0, params.n || 10);
    case "remove_nulls": {
      const { column } = params;
      if (column) {
        // Remove rows where specific column is null/empty/NaN
        return data.filter((row) => {
          const actualCol = resolveColumn(row, column);
          const val = row[actualCol];
          if (val == null || val === "") return false;
          if (typeof val === "number" && isNaN(val)) return false;
          return true;
        });
      }
      // Remove rows with any null values
      return data.filter((row) =>
        Object.values(row).every((v) => v != null && v !== "" && !(typeof v === "number" && isNaN(v)))
      );
    }
    case "transform_column": {
      const { column, function: func, skipNulls = true } = params;
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, column);
      return data.map((row) => {
        const newRow = { ...row };
        const val = row[actualCol];
        
        // Skip null/empty values if requested
        if (skipNulls && (val == null || val === "")) {
          return newRow;
        }
        
        if (func === "extract_number") {
          const match = String(val).match(/(\d+(?:\.\d+)?)/);
          newRow[actualCol] = match ? Number(match[1]) : NaN;
        } else if (func === "to_lower") {
          newRow[actualCol] = String(val).toLowerCase();
        } else if (func === "to_upper") {
          newRow[actualCol] = String(val).toUpperCase();
        } else if (func === "trim") {
          newRow[actualCol] = String(val).trim();
        }
        return newRow;
      });
    }
    case "unique": {
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, params.column);
      const vals = [...new Set(data.map((r) => r[actualCol]))];
      return vals.map((v) => ({ [params.column]: v }));
    }
    case "count":
      return { result: data.length };

    case "percentile": {
      const { column, percentiles = [25, 50, 75] } = params;
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, column);
      const nums = data.map((r) => Number(r[actualCol])).filter((n) => !isNaN(n)).sort((a, b) => a - b);
      if (nums.length === 0) return { error: "No numeric data" };
      const result: Record<string, number> = {};
      for (const p of percentiles) {
        const idx = (p / 100) * (nums.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        result[`p${p}`] = lo === hi ? nums[lo] : nums[lo] + (nums[hi] - nums[lo]) * (idx - lo);
      }
      return result;
    }

    case "correlation": {
      const { column1, column2 } = params;
      const firstRow = data[0] || {};
      const actualCol1 = resolveColumn(firstRow, column1);
      const actualCol2 = resolveColumn(firstRow, column2);
      const pairs = data
        .map((r) => [Number(r[actualCol1]), Number(r[actualCol2])])
        .filter(([a, b]) => !isNaN(a) && !isNaN(b));
      if (pairs.length < 2) return { correlation: 0, n: pairs.length };
      const n = pairs.length;
      const meanX = pairs.reduce((s, [x]) => s + x, 0) / n;
      const meanY = pairs.reduce((s, [, y]) => s + y, 0) / n;
      let sumXY = 0, sumX2 = 0, sumY2 = 0;
      for (const [x, y] of pairs) {
        sumXY += (x - meanX) * (y - meanY);
        sumX2 += (x - meanX) ** 2;
        sumY2 += (y - meanY) ** 2;
      }
      const denom = Math.sqrt(sumX2 * sumY2);
      return { correlation: denom === 0 ? 0 : +(sumXY / denom).toFixed(4), n };
    }

    case "topN_groupby": {
      const { groupColumn, rankColumn, n = 3, order = "desc" } = params;
      const firstRow = data[0] || {};
      const actualGroupCol = resolveColumn(firstRow, groupColumn);
      const actualRankCol = resolveColumn(firstRow, rankColumn);
      const groups: Record<string, Record<string, any>[]> = {};
      for (const row of data) {
        const key = String(row[actualGroupCol] ?? "null");
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      }
      const result: Record<string, any>[] = [];
      for (const [group, rows] of Object.entries(groups)) {
        const sorted = rows.sort((a, b) =>
          order === "desc" ? (b[actualRankCol] ?? 0) - (a[actualRankCol] ?? 0) : (a[actualRankCol] ?? 0) - (b[actualRankCol] ?? 0)
        );
        for (const row of sorted.slice(0, n)) {
          result.push({ _group: group, ...row });
        }
      }
      return result;
    }

    case "date_trunc": {
      const { dateColumn, period = "month", aggColumn, aggFunction = "count" } = params;
      const firstRow = data[0] || {};
      const actualDateCol = resolveColumn(firstRow, dateColumn);
      const actualAggCol = aggColumn ? resolveColumn(firstRow, aggColumn) : undefined;
      const buckets: Record<string, number[]> = {};
      for (const row of data) {
        const raw = row[actualDateCol];
        if (!raw) continue;
        const d = new Date(String(raw));
        if (isNaN(d.getTime())) continue;
        let key: string;
        switch (period) {
          case "day": key = d.toISOString().split("T")[0]; break;
          case "week": {
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d);
            monday.setDate(diff);
            key = `W-${monday.toISOString().split("T")[0]}`;
            break;
          }
          case "month": key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; break;
          case "quarter": key = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`; break;
          case "year": key = `${d.getFullYear()}`; break;
          default: key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        }
        if (!buckets[key]) buckets[key] = [];
        if (aggColumn && actualAggCol) buckets[key].push(Number(row[actualAggCol]) || 0);
        else buckets[key].push(1);
      }
      return Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period_key, vals]) => {
          let agg: number;
          switch (aggFunction) {
            case "sum": agg = vals.reduce((s, v) => s + v, 0); break;
            case "count": agg = vals.length; break;
            case "mean": agg = vals.reduce((s, v) => s + v, 0) / vals.length; break;
            case "min": agg = Math.min(...vals); break;
            case "max": agg = Math.max(...vals); break;
            default: agg = vals.length;
          }
          return { period: period_key, [aggFunction]: agg };
        });
    }

    case "outlier_detect": {
      const { column, method = "zscore", threshold = 2 } = params;
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, column);
      const nums = data.map((r, i) => ({ index: i, value: Number(r[actualCol]), row: r }))
        .filter((d) => !isNaN(d.value));
      if (nums.length < 3) return { error: "Not enough data for outlier detection" };

      if (method === "iqr") {
        const sorted = nums.map((d) => d.value).sort((a, b) => a - b);
        const q1Idx = Math.floor(sorted.length * 0.25);
        const q3Idx = Math.floor(sorted.length * 0.75);
        const q1 = sorted[q1Idx], q3 = sorted[q3Idx];
        const iqr = q3 - q1;
        const lower = q1 - threshold * iqr;
        const upper = q3 + threshold * iqr;
        return nums.filter((d) => d.value < lower || d.value > upper).map((d) => d.row);
      }

      const mean = nums.reduce((s, d) => s + d.value, 0) / nums.length;
      const std = Math.sqrt(nums.reduce((s, d) => s + (d.value - mean) ** 2, 0) / nums.length);
      if (std === 0) return [];
      return nums.filter((d) => Math.abs((d.value - mean) / std) > threshold).map((d) => d.row);
    }

    case "filter_outliers": {
      const { column, method = "zscore", threshold = 1.5 } = params;
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, column);
      const nums = data.map((r, i) => ({ index: i, value: Number(r[actualCol]), row: r }))
        .filter((d) => !isNaN(d.value));
      if (nums.length < 3) return data; // Not enough data, return all

      if (method === "iqr") {
        const sorted = nums.map((d) => d.value).sort((a, b) => a - b);
        const q1Idx = Math.floor(sorted.length * 0.25);
        const q3Idx = Math.floor(sorted.length * 0.75);
        const q1 = sorted[q1Idx], q3 = sorted[q3Idx];
        const iqr = q3 - q1;
        const lower = q1 - threshold * iqr;
        const upper = q3 + threshold * iqr;
        return nums.filter((d) => d.value >= lower && d.value <= upper).map((d) => d.row);
      }

      const mean = nums.reduce((s, d) => s + d.value, 0) / nums.length;
      const std = Math.sqrt(nums.reduce((s, d) => s + (d.value - mean) ** 2, 0) / nums.length);
      if (std === 0) return data;
      return nums.filter((d) => Math.abs((d.value - mean) / std) <= threshold).map((d) => d.row);
    }

    case "multi_filter": {
      const { filters = [], logic = "AND" } = params;
      return data.filter((row) => {
        const results = filters.map((f: any) => {
          const actualCol = resolveColumn(row, f.column);
          const v = row[actualCol];
          switch (f.operator) {
            case ">": return v > f.value;
            case "<": return v < f.value;
            case ">=": return v >= f.value;
            case "<=": return v <= f.value;
            case "==": return v == f.value;
            case "!=": return v != f.value;
            case "contains": return String(v).toLowerCase().includes(String(f.value).toLowerCase());
            case "starts_with": return String(v).toLowerCase().startsWith(String(f.value).toLowerCase());
            case "ends_with": return String(v).toLowerCase().endsWith(String(f.value).toLowerCase());
            case "is_null": return v == null || v === "";
            case "not_null": return v != null && v !== "";
            default: return true;
          }
        });
        return logic === "OR" ? results.some(Boolean) : results.every(Boolean);
      });
    }

    case "pivot": {
      const { rowColumn, colColumn, valueColumn, aggFunction = "sum" } = params;
      const firstRow = data[0] || {};
      const actualRowCol = resolveColumn(firstRow, rowColumn);
      const actualColCol = resolveColumn(firstRow, colColumn);
      const actualValueCol = resolveColumn(firstRow, valueColumn);
      const pivot: Record<string, Record<string, number[]>> = {};
      const allCols = new Set<string>();

      for (const row of data) {
        const rKey = String(row[actualRowCol] ?? "null");
        const cKey = String(row[actualColCol] ?? "null");
        allCols.add(cKey);
        if (!pivot[rKey]) pivot[rKey] = {};
        if (!pivot[rKey][cKey]) pivot[rKey][cKey] = [];
        pivot[rKey][cKey].push(Number(row[actualValueCol]) || 0);
      }

      const colList = [...allCols].sort();
      return Object.entries(pivot).map(([rKey, cols]) => {
        const result: Record<string, any> = { [rowColumn]: rKey };
        for (const c of colList) {
          const vals = cols[c] || [];
          if (vals.length === 0) { result[c] = 0; continue; }
          switch (aggFunction) {
            case "sum": result[c] = vals.reduce((s, v) => s + v, 0); break;
            case "count": result[c] = vals.length; break;
            case "mean": result[c] = vals.reduce((s, v) => s + v, 0) / vals.length; break;
            case "min": result[c] = Math.min(...vals); break;
            case "max": result[c] = Math.max(...vals); break;
            default: result[c] = vals.reduce((s, v) => s + v, 0);
          }
        }
        return result;
      });
    }

    case "pipeline": {
      const { operations } = params;
      let currentData = data;
      for (const op of operations) {
        currentData = executeOperation(currentData, op.operation, op.params || {});
      }
      return currentData;
    }

    case "multi_analysis": {
      const { operations = [] } = params;
      const results: Record<string, any> = {};
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const key = op.name || op.label || `analysis_${i}_${op.operation}`;
        results[key] = executeOperation(data, op.operation, op.params || {});
      }
      return results;
    }

    default:
      return { error: `Unknown operation: ${operation}` };
  }
}

// ─── JSON Parser with Recovery ─────────────────────────────────────────────────
// More robust than original — handles partial JSON, extra text, common LLM mistakes
function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }

  return null;
}

function parseCommand(text: string): { command: string; args?: Record<string, any> } | null {
  if (!text || typeof text !== "string") return null;

  // Strip common LLM wrapping artifacts
  let cleaned = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  // Extract the first complete object so trailing model noise like ]}} does not poison parsing.
  const jsonText = extractFirstJsonObject(cleaned);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    // Validate it has at least a command field
    if (typeof parsed.command === "string") return parsed;
  } catch {
    // Attempt to fix common JSON errors: trailing commas, single quotes
    try {
      const fixedJson = jsonText
        .replace(/,\s*([}\]])/g, "$1")         // Remove trailing commas
        .replace(/'/g, '"')                      // Replace single quotes
        .replace(/(\w+):/g, '"$1":')            // Quote unquoted keys (simple heuristic)
        .replace(/""(\w+)":/g, '"$1":');        // Fix double-quoted keys
      const parsed = JSON.parse(fixedJson);
      if (typeof parsed.command === "string") return parsed;
    } catch { }
  }

  return null;
}

// ─── Fallback Query Builder ────────────────────────────────────────────────────
// If LLM completely fails to produce valid JSON after retries, we attempt
// a rule-based fallback to still return SOMETHING useful.
function buildFallbackCommand(
  question: string,
  columns: SheetData["columns"]
): { command: string; args: Record<string, any> } | null {
  const q = question.toLowerCase();
  const findMentionedColumn = (candidates: SheetData["columns"]) =>
    candidates.find((c) => {
      const normalizedName = c.name.toLowerCase().replace(/[_-]+/g, " ");
      if (q.includes(normalizedName)) return true;
      return normalizedName
        .split(/\s+/)
        .some((word) => word.length > 2 && new RegExp(`\\b${word}\\b`, "i").test(q));
    });

  // Schema questions
  if (/how many columns/.test(q)) {
    return { command: "Answer", args: { value: columns.length } };
  }
  if (/column names?|what columns?|list (the )?columns?/.test(q)) {
    return { command: "Answer", args: { value: columns.map((c) => c.name) } };
  }

  // Count
  if (/how many rows?|total rows?|count of rows?|number of records?/.test(q)) {
    return { command: "ExecuteFinalQuery", args: { operation: "count", params: {} } };
  }

  // Preview
  if (/preview|sample|first (\d+) rows?|show (me )?(the )?(data|rows|records)|display (the )?(data|rows|records)/.test(q)) {
    const nMatch = q.match(/first (\d+)/);
    return { command: "ExecuteFinalQuery", args: { operation: "head", params: { n: nMatch ? parseInt(nMatch[1]) : 10 } } };
  }

  const groupedRanking = buildGroupedRankingFallback(question, columns);
  if (groupedRanking) return groupedRanking;

  // Find numeric columns for aggregation
  const numericDtypes = new Set<string>(["number", "float", "integer"]);
  const numericCols = columns.filter((c) => numericDtypes.has(c.dtype));
  const numericCol = findMentionedColumn(numericCols) || (numericCols.length === 1 ? numericCols[0] : undefined);
  const needsNumericClarification = (fnLabel: string) => ({
    command: "Answer",
    args: { value: `Which numeric column should I use for the ${fnLabel}?` },
  });

  if (numericCols.length > 0) {
    if (/total|sum/.test(q)) {
      if (!numericCol) return needsNumericClarification("total");
      return { command: "ExecuteFinalQuery", args: { operation: "aggregate", params: { column: numericCol.name, function: "sum" } } };
    }
    if (/average|mean|avg/.test(q)) {
      if (!numericCol) return needsNumericClarification("average");
      return { command: "ExecuteFinalQuery", args: { operation: "aggregate", params: { column: numericCol.name, function: "mean" } } };
    }
    if (/max|highest|most/.test(q)) {
      if (!numericCol) return needsNumericClarification("maximum");
      return { command: "ExecuteFinalQuery", args: { operation: "aggregate", params: { column: numericCol.name, function: "max" } } };
    }
    if (/min|lowest|least/.test(q)) {
      if (!numericCol) return needsNumericClarification("minimum");
      return { command: "ExecuteFinalQuery", args: { operation: "aggregate", params: { column: numericCol.name, function: "min" } } };
    }
  }

  return null;
}

// ─── Rich Column Summary Builder ───────────────────────────────────────────────
// Builds a detailed upfront context message for the LLM.
// Includes value ranges, dtype clarity, and explicit null counts.
function buildColumnSummary(sheetData: SheetData): string {
  return sheetData.columns
    .map((c) => {
      const samples = c.sampleValues.slice(0, 3).join(", ");
      const nullInfo = c.nonNullCount < sheetData.rows.length
        ? `, ${sheetData.rows.length - c.nonNullCount} nulls`
        : "";
      return `  • "${c.name}" [${c.dtype}] — ${c.uniqueCount} unique values${nullInfo} — e.g. ${samples}`;
    })
    .join("\n");
}

// ─── Main Agent Runner ─────────────────────────────────────────────────────────
export async function* runAgent(
  question: string,
  sheetData: SheetData,
  provider: Provider,
  model: string,
  apiKey: string,
  temperature: number,
  maxTokens: number,
  systemPromptOverride?: string,
  conversationHistory?: ConversationContext[],
  providerOptions: LLMProviderOptions = {}
): AsyncGenerator<AgentStep> {
  const messages: { role: string; content: string }[] = [];
  const prompt = systemPromptOverride || SYSTEM_PROMPT;
  let turn = 0;
  // ── Step budget: LLM is told so it plans efficiently ──
  const maxTurns = 12;

  // ── Pre-process question for better LLM comprehension ──
  const normalizedQuestion = normalizeQuestion(question, sheetData.columns);
  const intentHint = classifyIntent(normalizedQuestion);
  const columnHints = buildColumnHints(normalizedQuestion, sheetData.columns);

  // ── LangChain-style BufferWindowMemory: last 3 Q/A turns (compact) ──
  // Accepts both old ConversationContext[] and a pre-built contextBlock string.
  let contextBlock = "";
  if (conversationHistory && conversationHistory.length > 0) {
    // Keep last 3 turns, truncate each A to 200 chars — mirrors LangChain's window memory
    const recent = conversationHistory.slice(-3);
    contextBlock =
      "\n\nPrior conversation (last " + recent.length + " turn" + (recent.length !== 1 ? "s" : "") + " — use for follow-up context):\n" +
      recent
        .map((c, i) => {
          const q = c.question.slice(0, 120);
          const aRaw = typeof c.answer === "string" ? c.answer : JSON.stringify(c.answer);
          const a = aRaw.slice(0, 200);
          return `  Human[${i + 1}]: ${q}\n  AI[${i + 1}]: ${a}`;
        })
        .join("\n");
  }

  // ── Build the enriched first user message ──
  // Step budget disclosure: helps LLM plan (don't waste turns on unnecessary GetColumns loops)
  const firstMessage = [
    `Dataset: ${sheetData.rows.length} rows × ${sheetData.columns.length} columns`,
    `\nStep budget: you have at most ${maxTurns} steps total (including this one). Be efficient.`,
    `\nThe schema is available through GetColumns. Call GetColumns before writing QuerySheet or ExecuteFinalQuery.`,
    contextBlock,
    `\nQuestion: "${normalizedQuestion}"`,
    intentHint,
    columnHints,
    `\n\nRespond with a single JSON command only. No prose. No explanation.`,
  ].filter(Boolean).join("");

  messages.push({ role: "user", content: firstMessage });
  let schemaInspected = false;
  let currentData = sheetData.rows; // Track current data state for intermediate operations

  while (turn < maxTurns) {
    turn++;
    const startTime = Date.now();

    let llmResponse: LLMResponse;
    try {
      llmResponse = await callLLM(provider, model, apiKey, messages, prompt, temperature, maxTokens, providerOptions);
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

    // ── Parse LLM response with robust recovery ──
    let parsed = parseCommand(llmResponse.content);
    if (parsed) {
      parsed = repairCommandForQuestion(parsed, normalizedQuestion, sheetData.columns);
    }

    // ── If the model fails before schema inspection, keep the tool loop honest ──
    if (!parsed && !schemaInspected) {
      parsed = { command: "GetColumns", args: {} };
    }

    // ── Fallback: if LLM failed JSON after schema is available, use rule-based fallback ──
    if (!parsed) {
      const fallback = buildFallbackCommand(normalizedQuestion, sheetData.columns);
      if (fallback) {
        parsed = fallback;
      }
    }

    // ── If still no valid command, return raw response ──
    if (!parsed) {
      yield {
        turn,
        command: "Error",
        args: {},
        result: "The model returned a malformed command and the agent could not repair it.",
        tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
        durationMs: Date.now() - startTime,
        isFinal: true,
      };
      return;
    }

    let { command, args = {} } = parsed;
    let assistantCommandContent = llmResponse.content;
    if ((command === "QuerySheet" || command === "ExecuteFinalQuery") && !schemaInspected) {
      command = "GetColumns";
      args = {};
      assistantCommandContent = JSON.stringify({ command, args });
    }
    let result: any;
    const defaultRawResult = llmResponse.content;
    const rawArgs = args as Record<string, any>;
    const answerPayload = rawArgs.value !== undefined ? rawArgs.value : (Object.keys(rawArgs).length > 0 ? rawArgs : defaultRawResult);
    const normalizedAnswer =
      typeof answerPayload === "string" && !answerPayload.trim()
        ? defaultRawResult?.trim() || "No result returned from the model."
        : answerPayload;
    const narrativeText = args.text || args.narrative || defaultRawResult;
    const normalizedNarrative =
      typeof narrativeText === "string" && !narrativeText.trim()
        ? "No narrative returned from the model."
        : narrativeText;

    switch (command) {
      case "Answer":
        result = normalizedAnswer;
        break;
      case "NarrativeAnswer":
        result = {
          narrative: normalizedNarrative,
          highlights: args.highlights || [],
        };
        break;
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
        schemaInspected = true;
        break;
      case "QuerySheet":
        result = executeOperation(currentData, args.operation, args.params || {});
        if (args.operation === "filter" || args.operation === "multi_filter" || args.operation === "remove_nulls" || args.operation === "transform_column") {
          currentData = Array.isArray(result) ? result : [result];
        }
        break;
      case "ExecuteFinalQuery":
        result = executeOperation(currentData, args.operation, args.params || {});
        break;
      default:
        result = { error: `Unknown command: ${command}` };
    }

    const isFinal = command === "ExecuteFinalQuery" || command === "Answer" || command === "NarrativeAnswer";
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

    messages.push({ role: "assistant", content: assistantCommandContent });
    messages.push({
      role: "user",
      content: [
        `${command === "GetColumns" ? "Schema returned" : "Result of your query"}: ${JSON.stringify(result).slice(0, 2000)}${JSON.stringify(result).length > 2000 ? "... (truncated)" : ""}`,
        `\nContinue answering: "${normalizedQuestion}"`,
        `\nIf you have gathered ALL the information needed, issue ExecuteFinalQuery (for a data result) or Answer (to present a combined text answer).`,
        `\nIf the question asks for multiple things (e.g. highest AND lowest, full analysis, multiple metrics) and you still need more data, issue another QuerySheet.`,
        `\nRespond with a single JSON command only.`,
      ].join(""),
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

type WorkbookSheets = Record<string, SheetData>;
type DatabaseTables = Record<string, DatabaseTableData>;

const DEFAULT_AGENT_PROMPT = `You are a data analyst agent. Work one step at a time and request only the information you need.

You have access to these commands:

1. GetSheetDescription()
   Returns all sheet names, row counts, and column lists.

2. GetColumns(sheet_name)
   Returns detailed column info and sample values for a sheet.

3. QuerySheet(sheet_name, operation, params)
   Runs one intermediate data operation on a sheet or virtual sheet.

4. ExecuteFinalQuery(sheet_name, operation, params)
   Runs the final data operation that answers the question.

5. Answer(value, options?)
   Use only for clarification questions or schema-only final answers.
   For clarifications, always include args.options with 2–6 clickable choices (exact column names, metrics, or time ranges).

For backward compatibility, QuerySheet and ExecuteFinalQuery may also use pandas_query instead of operation/params.
Prefer operation/params unless the user or custom prompt explicitly relies on pandas_query.

Supported operations:
- count {}
- head {"n": 10}
- filter {"column":"col","operator":"==|!=|>|<|>=|<=|contains|starts_with|ends_with|is_null|not_null","value":X}
- multi_filter {"filters":[...],"logic":"AND|OR"}
- sort {"column":"col","order":"asc|desc","limit":N}
- select {"columns":["col1","col2"],"limit":N,"filter":{"column":"col","operator":"==","value":X}}
- unique {"column":"col"}
- aggregate {"column":"col","function":"sum|count|count_distinct|mean|min|max|median|std|variance"}
- groupby {"groupColumn":"col","aggColumn":"col2","aggFunction":"sum|count|count_distinct|mean|min|max","limit":N,"order":"asc|desc"}
- split_frequency {"column":"col","delimiter":",","limit":N,"order":"asc|desc","uniquePerRow":true|false}
- percentile {"column":"col","percentiles":[25,50,75]}
- correlation {"column1":"col1","column2":"col2"}
- date_trunc {"dateColumn":"col","period":"day|week|month|quarter|year","aggColumn":"col2","aggFunction":"count|sum|mean"}
- outlier_detect {"column":"col","method":"zscore|iqr","threshold":2}
- pivot {"rowColumn":"col","colColumn":"col2","valueColumn":"col3","aggFunction":"sum|count|mean"}
- pipeline {"operations":[{"operation":"filter","params":{...}}, {"operation":"aggregate","params":{...}}]}
- multi_analysis {"operations":[{"name":"op1","operation":"groupby","params":{...}}, {"name":"op2","operation":"percentile","params":{...}}]} to execute multiple independent operations in parallel on the dataset

Cross-Sheet / Multi-Sheet Operations:
- join_sheets {"sheet1":"Name1","sheet2":"Name2","key1":"col1","key2":"col2","joinType":"inner|left|right|outer"}
  Combines two sheets based on matching keys. In case of duplicate column names, columns are prefixed like 'sheetName_columnName'.
- compare_sheets {"sheet1":"Name1","sheet2":"Name2","key1":"col1","key2":"col2","compareColumn1":"col3","compareColumn2":"col4"}
  Aligns two sheets on matching keys and calculates differences/percentages for comparison columns.
- union_sheets {"sheets":["Name1","Name2"]}
  Vertically combines sheets. Adds a "_source_sheet" column to indicate each row's origin.
- lookup_sheets {"targetSheet":"Name1","sourceSheet":"Name2","targetKey":"col1","sourceKey":"col2","valueColumn":"col3","asColumn":"new_col"}
  Pulls a column from Name2 into Name1 based on matching keys, like VLOOKUP/XLOOKUP.

Rules:
- You have FULL read-only access to all workbook sheets and data. Perform any sequence of operations, transformations, or pipelines required to answer the user's question.
- Do not make assumptions or refuse requests: if a query requires filtering, cleaning, truncating, or outlier removal, do so dynamically using the pipeline or individual operations.
- If you are unsure which sheet to use, call GetSheetDescription first.
- Call GetColumns before writing a query on a sheet you have not inspected yet.
- Use exact column names from the returned schema.
- If GetColumns says a column contains delimited lists/tags/names inside one cell, use split_frequency to count the individual items.
- Do not group by or aggregate the whole cell when the question is about items inside a multi-value text column.
- For "which row has the max/min/highest/lowest value" questions, prefer a single sort+select pipeline. If the question asks for BOTH the highest and lowest, or max and min values/rows (e.g. both poor and rich, oldest and newest), ALWAYS use a single 'multi_analysis' operation containing a pipeline for each part so they execute in parallel in a single turn.
- If the question asks for MULTIPLE pieces of information (e.g. "highest and lowest", "analyze", "summary", "compare X and Y", "statistics"), use the 'multi_analysis' operation to execute all parts in parallel in a single command.
- If the question is an "overall analysis", "comprehensive analysis", "statistics", "5 analysis" or requests general insights, ALWAYS use the 'multi_analysis' operation with 4-5 different operations to analyze the dataset thoroughly. Include:
  1. An aggregate count/sum/mean of the main metric (e.g. revenue, amount).
  2. A groupby of the main metric by the primary categorical column (e.g. region, category, department).
  3. A date_trunc or time trend of the main metric if date columns are present.
  4. An outlier_detect or percentile distribution of the main metric.
  5. A head preview of the top 5-10 rows sorted by the main metric.
- If QuerySheet returns the exact row(s), either Answer from that result or preserve that subset/filter in ExecuteFinalQuery. Never follow a successful filtered lookup with an unfiltered final select.
- Use QuerySheet for intermediate work and ExecuteFinalQuery only for the final answer when ONE operation suffices.
- For cross-sheet/multi-sheet questions:
  1. Start by calling GetSheetDescription() to see all sheet names and schemas.
  2. Use QuerySheet with a cross-sheet operation (like join_sheets or union_sheets) and set the sheet_name to "cross_sheet".
  3. The result of the cross-sheet operation will be returned to you. In subsequent turns, you can run normal operations (groupby, filter, select) on "cross_sheet" to analyze the combined data.
- Respond with exactly one JSON object and no extra text.

Examples:
{"command":"GetSheetDescription","args":{}}
{"command":"GetColumns","args":{"sheet_name":"sales"}}
{"command":"QuerySheet","args":{"sheet_name":"sales","operation":"groupby","params":{"groupColumn":"region","aggColumn":"amount","aggFunction":"sum"}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"sales","operation":"aggregate","params":{"column":"amount","function":"sum"}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"cars","operation":"pipeline","params":{"operations":[{"operation":"sort","params":{"column":"Horsepower","order":"desc","limit":1}},{"operation":"select","params":{"columns":["Car"],"limit":1}}]}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"titles","operation":"split_frequency","params":{"column":"cast","delimiter":",","limit":10,"order":"desc"}}}
{"command":"QuerySheet","args":{"sheet_name":"cross_sheet","operation":"join_sheets","params":{"sheet1":"sales","sheet2":"customers","key1":"customer_id","key2":"id","joinType":"inner"}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"cross_sheet","operation":"groupby","params":{"groupColumn":"customers_name","aggColumn":"sales_amount","aggFunction":"sum"}}}
{"command":"QuerySheet","args":{"sheet_name":"cross_sheet","operation":"compare_sheets","params":{"sheet1":"q1_sales","sheet2":"q2_sales","key1":"product_id","key2":"product_id","compareColumn1":"revenue","compareColumn2":"revenue"}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"Employees_Data","operation":"multi_analysis","params":{"operations":[{"name":"poorest","operation":"pipeline","params":{"operations":[{"operation":"sort","params":{"column":"salary","order":"asc","limit":1}},{"operation":"select","params":{"columns":["first_name","last_name","salary"],"limit":1}}]}},{"name":"richest","operation":"pipeline","params":{"operations":[{"operation":"sort","params":{"column":"salary","order":"desc","limit":1}},{"operation":"select","params":{"columns":["first_name","last_name","salary"],"limit":1}}]}}]}}}`;

const DEFAULT_DATABASE_AGENT_PROMPT = `You are a database analysis agent. Work one step at a time and request only the information you need.

You are working with database tables, not workbook sheets.
For SQL databases, prefer writing database-native SQL with QuerySQL and ExecuteSQL. The backend validates that SQL is read-only, executes it against the selected database, and shows the exact executed SQL.
The operation JSON commands are still available as a safe fallback, but database-native SQL is preferred for joins, subqueries, CTEs, window functions, and any multi-table or dialect-specific work.

You have access to these commands:

1. GetSchema()
   Returns the database table inventory with column names and any cheap row-count estimates. It does not load table rows.

2. GetColumns(table_name)
   Returns detailed column info and sample values for a table.

3. QuerySQL(sql)
   Runs one intermediate read-only SQL query.

4. ExecuteSQL(sql)
   Runs the final read-only SQL query that answers the question.

5. QueryTable(table_name, operation, params)
   Runs one intermediate data operation on a table.

6. ExecuteFinalQuery(table_name, operation, params)
   Runs the final data operation that answers the question.

7. Answer(value, options?)
   Use only for clarification questions or schema-only final answers.
   For clarifications, always include args.options with 2–6 clickable choices (tables, columns, metrics, or filters).

SQL mode rules:
- Use QuerySQL/ExecuteSQL for SQL databases whenever possible.
- Only generate a single read-only SELECT or WITH query.
- Never generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, MERGE, CALL, EXEC, GRANT, REVOKE, COPY, VACUUM, PRAGMA, transaction, or multi-statement SQL.
- For detail/listing queries, include a sensible LIMIT/TOP/FETCH FIRST cap, usually 50 or 100. Aggregates and counts do not need a row limit.
- Quote qualified identifiers according to the selected database dialect.
- Use exact table and column names from GetSchema/GetColumns.

TURN-EFFICIENCY RULES (critical — you have a limited step budget):
- GetSchema already returns column names for every table. After calling GetSchema, you can immediately write SQL without calling GetColumns for every table.
- Only call GetColumns when you specifically need sample values or detailed data types that GetSchema did not provide.
- Prefer writing a single SQL query that answers the entire question, using JOINs, CTEs, subqueries, CASE expressions, and window functions as needed.
- For multi-part questions ("highest and lowest", "statistics", "compare X and Y"), write ONE SQL query that computes all parts at once rather than separate queries for each part.
- If the question is an "overall analysis", "comprehensive analysis", "statistics", "5 analysis" or requests general insights, write a single rich SELECT or WITH query that calculates:
  1. Overall aggregates (count, total, average, min, max of main numeric columns).
  2. Categorical distribution/breakdowns (using GROUP BY) for the primary categorical columns.
  3. Time-based trends (using date truncation/grouping) if date columns exist.
  4. Top ranking elements (using ORDER BY and LIMIT).
- When a QuerySQL returns data, analyze it and issue Answer or ExecuteSQL immediately — do NOT run another query for the same data.
- NEVER give up or say "I cannot answer". You have FULL read-only access. Always attempt to answer with the data you have.

CROSS-TABLE / MULTI-TABLE QUERIES:
- Use SQL JOINs (INNER JOIN, LEFT JOIN, etc.) to combine data across multiple tables in a single query.
- Use CTEs (WITH clauses) for complex multi-step logic across tables.
- Use UNION ALL to combine similar data from different tables.
- For lookups across tables, write a single JOIN query rather than querying tables one at a time.

Supported operations:
- count {}
- head {"n": 10}
- filter {"column":"col","operator":"==|!=|>|<|>=|<=|contains|starts_with|ends_with|is_null|not_null","value":X}
- multi_filter {"filters":[...],"logic":"AND|OR"}
- sort {"column":"col","order":"asc|desc","limit":N}
- select {"columns":["col1","col2"],"limit":N,"filter":{"column":"col","operator":"==","value":X} OR {"col":X}}
- unique {"column":"col"}
- aggregate {"column":"col","function":"sum|count|count_distinct|mean|min|max|median|std|variance"}
- groupby {"groupColumn":"col","aggColumn":"col2","aggFunction":"sum|count|count_distinct|mean|min|max","limit":N,"order":"asc|desc"}
- split_frequency {"column":"col","delimiter":",","limit":N,"order":"asc|desc","uniquePerRow":true|false}
- percentile {"column":"col","percentiles":[25,50,75]}
- correlation {"column1":"col1","column2":"col2"}
- date_trunc {"dateColumn":"col","period":"day|week|month|quarter|year","aggColumn":"col2","aggFunction":"count|sum|mean"}
- outlier_detect {"column":"col","method":"zscore|iqr","threshold":2}
- pivot {"rowColumn":"col","colColumn":"col2","valueColumn":"col3","aggFunction":"sum|count|mean"}
- pipeline {"operations":[{"operation":"filter","params":{...}}, {"operation":"aggregate","params":{...}}]}
- multi_analysis {"operations":[{"name":"op1","operation":"groupby","params":{...}}, {"name":"op2","operation":"percentile","params":{...}}]} to execute multiple independent operations in parallel on the table

CRITICAL RULES FOR MULTI-TABLE QUERIES:
- When the user provides an identifier (ID, code, name) without specifying a table, ALWAYS call GetSchema first.
- After GetSchema, analyze available tables and their purposes to determine which might contain the identifier.
- Search the most relevant tables in order of likelihood.
- Call GetColumns for each candidate table before querying.
- If the identifier is not found in the obvious tables, expand search to other tables.

FILTER FORMAT NOTES (select operation):
- Full format: {"column":"col","operator":"==","value":"search_term"}
- Shorthand format: {"col":"search_term"} (automatically converts to ==)
- Both formats are supported and equivalent for equality checks

Rules:
- You have FULL read-only access to the entire database. You can perform ANY search, write CTEs, joins, aggregates, subqueries, or filter on text/identifiers to answer the user's question perfectly.
- Never claim you don't have access to table rows or data. If you need to search for a value or string, dynamically run a QuerySQL query searching for it.
- If you are unsure which table to use, call GetSchema first.
- Call GetColumns before writing a query on a table you have not inspected yet.
- Use exact table and column names from the returned schema.
- GetSchema does not load table rows. Use GetColumns(table_name) to inspect exact column details before querying a specific table.
- If the user explicitly names an identifier column, such as upi, urs, urs_taxid, taxid, accession, rna_id, or id, filter that exact column when it exists. Do not substitute a similarly named column just because the value looks compatible.
- Example: a request like "details of upi URS..." must filter column "upi" on a table containing "upi"; do not filter "urs" unless no "upi" column exists.
- For identifier/detail lookups, prefer ExecuteSQL with an exact WHERE filter on the identifier column.
- If QueryTable finds rows with a filter, either answer from that result or include the same filter in ExecuteFinalQuery. Never follow a successful filtered lookup with an unfiltered final select.
- If the question asks for MULTIPLE pieces of information (e.g. "highest and lowest", "analyze", "summary", "compare X and Y", "statistics", "full analysis"), prefer writing ONE comprehensive SQL query using CASE, multiple aggregates, subqueries or UNION ALL. If that is not possible, use QuerySQL/QueryTable for EACH part (one query per call), gathering all the partial results across multiple turns. Then combine all results into a comprehensive Answer. Do NOT try to answer multi-part questions with a single query when the question clearly asks for several different metrics or comparisons.
- If the request needs a join across multiple tables and the target table is unclear, ask one concise clarification question.
- Use QuerySQL for intermediate SQL checks and ExecuteSQL for the final database answer when ONE query suffices.
- ALWAYS produce an answer. If you have gathered partial data but are running low on turns, synthesize the best answer you can from available results rather than continuing to query.
- Respond with exactly one JSON object and no extra text.

Examples:
{"command":"GetSchema","args":{}}
{"command":"GetColumns","args":{"table_name":"orders"}}
{"command":"QuerySQL","args":{"sql":"SELECT status, SUM(total_amount) AS total_amount FROM orders GROUP BY status LIMIT 20"}}
{"command":"ExecuteSQL","args":{"sql":"SELECT id, amount FROM orders WHERE status = 'completed' LIMIT 10"}}
{"command":"ExecuteSQL","args":{"sql":"SELECT o.id, o.amount, c.name FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.status = 'completed' LIMIT 50"}}
{"command":"ExecuteSQL","args":{"sql":"WITH summary AS (SELECT COUNT(*) as total, AVG(amount) as avg_amount, MAX(amount) as max_amount, MIN(amount) as min_amount FROM orders) SELECT * FROM summary"}}
{"command":"Answer","args":{"value":"Which table should I use for that metric?"}}`;


function buildDatabaseTableMap(tables: DatabaseTableData[]): DatabaseTables {
  const mapped: DatabaseTables = {};
  for (const table of tables) {
    mapped[table.name] = {
      ...table,
      rowCount: table.rowCount ?? (table.rows.length > 0 ? table.rows.length : undefined),
    };
  }
  return mapped;
}

const LOW_SIGNAL_DATABASE_COLUMN_NAMES = new Set([
  "name",
  "type",
  "date",
  "status",
  "result",
  "results",
  "data",
  "value",
  "values",
  "count",
  "total",
]);

const DATABASE_DETAIL_COLUMN_PRIORITY = [
  "upi",
  "urs",
  "urs taxid",
  "rna id",
  "taxid",
  "accession",
  "database",
  "databases",
  "description",
  "short description",
  "rna type",
  "ncrna class",
  "so rna type",
  "assigned so rna type",
  "gene",
  "species",
  "common name",
  "is active",
  "last release",
  "has coordinates",
  "id",
  "len",
  "seq short",
  "md5",
];

function hasPhrase(text: string, phrase: string) {
  if (!phrase) return false;
  return new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i").test(text);
}

function getTableColumnByNormalizedName(table: DatabaseTableData | undefined, normalizedColumnName: string) {
  return table?.columns.find((column) => normalizeColumnName(column.name) === normalizedColumnName);
}

function isUsefulQuestionColumnMention(normalizedColumnName: string) {
  return normalizedColumnName.length >= 3 && !LOW_SIGNAL_DATABASE_COLUMN_NAMES.has(normalizedColumnName);
}

function isIdentifierLikeDatabaseColumn(columnName: string) {
  const normalized = normalizeColumnName(columnName);
  return (
    /\b(upi|urs|urs taxid|rna id|taxid|accession|identifier|code|key)\b/.test(normalized) ||
    normalized === "id" ||
    normalized.endsWith(" id")
  );
}

function findQuestionMentionedDatabaseColumns(question: string, tables: DatabaseTables) {
  const normalizedQuestion = normalizeColumnName(question);
  const columnsByName = new Map<string, { name: string; tables: string[] }>();

  for (const [tableName, table] of Object.entries(tables)) {
    for (const column of table.columns) {
      const normalizedColumnName = normalizeColumnName(column.name);
      if (!isUsefulQuestionColumnMention(normalizedColumnName)) continue;
      if (!hasPhrase(normalizedQuestion, normalizedColumnName)) continue;

      const existing = columnsByName.get(normalizedColumnName) || { name: column.name, tables: [] };
      existing.tables.push(tableName);
      columnsByName.set(normalizedColumnName, existing);
    }
  }

  return Array.from(columnsByName.entries()).map(([normalizedName, info]) => ({
    normalizedName,
    name: info.name,
    tables: info.tables,
  }));
}

function buildDatabaseQuestionRoutingHints(question: string, tables: DatabaseTables) {
  const mentions = findQuestionMentionedDatabaseColumns(question, tables)
    .filter((mention) => isIdentifierLikeDatabaseColumn(mention.name));

  if (!mentions.length) return "";

  const lines = ["Question-aware routing hints:"];
  for (const mention of mentions.slice(0, 5)) {
    const candidateTables = mention.tables.slice(0, 12).join(", ");
    const suffix = mention.tables.length > 12 ? `, ... (${mention.tables.length} total)` : "";
    lines.push(
      `- User explicitly mentioned column "${mention.name}". Prefer filtering this exact column. Tables containing it: ${candidateTables}${suffix}.`
    );
  }
  lines.push("- Do not replace an explicitly mentioned identifier column with a similar column unless no exact column exists.");

  return lines.join("\n");
}

function scoreDatabaseTableForColumn(table: DatabaseTableData, normalizedColumnName: string) {
  const normalizedTableName = table.name.toLowerCase();
  const normalizedColumns = new Set(table.columns.map((column) => normalizeColumnName(column.name)));
  let score = 0;

  for (const detailColumn of DATABASE_DETAIL_COLUMN_PRIORITY) {
    if (normalizedColumns.has(detailColumn)) score += 4;
  }

  if (normalizedColumns.size <= 1) score -= 25;
  if (normalizedTableName.includes("precomputed")) score += 12;
  if (normalizedTableName.includes("summary") || normalizedTableName.includes("summaries")) score += 8;
  if (normalizedTableName.includes("tracking") || normalizedTableName.includes("map")) score -= 10;

  if (normalizedColumnName === "upi") {
    if (normalizedTableName.endsWith(".rnc_rna_precomputed") || normalizedTableName === "rnc_rna_precomputed") score += 80;
    if (normalizedTableName.endsWith(".rna") || normalizedTableName === "rna") score += 45;
    if (normalizedTableName.includes("rfam_analyzed_sequences")) score += 15;
    if (normalizedTableName.includes("pipeline_tracking") || normalizedTableName.includes("xref")) score -= 25;
  }

  return score;
}

function pickBestDatabaseTableForColumn(tables: DatabaseTables, normalizedColumnName: string) {
  const candidates = Object.values(tables)
    .filter((table) => getTableColumnByNormalizedName(table, normalizedColumnName))
    .sort((a, b) => scoreDatabaseTableForColumn(b, normalizedColumnName) - scoreDatabaseTableForColumn(a, normalizedColumnName));

  return candidates[0];
}

function buildPreferredDatabaseDetailColumns(table: DatabaseTableData, identifierColumnName?: string) {
  const byNormalizedName = new Map(table.columns.map((column) => [normalizeColumnName(column.name), column.name]));
  const ordered: string[] = [];
  const addColumn = (columnName?: string) => {
    if (!columnName) return;
    const actual = byNormalizedName.get(normalizeColumnName(columnName));
    if (actual && !ordered.includes(actual)) ordered.push(actual);
  };

  addColumn(identifierColumnName);
  for (const preferred of DATABASE_DETAIL_COLUMN_PRIORITY) addColumn(preferred);

  for (const column of table.columns) {
    if (ordered.length >= 12) break;
    if (!ordered.includes(column.name)) ordered.push(column.name);
  }

  return ordered.slice(0, 12);
}

function getPrimaryDatabaseFilter(operation: string, params: Record<string, any>) {
  if (operation === "filter") return params;
  if (params?.filter && typeof params.filter === "object" && !Array.isArray(params.filter)) return params.filter;
  if (Array.isArray(params?.filters) && params.filters.length > 0) return params.filters[0];
  return null;
}

function replacePrimaryDatabaseFilterColumn(operation: string, params: Record<string, any>, columnName: string) {
  if (operation === "filter") {
    return { ...params, column: columnName };
  }

  if (params?.filter && typeof params.filter === "object" && !Array.isArray(params.filter)) {
    return {
      ...params,
      filter: { ...params.filter, column: columnName },
    };
  }

  if (Array.isArray(params?.filters) && params.filters.length > 0) {
    const [first, ...rest] = params.filters;
    return {
      ...params,
      filters: [{ ...first, column: columnName }, ...rest],
    };
  }

  return params;
}

function repairDatabaseLookupForExplicitQuestionColumn(
  question: string,
  args: Record<string, any>,
  tables: DatabaseTables,
  defaultTableName: string
) {
  const operation = typeof args.operation === "string" ? args.operation.trim() : "";
  if (!operation) return { args, repaired: false };

  const params = args.params || {};
  const filter = getPrimaryDatabaseFilter(operation, params);
  if (!filter || !filter.column || filter.value === undefined) return { args, repaired: false };

  const explicitColumn = findQuestionMentionedDatabaseColumns(question, tables)
    .filter((mention) => isIdentifierLikeDatabaseColumn(mention.name))
    .find((mention) => normalizeColumnName(filter.column) !== mention.normalizedName);

  if (!explicitColumn) return { args, repaired: false };
  if (!isIdentifierLikeDatabaseColumn(filter.column)) return { args, repaired: false };

  const requestedTableName = typeof args.table_name === "string" && args.table_name.trim()
    ? args.table_name.trim()
    : defaultTableName;
  const requestedTable = tables[requestedTableName];
  const requestedTableColumn = getTableColumnByNormalizedName(requestedTable, explicitColumn.normalizedName);
  const targetTable = requestedTableColumn ? requestedTable : pickBestDatabaseTableForColumn(tables, explicitColumn.normalizedName);
  if (!targetTable) return { args, repaired: false };

  const targetColumn = getTableColumnByNormalizedName(targetTable, explicitColumn.normalizedName);
  if (!targetColumn) return { args, repaired: false };

  const tableChanged = targetTable.name !== requestedTableName;
  const nextParams = replacePrimaryDatabaseFilterColumn(operation, params, targetColumn.name);
  if (operation === "select" && Array.isArray(nextParams.columns)) {
    const validColumns = nextParams.columns.filter((column: any) =>
      typeof column === "string" && getTableColumnByNormalizedName(targetTable, normalizeColumnName(column))
    );
    nextParams.columns = tableChanged || validColumns.length <= 1
      ? buildPreferredDatabaseDetailColumns(targetTable, targetColumn.name)
      : Array.from(new Set([targetColumn.name, ...validColumns]));
  }

  return {
    args: {
      ...args,
      table_name: targetTable.name,
      params: nextParams,
    },
    repaired: true,
  };
}

function resolveDefaultSheetName(sheets: WorkbookSheets, selectedSheetName: string) {
  if (selectedSheetName && sheets[selectedSheetName]) return selectedSheetName;
  return Object.keys(sheets)[0] || "";
}

function resolveDefaultTableName(tables: DatabaseTables, selectedTableName: string) {
  if (selectedTableName && tables[selectedTableName]) return selectedTableName;
  return Object.keys(tables)[0] || "";
}

function buildSqlDialectGuidance(dbTypeLabel: string) {
  const label = dbTypeLabel.toLowerCase();

  if (label.includes("postgres") || label.includes("redshift")) {
    return 'SQL dialect: PostgreSQL/Redshift. Quote schema/table/columns with double quotes when needed, e.g. "schema"."table". Use LIMIT for row caps.';
  }
  if (label.includes("mysql") || label.includes("mariadb")) {
    return "SQL dialect: MySQL/MariaDB. Use backticks for identifiers when needed, e.g. `table`.`column`. Use LIMIT for row caps.";
  }
  if (label.includes("sql server")) {
    return "SQL dialect: SQL Server. Use [schema].[table] or [column] quoting when needed. Use TOP (N) for row caps.";
  }
  if (label.includes("oracle")) {
    return 'SQL dialect: Oracle. Use double quotes only when exact case-sensitive identifiers require it. Use FETCH FIRST N ROWS ONLY for row caps.';
  }
  if (label.includes("snowflake")) {
    return 'SQL dialect: Snowflake. Use double quotes for exact identifiers when needed. Use LIMIT for row caps.';
  }
  if (label.includes("bigquery")) {
    return "SQL dialect: BigQuery Standard SQL. Use backticks for project.dataset.table paths, e.g. `project.dataset.table`. Use LIMIT for row caps.";
  }
  if (label.includes("duckdb") || label.includes("sqlite")) {
    return 'SQL dialect: DuckDB/SQLite style. Use double quotes for identifiers when needed. Use LIMIT for row caps.';
  }
  if (label.includes("databricks")) {
    return "SQL dialect: Databricks SQL/Spark SQL. Use backticks for catalog.schema.table identifiers when needed. Use LIMIT for row caps.";
  }
  if (label.includes("clickhouse")) {
    return "SQL dialect: ClickHouse. Use backticks for identifiers when needed. Use LIMIT for row caps.";
  }

  return "SQL dialect: Use the selected database's read-only SELECT/WITH syntax and include a sensible row cap for detail queries.";
}

function formatSampleValue(value: any) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "null";
  return JSON.stringify(value);
}

function formatCompactNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, "");
}

function inferColumnMeaning(
  column: SheetData["columns"][number],
  totalRows: number,
  values: any[],
  multiValueProfile: MultiValueTextProfile | null
) {
  const normalizedName = normalizeColumnName(column.name);
  const nonNullCount = values.filter((value) => value != null && value !== "").length;
  const nonNullRatio = totalRows > 0 ? nonNullCount / totalRows : 0;
  const averageLength =
    column.dtype === "string" && nonNullCount > 0
      ? values
          .filter((value) => value != null && value !== "")
          .reduce((sum, value) => sum + String(value).length, 0) / nonNullCount
      : 0;

  if (multiValueProfile) {
    if (/cast|actor|actors|actress|starring|director|writer|author|artist/.test(normalizedName)) {
      return "multi-value list of people names";
    }
    if (/genre|listed|category|categories|tag|tags|keyword/.test(normalizedName)) {
      return "multi-value list of categories/tags";
    }
    if (/country|countries|language|languages|location|locations|region/.test(normalizedName)) {
      return "multi-value list of places/languages";
    }
    return "multi-value list of text items";
  }

  if (column.dtype === "date") return /year/.test(normalizedName) ? "year/date field" : "date/time field";
  if (column.dtype === "boolean") return "boolean flag";

  if (/id|identifier|code|key/.test(normalizedName)) return "identifier/code";
  if (column.dtype === "number") return /year/.test(normalizedName) ? "year value" : "numeric measure";
  if (/title|name|label/.test(normalizedName)) return "title/name";
  if (/description|summary|overview|plot|synopsis|notes?/.test(normalizedName) || (averageLength > 60 && column.uniqueCount >= Math.max(10, totalRows * 0.5))) {
    return "free-text description";
  }
  if (/country|city|state|region|location|language/.test(normalizedName)) return "location/category text";
  if (column.uniqueCount <= Math.min(50, Math.max(5, totalRows * 0.2)) && nonNullRatio > 0) return "categorical text";
  if (column.uniqueCount >= Math.max(10, totalRows * 0.9)) return "high-cardinality text";
  return "text field";
}

function buildColumnsDescription(sheets: WorkbookSheets, sheetName: string) {
  const sheet = sheets[sheetName];
  if (!sheet) {
    return `ERROR: Sheet '${sheetName}' not found. Available: ${Object.keys(sheets).join(", ")}`;
  }

  const lines = [`Sheet '${sheetName}' schema:`];
  for (const column of sheet.columns) {
    const values = getColumnValues(sheet.rows, column.name);
    const sample = `[${column.sampleValues.slice(0, 3).map(formatSampleValue).join(", ")}]`;
    const nullCount = sheet.rows.length - column.nonNullCount;
    const coverage = sheet.rows.length > 0 ? `${((column.nonNullCount / sheet.rows.length) * 100).toFixed(1)}% filled` : "0.0% filled";
    const multiValueProfile = detectMultiValueTextProfile(values, column.name);
    const meaning = inferColumnMeaning(column, sheet.rows.length, values, multiValueProfile);
    const parts = [
      `${column.name} (${column.dtype})`,
      `meaning: ${meaning}`,
      coverage,
      `${column.uniqueCount} unique non-null values`,
    ];

    if (nullCount > 0) {
      parts.push(`${nullCount} null/blank`);
    }

    if (column.dtype === "number") {
      const numericValues = values.map((value) => Number(value)).filter((value) => !isNaN(value));
      if (numericValues.length > 0) {
        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        parts.push(`range: ${formatCompactNumber(min)} to ${formatCompactNumber(max)}`);
      }
    } else if (column.dtype === "date") {
      const dateValues = values
        .map((value) => new Date(String(value)))
        .filter((value) => !isNaN(value.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());
      if (dateValues.length > 0) {
        parts.push(`range: ${dateValues[0].toISOString().slice(0, 10)} to ${dateValues[dateValues.length - 1].toISOString().slice(0, 10)}`);
      }
    }

    parts.push(`sample values: ${sample}`);

    if (multiValueProfile) {
      parts.push(
        `list pattern: "${multiValueProfile.delimiter}"-separated items, avg ${formatCompactNumber(multiValueProfile.averageItemsPerCell)} items/cell`
      );
      if (multiValueProfile.sampleItems.length > 0) {
        parts.push(`sample items: [${multiValueProfile.sampleItems.map(formatSampleValue).join(", ")}]`);
      }
      parts.push(`for individual item counts use split_frequency, not groupby on the full cell`);
    }

    lines.push(`  ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

function buildSheetDescription(sheets: WorkbookSheets) {
  const names = Object.keys(sheets);
  if (names.length === 0) return "No sheets available.";

  const lines = names.map((name) => {
    const sheet = sheets[name];
    const columns = sheet.columns.map((column) => column.name).join(", ");
    return `  Sheet '${name}': ${sheet.rows.length} rows | Columns: [${columns}]`;
  });

  return "Available sheets:\n" + lines.join("\n");
}

function buildDatabaseSchemaDescription(tables: DatabaseTables, question = "") {
  const names = Object.keys(tables);
  if (names.length === 0) return "No tables available.";
  const routingHints = buildDatabaseQuestionRoutingHints(question, tables);

  const lines = names.map((name) => {
    const table = tables[name];
    const columns = table.columns.length
      ? table.columns.map((column) => column.name).join(", ")
      : "columns not loaded yet; call GetColumns(table_name)";
    const rowLabel = table.rowCount != null
      ? `~${table.rowCount.toLocaleString()} rows`
      : table.rows.length > 0
        ? `${table.rows.length} preview rows`
        : "row count not loaded";
    const kind = table.kind ? ` (${table.kind})` : "";
    return `  Table '${name}'${kind}: ${rowLabel} | Columns: [${columns}]`;
  });

  return [
    `Available tables (${names.length}).`,
    "GetSchema loads table names and column names from database metadata only; it does not load table rows.",
    "Row counts are approximate/metadata-based when available. Use GetColumns(table_name) before querying a specific table.",
    ...(routingHints ? [routingHints] : []),
    ...lines,
  ].join("\n");
}

function buildDatabaseColumnsDescription(tables: DatabaseTables, tableName: string) {
  const table = tables[tableName];
  if (!table) {
    return `ERROR: Table '${tableName}' not found. Available: ${Object.keys(tables).join(", ")}`;
  }

  if (!table.columns.length) {
    return `Table '${tableName}' exists, but its column metadata is not loaded yet. Inspect another table or request this schema again.`;
  }

  const lines = [`Table '${tableName}' schema:`];
  for (const column of table.columns) {
    const values = getColumnValues(table.rows, column.name);
    const multiValueProfile = detectMultiValueTextProfile(values, column.name);
    const nullCount = table.rows.length - column.nonNullCount;
    const coverage = table.rows.length > 0 ? `${((column.nonNullCount / table.rows.length) * 100).toFixed(1)}% filled` : "0.0% filled";
    const samples = column.sampleValues.slice(0, 4).map((value) => formatSampleValue(value)).join(", ");
    const meaning = inferColumnMeaning(column, table.rows.length, values, multiValueProfile);

    const parts = [
      `- ${column.name} [${column.dtype}]`,
      `meaning: ${meaning}`,
      `coverage: ${coverage}`,
      `unique: ${column.uniqueCount}`,
    ];

    if (nullCount > 0) {
      parts.push(`nulls: ${nullCount}`);
    }
    if (samples) {
      parts.push(`samples: ${samples}`);
    }
    if (multiValueProfile) {
      parts.push(`list pattern: "${multiValueProfile.delimiter}"-separated items`);
      parts.push(`estimated items per row: avg ${multiValueProfile.averageItemsPerCell.toFixed(1)}`);
      parts.push(`for individual item counts use split_frequency, not groupby on the full cell`);
    }

    lines.push(parts.join(" | "));
  }

  return lines.join("\n");
}

function formatResultForModel(result: any) {
  const preview = Array.isArray(result) ? result.slice(0, 30) : result;
  const serialized = typeof preview === "string" ? preview : JSON.stringify(preview);
  return serialized.length > 8000 ? `${serialized.slice(0, 8000)}... (truncated)` : serialized;
}

function parseLegacyLiteral(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return trimmed;

  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith("\"") && trimmed.endsWith("\""))) {
    return trimmed.slice(1, -1);
  }
  if (/^(true|false)$/i.test(trimmed)) {
    return /^true$/i.test(trimmed);
  }
  if (/^(none|null)$/i.test(trimmed)) {
    return null;
  }

  const numeric = Number(trimmed.replace(/_/g, ""));
  return Number.isNaN(numeric) ? trimmed : numeric;
}

function parseLegacyColumnList(token: string) {
  return Array.from(token.matchAll(/['"]([^'"]+)['"]/g)).map((match) => match[1]);
}

function buildLegacyFilter(column: string, operator: string, rawValue: string) {
  return { column, operator, value: parseLegacyLiteral(rawValue) };
}

function translateLegacyPandasQuery(pandasQuery: string) {
  const query = pandasQuery.trim();

  let match = query.match(/^len\(df\)$/i);
  if (match || /^df\.shape\[0\]$/i.test(query)) {
    return { operation: "count", params: {} };
  }

  match = query.match(/^df\.head\((\d+)\)$/i);
  if (match) {
    return { operation: "head", params: { n: Number(match[1]) } };
  }

  match = query.match(/^df\.sort_values\(\s*(['"])(.+?)\1\s*,\s*ascending\s*=\s*(True|False)\s*\)(?:\.head\((\d+)\))?$/i);
  if (match) {
    const [, , column, ascending, limit] = match;
    return {
      operation: "sort",
      params: {
        column,
        order: /^true$/i.test(ascending) ? "asc" : "desc",
        ...(limit ? { limit: Number(limit) } : {}),
      },
    };
  }

  match = query.match(/^df\.groupby\(\s*(['"])(.+?)\1\s*\)\s*\[\s*(['"])(.+?)\3\s*\]\.(sum|count|mean|min|max)\(\)(?:\.sort_values\(\s*ascending\s*=\s*(True|False)\s*\))?(?:\.head\((\d+)\))?$/i);
  if (match) {
    const [, , groupColumn, , aggColumn, aggFunction, ascending, limit] = match;
    return {
      operation: "groupby",
      params: {
        groupColumn,
        aggColumn,
        aggFunction: aggFunction.toLowerCase(),
        ...(ascending ? { order: /^true$/i.test(ascending) ? "asc" : "desc" } : {}),
        ...(limit ? { limit: Number(limit) } : {}),
      },
    };
  }

  match = query.match(/^df\s*\[\s*df\s*\[\s*(['"])(.+?)\1\s*\]\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*\]\s*\[\s*(['"])(.+?)\5\s*\]\.(sum|count|mean|min|max|median|std|var|variance|nunique)\(\)$/i);
  if (match) {
    const [, , filterColumn, operator, rawValue, , targetColumn, rawFunction] = match;
    const fn = rawFunction.toLowerCase();
    const operations =
      fn === "count"
        ? [
            { operation: "filter", params: buildLegacyFilter(filterColumn, operator, rawValue) },
            { operation: "remove_nulls", params: { column: targetColumn } },
            { operation: "count", params: {} },
          ]
        : fn === "nunique"
          ? [
              { operation: "filter", params: buildLegacyFilter(filterColumn, operator, rawValue) },
              { operation: "unique", params: { column: targetColumn } },
              { operation: "count", params: {} },
            ]
          : [
              { operation: "filter", params: buildLegacyFilter(filterColumn, operator, rawValue) },
              { operation: "aggregate", params: { column: targetColumn, function: fn === "var" ? "variance" : fn } },
            ];

    return { operation: "pipeline", params: { operations } };
  }

  match = query.match(/^df\s*\[\s*(['"])(.+?)\1\s*\]\.(sum|count|mean|min|max|median|std|var|variance|nunique)\(\)$/i);
  if (match) {
    const [, , column, rawFunction] = match;
    const fn = rawFunction.toLowerCase();
    if (fn === "count") {
      return {
        operation: "pipeline",
        params: { operations: [{ operation: "remove_nulls", params: { column } }, { operation: "count", params: {} }] },
      };
    }
    if (fn === "nunique") {
      return {
        operation: "pipeline",
        params: { operations: [{ operation: "unique", params: { column } }, { operation: "count", params: {} }] },
      };
    }
    return { operation: "aggregate", params: { column, function: fn === "var" ? "variance" : fn } };
  }

  match = query.match(/^df\s*\[\s*(['"])(.+?)\1\s*\]\.(?:dropna\(\)\.)?unique\(\)(?:\.tolist\(\))?$/i);
  if (match) {
    return { operation: "unique", params: { column: match[2] } };
  }

  match = query.match(/^df\s*\[\s*df\s*\[\s*(['"])(.+?)\1\s*\]\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*\]\s*\[\s*(\[.+\]|['"].+?['"])\s*\](?:\.head\((\d+)\))?$/i);
  if (match) {
    const [, , filterColumn, operator, rawValue, selectionToken, limit] = match;
    const columns = parseLegacyColumnList(selectionToken);
    const operations: Array<{ operation: string; params: Record<string, any> }> = [
      { operation: "filter", params: buildLegacyFilter(filterColumn, operator, rawValue) },
    ];
    if (columns.length > 0) {
      operations.push({ operation: "select", params: { columns, ...(limit ? { limit: Number(limit) } : {}) } });
    } else if (limit) {
      operations.push({ operation: "head", params: { n: Number(limit) } });
    }
    return { operation: "pipeline", params: { operations } };
  }

  match = query.match(/^df\s*\[\s*df\s*\[\s*(['"])(.+?)\1\s*\]\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*\]\s*(?:\.head\((\d+)\))?$/i);
  if (match) {
    const [, , filterColumn, operator, rawValue, limit] = match;
    if (limit) {
      return {
        operation: "pipeline",
        params: {
          operations: [
            { operation: "filter", params: buildLegacyFilter(filterColumn, operator, rawValue) },
            { operation: "head", params: { n: Number(limit) } },
          ],
        },
      };
    }
    return { operation: "filter", params: buildLegacyFilter(filterColumn, operator, rawValue) };
  }

  match = query.match(/^df\s*\[\s*(\[.+\]|['"].+?['"])\s*\](?:\.head\((\d+)\))?$/i);
  if (match) {
    const [, selectionToken, limit] = match;
    const columns = parseLegacyColumnList(selectionToken);
    if (columns.length > 0) {
      return { operation: "select", params: { columns, ...(limit ? { limit: Number(limit) } : {}) } };
    }
  }

  return null;
}

function executeCrossSheetOperation(
  sheets: WorkbookSheets,
  operation: string,
  params: Record<string, any>
): any {
  switch (operation) {
    case "join_sheets": {
      const { sheet1, sheet2, key1, key2, joinType = "inner" } = params;
      const s1 = sheets[sheet1];
      const s2 = sheets[sheet2];
      if (!s1) return `ERROR: Sheet '${sheet1}' not found. Available: ${Object.keys(sheets).join(", ")}`;
      if (!s2) return `ERROR: Sheet '${sheet2}' not found. Available: ${Object.keys(sheets).join(", ")}`;

      const rows1 = s1.rows || [];
      const rows2 = s2.rows || [];
      const joined: Record<string, any>[] = [];

      const firstRow1 = rows1[0] || {};
      const firstRow2 = rows2[0] || {};
      const actualKey1 = resolveColumn(firstRow1, key1);
      const actualKey2 = resolveColumn(firstRow2, key2);

      const mergeRows = (r1: Record<string, any>, r2: Record<string, any>, k1: string, k2: string) => {
        const merged: Record<string, any> = {};
        const prefix1 = sheet1 === sheet2 ? `${sheet1}_1` : sheet1;
        const prefix2 = sheet1 === sheet2 ? `${sheet2}_2` : sheet2;

        for (const [k, v] of Object.entries(r1)) {
          if (k === k1) {
            merged[key1] = v;
          } else if (r2.hasOwnProperty(k)) {
            merged[`${prefix1}_${k}`] = v;
          } else {
            merged[k] = v;
          }
        }
        for (const [k, v] of Object.entries(r2)) {
          if (k === k2) {
            if (!merged.hasOwnProperty(key1)) {
              merged[key1] = v;
            }
          } else if (r1.hasOwnProperty(k)) {
            merged[`${prefix2}_${k}`] = v;
          } else {
            merged[k] = v;
          }
        }
        return merged;
      };

      if (joinType === "inner") {
        for (const r1 of rows1) {
          const val1 = r1[actualKey1];
          if (val1 === undefined || val1 === null) continue;
          for (const r2 of rows2) {
            const val2 = r2[actualKey2];
            if (val2 === undefined || val2 === null) continue;
            if (String(val1) === String(val2)) {
              joined.push(mergeRows(r1, r2, actualKey1, actualKey2));
            }
          }
        }
      } else if (joinType === "left") {
        for (const r1 of rows1) {
          const val1 = r1[actualKey1];
          let matched = false;
          if (val1 !== undefined && val1 !== null) {
            for (const r2 of rows2) {
              const val2 = r2[actualKey2];
              if (val2 !== undefined && val2 !== null && String(val1) === String(val2)) {
                joined.push(mergeRows(r1, r2, actualKey1, actualKey2));
                matched = true;
              }
            }
          }
          if (!matched) {
            const emptyRow2: Record<string, any> = {};
            if (s2.columns) {
              for (const col of s2.columns) {
                if (col.name !== actualKey2) emptyRow2[col.name] = null;
              }
            }
            joined.push(mergeRows(r1, emptyRow2, actualKey1, actualKey2));
          }
        }
      } else if (joinType === "right") {
        for (const r2 of rows2) {
          const val2 = r2[actualKey2];
          let matched = false;
          if (val2 !== undefined && val2 !== null) {
            for (const r1 of rows1) {
              const val1 = r1[actualKey1];
              if (val1 !== undefined && val1 !== null && String(val1) === String(val2)) {
                joined.push(mergeRows(r1, r2, actualKey1, actualKey2));
                matched = true;
              }
            }
          }
          if (!matched) {
            const emptyRow1: Record<string, any> = {};
            if (s1.columns) {
              for (const col of s1.columns) {
                if (col.name !== actualKey1) emptyRow1[col.name] = null;
              }
            }
            joined.push(mergeRows(emptyRow1, r2, actualKey1, actualKey2));
          }
        }
      } else if (joinType === "outer") {
        const matchedRight = new Set<number>();
        for (const r1 of rows1) {
          const val1 = r1[actualKey1];
          let matched = false;
          if (val1 !== undefined && val1 !== null) {
            for (let idx = 0; idx < rows2.length; idx++) {
              const r2 = rows2[idx];
              const val2 = r2[actualKey2];
              if (val2 !== undefined && val2 !== null && String(val1) === String(val2)) {
                joined.push(mergeRows(r1, r2, actualKey1, actualKey2));
                matched = true;
                matchedRight.add(idx);
              }
            }
          }
          if (!matched) {
            const emptyRow2: Record<string, any> = {};
            if (s2.columns) {
              for (const col of s2.columns) {
                if (col.name !== actualKey2) emptyRow2[col.name] = null;
              }
            }
            joined.push(mergeRows(r1, emptyRow2, actualKey1, actualKey2));
          }
        }
        for (let idx = 0; idx < rows2.length; idx++) {
          if (!matchedRight.has(idx)) {
            const r2 = rows2[idx];
            const emptyRow1: Record<string, any> = {};
            if (s1.columns) {
              for (const col of s1.columns) {
                if (col.name !== actualKey1) emptyRow1[col.name] = null;
              }
            }
            joined.push(mergeRows(emptyRow1, r2, actualKey1, actualKey2));
          }
        }
      }
      return joined;
    }
    case "compare_sheets": {
      const { sheet1, sheet2, key1, key2, compareColumn1, compareColumn2 } = params;
      const s1 = sheets[sheet1];
      const s2 = sheets[sheet2];
      if (!s1) return `ERROR: Sheet '${sheet1}' not found. Available: ${Object.keys(sheets).join(", ")}`;
      if (!s2) return `ERROR: Sheet '${sheet2}' not found. Available: ${Object.keys(sheets).join(", ")}`;

      const rows1 = s1.rows || [];
      const rows2 = s2.rows || [];

      const firstRow1 = rows1[0] || {};
      const firstRow2 = rows2[0] || {};
      const actualKey1 = resolveColumn(firstRow1, key1);
      const actualKey2 = resolveColumn(firstRow2, key2);
      const actualCompCol1 = resolveColumn(firstRow1, compareColumn1);
      const actualCompCol2 = resolveColumn(firstRow2, compareColumn2);

      const s2Map = new Map<string, Record<string, any>>();
      for (const r2 of rows2) {
        const val2 = r2[actualKey2];
        if (val2 !== undefined && val2 !== null) {
          s2Map.set(String(val2), r2);
        }
      }

      const compared: Record<string, any>[] = [];
      for (const r1 of rows1) {
        const val1 = r1[actualKey1];
        if (val1 === undefined || val1 === null) continue;
        const keyStr = String(val1);
        const r2 = s2Map.get(keyStr);

        const v1 = r1[actualCompCol1];
        const v2 = r2 ? r2[actualCompCol2] : null;

        const num1 = Number(v1);
        const num2 = Number(v2);

        let diff: number | null = null;
        let pctChange: number | null = null;

        if (v1 != null && v2 != null && !isNaN(num1) && !isNaN(num2)) {
          diff = num2 - num1;
          pctChange = num1 !== 0 ? (diff / num1) * 100 : null;
        }

        compared.push({
          [key1]: val1,
          [`${sheet1}_${compareColumn1}`]: v1,
          [`${sheet2}_${compareColumn2}`]: v2,
          difference: diff,
          pct_change: pctChange != null ? `${pctChange.toFixed(2)}%` : null,
          status: r2 ? (v1 === v2 ? "matched" : "mismatched") : "only_in_sheet1"
        });
      }

      const s1Keys = new Set(rows1.map(r => String(r[actualKey1])).filter(Boolean));
      for (const r2 of rows2) {
        const val2 = r2[actualKey2];
        if (val2 === undefined || val2 === null) continue;
        if (!s1Keys.has(String(val2))) {
          compared.push({
            [key1]: val2,
            [`${sheet1}_${compareColumn1}`]: null,
            [`${sheet2}_${compareColumn2}`]: r2[actualCompCol2],
            difference: null,
            pct_change: null,
            status: "only_in_sheet2"
          });
        }
      }

      return compared;
    }
    case "union_sheets": {
      const { sheets: sheetNames } = params;
      if (!Array.isArray(sheetNames) || sheetNames.length === 0) {
        return "ERROR: Missing sheets list for union.";
      }

      const combinedRows: Record<string, any>[] = [];
      for (const name of sheetNames) {
        const s = sheets[name];
        if (!s) return `ERROR: Sheet '${name}' not found. Available: ${Object.keys(sheets).join(", ")}`;
        for (const row of s.rows || []) {
          combinedRows.push({ ...row, _source_sheet: name });
        }
      }
      return combinedRows;
    }
    case "vlookup_sheets":
    case "lookup_sheets": {
      const { targetSheet, sourceSheet, targetKey, sourceKey, valueColumn, asColumn } = params;
      const tSheet = sheets[targetSheet];
      const sSheet = sheets[sourceSheet];
      if (!tSheet) return `ERROR: Target sheet '${targetSheet}' not found. Available: ${Object.keys(sheets).join(", ")}`;
      if (!sSheet) return `ERROR: Source sheet '${sourceSheet}' not found. Available: ${Object.keys(sheets).join(", ")}`;

      const tRows = tSheet.rows || [];
      const sRows = sSheet.rows || [];
      const firstRowT = tRows[0] || {};
      const firstRowS = sRows[0] || {};
      const actualTargetKey = resolveColumn(firstRowT, targetKey);
      const actualSourceKey = resolveColumn(firstRowS, sourceKey);
      const actualValueCol = resolveColumn(firstRowS, valueColumn);

      const sourceMap = new Map<string, any>();
      for (const row of sRows) {
        const sk = row[actualSourceKey];
        if (sk !== undefined && sk !== null) {
          sourceMap.set(String(sk), row[actualValueCol]);
        }
      }

      const lookupColName = asColumn || `${sourceSheet}_${valueColumn}`;
      const updatedRows = tRows.map((row) => {
        const tk = row[actualTargetKey];
        const val = tk !== undefined && tk !== null ? sourceMap.get(String(tk)) : null;
        return {
          ...row,
          [lookupColName]: val !== undefined ? val : null
        };
      });

      return updatedRows;
    }
    default:
      return `ERROR: Unknown cross-sheet operation '${operation}'`;
  }
}

function executeSheetCommand(
  args: Record<string, any>,
  sheets: WorkbookSheets,
  defaultSheetName: string,
  sourceRows?: Record<string, any>[]
) {
  const requestedSheetName = typeof args.sheet_name === "string" && args.sheet_name.trim()
    ? args.sheet_name.trim()
    : defaultSheetName;

  const operation = typeof args.operation === "string" ? args.operation.trim() : "";
  const isCrossSheetOp = ["join_sheets", "compare_sheets", "union_sheets", "vlookup_sheets", "lookup_sheets"].includes(operation);

  if (!isCrossSheetOp && !sourceRows) {
    const sheet = sheets[requestedSheetName];
    if (!sheet) {
      return {
        args: { ...args, sheet_name: requestedSheetName },
        result: `ERROR: Sheet '${requestedSheetName}' not found. Available: ${Object.keys(sheets).join(", ")}`,
      };
    }
  }

  if (isCrossSheetOp) {
    const result = executeCrossSheetOperation(sheets, operation, args.params || {});
    return {
      args: { ...args, sheet_name: requestedSheetName },
      result,
    };
  }

  const rows = sourceRows || sheets[requestedSheetName]?.rows || [];

  if (typeof args.pandas_query === "string" && args.pandas_query.trim()) {
    const translated = translateLegacyPandasQuery(args.pandas_query);
    if (!translated) {
      return {
        args: { ...args, sheet_name: requestedSheetName },
        result: "QUERY_ERROR: Unsupported pandas_query expression. Use operation + params for this query.",
      };
    }

    return {
      args: { ...args, sheet_name: requestedSheetName },
      result: executeOperation(rows, translated.operation, translated.params),
    };
  }

  if (!operation) {
    return {
      args: { ...args, sheet_name: requestedSheetName },
      result: "QUERY_ERROR: Missing operation or pandas_query.",
    };
  }

  return {
    args: { ...args, sheet_name: requestedSheetName },
    result: executeOperation(rows, operation, args.params || {}),
  };
}

function executeDatabaseTableCommand(args: Record<string, any>, tables: DatabaseTables, defaultTableName: string) {
  const requestedTableName = typeof args.table_name === "string" && args.table_name.trim()
    ? args.table_name.trim()
    : typeof args.sheet_name === "string" && args.sheet_name.trim()
      ? args.sheet_name.trim()
      : defaultTableName;
  const table = tables[requestedTableName];

  if (!table) {
    return {
      args: { ...args, table_name: requestedTableName },
      result: `ERROR: Table '${requestedTableName}' not found. Available: ${Object.keys(tables).join(", ")}`,
    };
  }

  return {
    args: { ...args, table_name: requestedTableName },
    result: executeOperation(table.rows, args.operation, args.params || {}),
  };
}

function normalizeDatabaseCommand(parsed: { command: string; args?: Record<string, any> }) {
  const args = { ...(parsed.args || {}) };
  let command = parsed.command;

  if (command === "GetSheetDescription") command = "GetSchema";
  if (command === "QuerySheet") command = "QueryTable";
  if (command === "RunSQL" || command === "ExecuteFinalSQL") command = "ExecuteSQL";
  if (command === "SqlQuery" || command === "SQLQuery") command = "QuerySQL";
  if (typeof args.sheet_name === "string" && !args.table_name) {
    args.table_name = args.sheet_name;
  }

  return { command, args };
}

const FILTER_CARRY_TARGET_OPERATIONS = new Set([
  "select",
  "head",
  "count",
  "unique",
  "sort",
  "aggregate",
  "groupby",
  "percentile",
  "correlation",
  "date_trunc",
]);

function hasDatabaseFilter(params: Record<string, any> = {}) {
  return Boolean(
    params.filter ||
    (Array.isArray(params.filters) && params.filters.length > 0)
  );
}

function getCarriableDatabaseFilter(operation: string, params: Record<string, any> = {}) {
  if (operation === "filter" && params.column) {
    return { operation, params: { ...params } };
  }

  if (operation === "multi_filter" && Array.isArray(params.filters) && params.filters.length > 0) {
    return { operation, params: { ...params } };
  }

  return null;
}

function carryForwardDatabaseFilter(
  operation: string,
  params: Record<string, any> = {},
  previousFilter?: { operation: string; params: Record<string, any> } | null
) {
  if (!previousFilter || hasDatabaseFilter(params) || !FILTER_CARRY_TARGET_OPERATIONS.has(operation)) {
    return params;
  }

  if (previousFilter.operation === "filter") {
    return {
      ...params,
      filter: { ...previousFilter.params },
    };
  }

  if (previousFilter.operation === "multi_filter") {
    return {
      ...params,
      filters: previousFilter.params.filters,
      logic: previousFilter.params.logic || "AND",
    };
  }

  return params;
}

function unwrapDatabaseExecutionResult(result: any) {
  if (
    result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    Array.isArray(result.data)
  ) {
    return {
      rows: result.data,
      sql: typeof result.sql === "string" && result.sql.trim() ? result.sql.trim() : undefined,
    };
  }

  return { rows: result, sql: undefined };
}

function getSqlFromArgs(args: Record<string, any> = {}) {
  const sql = args.sql ?? args.query ?? args.statement;
  return typeof sql === "string" ? sql.trim() : "";
}

const SHEET_FILTER_CARRY_TARGET_OPERATIONS = new Set([
  ...FILTER_CARRY_TARGET_OPERATIONS,
  "split_frequency",
  "outlier_detect",
  "pivot",
  "topN_groupby",
]);

function getCarriableSheetFilter(operation: string, params: Record<string, any> = {}) {
  if (operation === "filter" && params.column) {
    return { operation, params: { ...params } };
  }

  if (operation === "multi_filter" && Array.isArray(params.filters) && params.filters.length > 0) {
    return { operation, params: { ...params } };
  }

  return null;
}

function carryForwardSheetFilter(
  operation: string,
  params: Record<string, any> = {},
  previousFilter?: { operation: string; params: Record<string, any> } | null
) {
  if (!previousFilter || hasDatabaseFilter(params) || !SHEET_FILTER_CARRY_TARGET_OPERATIONS.has(operation)) {
    return params;
  }

  if (previousFilter.operation === "filter") {
    return {
      ...params,
      filter: { ...previousFilter.params },
    };
  }

  if (previousFilter.operation === "multi_filter") {
    return {
      ...params,
      filters: previousFilter.params.filters,
      logic: previousFilter.params.logic || "AND",
    };
  }

  return params;
}

function getReferencedSheetColumns(operation: string, params: Record<string, any> = {}) {
  const columns = new Set<string>();
  const add = (value: any) => {
    if (typeof value === "string" && value.trim()) columns.add(value.trim());
  };

  switch (operation) {
    case "select":
      (Array.isArray(params.columns) ? params.columns : []).forEach(add);
      break;
    case "sort":
    case "aggregate":
    case "unique":
    case "percentile":
    case "split_frequency":
    case "outlier_detect":
      add(params.column);
      break;
    case "groupby":
      add(params.groupColumn);
      add(params.aggColumn);
      break;
    case "correlation":
      add(params.column1);
      add(params.column2);
      break;
    case "date_trunc":
      add(params.dateColumn);
      add(params.aggColumn);
      break;
    case "pivot":
      add(params.rowColumn);
      add(params.colColumn);
      add(params.valueColumn);
      break;
    case "topN_groupby":
      add(params.groupColumn);
      add(params.rankColumn);
      break;
  }

  return Array.from(columns);
}

function canRunOnPreviousSheetRows(
  operation: string,
  params: Record<string, any> = {},
  previousRows?: Record<string, any>[]
) {
  if (!Array.isArray(previousRows) || hasDatabaseFilter(params) || operation === "filter" || operation === "multi_filter") {
    return false;
  }

  if (!SHEET_FILTER_CARRY_TARGET_OPERATIONS.has(operation)) return false;
  if (previousRows.length === 0) return true;

  const referencedColumns = getReferencedSheetColumns(operation, params);
  return referencedColumns.every((column) => Object.prototype.hasOwnProperty.call(previousRows[0], column));
}

export async function* runDatabaseAgent(
  question: string,
  databaseTables: DatabaseTableData[],
  selectedTableName: string,
  dbTypeLabel: string,
  provider: Provider,
  model: string,
  apiKey: string,
  temperature: number,
  maxTokens: number,
  systemPromptOverride?: string,
  conversationHistory?: ConversationContext[],
  providerOptions: LLMProviderOptions = {},
  tools: DatabaseAgentTools = {},
  hitlController?: HitlController
): AsyncGenerator<AgentStep> {
  const tables = buildDatabaseTableMap(databaseTables);
  const defaultTableName = resolveDefaultTableName(tables, selectedTableName);
  if (!defaultTableName) {
    yield {
      turn: 1,
      command: "Error",
      args: {},
      result: "No database tables are available for querying.",
      tokens: { input: 0, output: 0 },
      durationMs: 0,
      isFinal: true,
    };
    return;
  }

  const history: { role: string; content: string }[] = [];
  const prompt = systemPromptOverride || DEFAULT_DATABASE_AGENT_PROMPT;
  const maxTurns = 15;
  const inspectedTables = new Set<string>();
  const lastIntermediateFilterByTable = new Map<string, { operation: string; params: Record<string, any> }>();
  let turn = 0;

  // Detect if this is an identifier lookup query
  const identifierPattern = /^(?:give me|show me|details of|find|get|look for|search for|find details?\s+(?:of|for)|what.*(?:id|identifier|code)\s+)/i;
  const isIdentifierQuery = identifierPattern.test(question.trim());
  
  const introParts = [
    `Question: ${question}`,
    `Database type: ${dbTypeLabel}`,
    buildSqlDialectGuidance(dbTypeLabel),
    `Step budget: you have at most ${maxTurns} steps total. Be efficient — combine schema lookup and query in as few steps as possible.`,
    `Current selected table: "${defaultTableName}"`,
    `Available tables: ${Object.keys(tables).length} (${Object.keys(tables).slice(0, 5).join(", ")}${Object.keys(tables).length > 5 ? ", ..." : ""})`,
  ];

  // Add guidance for identifier searches
  if (isIdentifierQuery) {
    introParts.push(`NOTE: This appears to be an identifier/lookup query. Start with GetSchema() to understand all available tables, then search the most relevant tables for this identifier.`);
  }

  // ── LangChain BufferWindowMemory: last 3 turns, compact (120-char Q / 200-char A) ──
  if (conversationHistory && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-3).map((entry, index) => {
      const q = entry.question.slice(0, 120);
      const aRaw = typeof entry.answer === "string" ? entry.answer : JSON.stringify(entry.answer);
      const a = aRaw.slice(0, 200);
      return `Human[${index + 1}]: ${q}\nAI[${index + 1}]: ${a}`;
    });
    introParts.push(`Prior conversation (last ${recent.length} turn${recent.length !== 1 ? "s" : ""}):\n${recent.join("\n")}`);
  }

  introParts.push("Respond with one JSON command only.");
  let llmInput = introParts.join("\n\n");

  while (turn < maxTurns) {
    turn++;
    const startTime = Date.now();
    history.push({ role: "user", content: llmInput });

    let llmResponse: LLMResponse;
    try {
      llmResponse = await callLLM(provider, model, apiKey, history, prompt, temperature, maxTokens, providerOptions);
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

    history.push({ role: "assistant", content: llmResponse.content });

    let parsed = parseCommand(llmResponse.content);
    if (!parsed) {
      yield {
        turn,
        command: "PARSE_ERROR",
        args: {},
        result: "Could not parse command, retrying...",
        tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
        durationMs: Date.now() - startTime,
        isFinal: false,
      };
      llmInput = "Invalid response. Reply ONLY with a JSON command object.";
      continue;
    }

    parsed = normalizeDatabaseCommand(parsed);

    let { command, args = {} } = parsed;
    args = args || {};
    let rawArgs = args as Record<string, any>;
    const defaultRawResult = llmResponse.content;
    let repairedExplicitIdentifierLookup = false;
    if (command === "QueryTable" || command === "ExecuteFinalQuery") {
      const repaired = repairDatabaseLookupForExplicitQuestionColumn(question, rawArgs, tables, defaultTableName);
      if (repaired.repaired) {
        args = repaired.args;
        rawArgs = args as Record<string, any>;
        repairedExplicitIdentifierLookup = true;
      }
    }
    const requestedTableName =
      typeof rawArgs.table_name === "string" && rawArgs.table_name.trim()
        ? rawArgs.table_name.trim()
        : defaultTableName;
    const answerPayload = rawArgs.value !== undefined ? rawArgs.value : (Object.keys(rawArgs).length > 0 ? rawArgs : defaultRawResult);
    const normalizedAnswer =
      typeof answerPayload === "string" && !answerPayload.trim()
        ? defaultRawResult?.trim() || "No result returned from the model."
        : answerPayload;

    if (
      (command === "QueryTable" || command === "ExecuteFinalQuery") &&
      !inspectedTables.has(requestedTableName) &&
      !repairedExplicitIdentifierLookup
    ) {
      // Skip forced GetColumns if table already has columns from GetSchema AND we have SQL execution
      const tableInfo = tables[requestedTableName];
      const hasColumnsFromSchema = tableInfo && tableInfo.columns && tableInfo.columns.length > 0;
      const hasSqlTool = Boolean(tools.executeSql);
      if (!hasColumnsFromSchema || !hasSqlTool) {
        command = "GetColumns";
        args = { table_name: requestedTableName };
        rawArgs = args as Record<string, any>;
      } else {
        // Mark as inspected since we already have column info from schema
        inspectedTables.add(requestedTableName);
      }
    }

    let result: any;
    let executedSql: string | undefined;
    let normalizedArgs = args as Record<string, any>;

    switch (command) {
      case "Answer":
      case "FinalAnswer":
        result = normalizedAnswer;
        break;
      case "NarrativeAnswer":
        result = {
          narrative: rawArgs.text || rawArgs.narrative || defaultRawResult,
          highlights: rawArgs.highlights || [],
        };
        break;
      case "GetSchema":
        result = buildDatabaseSchemaDescription(tables, question);
        normalizedArgs = {};
        break;
      case "GetColumns":
        normalizedArgs = { ...rawArgs, table_name: requestedTableName };
        if ((!tables[requestedTableName] || tables[requestedTableName].columns.length === 0) && tools.loadTableSchema) {
          const loadedTable = await tools.loadTableSchema(requestedTableName);
          if (loadedTable) {
            const existingTable = tables[requestedTableName];
            tables[requestedTableName] = {
              ...(existingTable || { name: requestedTableName, rows: [], columns: [] }),
              ...loadedTable,
              rowCount: loadedTable.rowCount ?? existingTable?.rowCount,
            };
          }
        }
        inspectedTables.add(requestedTableName);
        result = buildDatabaseColumnsDescription(tables, requestedTableName);
        break;
      case "QuerySQL":
      case "ExecuteSQL": {
        const sql = getSqlFromArgs(rawArgs);
        normalizedArgs = { sql };
        if (!sql) {
          result = "ERROR: SQL command requires args.sql.";
          break;
        }

        if (!tools.executeSql) {
          result = "ERROR: Native SQL execution is not available for this database connection.";
          break;
        }

        // --- HITL: Large Operation Gate ---
        let rowCount = 0;
        let targetTableName = requestedTableName;
        if (tables[requestedTableName]?.rowCount) {
          rowCount = tables[requestedTableName].rowCount!;
        } else {
          const largeTable = Object.values(tables).find(t => t.rowCount && t.rowCount > 10000);
          if (largeTable) {
            rowCount = largeTable.rowCount!;
            targetTableName = largeTable.name;
          }
        }

        if (rowCount > 10000 && hitlController) {
          yield {
            turn,
            command: "HumanApproval",
            args: {
              prompt: `This operation runs on a large table "${targetTableName}" (${rowCount.toLocaleString()} rows). Do you want to proceed?`,
              operation: "SQL Query",
              rowCount,
              sql
            },
            result: "Waiting for user approval...",
            tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
            durationMs: Date.now() - startTime,
            isFinal: false,
            hitlKind: "approval",
            hitlPrompt: `This operation runs on a large table "${targetTableName}" (${rowCount.toLocaleString()} rows). Do you want to proceed?`,
          };

          const approved = await hitlController.waitForHuman(
            `This operation runs on a large table "${targetTableName}" (${rowCount.toLocaleString()} rows). Do you want to proceed?`,
            "approval",
            { rowCount, operation: "SQL Query", sql }
          );

          if (approved !== "approve") {
            yield {
              turn,
              command: "Error",
              args: {},
              result: "SQL query execution was rejected by the user.",
              tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
              durationMs: Date.now() - startTime,
              isFinal: true,
            };
            return;
          }
        }
        // --- End HITL ---
        const toolResult = await tools.executeSql({
          sql,
          isFinal: command === "ExecuteSQL",
        });
        const unwrapped = unwrapDatabaseExecutionResult(toolResult);
        result = command === "QuerySQL" && Array.isArray(unwrapped.rows)
          ? unwrapped.rows.slice(0, 15)
          : unwrapped.rows;
        executedSql = unwrapped.sql || sql;
        break;
      }
      case "QueryTable":
      case "ExecuteFinalQuery": {
        const normalizedTableName = requestedTableName || defaultTableName;
        const operation = typeof rawArgs.operation === "string" ? rawArgs.operation.trim() : "";
        const previousFilter = lastIntermediateFilterByTable.get(normalizedTableName);
        const operationParams = command === "ExecuteFinalQuery"
          ? carryForwardDatabaseFilter(operation, rawArgs.params || {}, previousFilter)
          : rawArgs.params || {};

        normalizedArgs = { ...rawArgs, table_name: normalizedTableName, operation, params: operationParams };

        // --- HITL: Large Operation Gate ---
        const table = tables[normalizedTableName];
        const rowCount = table?.rowCount || 0;
        if (rowCount > 10000 && hitlController) {
          yield {
            turn,
            command: "HumanApproval",
            args: {
              prompt: `This operation "${operation || 'query'}" runs on table "${normalizedTableName}" (${rowCount.toLocaleString()} rows). Do you want to proceed?`,
              operation: operation || "query",
              rowCount,
              table_name: normalizedTableName
            },
            result: "Waiting for user approval...",
            tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
            durationMs: Date.now() - startTime,
            isFinal: false,
            hitlKind: "approval",
            hitlPrompt: `This operation "${operation || 'query'}" runs on table "${normalizedTableName}" (${rowCount.toLocaleString()} rows). Do you want to proceed?`,
          };

          const approved = await hitlController.waitForHuman(
            `This operation "${operation || 'query'}" runs on table "${normalizedTableName}" (${rowCount.toLocaleString()} rows). Do you want to proceed?`,
            "approval",
            { rowCount, operation: operation || "query" }
          );

          if (approved !== "approve") {
            yield {
              turn,
              command: "Error",
              args: {},
              result: `Operation "${operation || 'query'}" on table "${normalizedTableName}" was rejected by the user.`,
              tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
              durationMs: Date.now() - startTime,
              isFinal: true,
            };
            return;
          }
        }
        // --- End HITL ---

        if (tools.executeTableOperation && operation) {
          const toolResult = await tools.executeTableOperation({
            tableName: normalizedTableName,
            operation,
            params: operationParams,
            isFinal: command === "ExecuteFinalQuery",
          });
          const unwrapped = unwrapDatabaseExecutionResult(toolResult);
          result = unwrapped.rows;
          executedSql = unwrapped.sql;
        } else {
          const executed = executeDatabaseTableCommand(normalizedArgs, tables, defaultTableName);
          normalizedArgs = executed.args;
          result = command === "QueryTable" && Array.isArray(executed.result)
            ? executed.result.slice(0, 20)
            : executed.result;
        }
        if (command === "QueryTable" && Array.isArray(result)) {
          result = result.slice(0, 20);
        }
        if (command === "QueryTable") {
          const carriableFilter = getCarriableDatabaseFilter(operation, operationParams);
          if (carriableFilter) {
            lastIntermediateFilterByTable.set(normalizedTableName, carriableFilter);
          }
        }
        break;
      }
      default:
        result = `ERROR: Unknown command '${command}'`;
    }

    const answerText = command === "NarrativeAnswer"
      ? (rawArgs.text || rawArgs.narrative || defaultRawResult)
      : (typeof result === "string" ? result : JSON.stringify(result));
    const clarificationOptions = mergeClarificationOptions(answerText, rawArgs);
    const isClarification = !isGreetingQuery(question) && isClarificationAnswer(command, answerText, rawArgs);

    if (isClarification && hitlController) {
      yield {
        turn,
        command: "HumanClarification",
        args: { prompt: answerText, options: clarificationOptions },
        result: "Waiting for user clarification...",
        tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
        durationMs: Date.now() - startTime,
        isFinal: false,
        hitlKind: "clarification",
        hitlPrompt: answerText,
      };

      const userReply = await hitlController.waitForHuman(answerText, "clarification", {
        options: clarificationOptions,
      });
      if (userReply && userReply.trim() && userReply !== "reject" && userReply !== "cancel") {
        llmInput = `User clarification: "${userReply}". Please use this clarification to proceed and execute the correct query.`;
        continue;
      } else {
        yield {
          turn,
          command: "Error",
          args: {},
          result: "Query was cancelled by the user.",
          tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
          durationMs: Date.now() - startTime,
          isFinal: true,
        };
        return;
      }
    }

    const isFinal =
      command === "ExecuteFinalQuery" ||
      command === "ExecuteSQL" ||
      command === "Answer" ||
      command === "FinalAnswer" ||
      command === "NarrativeAnswer";

    yield {
      turn,
      command,
      args: normalizedArgs,
      result,
      sql: executedSql,
      tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
      durationMs: Date.now() - startTime,
      isFinal,
    };

    if (isFinal) return;
    
    // Smart guidance for empty identifier searches
    let guidance = `Result: ${formatResultForModel(result)}`;
    if (isIdentifierQuery && command === "ExecuteFinalQuery" && 
        ((Array.isArray(result) && result.length === 0) || 
         (typeof result === "object" && result.rowCount === 0))) {
      guidance += `\n\nThe identifier was not found in ${requestedTableName}. Try searching in other available tables using GetSchema and ExecuteFinalQuery on likely tables.`;
    }
    
    llmInput = guidance;
  }

  // Smart fallback: try to synthesize an answer from gathered intermediate results
  const gatheredResults: any[] = [];
  // (We don't have direct access to prior steps here, but the history contains result feedback)
  // Extract last meaningful result from conversation history
  const lastUserMessage = history.length >= 2 ? history[history.length - 2]?.content : "";
  const lastResultMatch = lastUserMessage?.match(/^Result:\s*(.+)/s);
  if (lastResultMatch) {
    try {
      const lastResult = JSON.parse(lastResultMatch[1].replace(/\.\.\. \(truncated\)$/, ""));
      if (lastResult && (Array.isArray(lastResult) ? lastResult.length > 0 : Object.keys(lastResult).length > 0)) {
        yield {
          turn,
          command: "ExecuteFinalQuery",
          args: {},
          result: lastResult,
          tokens: { input: 0, output: 0 },
          durationMs: 0,
          isFinal: true,
        };
        return;
      }
    } catch { /* Not valid JSON, fall through to MaxTurnsReached */ }
  }

  yield {
    turn,
    command: "MaxTurnsReached",
    args: {},
    result: "Agent reached maximum turns without a final answer. Try breaking your question into smaller, simpler parts.",
    tokens: { input: 0, output: 0 },
    durationMs: 0,
    isFinal: true,
  };
}

export async function* runLegacyAgent(
  question: string,
  sheets: WorkbookSheets,
  selectedSheetName: string,
  provider: Provider,
  model: string,
  apiKey: string,
  temperature: number,
  maxTokens: number,
  systemPromptOverride?: string,
  conversationHistory?: ConversationContext[],
  providerOptions: LLMProviderOptions = {},
  hitlController?: HitlController
): AsyncGenerator<AgentStep> {
  const defaultSheetName = resolveDefaultSheetName(sheets, selectedSheetName);
  if (!defaultSheetName) {
    yield {
      turn: 1,
      command: "Error",
      args: {},
      result: "No sheets are available for querying.",
      tokens: { input: 0, output: 0 },
      durationMs: 0,
      isFinal: true,
    };
    return;
  }

  const history: { role: string; content: string }[] = [];
  const prompt = systemPromptOverride || DEFAULT_AGENT_PROMPT;
  const maxTurns = 12;
  const lastIntermediateRowsBySheet = new Map<string, Record<string, any>[]>();
  const lastIntermediateFilterBySheet = new Map<string, { operation: string; params: Record<string, any> }>();
  let turn = 0;

  const introParts = [
    `Question: ${question}`,
    `Current selected sheet: "${defaultSheetName}"`,
    `Available sheet count: ${Object.keys(sheets).length}`,
  ];

  if (conversationHistory && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-3).map((entry, index) =>
      `Q${index + 1}: ${entry.question}\nA${index + 1}: ${typeof entry.answer === "string" ? entry.answer : JSON.stringify(entry.answer).slice(0, 300)}`
    );
    introParts.push(`Recent conversation:\n${recent.join("\n")}`);
  }

  introParts.push("Respond with one JSON command only.");
  let llmInput = introParts.join("\n\n");

  while (turn < maxTurns) {
    turn++;
    const startTime = Date.now();
    history.push({ role: "user", content: llmInput });

    let llmResponse: LLMResponse;
    try {
      llmResponse = await callLLM(provider, model, apiKey, history, prompt, temperature, maxTokens, providerOptions);
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

    history.push({ role: "assistant", content: llmResponse.content });

    let parsed = parseCommand(llmResponse.content);
    if (!parsed) {
      yield {
        turn,
        command: "PARSE_ERROR",
        args: {},
        result: "Could not parse command, retrying...",
        tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
        durationMs: Date.now() - startTime,
        isFinal: false,
      };
      llmInput = "Invalid response. Reply ONLY with a JSON command object.";
      continue;
    }

    const requestedSheetName =
      typeof parsed.args?.sheet_name === "string" && parsed.args.sheet_name.trim()
        ? parsed.args.sheet_name.trim()
        : defaultSheetName;
    const repairSheet = sheets[requestedSheetName] || sheets[defaultSheetName];
    parsed = repairLegacyCommandForQuestion(parsed, question, repairSheet);

    let { command, args = {} } = parsed;
    args = args || {};
    let result: any;
    let normalizedArgs = args as Record<string, any>;
    const rawArgs = args as Record<string, any>;
    const defaultRawResult = llmResponse.content;
    const answerPayload = rawArgs.value !== undefined ? rawArgs.value : (Object.keys(rawArgs).length > 0 ? rawArgs : defaultRawResult);
    const normalizedAnswer =
      typeof answerPayload === "string" && !answerPayload.trim()
        ? defaultRawResult?.trim() || "No result returned from the model."
        : answerPayload;

    switch (command) {
      case "Answer":
      case "FinalAnswer":
        result = normalizedAnswer;
        break;
      case "NarrativeAnswer":
        result = {
          narrative: rawArgs.text || rawArgs.narrative || defaultRawResult,
          highlights: rawArgs.highlights || [],
        };
        break;
      case "GetSheetDescription":
        result = buildSheetDescription(sheets);
        normalizedArgs = {};
        break;
      case "GetColumns": {
        const requestedSheetName = typeof rawArgs.sheet_name === "string" && rawArgs.sheet_name.trim()
          ? rawArgs.sheet_name.trim()
          : defaultSheetName;
        normalizedArgs = { ...rawArgs, sheet_name: requestedSheetName };
        result = buildColumnsDescription(sheets, requestedSheetName);
        break;
      }
      case "QuerySheet":
      case "ExecuteFinalQuery": {
        const requestedSheetName = typeof rawArgs.sheet_name === "string" && rawArgs.sheet_name.trim()
          ? rawArgs.sheet_name.trim()
          : defaultSheetName;
        const operation = typeof rawArgs.operation === "string" ? rawArgs.operation.trim() : "";
        const previousFilter = lastIntermediateFilterBySheet.get(requestedSheetName);
        const operationParams = command === "ExecuteFinalQuery"
          ? carryForwardSheetFilter(operation, rawArgs.params || {}, previousFilter)
          : rawArgs.params || {};
        const commandArgs = operation
          ? { ...rawArgs, sheet_name: requestedSheetName, operation, params: operationParams }
          : { ...rawArgs, sheet_name: requestedSheetName };
        const previousRows = lastIntermediateRowsBySheet.get(requestedSheetName);
        const isRealSheet = Boolean(sheets[requestedSheetName]);
        const sourceRows =
          (command === "ExecuteFinalQuery" && operation && canRunOnPreviousSheetRows(operation, operationParams, previousRows))
          || (!isRealSheet && previousRows)
          ? previousRows
          : undefined;

        // --- HITL: Large Operation Gate ---
        const sheet = sheets[requestedSheetName] || sheets[defaultSheetName];
        const rowCount = sheet?.rows?.length || 0;
        if (rowCount > 10000 && hitlController) {
          yield {
            turn,
            command: "HumanApproval",
            args: {
              prompt: `This operation "${operation || 'query'}" runs on sheet "${requestedSheetName}" (${rowCount.toLocaleString()} rows). Do you want to proceed?`,
              operation: operation || "query",
              rowCount,
              sheet_name: requestedSheetName
            },
            result: "Waiting for user approval...",
            tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
            durationMs: Date.now() - startTime,
            isFinal: false,
            hitlKind: "approval",
            hitlPrompt: `This operation "${operation || 'query'}" runs on sheet "${requestedSheetName}" (${rowCount.toLocaleString()} rows). Do you want to proceed?`,
          };

          const approved = await hitlController.waitForHuman(
            `This operation "${operation || 'query'}" runs on sheet "${requestedSheetName}" (${rowCount.toLocaleString()} rows). Do you want to proceed?`,
            "approval",
            { rowCount, operation: operation || "query" }
          );

          if (approved !== "approve") {
            yield {
              turn,
              command: "Error",
              args: {},
              result: `Operation "${operation || 'query'}" on sheet "${requestedSheetName}" was rejected by the user.`,
              tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
              durationMs: Date.now() - startTime,
              isFinal: true,
            };
            return;
          }
        }
        // --- End HITL ---

        const executed = executeSheetCommand(commandArgs, sheets, defaultSheetName, sourceRows);
        normalizedArgs = executed.args;
        result = command === "QuerySheet" && Array.isArray(executed.result)
          ? executed.result.slice(0, 20)
          : executed.result;
        if (command === "QuerySheet") {
          if (Array.isArray(executed.result)) {
            lastIntermediateRowsBySheet.set(requestedSheetName, executed.result);
          }

          const carriableFilter = getCarriableSheetFilter(operation, operationParams);
          if (carriableFilter) {
            lastIntermediateFilterBySheet.set(requestedSheetName, carriableFilter);
          }
        }
        break;
      }
      default:
        result = `ERROR: Unknown command '${command}'`;
    }

    const answerText = command === "NarrativeAnswer"
      ? (rawArgs.text || rawArgs.narrative || defaultRawResult)
      : (typeof result === "string" ? result : JSON.stringify(result));
    const clarificationOptions = mergeClarificationOptions(answerText, rawArgs);
    const isClarification = !isGreetingQuery(question) && isClarificationAnswer(command, answerText, rawArgs);

    if (isClarification && hitlController) {
      yield {
        turn,
        command: "HumanClarification",
        args: { prompt: answerText, options: clarificationOptions },
        result: "Waiting for user clarification...",
        tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
        durationMs: Date.now() - startTime,
        isFinal: false,
        hitlKind: "clarification",
        hitlPrompt: answerText,
      };

      const userReply = await hitlController.waitForHuman(answerText, "clarification", {
        options: clarificationOptions,
      });
      if (userReply && userReply.trim() && userReply !== "reject" && userReply !== "cancel") {
        llmInput = `User clarification: "${userReply}". Please use this clarification to proceed and execute the correct query.`;
        continue;
      } else {
        yield {
          turn,
          command: "Error",
          args: {},
          result: "Query was cancelled by the user.",
          tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
          durationMs: Date.now() - startTime,
          isFinal: true,
        };
        return;
      }
    }

    const isFinal =
      command === "ExecuteFinalQuery" ||
      command === "Answer" ||
      command === "FinalAnswer" ||
      command === "NarrativeAnswer";

    yield {
      turn,
      command,
      args: normalizedArgs,
      result,
      tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
      durationMs: Date.now() - startTime,
      isFinal,
    };

    if (isFinal) return;
    llmInput = `Result: ${formatResultForModel(result)}`;
  }

  // Smart fallback: try to return the last intermediate result as an answer
  const lastUserMsg = history.length >= 2 ? history[history.length - 2]?.content : "";
  const lastResMatch = lastUserMsg?.match(/^Result:\s*(.+)/s);
  if (lastResMatch) {
    try {
      const lastRes = JSON.parse(lastResMatch[1].replace(/\.\.\. \(truncated\)$/, ""));
      if (lastRes && (Array.isArray(lastRes) ? lastRes.length > 0 : Object.keys(lastRes).length > 0)) {
        yield {
          turn,
          command: "ExecuteFinalQuery",
          args: {},
          result: lastRes,
          tokens: { input: 0, output: 0 },
          durationMs: 0,
          isFinal: true,
        };
        return;
      }
    } catch { /* Not valid JSON, fall through */ }
  }

  yield {
    turn,
    command: "MaxTurnsReached",
    args: {},
    result: "Agent reached maximum turns without a final answer. Try breaking your question into smaller, simpler parts.",
    tokens: { input: 0, output: 0 },
    durationMs: 0,
    isFinal: true,
  };
}
