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
              OR use value_column to compare row[column] against another column's value: {"column":"col","operator":">","value_column":"avg_col","multiplier":1.5}
              IMPORTANT: When comparing against a per-row column (e.g. after lookup_sheets adds an AvgQuantity column), ALWAYS use value_column — NEVER put a column name as "value" (that compares against the literal string).
sort          {"column":"col","order":"asc|desc","limit":N}
remove_nulls  {"column":"col"} or {} to remove all null rows
groupby       {"groupColumn":"col","aggColumn":"col2","aggFunction":"sum|count|count_distinct|mean|min|max","limit":N,"order":"desc|asc","having":{"operator":">","value":N},"filter":{optional},"transformColumn":{optional},"transformFunction":{optional},"removeOutliers":{optional},"removeNulls":{true|false}}
              OUTPUT COLUMNS: groupby outputs (1) groupColumn as-is, (2) aggregated value as "<aggColumn>_<aggFunction>" (e.g. aggColumn="Sales", aggFunction="sum" → "Sales_sum"). Use "having" to filter on the aggregate WITHIN groupby instead of a downstream filter step — this avoids column-loss in pipelines. Example: having:{"operator":">","value":1} keeps only groups where the aggregate > 1.
groupby_multi {"groupColumn":"col","aggregations":[{"column":"col2","function":"count_distinct","alias":"cat_count"},{"column":"col3","function":"sum","alias":"total_rev"}],"having":{"alias":"cat_count","operator":">","value":1},"limit":N,"order":"desc|asc"}
              *** MANDATORY *** USE groupby_multi — NEVER chain multiple groupby steps in a pipeline.
              WHY: After the first groupby, ALL original columns are DESTROYED. Only groupColumn and the ONE aggregate column survive.
              Chaining a second groupby on destroyed data = 0 rows ALWAYS.
              RULE: Any time you need (A) filter by one aggregate (e.g. count_distinct > 1) AND (B) compute another aggregate (e.g. sum) grouped by the SAME column → you MUST use ONE groupby_multi call, NOT two groupby steps.
              WRONG (always returns 0 rows):
                pipeline: [groupby(CustomerID/Category/count_distinct, having>1), groupby(CustomerID/TotalAmount/sum)]
              CORRECT:
                groupby_multi: {groupColumn:"CustomerID", aggregations:[{column:"Category",function:"count_distinct",alias:"cat_count"},{column:"TotalAmount",function:"sum",alias:"total_revenue"}], having:{alias:"cat_count",operator:">",value:1}}
              AGGREGATION FUNCTIONS: count, count_distinct, sum, mean, min, max, first, last.
              For STRING columns (status, category, name): use "first" to carry the value through, or "count_distinct" to count unique values. "max"/"min" on strings does lexicographic comparison.
              EXAMPLE (string column carry-through): {column:"InventoryStatus",function:"first",alias:"Status"} — carries the status string through the groupby so you can filter on it afterward.
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

FORECASTING / FUTURE ANALYSIS (never refuse these)
  "forecast / predict / projection / next month / next year / future / expected / estimate ahead" →
    Step 1: date_trunc to aggregate the metric per period (month/quarter/year) — this builds the historical series.
    Step 2: universal_compute with a JS snippet that fits a simple linear regression (least squares) over the
            period index vs metric value and extrapolates the requested number of future periods.
    Example code body:
      "const pts = data.map((r,i)=>({x:i, y:Number(r.value ?? Object.values(r)[1])})).filter(p=>Number.isFinite(p.y));
       const n = pts.length; const sx = pts.reduce((s,p)=>s+p.x,0), sy = pts.reduce((s,p)=>s+p.y,0);
       const sxy = pts.reduce((s,p)=>s+p.x*p.y,0), sxx = pts.reduce((s,p)=>s+p.x*p.x,0);
       const slope = (n*sxy - sx*sy) / (n*sxx - sx*sx || 1); const intercept = (sy - slope*sx) / n;
       const k = 3; // number of future periods requested
       return Array.from({length:k},(_,j)=>({ period: 'future+' + (j+1), forecast: Math.round((intercept + slope*(n+j))*100)/100 }));"
    Step 3: In the final answer, clearly label the values as a linear-trend projection based on historical data —
            not a guarantee. Mention the trend direction (growing/declining) and the per-period rate of change.
  RULE: For "will X grow?", "what will Y be in 2027?", "expected sales next quarter" — same recipe.
        If the data has no usable date column, use the row order as the time axis and say so in the answer.

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

Q: "What is the highest revenue product?" (return full row — all columns)
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

Q: "Which employee has the highest and lowest salary?" (multi-part → use multi_analysis to return full rows)
A: {"command":"ExecuteFinalQuery","args":{"operation":"multi_analysis","params":{"operations":[{"name":"highest_salary","operation":"sort","params":{"column":"salary","order":"desc","limit":1}},{"name":"lowest_salary","operation":"sort","params":{"column":"salary","order":"asc","limit":1}}]}}}

Q: "Analyze the employee data" or "Give me a complete analysis" (broad analysis → multiple QuerySheet then Answer)
Turn 1: {"command":"QuerySheet","args":{"operation":"count","params":{}}}
Turn 2: {"command":"QuerySheet","args":{"operation":"aggregate","params":{"column":"salary","function":"mean"}}}
Turn 3: {"command":"QuerySheet","args":{"operation":"groupby","params":{"groupColumn":"department","aggColumn":"salary","aggFunction":"mean"}}}
Turn 4: {"command":"Answer","args":{"value":"Dataset has N records. Average salary is $X. Department breakdown: ..."}} (combines all)

Q: "Show sales"
A: {"command":"Answer","args":{"value":"Do you want total sales, sales by a category, or sales over time?"}}

Q: "Which employee is good?" (subjective adjective with no measurable metric → ALWAYS clarify, never guess)
A: {"command":"Answer","args":{"value":"\"Good\" needs a specific metric. What should I use to decide who is good?","options":["Highest Salary","Highest Score","Most Senior","Most Recent Joiner","Highest Rating"]}}

Q: "Which employee is bad?" (same pattern — subjective quality word without metric → clarify, do NOT filter or guess)
A: {"command":"Answer","args":{"value":"\"Bad\" needs a specific metric. What should I use to decide who is bad?","options":["Lowest Salary","Lowest Score","Least Senior","Lowest Rating","Lowest Performance"]}}

Q: "Who is the worst employee?" (subjective ranking without a metric column stated → clarify)
A: {"command":"Answer","args":{"value":"\"Worst\" by which measure?","options":["Lowest Salary","Lowest Score","Lowest Rating","Least Projects","Least Senior"]}}

═══════════════════════════════════════════════════════
STRICT RULES — NEVER VIOLATE
═══════════════════════════════════════════════════════

✅ You have FULL READ-ACCESS to all tables/sheets in the workbook/database. You can perform ANY supported operation, filtering, sorting, pipeline, or search to retrieve the results. Never state that you cannot access the data or refuse a query.
✅ Be completely dynamic: combine filters, groupbys, and transformations freely to answer the user's natural language question accurately based on the data.
✅ Output ONLY valid JSON — no prose, no markdown, no explanation
✅ Use EXACT column names from the schema
✅ Call GetColumns before QuerySheet or ExecuteFinalQuery if the current turn has not already shown the schema
✅ Use ExecuteFinalQuery when one supported operation fully answers the question. If the user expects a list, table, or rows of data, ALWAYS use ExecuteFinalQuery.
✅ Use QuerySheet when the answer requires interpreting an intermediate result.
✅ When the user asks for MULTIPLE things (e.g. "highest AND lowest", "analyze", "summary", "compare", "statistics"), prefer using the "multi_analysis" operation to execute all parts in a single turn, OR use separate QuerySheet operations for sequential multi-turn evaluation, then combine all results in a final Answer.
✅ Use Answer only for metadata, clarification questions, and final text-only calculations, but NEVER to wrap tabular results (rows) in a text message. If the question expects a table or row-list, ALWAYS return it using ExecuteFinalQuery.
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
✅ When returning a row result (ranked record, filtered rows, top/bottom entity), return ALL columns from the schema — do NOT use a select step to strip them down. Only use select to restrict columns when the user explicitly asks for specific fields (e.g. "show only name and salary").
❌ NEVER output text outside of JSON
❌ NEVER invent column names not in the schema
❌ Do not use ExecuteFinalQuery for ambiguous requests that need clarification
❌ Do not use QuerySheet when a single ExecuteFinalQuery operation fully answers the question
❌ Do not skip schema inspection before writing a query
❌ NEVER interpret subjective quality words (good, bad, great, poor, excellent, terrible, strong, weak, successful, unsuccessful, effective, ineffective, productive, unproductive) as a data operation. These words are inherently ambiguous — ALWAYS respond with an Answer clarification question that lists 2–6 concrete metric options from the schema. Do NOT filter, sort, or guess based on prior conversation context.

═══════════════════════════════════════════════════════
UNIVERSAL COMPUTE — USE WHEN NO STANDARD OPERATION FITS
═══════════════════════════════════════════════════════

When you need a computation that doesn't map to any named operation, use:
  {"command":"ExecuteFinalQuery","args":{"operation":"universal_compute","params":{"code":"<JS body>"}}}

The code runs as: function(data) { "use strict"; <your code here> }
where data = the full array of row objects (each row is {colName: value, ...}).
Return any serializable value — a number, string, array, or object.

Examples:
  Count rows matching a custom condition:
    {"code":"return data.filter(r => r.status === 'active' && r.score > 90).length"}

  Compute ratio of two aggregates:
    {"code":"const sold=data.filter(r=>r.status==='sold').length; return {sold, total:data.length, pct:(sold/data.length*100).toFixed(1)+'%'}"}

  Multi-step custom ranking:
    {"code":"return data.map(r=>({...r, score: (+r.revenue||0)*0.6 + (+r.units||0)*0.4})).sort((a,b)=>b.score-a.score).slice(0,10)"}

  Text frequency across cells:
    {"code":"const freq={}; data.forEach(r=>{String(r.tags||'').split(',').forEach(t=>{t=t.trim();if(t)freq[t]=(freq[t]||0)+1;})}); return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([k,v])=>({tag:k,count:v}))"}

RULE: NEVER say "I cannot compute this." If no named operation fits, use universal_compute.
RULE: universal_compute is blocked from network/filesystem access — it only operates on the in-memory data array.

