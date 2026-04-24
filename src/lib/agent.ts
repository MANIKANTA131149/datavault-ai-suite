import { callLLM, type Provider, type LLMProviderOptions, type LLMResponse } from "./llm-client";
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

export interface ConversationContext {
  question: string;
  answer: any;
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
  YES → Answer with one concise clarification question. Do not guess.

Step 4: Does the question need ONE supported operation to produce the final answer?
  YES → ExecuteFinalQuery with the right operation.

Step 5: Does the question require aggregation first and then interpretation, comparison, ranking, ratio, percentage, change, or explanation?
  YES → QuerySheet first. On the next turn, use Answer to interpret the returned result, or ExecuteFinalQuery only if another full-data operation is truly needed.

Step 6: Is sheet info missing entirely?
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

Q: "Show sales"
A: {"command":"Answer","args":{"value":"Do you want total sales, sales by a category, or sales over time?"}}

═══════════════════════════════════════════════════════
STRICT RULES — NEVER VIOLATE
═══════════════════════════════════════════════════════

✅ Output ONLY valid JSON — no prose, no markdown, no explanation
✅ Use EXACT column names from the schema
✅ Call GetColumns before QuerySheet or ExecuteFinalQuery if the current turn has not already shown the schema
✅ Use ExecuteFinalQuery when one supported operation fully answers the question
✅ Use QuerySheet when the answer requires interpreting an intermediate result
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
      const sorted = [...data].sort((a, b) => {
        const av = a[column], bv = b[column];
        if (av == null) return 1;
        if (bv == null) return -1;
        return order === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
      });
      return limit ? sorted.slice(0, limit) : sorted;
    }
    case "groupby": {
      const { groupColumn, aggColumn, aggFunction, filter: filterParam, transformColumn, transformFunction, removeOutliers, removeNulls = true, limit, order = "desc" } = params;
      const aggregateKey = String(aggFunction || "count");
      
      // Step 1: Remove null values from BOTH groupColumn and aggColumn if requested (enabled by default)
      let filtered = data;
      if (removeNulls) {
        filtered = data.filter((row) => {
          // Remove rows where groupColumn is null/empty
          const groupVal = row[groupColumn];
          if (groupVal == null || groupVal === "") return false;
          
          // Remove rows where aggColumn is null/empty/NaN
          if (aggColumn) {
            const aggVal = row[aggColumn];
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
        if (!aggColumn) return true;
        const val = row[aggColumn];
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
        const key = String(row[groupColumn] ?? "null");
        if (!groups[key]) groups[key] = [];
        if (aggregateKey === "count") {
          groups[key].push(1);
        } else if ((aggregateKey === "count_distinct" || aggregateKey === "distinct_count") && aggColumn) {
          groups[key].push(row[aggColumn]);
        } else if (aggColumn) {
          const val = Number(row[aggColumn]);
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
      const values = data.map((row) => row[column]).filter((value) => value != null && value !== "");
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

      const filtered = filterParam ? executeOperation(data, "filter", filterParam) : data;
      const resolvedDelimiter =
        typeof delimiter === "string" && delimiter
          ? delimiter
          : detectMultiValueTextProfile(getColumnValues(filtered, column), column)?.delimiter || ",";

      const counts = new Map<string, { label: string; count: number }>();
      for (const row of filtered) {
        const parts = splitDelimitedText(row[column], resolvedDelimiter);
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
      const { columns, limit = 50 } = params;
      return data.slice(0, limit).map((row) => {
        const obj: Record<string, any> = {};
        for (const c of columns) obj[c] = row[c];
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
          const val = row[column];
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
      return data.map((row) => {
        const newRow = { ...row };
        const val = row[column];
        
        // Skip null/empty values if requested
        if (skipNulls && (val == null || val === "")) {
          return newRow;
        }
        
        if (func === "extract_number") {
          const match = String(val).match(/(\d+(?:\.\d+)?)/);
          newRow[column] = match ? Number(match[1]) : NaN;
        } else if (func === "to_lower") {
          newRow[column] = String(val).toLowerCase();
        } else if (func === "to_upper") {
          newRow[column] = String(val).toUpperCase();
        } else if (func === "trim") {
          newRow[column] = String(val).trim();
        }
        return newRow;
      });
    }
    case "unique": {
      const vals = [...new Set(data.map((r) => r[params.column]))];
      return vals.map((v) => ({ [params.column]: v }));
    }
    case "count":
      return { result: data.length };

    case "percentile": {
      const { column, percentiles = [25, 50, 75] } = params;
      const nums = data.map((r) => Number(r[column])).filter((n) => !isNaN(n)).sort((a, b) => a - b);
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
      const pairs = data
        .map((r) => [Number(r[column1]), Number(r[column2])])
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
      const groups: Record<string, Record<string, any>[]> = {};
      for (const row of data) {
        const key = String(row[groupColumn] ?? "null");
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      }
      const result: Record<string, any>[] = [];
      for (const [group, rows] of Object.entries(groups)) {
        const sorted = rows.sort((a, b) =>
          order === "desc" ? (b[rankColumn] ?? 0) - (a[rankColumn] ?? 0) : (a[rankColumn] ?? 0) - (b[rankColumn] ?? 0)
        );
        for (const row of sorted.slice(0, n)) {
          result.push({ _group: group, ...row });
        }
      }
      return result;
    }

    case "date_trunc": {
      const { dateColumn, period = "month", aggColumn, aggFunction = "count" } = params;
      const buckets: Record<string, number[]> = {};
      for (const row of data) {
        const raw = row[dateColumn];
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
        if (aggColumn) buckets[key].push(Number(row[aggColumn]) || 0);
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
      const nums = data.map((r, i) => ({ index: i, value: Number(r[column]), row: r }))
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
      const nums = data.map((r, i) => ({ index: i, value: Number(r[column]), row: r }))
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
          const v = row[f.column];
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
      const pivot: Record<string, Record<string, number[]>> = {};
      const allCols = new Set<string>();

      for (const row of data) {
        const rKey = String(row[rowColumn] ?? "null");
        const cKey = String(row[colColumn] ?? "null");
        allCols.add(cKey);
        if (!pivot[rKey]) pivot[rKey] = {};
        if (!pivot[rKey][cKey]) pivot[rKey][cKey] = [];
        pivot[rKey][cKey].push(Number(row[valueColumn]) || 0);
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
  const maxTurns = 6;

  // ── Pre-process question for better LLM comprehension ──
  const normalizedQuestion = normalizeQuestion(question, sheetData.columns);
  const intentHint = classifyIntent(normalizedQuestion);
  const columnHints = buildColumnHints(normalizedQuestion, sheetData.columns);

  // ── Conversational history context ──
  let contextBlock = "";
  if (conversationHistory && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-5);
    contextBlock = "\n\nPrior conversation (use for follow-up context):\n" +
      recent.map((c, i) =>
        `  Q${i + 1}: ${c.question}\n  A${i + 1}: ${typeof c.answer === "string" ? c.answer : JSON.stringify(c.answer).slice(0, 300)}`
      ).join("\n");
  }

  // ── Build the enriched first user message ──
  const firstMessage = [
    `Dataset: ${sheetData.rows.length} rows × ${sheetData.columns.length} columns`,
    `\nThe schema is available through GetColumns. Call GetColumns before writing QuerySheet or ExecuteFinalQuery.`,
    contextBlock,
    `\nQuestion: "${normalizedQuestion}"`,
    intentHint,
    columnHints,
    `\n\nRespond with a single JSON command only. No prose. No explanation.`,
  ].filter(Boolean).join("");

  messages.push({ role: "user", content: firstMessage });
  let schemaInspected = false;

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
      case "ExecuteFinalQuery":
        result = executeOperation(sheetData.rows, args.operation, args.params || {});
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
        `\nNow issue ExecuteFinalQuery or Answer to complete answering: "${normalizedQuestion}"`,
        `\nDo NOT issue more intermediate steps unless strictly necessary.`,
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

const DEFAULT_AGENT_PROMPT = `You are a data analyst agent. Work one step at a time and request only the information you need.

You have access to these commands:

1. GetSheetDescription()
   Returns all sheet names, row counts, and column lists.

2. GetColumns(sheet_name)
   Returns detailed column info and sample values for a sheet.

3. QuerySheet(sheet_name, operation, params)
   Runs one intermediate data operation on a sheet.

4. ExecuteFinalQuery(sheet_name, operation, params)
   Runs the final data operation that answers the question.

5. Answer(value)
   Use only for clarification questions or schema-only final answers.

For backward compatibility, QuerySheet and ExecuteFinalQuery may also use pandas_query instead of operation/params.
Prefer operation/params unless the user or custom prompt explicitly relies on pandas_query.

Supported operations:
- count {}
- head {"n": 10}
- filter {"column":"col","operator":"==|!=|>|<|>=|<=|contains|starts_with|ends_with|is_null|not_null","value":X}
- multi_filter {"filters":[...],"logic":"AND|OR"}
- sort {"column":"col","order":"asc|desc","limit":N}
- select {"columns":["col1","col2"],"limit":N}
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

Rules:
- If you are unsure which sheet to use, call GetSheetDescription first.
- Call GetColumns before writing a query on a sheet you have not inspected yet.
- Use exact column names from the returned schema.
- If GetColumns says a column contains delimited lists/tags/names inside one cell, use split_frequency to count the individual items.
- Do not group by or aggregate the whole cell when the question is about items inside a multi-value text column.
- Use QuerySheet for intermediate work and ExecuteFinalQuery only for the final answer.
- Respond with exactly one JSON object and no extra text.

Examples:
{"command":"GetSheetDescription","args":{}}
{"command":"GetColumns","args":{"sheet_name":"sales"}}
{"command":"QuerySheet","args":{"sheet_name":"sales","operation":"groupby","params":{"groupColumn":"region","aggColumn":"amount","aggFunction":"sum"}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"sales","operation":"aggregate","params":{"column":"amount","function":"sum"}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"titles","operation":"split_frequency","params":{"column":"cast","delimiter":",","limit":10,"order":"desc"}}}`;

function resolveDefaultSheetName(sheets: WorkbookSheets, selectedSheetName: string) {
  if (selectedSheetName && sheets[selectedSheetName]) return selectedSheetName;
  return Object.keys(sheets)[0] || "";
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

function formatResultForModel(result: any) {
  const preview = Array.isArray(result) ? result.slice(0, 20) : result;
  const serialized = typeof preview === "string" ? preview : JSON.stringify(preview);
  return serialized.length > 4000 ? `${serialized.slice(0, 4000)}... (truncated)` : serialized;
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

function executeSheetCommand(args: Record<string, any>, sheets: WorkbookSheets, defaultSheetName: string) {
  const requestedSheetName = typeof args.sheet_name === "string" && args.sheet_name.trim()
    ? args.sheet_name.trim()
    : defaultSheetName;

  const sheet = sheets[requestedSheetName];
  if (!sheet) {
    return {
      args: { ...args, sheet_name: requestedSheetName },
      result: `ERROR: Sheet '${requestedSheetName}' not found. Available: ${Object.keys(sheets).join(", ")}`,
    };
  }

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
      result: executeOperation(sheet.rows, translated.operation, translated.params),
    };
  }

  if (typeof args.operation !== "string" || !args.operation.trim()) {
    return {
      args: { ...args, sheet_name: requestedSheetName },
      result: "QUERY_ERROR: Missing operation or pandas_query.",
    };
  }

  return {
    args: { ...args, sheet_name: requestedSheetName },
    result: executeOperation(sheet.rows, args.operation, args.params || {}),
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
  providerOptions: LLMProviderOptions = {}
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
  const maxTurns = 8;
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
        const executed = executeSheetCommand(rawArgs, sheets, defaultSheetName);
        normalizedArgs = executed.args;
        result = command === "QuerySheet" && Array.isArray(executed.result)
          ? executed.result.slice(0, 20)
          : executed.result;
        break;
      }
      default:
        result = `ERROR: Unknown command '${command}'`;
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