═══════════════════════════════════════════════════════
SELF-CORRECTION PROTOCOL (follow whenever a result is an error)
═══════════════════════════════════════════════════════
- If a tool result is an error (e.g. "Unknown operation", "Unknown column", "No numeric data"), treat it as RECOVERABLE feedback, not a dead end.
- Diagnose the cause, then immediately reissue ONE corrected command. Never apologize, never give up, never tell the user you cannot do it.
- If a column name was wrong, re-read the schema and use the EXACT name; issue GetColumns again if unsure.
- If an operation was unsupported, pick the closest SUPPORTED operation OR use universal_compute with a JS snippet.
- If a filter/value returned an error, fix the casing or broaden it. You have full read access to the entire dataset.
- Keep iterating until you produce a correct final answer. Only ask the user a clarification question when the request is genuinely ambiguous — never merely because a command failed.`;


// ─── Supported Operations Registry ────────────────────────────────────────────
// Single source of truth. Add new operations here and every system prompt
// automatically picks them up via buildOperationsBlock().
const SUPPORTED_OPERATIONS: Array<{ name: string; params: string; note?: string }> = [
  { name: "filter",           params: '{"column":"col","operator":"==|!=|>|<|>=|<=|contains|starts_with|ends_with|is_null|not_null","value":X} OR {"column":"col","operator":">","value_column":"other_col","multiplier":1.5} — use value_column to compare row[column] against row[other_col] (optionally scaled). Use this when comparing a value against a per-row computed column (e.g. after a lookup_sheets step).' },
  { name: "sort",             params: '{"column":"col","order":"asc|desc","limit":N}' },
  { name: "remove_nulls",     params: '{"column":"col"} or {} to remove all null rows' },
  { name: "groupby",          params: '{"groupColumn":"col","aggColumn":"col2","aggFunction":"sum|count|count_distinct|mean|min|max","limit":N,"order":"desc|asc","having":{"operator":">","value":N},"filter":{optional},"transformColumn":{optional},"transformFunction":{optional},"removeOutliers":{optional},"removeNulls":{true|false}}', note: 'WARNING: groupby destroys all columns except groupColumn and the ONE aggregate. NEVER chain two groupby steps — use groupby_multi instead.' },
  { name: "groupby_multi",    params: '{"groupColumn":"col","aggregations":[{"column":"col2","function":"count_distinct","alias":"alias1"},{"column":"col3","function":"sum","alias":"alias2"}],"having":{"alias":"alias1","operator":">","value":1},"limit":N,"order":"desc|asc"}', note: 'MANDATORY when you need multiple aggregations per group OR when filtering by one aggregate while computing another. NEVER chain two groupby steps — use groupby_multi instead. Supported agg functions: count, count_distinct, sum, mean, min, max, first, last. For STRING columns use "first" to carry the value through. Example: products ordered >10 times with Low Stock = groupby_multi(ProductName, [{OrderID,count,OrderCount},{InventoryStatus,first,Status}], having:{alias:OrderCount,operator:>,value:10}) then filter Status=="Low Stock".' },
  { name: "aggregate",        params: '{"column":"col","function":"sum|count|mean|min|max|median|std|variance"}' },
  { name: "select",           params: '{"columns":["col1","col2"],"limit":N}' },
  { name: "head",             params: '{"n":N}' },
  { name: "transform_column", params: '{"column":"col","function":"extract_number|to_lower|to_upper|trim","skipNulls":true}' },
  { name: "unique",           params: '{"column":"col"}' },
  { name: "count",            params: '{}' },
  { name: "percentile",       params: '{"column":"col","percentiles":[25,50,75]}' },
  { name: "correlation",      params: '{"column1":"col1","column2":"col2"}' },
  { name: "topN_groupby",     params: '{"groupColumn":"col","rankColumn":"col2","n":3,"order":"desc|asc"}' },
  { name: "date_trunc",       params: '{"dateColumn":"col","period":"day|week|month|quarter|year","aggColumn":"col2","aggFunction":"count|sum|mean"}' },
  { name: "outlier_detect",   params: '{"column":"col","method":"zscore|iqr","threshold":2}' },
  { name: "filter_outliers",  params: '{"column":"col","method":"zscore|iqr","threshold":1.5}' },
  { name: "multi_filter",     params: '{"filters":[{"column":"col","operator":"==","value":X}],"logic":"AND|OR"}' },
  { name: "pivot",            params: '{"rowColumn":"col","colColumn":"col2","valueColumn":"col3","aggFunction":"sum|count|mean"}' },
  { name: "split_frequency",  params: '{"column":"col","delimiter":",","limit":N,"order":"asc|desc","uniquePerRow":true|false}', note: "for multi-value text columns (comma/pipe/semicolon delimited)" },
  { name: "pipeline",          params: '{"operations":[{"operation":"filter","params":{...}},{"operation":"transform_column","params":{...}},...]}' },
  { name: "multi_analysis",    params: '{"operations":[{"name":"label1","operation":"groupby","params":{...}},{"name":"label2","operation":"aggregate","params":{...}}]}', note: "execute multiple independent operations in a single turn" },
  // ── Extended / escape-hatch operations ─────────────────────────────────────
  { name: "fuzzy_search",      params: '{"column":"col","query":"text","limit":20}  OR  {"query":"text"} to search all string columns', note: "partial text match, case-insensitive" },
  { name: "regex_filter",      params: '{"column":"col","pattern":"regex","flags":"i","limit":N}', note: "filter rows by regex pattern" },
  { name: "running_total",     params: '{"column":"col","sortColumn":"date","order":"asc"}', note: "cumulative sum" },
  { name: "rank",              params: '{"column":"col","order":"desc","limit":N}', note: "add rank 1..N column" },
  { name: "value_counts",      params: '{"column":"col","limit":N,"order":"desc"}', note: "alias for groupby count (pandas-style)" },
  { name: "describe",          params: '{"columns":["col1","col2"]} or {}', note: "count/mean/std/min/p25/median/p75/max for all numeric cols" },
  {
    name: "universal_compute",
    params: '{"code":"JS function body — receives data (array of row objects), must return a serializable value"}',
    note: "ESCAPE HATCH: use when no other operation fits. Write any JS computation against the data rows. Example: {\"code\":\"return data.filter(r=>r.price>1000 && /pro/i.test(r.name)).length\"}",
  },
];

function buildOperationsBlock(): string {
  return SUPPORTED_OPERATIONS
    .map((op) => `${op.name.padEnd(18)} ${op.params}${op.note ? `  ← ${op.note}` : ""}`)
    .join("\n");
}

// ─── Model Size Detector ───────────────────────────────────────────────────────
// Returns true for known small/weak models that need terse, ultra-direct prompts.
function isSmallModel(model: string): boolean {
  const m = (model || "").toLowerCase();
  return (
    m.includes("mini") ||
    m.includes("haiku") ||
    m.includes("flash") ||
    m.includes("gemma") ||
    m.includes("phi") ||
    m.includes("llama") ||
    m.includes("mistral-7b") ||
    m.includes("mixtral") ||
    m.includes("3.5-turbo") ||
    m.includes("o1-mini") ||
    m.includes("small")
  );
}

// ─── Schema-Grounded Example Generator ────────────────────────────────────────
// Generates 2-4 concrete few-shot examples using ACTUAL column names from the
// loaded dataset. This dramatically reduces column-name hallucination in small
// models because they see their own data in the examples.
function buildSchemaGroundedExamples(columns: SheetData["columns"]): string {
  const numericCols = columns.filter((c) => c.dtype === "number" || c.dtype === "float" || c.dtype === "integer");
  const catCols = columns.filter((c) => c.dtype === "string" && c.uniqueCount <= 50);
  const dateCols = columns.filter((c) => c.dtype === "date");
  const anyCols = columns;

  const examples: string[] = [];

  // Example 1: count
  examples.push(`Q: "How many records are there?"\nA: {"command":"ExecuteFinalQuery","args":{"operation":"count","params":{}}}`);

  // Example 2: groupby using real categorical + numeric columns
  if (catCols.length > 0 && numericCols.length > 0) {
    examples.push(
      `Q: "What is the total ${numericCols[0].name} by ${catCols[0].name}?"\nA: {"command":"ExecuteFinalQuery","args":{"operation":"groupby","params":{"groupColumn":"${catCols[0].name}","aggColumn":"${numericCols[0].name}","aggFunction":"sum"}}}`
    );
  }

  // Example 3: aggregate using first numeric column
  if (numericCols.length > 0) {
    examples.push(
      `Q: "What is the average ${numericCols[0].name}?"\nA: {"command":"ExecuteFinalQuery","args":{"operation":"aggregate","params":{"column":"${numericCols[0].name}","function":"mean"}}}`
    );
  }

  // Example 4: sort using first numeric column
  if (numericCols.length > 0 && anyCols.length > 0) {
    examples.push(
      `Q: "Which record has the highest ${numericCols[0].name}?"\nA: {"command":"ExecuteFinalQuery","args":{"operation":"sort","params":{"column":"${numericCols[0].name}","order":"desc","limit":1}}}`
    );
  }

  // Example 5: date_trunc if date column exists
  if (dateCols.length > 0 && numericCols.length > 0) {
    examples.push(
      `Q: "Show ${numericCols[0].name} trend by month"\nA: {"command":"ExecuteFinalQuery","args":{"operation":"date_trunc","params":{"dateColumn":"${dateCols[0].name}","period":"month","aggColumn":"${numericCols[0].name}","aggFunction":"sum"}}}`
    );
  }

  // Example 6: multi_analysis with 2 real columns
  if (numericCols.length >= 2) {
    examples.push(
      `Q: "Give me both the highest and lowest ${numericCols[0].name}"\nA: {"command":"ExecuteFinalQuery","args":{"operation":"multi_analysis","params":{"operations":[{"name":"highest","operation":"sort","params":{"column":"${numericCols[0].name}","order":"desc","limit":1}},{"name":"lowest","operation":"sort","params":{"column":"${numericCols[0].name}","order":"asc","limit":1}}]}}}`
    );
  }

  return examples.join("\n\n");
}

// ─── Runtime Schema Context Block ─────────────────────────────────────────────
// Builds a compact, structured schema block injected into the USER message.
// Putting this in the user message (not system prompt) is more reliable for
// small models that may de-prioritize long system prompts.
function buildSchemaContextBlock(sheetData: SheetData): string {
  const lines: string[] = [
    `EXACT COLUMN NAMES — use these VERBATIM (do NOT guess or paraphrase):`,
  ];
  for (const col of sheetData.columns) {
    const sample = col.sampleValues.slice(0, 3).join(", ");
    const nullNote = col.nonNullCount < sheetData.rows.length
      ? `, ${sheetData.rows.length - col.nonNullCount} nulls`
      : "";
    lines.push(`  "${col.name}" [${col.dtype}] — ${col.uniqueCount} unique${nullNote} — e.g. ${sample}`);
  }
  lines.push(`Dataset size: ${sheetData.rows.length} rows × ${sheetData.columns.length} columns`);
  return lines.join("\n");
}

// ─── Runtime-Enriched System Prompt ───────────────────────────────────────────
// Appends the live operations list (from SUPPORTED_OPERATIONS registry) and
// dataset-specific few-shot examples to the base system prompt.
// This is called at query time so the prompt always reflects the current
// operation set — no manual update needed when new ops are added.
function buildRuntimeSystemPrompt(sheetData: SheetData, basePrompt: string): string {
  const examples = buildSchemaGroundedExamples(sheetData.columns);
  const opsBlock = buildOperationsBlock();

  return `${basePrompt}

═══════════════════════════════════════════════════════
CURRENT OPERATION SET (authoritative — always up-to-date)
═══════════════════════════════════════════════════════
${opsBlock}

═══════════════════════════════════════════════════════
DATASET-SPECIFIC EXAMPLES (using YOUR actual column names)
═══════════════════════════════════════════════════════
${examples}

═══════════════════════════════════════════════════════
HARD RULE — groupby_multi IS MANDATORY
═══════════════════════════════════════════════════════
If you need BOTH: (A) filter groups by one aggregate (e.g. count_distinct > 1) AND (B) compute another aggregate (e.g. sum) for the SAME groups:
→ YOU MUST USE groupby_multi IN A SINGLE STEP.
→ NEVER chain two groupby steps in a pipeline — the first groupby destroys all original columns, so the second always returns 0 rows.

CORRECT PATTERN for "customers who bought from multiple categories + their total revenue":
{"command":"ExecuteFinalQuery","args":{"sheet_name":"cross_sheet","operation":"groupby_multi","params":{"groupColumn":"CustomerID","aggregations":[{"column":"Category","function":"count_distinct","alias":"cat_count"},{"column":"TotalAmount","function":"sum","alias":"total_revenue"}],"having":{"alias":"cat_count","operator":">","value":1}}}}

WRONG PATTERN (always returns 0 rows — FORBIDDEN):
pipeline with two groupby steps where second groupby references columns lost after first groupby.

FINAL REMINDER: output ONLY a single JSON object. Zero prose. Zero markdown. Zero explanation.`;
}

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

// ─── Subjective Query Detector ────────────────────────────────────────────────
// Catches questions using vague quality adjectives (good, bad, great, poor, etc.)
// WITHOUT a measurable metric, and forces a deterministic clarification BEFORE
// the LLM is called. This prevents small models from hallucinating random
// interpretations of subjective terms.
const PURE_SUBJECTIVE_ADJECTIVES = [
  "good", "bad", "great", "poor", "excellent", "terrible",
  "strong", "weak", "successful", "unsuccessful",
  "effective", "ineffective", "productive", "unproductive",
  "talented", "incompetent", "capable", "skilled",
];

const METRIC_SIGNAL_WORDS = [
  "salary", "revenue", "sales", "profit", "income", "earning",
  "score", "rating", "performance", "age", "experience", "tenure",
  "spend", "spending", "cost", "amount", "value", "total", "rank",
  "grade", "hours", "points", "marks", "growth", "target", "quota",
];

function detectSubjectiveQuery(
  originalQuestion: string,
  columns: SheetData["columns"]
): { prompt: string; options: string[] } | null {
  const q = originalQuestion.toLowerCase().trim();

  // Only fire when user is asking about a specific entity (which/who/what)
  if (!/\b(which|who|what)\b/i.test(q)) return null;

  // Find which subjective adjective matched
  const matchedAdj = PURE_SUBJECTIVE_ADJECTIVES.find((adj) =>
    new RegExp(`\\b${adj}\\b`, "i").test(q)
  );
  if (!matchedAdj) return null;

  // Don't fire if a concrete metric word is already in the question
  if (METRIC_SIGNAL_WORDS.some((m) => q.includes(m))) return null;

  // Don't fire if a numeric column name is directly mentioned
  const numericCols = columns.filter(
    (c) => c.dtype === "number" || c.dtype === "float" || c.dtype === "integer"
  );
  if (
    numericCols.some((c) =>
      q.includes(c.name.toLowerCase().replace(/_+/g, " "))
    )
  )
    return null;

  // Build clarification options from numeric columns (pretty labels)
  const options: string[] = numericCols.slice(0, 5).map((c) =>
    c.name.replace(/_+/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  );

  // Always ensure at least a few fallback options
  if (options.length === 0) {
    options.push("Most recent joiner", "Highest ranked", "Most experienced");
  }

  const label = matchedAdj.charAt(0).toUpperCase() + matchedAdj.slice(1);
  return {
    prompt: `"${label}" is subjective and needs a specific metric. What should I use to decide who is "${matchedAdj}"?`,
    options,
  };
}

// ─── Query Plan Classifier ─────────────────────────────────────────────────────
// Detects question intent and injects a focused hint into the prompt.
// Helps weak models pick the right operation without guessing.
function classifyIntent(question: string): string {
  const q = question.toLowerCase();

  const intents: Array<[RegExp, string]> = [
    // Subjective quality words without a metric → must ask for clarification
    [/\b(which|what|who)\b.{0,50}\b(is|are|was|were)\b.{0,20}\b(good|bad|great|poor|excellent|terrible|strong|weak|successful|unsuccessful|effective|ineffective|productive|unproductive)\b/i,
      "INTENT: subjective quality question with no metric → use Answer to ask a clarification question with 2–6 concrete metric options from the column list. Do NOT guess or execute a query."],
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

function sheetHasColumn(sheet: SheetData | undefined, columnName: string): boolean {
  if (!sheet || !sheet.columns) return false;
  const normalized = normalizeColumnName(columnName);
  return sheet.columns.some(c => normalizeColumnName(c.name) === normalized);
}

function getReferencedColumnsFromPandasQuery(pandasQuery: string): string[] {
  const columns: string[] = [];
  const matches = pandasQuery.matchAll(/['"]([^'"]+)['"]/g);
  for (const match of matches) {
    columns.push(match[1]);
  }
  return columns;
}

function repairLegacyCommandSheet(
  parsed: { command: string; args?: Record<string, any> },
  sheets: WorkbookSheets,
  defaultSheetName: string
) {
  const args = parsed.args || {};
  if (parsed.command !== "QuerySheet" && parsed.command !== "ExecuteFinalQuery") {
    return parsed;
  }

  const requestedSheetName =
    typeof args.sheet_name === "string" && args.sheet_name.trim()
      ? args.sheet_name.trim()
      : defaultSheetName;

  // Never remap virtual/cross-sheet queries — cross_sheet is a runtime workspace that
  // holds join/union results in memory; it won't be found in the sheets map by design.
  if (requestedSheetName === "cross_sheet") return parsed;

  const operation = typeof args.operation === "string" ? args.operation.trim() : "";
  let referencedColumns = getReferencedSheetColumns(operation, args.params || {});
  if (referencedColumns.length === 0 && typeof args.pandas_query === "string") {
    referencedColumns = getReferencedColumnsFromPandasQuery(args.pandas_query);
  }

  if (referencedColumns.length === 0) return parsed;

  // Check how many of the referenced columns are in the requested sheet
  const requestedSheet = sheets[requestedSheetName];
  let requestedMatchCount = 0;
  if (requestedSheet) {
    for (const col of referencedColumns) {
      if (sheetHasColumn(requestedSheet, col)) {
        requestedMatchCount++;
      }
    }
  }

  // If the requested sheet matches all referenced columns, no need to change sheet
  if (requestedMatchCount === referencedColumns.length && requestedMatchCount > 0) {
    return parsed;
  }

  // Find a sheet that matches the maximum number of referenced columns
  let bestSheetName = requestedSheetName;
  let maxMatchCount = requestedMatchCount;

  for (const [sheetName, sheet] of Object.entries(sheets)) {
    if (sheetName === requestedSheetName) continue;
    let matchCount = 0;
    for (const col of referencedColumns) {
      if (sheetHasColumn(sheet, col)) {
        matchCount++;
      }
    }
    if (matchCount > maxMatchCount) {
      maxMatchCount = matchCount;
      bestSheetName = sheetName;
    }
  }

  if (bestSheetName !== requestedSheetName) {
    return {
      ...parsed,
      args: {
        ...args,
        sheet_name: bestSheetName,
      },
    };
  }

  return parsed;
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

function looseEquals(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;

  const strA = String(a).trim().toLowerCase();
  const strB = String(b).trim().toLowerCase();

  if (strA === strB) return true;

  // Handle Gender abbreviations: male/m, female/f
  if ((strA === "male" && strB === "m") || (strA === "m" && strB === "male")) {
    return true;
  }
  if ((strA === "female" && strB === "f") || (strA === "f" && strB === "female")) {
    return true;
  }

  // Handle Yes/No to Boolean
  if ((strA === "yes" && (b === true || strB === "true")) || (strB === "yes" && (a === true || strA === "true"))) {
    return true;
  }
  if ((strA === "no" && (b === false || strB === "false")) || (strB === "no" && (a === false || strA === "false"))) {
    return true;
  }

  return false;
}

function looseCompare(a: any, b: any, operator: string): boolean {
  if (a == null || b == null) return false;

  // Attempt to parse both as numbers
  const numA = Number(String(a).replace(/,/g, ""));
  const numB = Number(String(b).replace(/,/g, ""));

  if (!isNaN(numA) && !isNaN(numB)) {
    switch (operator) {
      case ">": return numA > numB;
      case "<": return numA < numB;
      case ">=": return numA >= numB;
      case "<=": return numA <= numB;
    }
  }

  // Fallback to standard comparison
  switch (operator) {
    case ">": return a > b;
    case "<": return a < b;
    case ">=": return a >= b;
    case "<=": return a <= b;
  }

  return false;
}

// Wraps executeOperation so a malformed tool call from the model (e.g. a param
// the code expects to be an array arriving as a string/object, which would throw
// "x.filter is not a function") becomes a recoverable error result instead of
// crashing the whole run. The returned { error } feeds the self-healing loop.
function safeExecuteOperation(data: Record<string, any>[], operation: string, params: Record<string, any>, sheets?: WorkbookSheets): any {
  const noArrayRequired = new Set(["pipeline", "multi_analysis", "groupby_multi"]);
  if (!Array.isArray(data) && !noArrayRequired.has(operation)) {
    return { error: "No tabular data is available to run this operation on. Inspect the columns first with GetColumns." };
  }
  try {
    return executeOperation(data, operation, params, sheets);
  } catch (err: any) {
    console.error(`executeOperation("${operation}") failed:`, err, { params });
    return {
      error: `The "${operation}" operation could not run with the given parameters (${err?.message || String(err)}). Re-check the operation name and that each parameter has the expected type (for example "columns" and "filters" must be arrays), then try again.`,
    };
  }
}

function normalizeOperationParams(operation: string, params: any): Record<string, any> {
  if (params === null || params === undefined) return {};
  if (typeof params !== "object") return {};
  if ((operation === "multi_analysis" || operation === "pipeline") && Array.isArray(params)) return { operations: params };
  if (operation === "groupby" && params.aggFunction && typeof params.aggFunction === "object") {
    return { ...params, aggFunction: (params.aggFunction as any).function ?? "count" };
  }
  if (operation === "filter" && params.filter && !params.column) {
    return { ...params, ...params.filter, filter: undefined };
  }
  if (operation === "sort" && !params.column) {
    const col = params.orderBy ?? params.sortBy ?? params.sortColumn ?? params.order_by;
    if (col) return { ...params, column: col };
  }
  if (operation === "aggregate" && !params.aggFunction && params.function) {
    return { ...params, aggFunction: params.function };
  }
  return params as Record<string, any>;
}

const CROSS_SHEET_OPS = new Set(["join_sheets", "compare_sheets", "union_sheets", "vlookup_sheets", "lookup_sheets"]);

const OP_PARAM_KEYS: Record<string, string[]> = {
  groupby: ["groupColumn", "aggColumn", "aggFunction", "limit", "order"],
  filter: ["column", "operator", "value"],
  sort: ["column", "order", "limit"],
  aggregate: ["column", "aggFunction", "function"],
  select: ["columns", "limit"],
  join_sheets: ["sheet1", "sheet2", "key1", "key2", "joinType"],
};

function normalizeStepOp(op: any): { operation: string; params: Record<string, any> } {
  const operation = typeof op.operation === "string" ? op.operation : String(op.operation ?? "");
  let params: Record<string, any> = op.params ?? {};
  const keys = OP_PARAM_KEYS[operation];
  if (keys) {
    const hoisted: Record<string, any> = {};
    for (const k of keys) {
      if (op[k] !== undefined && params[k] === undefined) hoisted[k] = op[k];
    }
    if (Object.keys(hoisted).length > 0) params = { ...hoisted, ...params };
  }
  return { operation, params: normalizeOperationParams(operation, params) };
}

function executeOperation(data: Record<string, any>[], operation: string, params: Record<string, any>, sheets?: WorkbookSheets): any {
  params = normalizeOperationParams(operation, params);

  // Pipeline/multi_analysis manage their own data — don't require array input
  const noArrayRequired = new Set(["pipeline", "multi_analysis", "groupby_multi"]);
  if (!Array.isArray(data) && !noArrayRequired.has(operation)) {
    const preview = typeof data === "object" && data !== null
      ? JSON.stringify(data).slice(0, 200)
      : String(data);
    return { error: `Operation "${operation}" expects an array of rows but received: ${preview}. Check that previous pipeline steps returned tabular data.` };
  }

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

      const { column, operator = "==", value, value_column, multiplier } = normalizedParams;
      return data.filter((row) => {
        const actualCol = resolveColumn(row, column);
        const v = row[actualCol];
        // value_column: compare row[column] against row[value_column] (optionally scaled by multiplier)
        let resolvedValue = value;
        if (value_column) {
          const actualValCol = resolveColumn(row, value_column);
          resolvedValue = multiplier != null ? Number(row[actualValCol]) * Number(multiplier) : row[actualValCol];
        }
        switch (operator) {
          case ">": return looseCompare(v, resolvedValue, ">");
          case "<": return looseCompare(v, resolvedValue, "<");
          case ">=": return looseCompare(v, resolvedValue, ">=");
          case "<=": return looseCompare(v, resolvedValue, "<=");
          case "==": return looseEquals(v, resolvedValue);
          case "!=": return !looseEquals(v, resolvedValue);
          case "contains": return String(v).toLowerCase().includes(String(resolvedValue).toLowerCase());
          case "starts_with": return String(v).toLowerCase().startsWith(String(resolvedValue).toLowerCase());
          case "ends_with": return String(v).toLowerCase().endsWith(String(resolvedValue).toLowerCase());
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
      const { groupColumn, aggColumn, aggFunction, filter: filterParam, transformColumn, transformFunction, removeOutliers, removeNulls = true, limit, order = "desc", having } = params;
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
        // Output column name: use bare aggFunction (e.g. "sum", "mean") for backward compat.
        // The having filter below also checks both naming forms for robustness.
        const row: Record<string, string | number> = { [groupColumn]: key, [aggregateKey]: agg };
        return row;
      });

      // Apply HAVING filter on the aggregated value before sorting/limiting
      let finalResult = result;
      if (having) {
        const { operator = ">", value } = having;
        const havingVal = Number(value);
        finalResult = result.filter((row) => {
          const v = Number(row[aggregateKey] ?? 0);
          switch (operator) {
            case ">":  return v > havingVal;
            case ">=": return v >= havingVal;
            case "<":  return v < havingVal;
            case "<=": return v <= havingVal;
            case "==": case "=": return v === havingVal;
            case "!=": return v !== havingVal;
            default:   return v > havingVal;
          }
        });
      }

      // Sort by aggregate descending by default
      const sorted = finalResult.sort((a, b) => {
        const diff = Number(b[aggregateKey] ?? 0) - Number(a[aggregateKey] ?? 0);
        return order === "asc" ? -diff : diff;
      });
      return limit ? sorted.slice(0, Number(limit)) : sorted;
    }

    // groupby_multi: aggregate multiple columns per group in one pass.
    // Returns one row per group with ALL requested aggregations — no column loss.
    // params: { groupColumn, aggregations: [{column, function, alias?}], having?, limit?, order? }
    // Example: group by CustomerID, count_distinct Category AND sum TotalAmount:
    //   {"groupColumn":"CustomerID","aggregations":[{"column":"Category","function":"count_distinct","alias":"category_count"},{"column":"TotalAmount","function":"sum","alias":"total_revenue"}],"having":{"alias":"category_count","operator":">","value":1}}
    case "groupby_multi": {
      const { groupColumn, aggregations = [], having: havingMulti, limit: limitMulti, order: orderMulti = "desc" } = params;
      if (!groupColumn || !Array.isArray(aggregations) || aggregations.length === 0) {
        return { error: 'groupby_multi requires "groupColumn" and non-empty "aggregations" array.' };
      }
      const firstRow = data[0] || {};
      const actualGrpCol = resolveColumn(firstRow, groupColumn);

      // Group all rows by the group column
      const groups: Record<string, Record<string, any>[]> = {};
      for (const row of data) {
        const key = String(row[actualGrpCol] ?? "null");
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      }

      const multiResult = Object.entries(groups).map(([key, rows]) => {
        const out: Record<string, any> = { [groupColumn]: key };
        for (const agg of aggregations) {
          const col = resolveColumn(firstRow, agg.column);
          const fn = String(agg.function || "count");
          const alias = agg.alias || `${agg.column}_${fn}`;
          const vals = rows.map((r) => r[col]).filter((v) => v != null && v !== "");
          const isNumericCol = vals.length > 0 && !isNaN(Number(vals[0]));
          let aggVal: number | string;
          switch (fn) {
            case "count":          aggVal = rows.length; break;
            case "count_distinct": aggVal = new Set(vals.map(String)).size; break;
            case "sum":            aggVal = vals.reduce((s: number, v) => s + Number(v), 0); break;
            case "mean":           aggVal = vals.length ? vals.reduce((s: number, v) => s + Number(v), 0) / vals.length : 0; break;
            case "min":
              aggVal = isNumericCol
                ? Math.min(...vals.map(Number))
                : (vals.slice().sort()[0] ?? ""); // lexicographic min for strings
              break;
            case "max":
              aggVal = isNumericCol
                ? Math.max(...vals.map(Number))
                : (vals.slice().sort().reverse()[0] ?? ""); // lexicographic max for strings
              break;
            case "first": aggVal = vals[0] ?? ""; break;
            case "last":  aggVal = vals[vals.length - 1] ?? ""; break;
            default:               aggVal = rows.length;
          }
          out[alias] = aggVal;
        }
        return out;
      });

      // Apply HAVING on a named alias
      let filteredMulti = multiResult;
      if (havingMulti) {
        const { alias: havingAlias, operator: havingOp = ">", value: havingVal } = havingMulti;
        const hv = Number(havingVal);
        filteredMulti = multiResult.filter((row) => {
          const v = Number(row[havingAlias] ?? 0);
          switch (havingOp) {
            case ">":  return v > hv;
            case ">=": return v >= hv;
            case "<":  return v < hv;
            case "<=": return v <= hv;
            case "==": case "=": return v === hv;
            case "!=": return v !== hv;
            default:   return v > hv;
          }
        });
      }

      // Sort by first aggregation alias descending by default
      const sortAlias = aggregations[0]?.alias || `${aggregations[0]?.column}_${aggregations[0]?.function}`;
      const sortedMulti = filteredMulti.sort((a, b) => {
        const diff = Number(b[sortAlias] ?? 0) - Number(a[sortAlias] ?? 0);
        return orderMulti === "asc" ? -diff : diff;
      });
      return limitMulti ? sortedMulti.slice(0, Number(limitMulti)) : sortedMulti;
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
      // The model occasionally returns `columns` as a single string instead of
      // an array; coerce so iteration never throws.
      const selectCols = Array.isArray(columns)
        ? columns
        : typeof columns === "string" && columns.trim()
          ? [columns]
          : [];
      if (selectCols.length === 0) {
        return { error: 'The "select" operation requires a non-empty "columns" array, e.g. {"columns":["name","price"]}.' };
      }
      let rows = data;
      if (filterParam) {
        rows = executeOperation(rows, "filter", filterParam);
      }
      if (Array.isArray(filters) && filters.length > 0) {
        rows = executeOperation(rows, "multi_filter", { filters, logic });
      }

      return rows.slice(0, limit).map((row) => {
        const obj: Record<string, any> = {};
        for (const c of selectCols) {
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
      if (!Array.isArray(filters)) {
        return { error: 'The "multi_filter" operation requires "filters" to be an array of {column, operator, value} objects.' };
      }
      return data.filter((row) => {
        const results = filters.map((f: any) => {
          const actualCol = resolveColumn(row, f.column);
          const v = row[actualCol];
          switch (f.operator) {
            case ">": return looseCompare(v, f.value, ">");
            case "<": return looseCompare(v, f.value, "<");
            case ">=": return looseCompare(v, f.value, ">=");
            case "<=": return looseCompare(v, f.value, "<=");
            case "==": return looseEquals(v, f.value);
            case "!=": return !looseEquals(v, f.value);
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
      const rawOps = params.operations ?? params;
      if (!Array.isArray(rawOps)) {
        return { error: 'The "pipeline" operation requires an "operations" array of {operation, params} steps.' };
      }

      // Auto-fix: detect chained groupby steps that reference destroyed columns.
      // When pipeline has 2+ consecutive groupby steps on the same groupColumn,
      // automatically convert them to a single groupby_multi call.
      const normalizedOps = [...rawOps];
      const gbIndices: number[] = [];
      for (let i = 0; i < normalizedOps.length; i++) {
        const op = normalizeStepOp(normalizedOps[i]);
        if (op.operation === "groupby") gbIndices.push(i);
      }
      if (gbIndices.length >= 2) {
        // Check if they share the same groupColumn
        const firstOp = normalizeStepOp(normalizedOps[gbIndices[0]]);
        const allSameGroup = gbIndices.every((idx) => {
          const o = normalizeStepOp(normalizedOps[idx]);
          return o.params.groupColumn === firstOp.params.groupColumn;
        });
        if (allSameGroup) {
          // Build aggregations array from all chained groupby steps
          const aggregations = gbIndices.map((idx) => {
            const o = normalizeStepOp(normalizedOps[idx]);
            const col = o.params.aggColumn ?? o.params.column ?? "";
            const fn = o.params.aggFunction ?? o.params.function ?? "count";
            return { column: col, function: fn, alias: `${col}_${fn}` };
          });
          // Use having from the first groupby that has one (usually the filter step)
          const havingSource = gbIndices.find((idx) => normalizeStepOp(normalizedOps[idx]).params.having);
          const having = havingSource != null ? { ...normalizeStepOp(normalizedOps[havingSource]).params.having, alias: aggregations[gbIndices.indexOf(havingSource)].alias } : undefined;
          const multiStep = {
            operation: "groupby_multi",
            params: { groupColumn: firstOp.params.groupColumn, aggregations, ...(having ? { having } : {}) },
          };
          // Replace all groupby steps with a single groupby_multi
          const nonGbOps = normalizedOps.filter((_, i) => !gbIndices.includes(i));
          // Insert groupby_multi where the first groupby was
          const insertAt = gbIndices[0];
          nonGbOps.splice(insertAt, 0, multiStep);
          // Re-run pipeline with fixed ops
          return executeOperation(data, "pipeline", { operations: nonGbOps }, sheets);
        }
      }

      const VIRTUAL = "cross_sheet";
      let currentData: any = Array.isArray(data) ? data : [];
      for (let stepIdx = 0; stepIdx < rawOps.length; stepIdx++) {
        const rawOp = rawOps[stepIdx];
        const op = normalizeStepOp(rawOp);
        let stepResult: any;
        if (CROSS_SHEET_OPS.has(op.operation) && sheets) {
          const joinParams = op.params as any;
          if ((joinParams.sheet1 === VIRTUAL || joinParams.sheet2 === VIRTUAL) && Array.isArray(currentData)) {
            const virtualSheets: WorkbookSheets = {
              ...sheets,
              [VIRTUAL]: {
                rows: currentData,
                columns: currentData.length > 0
                  ? Object.keys(currentData[0]).map((name) => ({ name, dtype: "string" as const, sampleValues: [] }))
                  : [],
              },
            };
            stepResult = executeCrossSheetOperation(virtualSheets, op.operation, joinParams);
          } else {
            stepResult = executeCrossSheetOperation(sheets, op.operation, joinParams);
          }
        } else {
          stepResult = executeOperation(currentData, op.operation, op.params, sheets);
        }
        // If a step returned an error object or non-array where next step needs array, stop early
        if (stepResult && typeof stepResult === "object" && !Array.isArray(stepResult) && stepResult.error) {
          return stepResult;
        }
        currentData = stepResult;
      }
      return currentData;
    }

    case "multi_analysis": {
      const rawOps = params.operations ?? params;
      if (!Array.isArray(rawOps)) {
        return { error: 'The "multi_analysis" operation requires an "operations" array of {operation, params} steps.' };
      }
      const results: Record<string, any> = {};
      for (let i = 0; i < rawOps.length; i++) {
        const op = normalizeStepOp(rawOps[i]);
        const key = rawOps[i].name || rawOps[i].label || `analysis_${i}_${op.operation}`;
        results[key] = executeOperation(data, op.operation, op.params, sheets);
      }
      return results;
    }

    // ── universal_compute: LLM writes a JS snippet run against the data ──────
    // This is the "any computation" escape hatch. The LLM supplies a JS function
    // body that receives `data` (array of row objects) and must return any
    // serializable value.  The executor runs it in a strict-mode sandbox.
    //
    // Example param:
    //   {"code":"return data.filter(r=>r.price>1000).map(r=>r.name)"}
    //   {"code":"const total=data.reduce((s,r)=>s+(+r.revenue||0),0); return {total,avg:total/data.length}"}
    case "universal_compute": {
      const { code } = params;
      if (typeof code !== "string" || !code.trim()) {
        return { error: "universal_compute requires a 'code' param containing a JS function body that receives 'data' and returns a result." };
      }
      // Block patterns that could exfiltrate data or access the environment.
      const BLOCKED = /\b(fetch|XMLHttpRequest|require|import|process|__dirname|__filename|eval|setTimeout|setInterval|setImmediate|clearTimeout|clearInterval|WebSocket|localStorage|sessionStorage|indexedDB|document|window\s*\.|global\s*\.|Buffer\s*\.|crypto\s*\.|fs\s*\.|child_process|exec\s*\(|spawn\s*\()\b/;
      if (BLOCKED.test(code)) {
        return { error: "universal_compute: code contains a disallowed pattern (network / filesystem / eval access is blocked for safety)." };
      }
      // The sandbox runs synchronously and every async API is blocked, so any
      // `async`/`await` the model emits is meaningless and would otherwise throw
      // "await is only valid in async functions". Strip those keywords so the
      // computation still runs.
      const syncCode = code.replace(/\basync\b/g, " ").replace(/\bawait\b/g, " ");
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function("data", `"use strict";\n${syncCode}`);
        const result = fn(data);
        return result ?? null;
      } catch (err: any) {
        return { error: `universal_compute execution error: ${err?.message || String(err)}` };
      }
    }

    // ── fuzzy_search: case-insensitive partial-text search across columns ─────
    // Useful when the LLM isn't sure of the exact filter value.
    // {"column":"name","query":"john","limit":20}  — search one column
    // {"query":"john","limit":20}                  — search ALL string columns
    case "fuzzy_search": {
      const { column, query = "", limit = 50, caseSensitive = false } = params;
      if (!query) return { error: "fuzzy_search requires a 'query' param." };
      const q = caseSensitive ? String(query) : String(query).toLowerCase();
      const cols = column
        ? [column]
        : (data[0] ? Object.keys(data[0]).filter((k) => typeof data[0][k] === "string") : []);
      const results = data.filter((row) =>
        cols.some((c) => {
          const v = caseSensitive ? String(row[c] ?? "") : String(row[c] ?? "").toLowerCase();
          return v.includes(q);
        })
      );
      return limit ? results.slice(0, Number(limit)) : results;
    }

    // ── regex_filter: filter rows where a column matches a regex pattern ──────
    // {"column":"email","pattern":"@gmail\\.com$"} or {"column":"id","pattern":"^USR-\\d+"}
    case "regex_filter": {
      const { column, pattern, flags = "i", limit } = params;
      if (!column || !pattern) return { error: "regex_filter requires 'column' and 'pattern' params." };
      let re: RegExp;
      try { re = new RegExp(String(pattern), String(flags)); }
      catch { return { error: `regex_filter: invalid regex pattern: ${pattern}` }; }
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, column);
      const results = data.filter((row) => re.test(String(row[actualCol] ?? "")));
      return limit ? results.slice(0, Number(limit)) : results;
    }

    // ── running_total: cumulative sum of a column (optionally sorted first) ──
    // {"column":"revenue","sortColumn":"date","order":"asc"}
    case "running_total": {
      const { column, sortColumn, order = "asc" } = params;
      if (!column) return { error: "running_total requires a 'column' param." };
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, column);
      let rows = [...data];
      if (sortColumn) {
        const actualSort = resolveColumn(firstRow, sortColumn);
        rows.sort((a, b) => {
          const av = a[actualSort], bv = b[actualSort];
          if (av == null) return 1; if (bv == null) return -1;
          return order === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
        });
      }
      let cumSum = 0;
      return rows.map((row) => {
        cumSum += Number(row[actualCol]) || 0;
        return { ...row, [`running_${column}`]: +cumSum.toFixed(4) };
      });
    }

    // ── rank: add a rank column to rows sorted by a metric ───────────────────
    // {"column":"revenue","order":"desc","limit":10}
    case "rank": {
      const { column, order = "desc", limit } = params;
      if (!column) return { error: "rank requires a 'column' param." };
      const firstRow = data[0] || {};
      const actualCol = resolveColumn(firstRow, column);
      const sorted = [...data].sort((a, b) => {
        const av = Number(a[actualCol] ?? 0), bv = Number(b[actualCol] ?? 0);
        return order === "asc" ? av - bv : bv - av;
      });
      const ranked = sorted.map((row, i) => ({ rank: i + 1, ...row }));
      return limit ? ranked.slice(0, Number(limit)) : ranked;
    }

    // ── value_counts: shorthand alias for groupby count ───────────────────────
    // LLMs often reach for "value_counts" (pandas terminology).
    // {"column":"status","limit":20,"order":"desc"}
    case "value_counts": {
      const { column, limit, order = "desc" } = params;
      if (!column) return { error: "value_counts requires a 'column' param." };
      return executeOperation(data, "groupby", {
        groupColumn: column,
        aggColumn: column,
        aggFunction: "count",
        limit,
        order,
      });
    }

    // ── describe: summary statistics for all numeric columns ─────────────────
    // {"columns":["price","qty"]}  or {}  for all numeric columns
    case "describe": {
      const { columns: colFilter } = params;
      const numericCols = (data[0] ? Object.keys(data[0]) : []).filter((k) => {
        if (colFilter && !colFilter.includes(k)) return false;
        return !isNaN(Number(data.find((r) => r[k] != null)?.[k]));
      });
      if (numericCols.length === 0) return { error: "describe: no numeric columns found." };
      const result: Record<string, any> = {};
      for (const col of numericCols) {
        const nums = data.map((r) => Number(r[col])).filter((n) => !isNaN(n));
        if (nums.length === 0) continue;
        nums.sort((a, b) => a - b);
        const sum = nums.reduce((s, v) => s + v, 0);
        const mean = sum / nums.length;
        const mid = Math.floor(nums.length / 2);
        result[col] = {
          count: nums.length,
          mean: +mean.toFixed(4),
          std: +(Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length)).toFixed(4),
          min: nums[0],
          p25: nums[Math.floor(nums.length * 0.25)],
          median: nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2,
          p75: nums[Math.floor(nums.length * 0.75)],
          max: nums[nums.length - 1],
        };
      }
      return result;
    }

    default:
      // Last-resort: try to map common LLM naming variations to supported ops
      // before giving up with an error (reduces self-healing round-trips).
      {
        const opAliases: Record<string, string> = {
          group_by: "groupby",   groupBy: "groupby",   group: "groupby",
          agg: "aggregate",      aggregation: "aggregate",
          top: "sort",           bottom: "sort",
          search: "fuzzy_search", text_search: "fuzzy_search", contains_search: "fuzzy_search",
          cumsum: "running_total", cumulative_sum: "running_total",
          freq: "value_counts",  frequency: "value_counts",
          stats: "describe",     summary_stats: "describe", statistics: "describe",
          order: "sort",         order_by: "sort",
          limit: "head",         take: "head",   sample_rows: "head",
          remove_outliers: "filter_outliers",
          regex: "regex_filter",
          compute: "universal_compute", js: "universal_compute", eval: "universal_compute",
        };
        const resolved = opAliases[operation] || opAliases[operation.toLowerCase()];
        if (resolved) {
          return executeOperation(data, resolved, params);
        }
        return { error: `Unknown operation: "${operation}". Supported: ${SUPPORTED_OPERATIONS.map((o) => o.name).join(", ")}. Use 'universal_compute' with a JS code snippet for any custom logic.` };
      }
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

// ─── Self-Healing & Resilience Utilities ───────────────────────────────────────
// These make the agent robust enough that even small/weak models can recover from
// transient API failures and their own mistakes (bad columns, empty results, SQL
// errors) by feeding the failure back and letting the model issue a corrected
// command — instead of giving up after a single attempt.

// Max number of times the agent will feed an execution error back for correction
// within a single question. Keeps self-healing bounded so it can never loop forever.
const MAX_HEAL_ATTEMPTS = 3;

// Classifies an LLM transport error as transient (worth retrying) vs. fatal.
// Free/small-model endpoints rate-limit aggressively, so retrying transient
// failures dramatically improves perceived reliability.
function isTransientLLMError(message: string): boolean {
  const m = (message || "").toLowerCase();
  // Fatal — never retry (auth/config problems won't fix themselves):
  if (/\(401\)|\(403\)|unauthorized|forbidden|invalid api key|api key is missing|missing\.|unknown provider|requires resource/.test(m)) {
    return false;
  }
  // Transient — retry with backoff:
  return /\(429\)|\(408\)|\(425\)|\(500\)|\(502\)|\(503\)|\(504\)|rate.?limit|too many requests|timeout|timed out|network|fetch failed|failed to fetch|econnreset|socket hang up|etimedout|enotfound|temporarily|overloaded|capacity|try again|service unavailable/.test(m);
}

// Wraps callLLM with bounded exponential-backoff retries on transient errors.
// On success it calls callLLM exactly once (no behavior change for healthy calls).
async function callLLMWithRetry(
  provider: Provider,
  model: string,
  apiKey: string,
  messages: { role: string; content: string }[],
  prompt: string,
  temperature: number,
  maxTokens: number,
  providerOptions: LLMProviderOptions,
  maxRetries = 2,
): Promise<LLMResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callLLM(provider, model, apiKey, messages, prompt, temperature, maxTokens, providerOptions);
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || String(err);
      if (attempt >= maxRetries || !isTransientLLMError(msg)) break;
      // Exponential backoff with jitter: ~0.4s, ~0.8s (capped at 2s).
      const backoff = Math.min(2000, 400 * 2 ** attempt) + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw lastErr;
}

// Detects a hard execution failure that the model should be asked to self-correct.
// Returns a human-readable error string, or null if the result is acceptable.
// IMPORTANT: only flags unambiguous failures (explicit error payloads / ERROR-prefixed
// strings). Empty arrays and zero values are valid answers and are NOT flagged here,
// so legitimate "no matching rows" results are never second-guessed.
function detectExecutionError(result: any): string | null {
  if (result == null) return null;
  if (typeof result === "string") {
    const t = result.trim();
    return /^error\b[:\s-]/i.test(t) ? t : null;
  }
  if (Array.isArray(result)) return null;
  if (typeof result === "object") {
    if (typeof result.error === "string" && result.error.trim()) return result.error.trim();
  }
  return null;
}

// Builds a corrective instruction that helps any model (especially small ones)
// fix the failing command on the next turn.
function buildHealingHint(
  errorText: string,
  command: string,
  validNames: string[],
  options: { kind?: "sheet" | "table" | "sql"; tableNames?: string[] } = {},
): string {
  const kind = options.kind || "sheet";
  const colsLine = validNames.length
    ? `Valid ${kind === "sql" ? "column" : "column"} names (use EXACT spelling): ${validNames.slice(0, 60).map((n) => `"${n}"`).join(", ")}.`
    : "";
  const tablesLine = options.tableNames && options.tableNames.length
    ? `Available tables you may search instead: ${options.tableNames.slice(0, 40).map((n) => `"${n}"`).join(", ")}.`
    : "";
  const fixes = kind === "sql"
    ? "Common fixes: (1) correct the column/table name using the exact spelling above; (2) fix SQL syntax for this dialect; (3) qualify ambiguous columns; (4) if the value was not found, search another table or loosen the WHERE filter (e.g. use ILIKE/LOWER for case-insensitive text); (5) call GetSchema or GetColumns if you are unsure of the schema."
    : "Common fixes: (1) use an exact column name from the list above; (2) choose a SUPPORTED operation; (3) if a filter/value returned an error, fix the column or value casing; (4) if you are unsure of the schema, issue GetColumns first.";
  return [
    `Your previous ${command} command FAILED with this error: "${errorText}".`,
    `This is recoverable. Do NOT give up, do NOT apologize, and do NOT ask the user — diagnose the cause and reissue ONE corrected JSON command that answers the original question.`,
    colsLine,
    tablesLine,
    fixes,
    `Respond with a single corrected JSON command only.`,
  ].filter(Boolean).join(" ");
}

// Appended to every agent system prompt so models know failures are recoverable
// and exactly how to behave when they receive an error result.
const SELF_CORRECTION_PROTOCOL = `

═══════════════════════════════════════════════════════
SELF-CORRECTION PROTOCOL (follow whenever a result is an error)
═══════════════════════════════════════════════════════
- If a tool result is an error (e.g. "Unknown operation", "Unknown column", a SQL error, or "No numeric data"), treat it as RECOVERABLE feedback, not a dead end.
- Diagnose the cause, then immediately reissue ONE corrected command. Never apologize, never give up, never tell the user you cannot do it.
- If a column/table name was wrong, re-read the schema you were given and use the EXACT name; call GetColumns/GetSchema again if you are unsure.
- If an operation was unsupported, pick the closest SUPPORTED operation that answers the question. As a last resort, use universal_compute with a JS code snippet that operates on the data array.
- If a search/filter returned an error or nothing useful, broaden it (case-insensitive match, fewer conditions) or search a different table/sheet — you have full read access to ALL of them.
- Keep iterating until you can produce a correct final answer. Only ask the user a clarification question when the request is genuinely ambiguous, never merely because a command failed.

LAST-RESORT RULE: If no named operation fits what you need, use universal_compute:
  {"command":"ExecuteFinalQuery","args":{"operation":"universal_compute","params":{"code":"return data.filter(r => ...).map(r => ...)"}}}
The code receives data (array of row objects) and must return a serializable value. Network and filesystem access are blocked.`;

// ─── Zero-Rows Smart Probe ─────────────────────────────────────────────────────
// Runs inline data stats (no extra LLM calls) to diagnose WHY a query returned
// 0 rows and produce a targeted corrective hint for the next LLM turn.

interface FilterSpec {
  column: string;
  operator: string;
  value: any;
}

function extractFiltersFromArgs(operation: string, params: Record<string, any>): FilterSpec[] {
  const out: FilterSpec[] = [];
  if (operation === "filter") {
    if (params.column) out.push({ column: params.column, operator: params.operator ?? "==", value: params.value });
  } else if (operation === "multi_filter" && Array.isArray(params.filters)) {
    for (const f of params.filters) {
      if (f?.column) out.push({ column: f.column, operator: f.operator ?? "==", value: f.value });
    }
  } else if (operation === "pipeline" && Array.isArray(params.operations)) {
    for (const step of params.operations) {
      const s = normalizeStepOp(step);
      out.push(...extractFiltersFromArgs(s.operation, s.params));
    }
  } else if (operation === "groupby" && params.filter) {
    const f = params.filter;
    if (f?.column) out.push({ column: f.column, operator: f.operator ?? "==", value: f.value });
  }
  return out;
}

function findJoinSpec(operation: string, params: Record<string, any>): { sheet1: string; sheet2: string; key1: string; key2: string } | null {
  if (operation === "join_sheets") {
    if (params.sheet1 && params.sheet2 && params.key1 && params.key2) {
      return { sheet1: params.sheet1, sheet2: params.sheet2, key1: params.key1, key2: params.key2 };
    }
  }
  if (operation === "pipeline" && Array.isArray(params.operations)) {
    for (const step of params.operations) {
      const s = normalizeStepOp(step);
      const found = findJoinSpec(s.operation, s.params);
      if (found) return found;
    }
  }
  return null;
}

function probeZeroRowsCause(
  _command: string,
  normalizedArgs: Record<string, any>,
  sheets: WorkbookSheets,
  defaultSheetName: string,
  columnRangeCache?: Map<string, Map<string, any>>,
): string | null {
  const operation = (normalizedArgs.operation as string) ?? "";
  const params = (normalizedArgs.params ?? {}) as Record<string, any>;
  const sheetName = (normalizedArgs.sheet_name as string) || defaultSheetName;

  // ── Probe: join key overlap (most definitive — check first) ──
  if (sheetName !== "cross_sheet") {
    const joinSpec = findJoinSpec(operation, params);
    if (joinSpec) {
      try {
        const s1 = sheets[joinSpec.sheet1];
        const s2 = sheets[joinSpec.sheet2];
        if (s1 && s2) {
          const col1Info = s1.columns.find((c) => c.name === joinSpec.key1 || c.name.toLowerCase() === joinSpec.key1.toLowerCase());
          const col2Info = s2.columns.find((c) => c.name === joinSpec.key2 || c.name.toLowerCase() === joinSpec.key2.toLowerCase());
          const skipProbe = (col1Info?.uniqueCount ?? 0) > 500 || (col2Info?.uniqueCount ?? 0) > 500;
          if (!skipProbe) {
            const u1 = executeOperation(s1.rows, "unique", { column: joinSpec.key1 });
            const u2 = executeOperation(s2.rows, "unique", { column: joinSpec.key2 });
            if (Array.isArray(u1) && Array.isArray(u2)) {
              const set1 = new Set(u1.map((r: any) => String(r[joinSpec.key1] ?? "")));
              const set2 = new Set(u2.map((r: any) => String(r[joinSpec.key2] ?? "")));
              const overlap = [...set1].filter((v) => set2.has(v)).length;
              return [
                `Your join_sheets on "${joinSpec.sheet1}.${joinSpec.key1}" = "${joinSpec.sheet2}.${joinSpec.key2}" returned 0 rows.`,
                `"${joinSpec.key1}" has ${set1.size} unique values in "${joinSpec.sheet1}"; "${joinSpec.key2}" has ${set2.size} unique values in "${joinSpec.sheet2}".`,
                `Overlapping key values: ${overlap}.`,
                overlap === 0
                  ? `No keys match — these may not be the correct join keys. Use GetColumns on both sheets and pick columns whose values overlap.`
                  : `Some keys match but the inner join still returned 0 rows — try joinType: "left" to see which rows have no match.`,
                `Rewrite the command.`,
              ].join(" ");
            }
          }
        }
      } catch { /* ignore probe errors */ }
    }
  }

  // ── Probe: pipeline step-through — find which step first kills rows ──
  // Runs each step of the pipeline in sequence so we can pinpoint exactly which
  // step first reduces the row count to 0.  Cross-sheet ops (join_sheets etc.) are
  // dispatched through executeCrossSheetOperation rather than executeOperation so
  // the probe doesn't silently break on step 0.
  if (operation === "pipeline" && Array.isArray(params.operations) && params.operations.length >= 2) {
    try {
      const CROSS_SHEET_OPS = new Set(["join_sheets", "compare_sheets", "union_sheets", "vlookup_sheets", "lookup_sheets"]);

      // Helper: run one pipeline step and return resulting rows (or null on failure)
      function runStep(rows: Record<string, any>[], step: { operation: string; params: Record<string, any> }): Record<string, any>[] | null {
        try {
          if (CROSS_SHEET_OPS.has(step.operation)) {
            const res = executeCrossSheetOperation(sheets, step.operation, step.params);
            return Array.isArray(res) ? res : null;
          }
          const res = executeOperation(rows, step.operation, step.params, sheets);
          return Array.isArray(res) ? res : null;
        } catch { return null; }
      }

      // Helper: replay steps 0..upTo-1 to get rows going into step upTo
      function replayUpTo(upTo: number): Record<string, any>[] {
        let r: Record<string, any>[] = [];
        for (let j = 0; j < upTo; j++) {
          const s = normalizeStepOp(params.operations[j]);
          const res = runStep(r, s);
          if (res !== null) r = res;
          else break;
        }
        return r;
      }

      // Walk each step; if it produces 0 rows from non-zero input, diagnose it.
      let rows: Record<string, any>[] = [];
      for (let i = 0; i < params.operations.length; i++) {
        const step = normalizeStepOp(params.operations[i]);
        const prevLen = rows.length;
        const next = runStep(rows, step);
        if (next === null) break; // step failed internally — can't probe further
        rows = next;

        if (rows.length === 0 && (prevLen > 0 || i === 0)) {
          const stepDesc = `step ${i + 1} (${step.operation})`;

          // ── Diagnose: join_sheets key mismatch ──
          if (step.operation === "join_sheets") {
            const js = step.params;
            const s1 = sheets[js.sheet1];
            const s2 = sheets[js.sheet2];
            if (s1 && s2) {
              const vals1 = [...new Set(s1.rows.slice(0, 200).map((r) => String(r[js.key1] ?? "")))];
              const vals2 = [...new Set(s2.rows.slice(0, 200).map((r) => String(r[js.key2] ?? "")))];
              const overlap = vals1.filter((v) => vals2.includes(v)).length;
              if (overlap === 0) {
                return [
                  `Pipeline failed at ${stepDesc}: join on ${js.sheet1}.${js.key1} = ${js.sheet2}.${js.key2} returned 0 rows.`,
                  `Sample "${js.key1}" values in ${js.sheet1}: [${vals1.slice(0, 5).join(", ")}].`,
                  `Sample "${js.key2}" values in ${js.sheet2}: [${vals2.slice(0, 5).join(", ")}].`,
                  `No overlap found — the join keys may not match (e.g. number vs. string, different IDs).`,
                  `Use GetColumns on both sheets and pick columns whose values overlap. Rewrite the command.`,
                ].join(" ");
              }
            }
          }

          // ── Diagnose: groupby_multi string agg mismatch ──
          if (step.operation === "groupby_multi" && Array.isArray(step.params.aggregations)) {
            const prevRows = replayUpTo(i);
            const badAggs: string[] = [];
            for (const agg of step.params.aggregations) {
              const fn = String(agg.function || "count");
              if (!["count", "count_distinct", "first", "last"].includes(fn)) {
                const colName = agg.column;
                const sampleVals = prevRows.slice(0, 10).map((r: any) => r[colName]).filter((v: any) => v != null && v !== "");
                const isStringCol = sampleVals.length > 0 && isNaN(Number(sampleVals[0]));
                if (isStringCol) {
                  badAggs.push(`"${colName}" (${fn} on strings → NaN, alias "${agg.alias || colName + "_" + fn}" unusable)`);
                }
              }
            }
            if (badAggs.length > 0) {
              return [
                `Pipeline failed at ${stepDesc}: groupby_multi used a numeric function on a string column: ${badAggs.join("; ")}.`,
                `Numeric functions (max/min/sum/mean) on string columns produce NaN — downstream filters on those aliases always return 0 rows.`,
                `Fix: replace with "first" to carry the string value through: {"column":"<col>","function":"first","alias":"<alias>"}.`,
                `Rewrite the command.`,
              ].join(" ");
            }
          }

          // ── Diagnose: filter / multi_filter with wrong value on aggregated column ──
          if (step.operation === "filter" || step.operation === "multi_filter") {
            const prevRows = replayUpTo(i);
            if (prevRows.length > 0) {
              const filters = extractFiltersFromArgs(step.operation, step.params);
              const hints: string[] = [];
              // Check each filter condition independently
              for (const f of filters) {
                if (!f.column || f.value === undefined) continue;
                const actualVals = [...new Set(prevRows.slice(0, 50).map((r: any) => r[f.column]).filter((v: any) => v != null).map(String))].slice(0, 8);
                if (actualVals.length === 0) {
                  hints.push(`column "${f.column}" not found in grouped data — check that the alias matches the groupby_multi alias exactly`);
                } else {
                  const matchCount = prevRows.filter((r: any) => {
                    const v = String(r[f.column] ?? "");
                    if (f.operator === "==" || f.operator === "=") return v === String(f.value);
                    if (f.operator === "!=" || f.operator === "<>") return v !== String(f.value);
                    if ([">", ">=", "<", "<="].includes(f.operator)) {
                      const n = Number(r[f.column]); const fv = Number(f.value);
                      if (f.operator === ">") return n > fv;
                      if (f.operator === ">=") return n >= fv;
                      if (f.operator === "<") return n < fv;
                      if (f.operator === "<=") return n <= fv;
                    }
                    return false;
                  }).length;
                  hints.push(`"${f.column} ${f.operator} ${JSON.stringify(f.value)}" matches ${matchCount}/${prevRows.length} rows — actual values: [${actualVals.map((v) => `"${v}"`).join(", ")}]`);
                }
              }
              if (hints.length > 0) {
                const noRowsFromBothFilters = hints.every((h) => h.includes("matches 0/"));
                return [
                  `Pipeline failed at ${stepDesc}: filter returned 0 rows from ${prevRows.length} grouped rows.`,
                  hints.join("; ") + ".",
                  noRowsFromBothFilters
                    ? `The data may genuinely have no rows matching ALL conditions simultaneously — check if any product satisfies BOTH criteria, or relax one condition.`
                    : `At least one condition is too strict or uses the wrong value. Check spelling/casing and alias names.`,
                  `Rewrite the command or report to the user that no data matches.`,
                ].join(" ");
              }
            }
          }

          // ── Generic ──
          return [
            `Pipeline returned 0 rows at ${stepDesc} (input had ${prevLen} rows).`,
            `Steps so far: ${params.operations.slice(0, i + 1).map((s: any) => normalizeStepOp(s).operation).join(" → ")}.`,
            `Check column names and filter values for ${step.operation}.`,
            `Rewrite the command.`,
          ].join(" ");
        }
      }
    } catch { /* ignore probe errors */ }
  }

  // ── Per-filter probes ──
  const sheet = sheets[sheetName] || sheets[defaultSheetName];
  if (!sheet || sheet.rows.length === 0) {
    // fallback to value_column hint below
  } else {
    const filters = extractFiltersFromArgs(operation, params);
    for (const f of filters) {
      if (!f.column || f.value === undefined || f.value === null) continue;
      const colInfo = sheet.columns.find(
        (c) => c.name === f.column || c.name.toLowerCase() === f.column.toLowerCase()
      );
      if (!colInfo) continue;

      // ── Probe: numeric threshold out of range ──
      if (
        [">", ">=", "<", "<="].includes(f.operator) &&
        colInfo.dtype === "number" &&
        typeof f.value === "number" &&
        Number.isFinite(f.value)
      ) {
        try {
          const cacheKey = colInfo.name;
          let stats: any = columnRangeCache?.get(sheetName)?.get(cacheKey) ?? null;
          if (!stats) {
            const described = executeOperation(sheet.rows, "describe", { columns: [colInfo.name] });
            stats = described?.[colInfo.name] ?? null;
            if (stats && columnRangeCache) {
              if (!columnRangeCache.has(sheetName)) columnRangeCache.set(sheetName, new Map());
              columnRangeCache.get(sheetName)!.set(cacheKey, stats);
            }
          }
          if (stats) {
            const suggested = (f.operator === ">" || f.operator === ">=") ? stats.p75 : stats.p25;
            const outOfRange = f.value > stats.max || f.value < stats.min;
            return [
              `Your filter "${colInfo.name} ${f.operator} ${f.value}" returned 0 rows.`,
              `Actual "${colInfo.name}" distribution (${stats.count} non-null values):`,
              `min=${stats.min}, p25=${stats.p25}, median=${stats.median}, p75=${stats.p75}, max=${stats.max}, mean=${stats.mean}.`,
              outOfRange
                ? `Your threshold (${f.value}) is ${f.value > stats.max ? "above the maximum" : "below the minimum"}.`
                : `No rows pass this filter with the current data distribution.`,
              `Suggested threshold: ${f.operator} ${suggested}.`,
              `Rewrite the command using a value within the actual data range.`,
            ].join(" ");
          }
        } catch { /* ignore */ }
      }

      // ── Probe: date format mismatch ──
      const isDateCol = colInfo.dtype === "date" || /date|time|_at$|created|updated|timestamp/i.test(colInfo.name);
      if (
        isDateCol &&
        ["==", "contains", "starts_with", ">", "<", ">=", "<="].includes(f.operator) &&
        typeof f.value === "string"
      ) {
        try {
          const samples = (colInfo.sampleValues ?? []).slice(0, 3).map(String).filter(Boolean);
          if (samples.length > 0) {
            const isIso = samples.some((s) => s.includes("T") && s.includes("Z"));
            return [
              `Your filter "${colInfo.name} ${f.operator} '${f.value}'" returned 0 rows.`,
              `Sample values in "${colInfo.name}": ${samples.map((s) => `"${s}"`).join(", ")}.`,
              `Your filter value '${f.value}' may not match the stored format.`,
              isIso
                ? `Tip: for ISO timestamp columns use operator "contains" with a partial value (e.g. contains "2024") or "starts_with" for YYYY-MM.`
                : `Tip: match the exact format shown in the samples above.`,
              `Rewrite the command with a value that matches the actual date format.`,
            ].join(" ");
          }
        } catch { /* ignore */ }
      }

      // ── Probe: string case / typo mismatch ──
      if (
        colInfo.dtype === "string" &&
        (f.operator === "==" || f.operator === "!=") &&
        typeof f.value === "string" &&
        f.value.trim() !== "" &&
        (colInfo.uniqueCount ?? 0) <= 500
      ) {
        try {
          const uniqueResult = executeOperation(sheet.rows, "unique", { column: colInfo.name });
          if (Array.isArray(uniqueResult) && uniqueResult.length > 0) {
            const actualValues = uniqueResult
              .slice(0, 10)
              .map((r: any) => r[colInfo.name])
              .filter((v: any) => v != null);
            return [
              `Your filter "${colInfo.name} ${f.operator} '${f.value}'" returned 0 rows.`,
              `Actual values in "${colInfo.name}" (first ${actualValues.length}): ${actualValues.map((v: any) => `"${v}"`).join(", ")}.`,
              `"${f.value}" was not found — check spelling and casing.`,
              `For a partial match use operator "contains" instead of "==".`,
              `Rewrite using an exact value from the list above.`,
            ].join(" ");
          }
        } catch { /* ignore */ }
      }
    }
  }

  // ── Fallback: value_column hint (existing behavior) ──
  const ops = (params.operations ?? []) as any[];
  const hasFilter = ops.some((o: any) => o?.operation === "filter" || o?.params?.column);
  const filterOps = ops.filter((o: any) => o?.operation === "filter");
  const badFilterVal = filterOps.find((o: any) => {
    const val = o?.params?.value;
    return typeof val === "string" && isNaN(Number(val)) && val !== "" && !["null", "true", "false"].includes(val.toLowerCase());
  });
  if (badFilterVal) {
    return `Your filter used "value": "${badFilterVal.params?.value}" — this compares against the literal string "${badFilterVal.params?.value}", not a column. If you intended to compare against a per-row column value, use "value_column": "${badFilterVal.params?.value}" instead (and optionally "multiplier": 1.5 to scale it). Rewrite the command with the correct approach.`;
  }
  if (hasFilter) {
    return `Your pipeline returned 0 rows. If you have a filter step that compares a column against another column's value (e.g. Quantity > AvgQuantity), use "value_column" instead of "value". Alternatively, use universal_compute to express the comparison in JS. Rewrite the command.`;
  }

  return null;
}

// ─── Query Complexity Detector ────────────────────────────────────────────────
// Heuristic classifier — zero cost, no LLM call. Requires 2+ signals to fire
// so simple questions are never mis-classified as complex.
function detectQueryComplexity(question: string, sheets: WorkbookSheets): { isComplex: boolean; reason: string } {
  const q = question.toLowerCase();
  const words = question.trim().split(/\s+/);
  const sheetNames = Object.keys(sheets).map((n) => n.toLowerCase());
  const signals: string[] = [];

  const mentionedSheets = sheetNames.filter((name) => name.length > 2 && q.includes(name));
  if (mentionedSheets.length >= 2) signals.push(`references multiple sheets (${mentionedSheets.join(", ")})`);

  if (/\band\s+(calculate|compute|find|show|compare|get)\b/.test(q)) signals.push("compound operation (and calculate/compare)");

  if (/\bcompare\b.{0,50}\b(across|between|vs\.?|versus|against)\b/.test(q)) signals.push("cross-group comparison");

  if (/\b(both|as well as|along with|also)\b/.test(q) && /\b(sum|count|average|mean|total|max|min|revenue|amount)\b/.test(q)) signals.push("multiple aggregations implied");

  if (words.length >= 25) signals.push(`long question (${words.length} words)`);

  if (/\bfor each\b.{0,40}\b(and|also|plus)\b/.test(q)) signals.push("per-group multi-metric");

  return { isComplex: signals.length >= 2, reason: signals.join("; ") };
}

// ─── Custom prompt layering ────────────────────────────────────────────────────
// The user's "Advanced" prompt is ADDITIONAL instructions layered on top of the
// default agent prompt — never a full replacement. Replacing the prompt strips
// the JSON command protocol and schema rules, which breaks the agent loop.
function applyPromptOverride(basePrompt: string, override?: string): string {
  const custom = override?.trim();
  if (!custom) return basePrompt;
  return (
    basePrompt +
    "\n\n## USER CUSTOM INSTRUCTIONS (apply these to interpretation, tone, and answer formatting — but NEVER abandon the JSON command protocol defined above)\n" +
    custom
  );
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
  // Use the runtime-enriched prompt (adds live ops list + dataset-specific examples).
  // For small/weak models we still use the same prompt but inject the schema directly
  // into the first user message so they don't need to waste a turn on GetColumns.
  const prompt = applyPromptOverride(
    buildRuntimeSystemPrompt(sheetData, SYSTEM_PROMPT),
    systemPromptOverride,
  );
  let turn = 0;
  // ── Step budget: LLM is told so it plans efficiently ──
  const maxTurns = 12;

  // ── Pre-process question for better LLM comprehension ──
  const normalizedQuestion = normalizeQuestion(question, sheetData.columns);
  const intentHint = classifyIntent(normalizedQuestion);
  const columnHints = buildColumnHints(normalizedQuestion, sheetData.columns);

  // ── Pre-flight: deterministic subjective-query guard ──
  // Catches "which employee is good/bad/great/poor/..." without a metric BEFORE
  // the LLM runs, so small models cannot hallucinate a random interpretation.
  const subjectiveClarification = !systemPromptOverride
    ? detectSubjectiveQuery(question, sheetData.columns)
    : null;
  if (subjectiveClarification) {
    yield {
      turn: 1,
      command: "Answer",
      args: { value: subjectiveClarification.prompt, options: subjectiveClarification.options },
      result: subjectiveClarification.prompt,
      tokens: { input: 0, output: 0 },
      durationMs: 0,
      isFinal: true,
    };
    return;
  }

  // ── LangChain-style BufferWindowMemory: last 3 Q/A turns (compact) ──
  let contextBlock = "";
  if (conversationHistory && conversationHistory.length > 0) {
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

  // ── Pre-inject schema so the model can write a query on turn 1 ──
  // This saves a GetColumns round-trip (critical for small models).
  // We embed the schema in the user message so even models that skim
  // the system prompt will see the exact column names right before the question.
  const schemaBlock = `\n\n${buildSchemaContextBlock(sheetData)}`;

  // ── Build the enriched first user message ──
  const firstMessage = [
    `Step budget: you have at most ${maxTurns} steps total. Be efficient.`,
    schemaBlock,
    contextBlock,
    `\nQuestion: "${normalizedQuestion}"`,
    intentHint,
    // Only add redundant column hints when NOT pre-injecting schema (avoids token waste)
    !schemaBlock ? columnHints : "",
    `\n\nRespond with ONE JSON command only. No prose. No explanation. No markdown.`,
  ].filter(Boolean).join("");

  messages.push({ role: "user", content: firstMessage });
  // Schema is pre-injected above — mark as inspected so we don't force a GetColumns
  // round-trip on turn 1. The repair guards still run if column names don't match.
  let schemaInspected = true; // schema is always pre-injected above
  let currentData = sheetData.rows; // Track current data state for intermediate operations
  let healAttempts = 0; // Bounded self-healing budget for execution errors

  while (turn < maxTurns) {
    turn++;
    const startTime = Date.now();

    let llmResponse: LLMResponse;
    try {
      llmResponse = await callLLMWithRetry(provider, model, apiKey, messages, prompt, temperature, maxTokens, providerOptions);
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
        result = safeExecuteOperation(currentData, args.operation, args.params || {});
        if (args.operation === "filter" || args.operation === "multi_filter" || args.operation === "remove_nulls" || args.operation === "transform_column") {
          if (Array.isArray(result)) currentData = result;
        }
        break;
      case "ExecuteFinalQuery":
        result = safeExecuteOperation(currentData, args.operation, args.params || {});
        break;
      default:
        result = { error: `Unknown command: ${command}` };
    }

    let isFinal = command === "ExecuteFinalQuery" || command === "Answer" || command === "NarrativeAnswer";
    const durationMs = Date.now() - startTime;

    // ── Self-healing: if a data operation errored, feed the error back for correction
    //    instead of finalizing — so the model can fix the column/operation and retry. ──
    const execError =
      command === "ExecuteFinalQuery" || command === "QuerySheet"
        ? detectExecutionError(result)
        : null;
    if (execError && healAttempts < MAX_HEAL_ATTEMPTS && turn < maxTurns) {
      healAttempts++;
      yield {
        turn,
        command,
        args,
        result,
        tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
        durationMs,
        isFinal: false,
      };
      messages.push({ role: "assistant", content: assistantCommandContent });
      messages.push({
        role: "user",
        content: buildHealingHint(execError, command, sheetData.columns.map((c) => c.name), { kind: "sheet" }),
      });
      continue;
    }

    // ── Smart zero-rows probe (legacy single-sheet runAgent) ──
    const zrProbableOps = new Set(["filter", "multi_filter", "pipeline", "join_sheets", "groupby", "groupby_multi"]);
    const zrOp = (rawArgs as any).operation as string ?? "";
    if (command === "ExecuteFinalQuery" && Array.isArray(result) && result.length === 0 && healAttempts < MAX_HEAL_ATTEMPTS && turn < maxTurns && zrProbableOps.has(zrOp)) {
      const singleSheetMap: WorkbookSheets = { [sheetData.name ?? "sheet"]: sheetData };
      const probe = probeZeroRowsCause(command, rawArgs as Record<string, any>, singleSheetMap, sheetData.name ?? "sheet");
      if (probe) {
        healAttempts++;
        yield { turn, command, args, result, tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens }, durationMs, isFinal: false };
        messages.push({ role: "assistant", content: assistantCommandContent });
        messages.push({ role: "user", content: probe });
        continue;
      }
    }

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
- If the user's question asks for a list, table, or rows of data (e.g., "show me", "give me", "list", "filter", "find all"), and it can be answered with a single operation or pipeline, ALWAYS use ExecuteFinalQuery. NEVER use QuerySheet followed by Answer for questions that expect a table output.
- Answer should ONLY be used for:
  1. Clarification questions.
  2. Questions that ask for metadata/schema info (e.g., column list).
  3. Final text-based calculations/conclusions (like "Yes", "No", or a specific single number) that cannot be returned as a table.
- If you ran a QuerySheet and got the exact tabular result (rows) that answers the user's question, DO NOT issue an Answer command with a text summary. Instead, issue ExecuteFinalQuery with the exact same operation/params to return the final table result.
- Use QuerySheet for intermediate work and ExecuteFinalQuery only for the final answer when ONE operation suffices.
- For cross-sheet/multi-sheet questions:
  1. Start by calling GetSheetDescription() to see all sheet names and schemas.
  2. PREFERRED — use a single ExecuteFinalQuery pipeline that chains ALL joins and aggregations in one shot:
     {"command":"ExecuteFinalQuery","args":{"sheet_name":"cross_sheet","operation":"pipeline","params":{"operations":[{"operation":"join_sheets","params":{"sheet1":"A","sheet2":"B","key1":"id","key2":"id","joinType":"inner"}},{"operation":"join_sheets","params":{"sheet1":"cross_sheet","sheet2":"C","key1":"order_id","key2":"order_id","joinType":"left"}},{"operation":"groupby_multi","params":{...}}]}}}
     Inside a pipeline, "cross_sheet" as sheet1 always refers to the accumulated result of previous steps.
  3. ALTERNATIVE — sequential QuerySheet joins. After the first QuerySheet join, the result is stored as "cross_sheet". The next QuerySheet can use sheet1:"cross_sheet" to join with another sheet:
     Turn 1: QuerySheet join_sheets(sheet1:A, sheet2:B) → stored as "cross_sheet"
     Turn 2: QuerySheet join_sheets(sheet1:"cross_sheet", sheet2:C) → chained join
     Turn 3: ExecuteFinalQuery groupby_multi on "cross_sheet"
  4. NEVER issue QuerySheet with sheet_name:"cross_sheet" for a plain join on a fresh "cross_sheet" that doesn't exist yet — always name a real sheet (e.g. "Customers") as the starting point for the first join.
- CRITICAL: When you need to compute multiple aggregations per group (e.g. count distinct categories AND sum revenue, grouped by the same column), you MUST use groupby_multi in a SINGLE step — NEVER chain two groupby steps in a pipeline. After the first groupby, all original columns are destroyed, so the second groupby will always return 0 rows. groupby_multi computes all aggregations in one pass with no column loss. Example: "customers who bought from >1 category and their total revenue" → {"operation":"groupby_multi","params":{"groupColumn":"CustomerID","aggregations":[{"column":"Category","function":"count_distinct","alias":"cat_count"},{"column":"TotalAmount","function":"sum","alias":"total_revenue"}],"having":{"alias":"cat_count","operator":">","value":1}}}
- FORECASTING / FUTURE ANALYSIS — never refuse "forecast", "predict", "next month/year", "future", "expected", "projection" questions:
  1. First aggregate the metric per time period with date_trunc (or use row order if no date column exists — say so in the answer).
  2. Then run universal_compute with a least-squares linear regression over (period index, metric value) and extrapolate the requested number of future periods, rounding to 2 decimals.
  3. Label the result clearly as a linear-trend projection from historical data (not a guarantee) and state the trend direction and per-period rate of change.
- Respond with exactly one JSON object and no extra text.

Examples:
{"command":"GetSheetDescription","args":{}}
{"command":"GetColumns","args":{"sheet_name":"sales"}}
{"command":"QuerySheet","args":{"sheet_name":"sales","operation":"groupby","params":{"groupColumn":"region","aggColumn":"amount","aggFunction":"sum"}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"sales","operation":"aggregate","params":{"column":"amount","function":"sum"}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"cars","operation":"sort","params":{"column":"Horsepower","order":"desc","limit":1}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"titles","operation":"split_frequency","params":{"column":"cast","delimiter":",","limit":10,"order":"desc"}}}
{"command":"QuerySheet","args":{"sheet_name":"cross_sheet","operation":"join_sheets","params":{"sheet1":"sales","sheet2":"customers","key1":"customer_id","key2":"id","joinType":"inner"}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"cross_sheet","operation":"groupby","params":{"groupColumn":"customers_name","aggColumn":"sales_amount","aggFunction":"sum"}}}
{"command":"QuerySheet","args":{"sheet_name":"cross_sheet","operation":"compare_sheets","params":{"sheet1":"q1_sales","sheet2":"q2_sales","key1":"product_id","key2":"product_id","compareColumn1":"revenue","compareColumn2":"revenue"}}}
{"command":"ExecuteFinalQuery","args":{"sheet_name":"Employees_Data","operation":"multi_analysis","params":{"operations":[{"name":"poorest","operation":"sort","params":{"column":"salary","order":"asc","limit":1}},{"name":"richest","operation":"sort","params":{"column":"salary","order":"desc","limit":1}}]}}}` + SELF_CORRECTION_PROTOCOL;

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
- FORECASTING / FUTURE ANALYSIS — never refuse "forecast", "predict", "next month/year", "future", "expected", "projection" questions:
  1. Run one SQL query that aggregates the metric per time period (GROUP BY month/quarter/year using the dialect's date functions), ordered chronologically.
  2. From the returned period series, fit a simple linear trend (least squares over period index vs value) and extrapolate the requested future periods yourself, rounding to 2 decimals.
  3. Answer with the projected values clearly labeled as a linear-trend projection from historical data (not a guarantee), including trend direction and per-period rate of change.
- Respond with exactly one JSON object and no extra text.

Examples:
{"command":"GetSchema","args":{}}
{"command":"GetColumns","args":{"table_name":"orders"}}
{"command":"QuerySQL","args":{"sql":"SELECT status, SUM(total_amount) AS total_amount FROM orders GROUP BY status LIMIT 20"}}
{"command":"ExecuteSQL","args":{"sql":"SELECT id, amount FROM orders WHERE status = 'completed' LIMIT 10"}}
{"command":"ExecuteSQL","args":{"sql":"SELECT o.id, o.amount, c.name FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.status = 'completed' LIMIT 50"}}
{"command":"ExecuteSQL","args":{"sql":"WITH summary AS (SELECT COUNT(*) as total, AVG(amount) as avg_amount, MAX(amount) as max_amount, MIN(amount) as min_amount FROM orders) SELECT * FROM summary"}}
{"command":"Answer","args":{"value":"Which table should I use for that metric?"}}` + SELF_CORRECTION_PROTOCOL;

const DEFAULT_NOSQL_DATABASE_AGENT_PROMPT = `You are a NoSQL database analysis agent. Work one step at a time and request only the information you need.

You are working with NoSQL database collections/tables. Since this is a NoSQL database, you CANNOT write SQL. Raw SQL queries are NOT supported. You must ONLY use the structured NoSQL operation commands listed below (QueryTable, ExecuteFinalQuery).

You have access to these commands:

1. GetSchema()
   Returns the database collection inventory with field names. It does not load rows.

2. GetColumns(table_name)
   Returns detailed field info and sample values for a collection.

3. QueryTable(table_name, operation, params)
   Runs one intermediate data operation on a collection.

4. ExecuteFinalQuery(table_name, operation, params)
   Runs the final data operation that answers the question.

5. Answer(value, options?)
   Use only for clarification questions or schema-only final answers.
   For clarifications, always include args.options with 2–6 clickable choices.

NoSQL operation rules:
- Do NOT output QuerySQL or ExecuteSQL commands. If you do, they will fail. Only use QueryTable or ExecuteFinalQuery.
- Use exact collection and field names from GetSchema/GetColumns.

TURN-EFFICIENCY RULES (critical — you have a limited step budget):
- GetSchema already returns field names for every collection. After calling GetSchema, you can immediately write operations without calling GetColumns for every collection.
- Only call GetColumns when you specifically need sample values or detailed data types.
- When a QueryTable returns data, analyze it and issue Answer or ExecuteFinalQuery immediately — do NOT run another query for the same data.
- NEVER give up or say "I cannot answer". You have FULL read-only access. Always attempt to answer with the data you have.

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
- When the user provides an identifier (ID, code, name) without specifying a collection, ALWAYS call GetSchema first.
- Search the most relevant collections in order of likelihood.
- Call GetColumns for each candidate collection before querying.

FORECASTING / FUTURE ANALYSIS — never refuse "forecast", "predict", "next month/year", "future", "expected", "projection" questions:
1. Aggregate the metric per time period with date_trunc, ordered chronologically.
2. From the returned series, fit a simple linear trend (least squares over period index vs value) and extrapolate the requested future periods yourself, rounding to 2 decimals.
3. Answer with values clearly labeled as a linear-trend projection from historical data (not a guarantee), including trend direction and per-period rate of change.

Respond with exactly one JSON object and no extra text.

Examples:
{"command":"GetSchema","args":{}}
{"command":"GetColumns","args":{"table_name":"orders"}}
{"command":"ExecuteFinalQuery","args":{"table_name":"orders","operation":"groupby","params":{"groupColumn":"status","aggColumn":"total_amount","aggFunction":"sum"}}}
{"command":"Answer","args":{"value":"Which collection should I use for that metric?"}}` + SELF_CORRECTION_PROTOCOL;

// ─── Prompt Hardening Wrapper ──────────────────────────────────────────────────
// Appends the auto-generated, always-current operations block to any prompt.
// Call this at the usage site so DEFAULT_*_PROMPT strings don't need editing
// when new operations are added to SUPPORTED_OPERATIONS.
function withAutoOps(basePrompt: string): string {
  const opsBlock = buildOperationsBlock();
  return `${basePrompt}

═══════════════════════════════════════════════════════
AUTHORITATIVE OPERATION LIST (auto-generated from code — always current)
Use ONLY these operation names. Unknown operations return errors.
═══════════════════════════════════════════════════════
${opsBlock}

HARD RULE — groupby_multi IS MANDATORY: If you need multiple aggregations per group (e.g. count_distinct of one column AND sum of another, grouped by the same key), use groupby_multi in a SINGLE step. NEVER chain two groupby steps — after the first groupby all original columns are gone and the second returns 0 rows.

OUTPUT RULE: respond with exactly ONE JSON object. No prose. No markdown. No trailing text.`;
}

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

function isNoSqlDb(dbTypeLabel: string): boolean {
  const label = dbTypeLabel.toLowerCase();
  return label.includes("mongo") || label.includes("elastic") || label.includes("opensearch");
}

function buildSqlDialectGuidance(dbTypeLabel: string) {
  const label = dbTypeLabel.toLowerCase();

  if (isNoSqlDb(dbTypeLabel)) {
    return "This is a NoSQL database. SQL is not supported. Use NoSQL operations (QueryTable/ExecuteFinalQuery) to query data.";
  }

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
    const sampleVals = column.sampleValues ?? values.slice(0, 3);
    const sample = `[${sampleVals.slice(0, 3).map(formatSampleValue).join(", ")}]`;
    const nonNullCount = column.nonNullCount ?? values.filter((v) => v != null && v !== "").length;
    const nullCount = sheet.rows.length - nonNullCount;
    const coverage = sheet.rows.length > 0 ? `${((nonNullCount / sheet.rows.length) * 100).toFixed(1)}% filled` : "0.0% filled";
    const uniqueCount = column.uniqueCount ?? new Set(values.filter((v) => v != null && v !== "").map(String)).size;
    const colForMeaning = { ...column, nonNullCount: nonNullCount, uniqueCount };
    const multiValueProfile = detectMultiValueTextProfile(values, column.name);
    const meaning = inferColumnMeaning(colForMeaning, sheet.rows.length, values, multiValueProfile);
    const parts = [
      `${column.name} (${column.dtype})`,
      `meaning: ${meaning}`,
      coverage,
      `${uniqueCount} unique non-null values`,
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
    // Rich per-column profile (type, cardinality, nulls, sample values) so the
    // model can pick the correct columns/values on turn 1 without a GetColumns
    // round-trip — critical for medium/complex queries.
    const colLines = sheet.columns
      .map((column) => {
        const sample = Array.isArray(column.sampleValues)
          ? column.sampleValues.slice(0, 3).map((v) => String(v)).join(", ")
          : "";
        const type = column.dtype ? ` [${column.dtype}]` : "";
        const unique = typeof column.uniqueCount === "number" ? ` — ${column.uniqueCount} unique` : "";
        const nulls =
          typeof column.nonNullCount === "number" && column.nonNullCount < sheet.rows.length
            ? `, ${sheet.rows.length - column.nonNullCount} nulls`
            : "";
        return `      - "${column.name}"${type}${unique}${nulls}${sample ? ` — e.g. ${sample}` : ""}`;
      })
      .join("\n");
    return `  Sheet '${name}': ${sheet.rows.length} rows × ${sheet.columns.length} columns\n${colLines}`;
  });

  return (
    "Available sheets (use EXACT column names below VERBATIM — do NOT guess, paraphrase, or invent columns; match filter values to the sample values shown):\n" +
    lines.join("\n\n")
  );
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

// Returns column names referenced in operation params (recursively handles pipeline/multi_analysis steps)
function extractReferencedColumns(operation: string, params: Record<string, any>): string[] {
  const cols: string[] = [];
  const add = (v: any) => { if (typeof v === "string" && v.trim()) cols.push(v.trim()); };

  // Recurse into pipeline / multi_analysis steps
  if (operation === "pipeline" || operation === "multi_analysis") {
    const ops = params.operations ?? [];
    if (Array.isArray(ops)) {
      for (const op of ops) {
        if (op.operation && op.params) {
          cols.push(...extractReferencedColumns(op.operation, op.params));
        }
      }
    }
    return cols;
  }

  // Common param keys that hold column names
  for (const key of ["column", "column1", "column2", "groupColumn", "aggColumn", "rankColumn", "dateColumn", "rowColumn", "colColumn", "valueColumn"]) {
    add(params[key]);
  }
  if (Array.isArray(params.columns)) params.columns.forEach(add);
  if (Array.isArray(params.filters)) {
    params.filters.forEach((f: any) => add(f?.column));
  }
  if (params.filter) add(params.filter?.column);
  if (Array.isArray(params.aggregations)) {
    params.aggregations.forEach((a: any) => add(a?.column));
  }
  return cols.filter(Boolean);
}

// Returns the set of known column names for a sheet (case-insensitive lookup included)
function getSheetColumnNames(sheets: WorkbookSheets, sheetName: string): Set<string> | null {
  const sheet = sheets[sheetName];
  if (!sheet) return null;
  const names = new Set<string>();
  for (const col of sheet.columns) {
    names.add(col.name);
    names.add(col.name.toLowerCase());
  }
  return names;
}

// Returns unknown column names the LLM referenced that don't exist in the sheet.
// Cross-sheet ops (join_sheets etc.) are exempt — their "columns" are keys across sheets.
// Virtual sheet "cross_sheet" is exempt — its schema is built at runtime.
function findUnknownColumns(
  operation: string,
  params: Record<string, any>,
  sheets: WorkbookSheets,
  sheetName: string
): string[] {
  const CROSS_SHEET_OPS_SET = new Set(["join_sheets", "compare_sheets", "union_sheets", "vlookup_sheets", "lookup_sheets", "pipeline", "multi_analysis"]);
  if (CROSS_SHEET_OPS_SET.has(operation)) return []; // schema is dynamic / multi-sheet
  if (sheetName === "cross_sheet" || !sheets[sheetName]) return []; // virtual sheet
  const known = getSheetColumnNames(sheets, sheetName);
  if (!known) return [];
  const referenced = extractReferencedColumns(operation, params);
  return referenced.filter((col) => !known.has(col) && !known.has(col.toLowerCase()));
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
  const isPipelineOp = operation === "pipeline" || operation === "multi_analysis";

  // When the LLM targets "cross_sheet" (a virtual workspace name) with a pipeline,
  // the sheet doesn't physically exist yet — resolve starting rows from the first
  // pipeline step's sheet1 param so the pipeline can build it up from real sheets.
  const isVirtualSheet = requestedSheetName === "cross_sheet" || !sheets[requestedSheetName];

  if (!isCrossSheetOp && !isPipelineOp && !sourceRows && isVirtualSheet) {
    return {
      args: { ...args, sheet_name: requestedSheetName },
      result: `ERROR: Sheet '${requestedSheetName}' not found. Available: ${Object.keys(sheets).join(", ")}`,
    };
  }

  if (isCrossSheetOp) {
    // For join_sheets where sheet1 is "cross_sheet" (a virtual accumulated result),
    // substitute the sourceRows as the left-hand table by injecting a synthetic entry.
    let sheetsForOp = sheets;
    const joinParams = args.params || {};
    if (operation === "join_sheets" && joinParams.sheet1 === "cross_sheet" && sourceRows) {
      sheetsForOp = {
        ...sheets,
        cross_sheet: { name: "cross_sheet", columns: [], rows: sourceRows },
      };
    }
    const result = executeCrossSheetOperation(sheetsForOp, operation, joinParams);
    return {
      args: { ...args, sheet_name: requestedSheetName },
      result,
    };
  }

  // For pipeline/multi_analysis targeting a virtual sheet, start with the first real
  // sheet referenced in the first step's sheet1 param (or fall back to defaultSheet).
  let rows: Record<string, any>[];
  if (sourceRows) {
    rows = sourceRows;
  } else if (sheets[requestedSheetName]) {
    rows = sheets[requestedSheetName].rows;
  } else if (isPipelineOp) {
    const ops = args.params?.operations ?? [];
    const firstSheet1 = ops[0]?.params?.sheet1;
    rows = (firstSheet1 && sheets[firstSheet1]) ? sheets[firstSheet1].rows : [];
  } else {
    rows = [];
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
      result: safeExecuteOperation(rows, translated.operation, translated.params),
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
    result: safeExecuteOperation(rows, operation, args.params || {}, sheets),
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
    result: safeExecuteOperation(table.rows, args.operation, args.params || {}),
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
  const prompt = applyPromptOverride(
    withAutoOps(isNoSqlDb(dbTypeLabel) ? DEFAULT_NOSQL_DATABASE_AGENT_PROMPT : DEFAULT_DATABASE_AGENT_PROMPT),
    systemPromptOverride,
  );
  const maxTurns = 15;
  const inspectedTables = new Set<string>();
  const lastIntermediateFilterByTable = new Map<string, { operation: string; params: Record<string, any> }>();
  let schemaShown = false; // tracks whether GetSchema has been surfaced to the model
  let turn = 0;
  let healAttempts = 0; // Bounded self-healing budget for execution errors

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
      llmResponse = await callLLMWithRetry(provider, model, apiKey, history, prompt, temperature, maxTokens, providerOptions);
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

    // Wrap turn execution — unexpected JS errors become error steps, not generator crashes.
    try {

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

    // Inspect-first: if model jumps straight to SQL without seeing the schema, force GetSchema first.
    if ((command === "QuerySQL" || command === "ExecuteSQL") && !schemaShown) {
      command = "GetSchema";
      args = {};
      rawArgs = args as Record<string, any>;
    }

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
        schemaShown = true;
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
      default: {
        const knownOpsDb = new Set([...SUPPORTED_OPERATIONS.map((o) => o.name), "group_by", "groupBy", "multi_analysis", "pipeline", "fuzzy_search", "universal_compute", "regex_filter", "running_total", "value_counts", "describe"]);
        if (knownOpsDb.has(command) || knownOpsDb.has(command.toLowerCase())) {
          const wrappedTable = (rawArgs.table_name as string) || defaultTableName;
          const executed = executeDatabaseTableCommand({ table_name: wrappedTable, operation: command, params: rawArgs.params ?? rawArgs }, tables, defaultTableName);
          normalizedArgs = executed.args;
          result = executed.result;
          command = "ExecuteFinalQuery";
        } else {
          result = `ERROR: Unknown command '${command}'. Use ExecuteFinalQuery, QueryTable, GetSchema, Answer, NarrativeAnswer, or HumanApproval.`;
        }
        break;
      }
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

    // ── Self-healing: a failed SQL/data command (syntax error, unknown column/table,
    //    unsupported operation) is fed back for correction instead of finalizing. ──
    const execError =
      command === "ExecuteSQL" || command === "QuerySQL" ||
      command === "ExecuteFinalQuery" || command === "QueryTable"
        ? detectExecutionError(result)
        : null;
    if (execError && healAttempts < MAX_HEAL_ATTEMPTS && turn < maxTurns) {
      healAttempts++;
      const healTable = tables[requestedTableName];
      const validNames = (healTable?.columns || []).map((c) => c.name);
      yield {
        turn,
        command,
        args: normalizedArgs,
        result,
        sql: executedSql,
        tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
        durationMs: Date.now() - startTime,
        isFinal: false,
      };
      llmInput = buildHealingHint(execError, command, validNames, {
        kind: "sql",
        tableNames: Object.keys(tables),
      });
      continue;
    }

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

    } catch (turnErr: any) {
      console.error(`[DB agent] Turn ${turn} crashed:`, turnErr);
      yield {
        turn,
        command: "Error",
        args: {},
        result: `Internal error on turn ${turn}: ${turnErr?.message || String(turnErr)}. The agent will attempt to self-correct.`,
        tokens: { input: 0, output: 0 },
        durationMs: Date.now() - startTime,
        isFinal: false,
      };
      llmInput = `An internal error occurred while executing the previous command: ${turnErr?.message || String(turnErr)}. Please try a different approach to answer: "${question}"`;
      if (++healAttempts > MAX_HEAL_ATTEMPTS) {
        yield {
          turn: turn + 1,
          command: "Error",
          args: {},
          result: "Too many errors — could not complete the query.",
          tokens: { input: 0, output: 0 },
          durationMs: 0,
          isFinal: true,
        };
        return;
      }
    }
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
  const prompt = applyPromptOverride(withAutoOps(DEFAULT_AGENT_PROMPT), systemPromptOverride);
  const maxTurns = 12;
  const lastIntermediateRowsBySheet = new Map<string, Record<string, any>[]>();
  const lastIntermediateFilterBySheet = new Map<string, { operation: string; params: Record<string, any> }>();
  const columnRangeCache = new Map<string, Map<string, any>>(); // caches describe() results per sheet/column
  const inspectedSheets = new Set<string>(); // tracks which sheets have had GetColumns run
  let turn = 0;
  let healAttempts = 0; // Bounded self-healing budget for execution errors
  // complexity detected after introParts are built (injected below)

  const sheetInventory = buildSheetDescription(sheets);
  const introParts = [
    `Question: ${question}`,
    `Current selected sheet: "${defaultSheetName}"`,
    `Workbook Inventory:\n${sheetInventory}`,
  ];

  if (conversationHistory && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-3).map((entry, index) =>
      `Q${index + 1}: ${entry.question}\nA${index + 1}: ${typeof entry.answer === "string" ? entry.answer : JSON.stringify(entry.answer).slice(0, 300)}`
    );
    introParts.push(`Recent conversation:\n${recent.join("\n")}`);
  }

  introParts.push("Respond with one JSON command only.");

  // Inject planning preamble for complex multi-step queries (2+ signals required)
  const complexity = detectQueryComplexity(question, sheets);
  if (complexity.isComplex) {
    introParts.push(
      `PLANNING REQUIRED (${complexity.reason}): This question needs multiple steps. ` +
      `Before executing, output your plan as the first response: ` +
      `{"command":"Plan","args":{"steps":["step 1 — e.g. join Orders+Products on ProductID","step 2 — groupby_multi CustomerID with count_distinct(Category) and sum(TotalAmount)","step 3 — filter where cat_count > 1"]}} ` +
      `Be concrete: name the sheets, columns, and operations. Output the Plan JSON only.`
    );
  }

  let llmInput = introParts.join("\n\n");

  while (turn < maxTurns) {
    turn++;
    const startTime = Date.now();
    history.push({ role: "user", content: llmInput });

    let llmResponse: LLMResponse;
    try {
      llmResponse = await callLLMWithRetry(provider, model, apiKey, history, prompt, temperature, maxTokens, providerOptions);
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

    // Wrap turn execution — unexpected JS errors become error steps, not generator crashes.
    try {

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

    parsed = repairLegacyCommandSheet(parsed, sheets, defaultSheetName);

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

    // ── Inspect-first gate: force GetColumns before the first ExecuteFinalQuery on
    //    any real sheet that hasn't been inspected yet. This grounds the query in the
    //    actual schema and enables the model to self-correct column names/sheet routing.
    if (command === "ExecuteFinalQuery") {
      const targetSheet =
        typeof rawArgs.sheet_name === "string" && rawArgs.sheet_name.trim()
          ? rawArgs.sheet_name.trim()
          : defaultSheetName;
      const isCrossSheet = targetSheet === "cross_sheet" || !sheets[targetSheet];
      const opName = typeof rawArgs.operation === "string" ? rawArgs.operation : "";
      const isCrossSheetOp = ["join_sheets", "compare_sheets", "union_sheets", "vlookup_sheets", "lookup_sheets"].includes(opName);
      if (!isCrossSheet && !isCrossSheetOp && !inspectedSheets.has(targetSheet)) {
        command = "GetColumns";
        args = { sheet_name: targetSheet };
        normalizedArgs = { sheet_name: targetSheet };
        result = buildColumnsDescription(sheets, targetSheet);
        inspectedSheets.add(targetSheet);
        yield {
          turn,
          command: "GetColumns",
          args: normalizedArgs,
          result,
          tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
          durationMs: Date.now() - startTime,
          isFinal: false,
        };
        llmInput = `Schema for "${targetSheet}":\n${typeof result === "string" ? result : JSON.stringify(result)}\n\nNow execute the query using only the exact column names shown above.`;
        continue;
      }
    }

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
        inspectedSheets.add(requestedSheetName);
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

        // --- Column validation: if LLM referenced columns that don't exist in the sheet,
        //     intercept and run GetColumns instead so the model can self-correct. ---
        const unknownCols = findUnknownColumns(
          operation,
          operationParams,
          sheets,
          requestedSheetName
        );
        if (unknownCols.length > 0 && sheets[requestedSheetName]) {
          command = "GetColumns";
          normalizedArgs = { sheet_name: requestedSheetName };
          result = {
            _warning: `Column(s) not found: ${unknownCols.join(", ")}. Showing actual columns so you can correct the query.`,
            ...buildColumnsDescription(sheets, requestedSheetName),
            actualColumns: sheets[requestedSheetName].columns.map((c) => c.name),
          };
          // history already has the assistant turn pushed at the top of the loop.
          // Feed the column-validation hint as the next user message via llmInput.
          llmInput = `Column validation failed — these column names do not exist in sheet "${requestedSheetName}": ${unknownCols.map((c) => `"${c}"`).join(", ")}.\n\nActual columns: ${sheets[requestedSheetName].columns.map((c) => `"${c.name}"`).join(", ")}.\n\nPlease rewrite your query using ONLY the exact column names listed above.`;
          yield {
            turn,
            command: "GetColumns",
            args: normalizedArgs,
            result,
            tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
            durationMs: Date.now() - startTime,
            isFinal: false,
          };
          continue;
        }
        // --- End column validation ---

        const executed = executeSheetCommand(commandArgs, sheets, defaultSheetName, sourceRows);
        normalizedArgs = executed.args;
        result = command === "QuerySheet" && Array.isArray(executed.result)
          ? executed.result.slice(0, 20)
          : executed.result;
        if (command === "QuerySheet") {
          if (Array.isArray(executed.result)) {
            lastIntermediateRowsBySheet.set(requestedSheetName, executed.result);
            // Also store under "cross_sheet" so subsequent steps that reference "cross_sheet"
            // as sheet1 in a join can find the accumulated intermediate data.
            lastIntermediateRowsBySheet.set("cross_sheet", executed.result);
          }

          const carriableFilter = getCarriableSheetFilter(operation, operationParams);
          if (carriableFilter) {
            lastIntermediateFilterBySheet.set(requestedSheetName, carriableFilter);
          }
        }
        break;
      }
      case "Plan": {
        // Planning turn — model outputs its intended execution plan before acting.
        result = { plan: rawArgs.steps || rawArgs.plan || rawArgs.reasoning || [] };
        normalizedArgs = rawArgs;
        break;
      }
      default: {
        const knownOpsLegacy = new Set([...SUPPORTED_OPERATIONS.map((o) => o.name), "group_by", "groupBy", "multi_analysis", "pipeline", "fuzzy_search", "universal_compute", "regex_filter", "running_total", "value_counts", "describe"]);
        if (knownOpsLegacy.has(command) || knownOpsLegacy.has(command.toLowerCase())) {
          const wrappedSheet = (rawArgs.sheet_name as string) || defaultSheetName;
          const executed = executeSheetCommand({ sheet_name: wrappedSheet, operation: command, params: rawArgs.params ?? rawArgs }, sheets, defaultSheetName);
          normalizedArgs = executed.args;
          result = executed.result;
          command = "ExecuteFinalQuery";
        } else {
          result = `ERROR: Unknown command '${command}'. Use ExecuteFinalQuery, QuerySheet, GetColumns, GetSheetDescription, Answer, NarrativeAnswer, or HumanApproval.`;
        }
        break;
      }
    }

    // ── Plan command: receive plan, feed it back, proceed to execution ──
    if (command === "Plan") {
      const steps = (rawArgs.steps || rawArgs.plan || rawArgs.reasoning || []) as any;
      const planText = Array.isArray(steps)
        ? steps.map((s: any, i: number) => `${i + 1}. ${s}`).join("\n")
        : String(steps);
      yield {
        turn,
        command: "Plan",
        args: normalizedArgs,
        result,
        tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
        durationMs: Date.now() - startTime,
        isFinal: false,
      };
      llmInput = `Your plan was received:\n${planText}\n\nNow execute step 1. Issue one JSON command.`;
      continue;
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

    // ── Self-healing: feed a failed data operation back for correction. ──
    const execError =
      command === "ExecuteFinalQuery" || command === "QuerySheet"
        ? detectExecutionError(result)
        : null;
    if (execError && healAttempts < MAX_HEAL_ATTEMPTS && turn < maxTurns) {
      healAttempts++;
      const healSheetName =
        typeof normalizedArgs.sheet_name === "string" && sheets[normalizedArgs.sheet_name]
          ? normalizedArgs.sheet_name
          : defaultSheetName;
      const validNames = (sheets[healSheetName]?.columns || []).map((c) => c.name);
      yield {
        turn,
        command,
        args: normalizedArgs,
        result,
        tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
        durationMs: Date.now() - startTime,
        isFinal: false,
      };
      llmInput = buildHealingHint(execError, command, validNames, {
        kind: "sheet",
        tableNames: Object.keys(sheets),
      });
      continue;
    }

    // ── Smart zero-rows probe: diagnose WHY 0 rows, feed specific hint back ──
    // Only probe operations that actually filter/join data — not count/head/aggregate which
    // legitimately return empty arrays without any bug.
    const probableOps = new Set(["filter", "multi_filter", "pipeline", "join_sheets", "groupby", "groupby_multi"]);
    const opName = (normalizedArgs.operation as string) ?? "";
    if (command === "ExecuteFinalQuery" && Array.isArray(result) && result.length === 0 && turn < maxTurns && probableOps.has(opName)) {
      const probe = probeZeroRowsCause(command, normalizedArgs, sheets, defaultSheetName, columnRangeCache);
      if (probe && healAttempts < MAX_HEAL_ATTEMPTS) {
        healAttempts++;
        yield {
          turn,
          command,
          args: normalizedArgs,
          result,
          tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
          durationMs: Date.now() - startTime,
          isFinal: false,
        };
        // If probe says data genuinely has no rows, tell the agent to explain rather than retry.
        const isGenuinelyEmpty = probe.includes("genuinely have no rows") || probe.includes("no data matches");
        llmInput = isGenuinelyEmpty
          ? `Diagnostic result: ${probe}\n\nThe data has been verified — there are genuinely no rows matching all criteria. Do NOT retry the same query. Instead, respond with a NarrativeAnswer explaining clearly: which conditions matched individually, and that no rows satisfy all conditions together. Be specific about what the data shows.`
          : probe;
        continue;
      }
      // Probe returned null (no structural bug found) — data is genuinely empty.
      // Force the agent to explain rather than return a silent empty result.
      if (!probe && healAttempts === 0 && opName === "pipeline") {
        healAttempts++;
        yield {
          turn,
          command,
          args: normalizedArgs,
          result,
          tokens: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
          durationMs: Date.now() - startTime,
          isFinal: false,
        };
        llmInput = `Your query returned 0 rows. Before concluding, verify: (1) run each filter condition INDEPENDENTLY on the data to count how many rows each condition alone would return, (2) then explain to the user in a NarrativeAnswer why no rows match — e.g. "8 products have >10 orders, 3 products have Low Stock status, but none overlap." Do NOT just return empty results silently.`;
        continue;
      }
    }

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

    } catch (turnErr: any) {
      console.error(`[Legacy agent] Turn ${turn} crashed:`, turnErr);
      yield {
        turn,
        command: "Error",
        args: {},
        result: `Internal error on turn ${turn}: ${turnErr?.message || String(turnErr)}. The agent will attempt to self-correct.`,
        tokens: { input: 0, output: 0 },
        durationMs: Date.now() - startTime,
        isFinal: false,
      };
      llmInput = `An internal error occurred while executing the previous command: ${turnErr?.message || String(turnErr)}. Please try a different approach to answer the question: "${question}"`;
      if (++healAttempts > MAX_HEAL_ATTEMPTS) {
        yield {
          turn: turn + 1,
          command: "Error",
          args: {},
          result: "Too many errors — could not complete the query.",
          tokens: { input: 0, output: 0 },
          durationMs: 0,
          isFinal: true,
        };
        return;
      }
    }
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
