# Stronger Agent — Visible Reasoning, Streaming, Native Tools, Deeper Data Tools + Self-Reflection

## Context
The current AI agent (`src/lib/agent.ts`) behaves more like a single-shot LLM call wrapped in a loop: it emits JSON commands (RunSQL, ExecuteFinalSQL, Answer…) parsed manually, and the UI shows a step timeline but **no real reasoning** — only a generic "Agent is thinking…" spinner. The user wants it to feel like a real agent (like a coding agent that shows full reasoning and uses many tools): visible chain-of-thought, live streaming thoughts, more powerful tools, and self-reflection — **without changing or removing any existing functionality**.

Decisions made with the user:
- **Phased**: Phase 1 = richer prompt-based reasoning for ALL providers (incl. free `querify` tier). Phase 2 = native tool-calling for capable models (anthropic/openai) with fallback.
- **Reasoning UI = BOTH**: per-step reasoning lines + a live streaming thought panel.
- **New tools = deeper data tools + self-reflection / plan-act-reflect loop.**

Hard constraint: **everything additive**. `AgentStep` only gains optional fields; `callLLM` signature untouched; the existing prompt-JSON loop stays the source of truth; deployed-chat path (`hitlController === undefined`), `runLegacyAgent`, `runDatabaseAgent` all keep working unchanged.

The live, primary path is `runSheetAgent` (DuckDB-WASM SQL-first). All enrichment targets it; the legacy/DB agents inherit only the safe shared `AgentStep` additions.

---

## Files to modify
- `src/lib/agent.ts` — AgentStep fields, parseCommand, runSheetAgent loop, prompt, reflection, new data-tool commands, tool schemas.
- `src/lib/llm-client.ts` — add `callLLMStream`, `callLLMTools`, capability predicates. **Do NOT edit `callLLM`.**
- `src/pages/QueryPage.tsx` — render `reasoning`, live thought panel, new command colors/labels.
- `src/lib/data-tools.ts` — **NEW** deterministic helpers (modeled on `src/lib/anomaly-detector.ts`).

---

## Phase 1a — Visible per-step reasoning (all providers)
1. **AgentStep** (agent.ts ~L12–23): add optional `reasoning?: string;` and `thought?: string;`. Optional → all existing consumers/spreads (orchestrator `{...step}` ~L6383, persistence in QueryPage ~L4199) compile unchanged.
2. **Prompt** (`SQL_SHEET_AGENT_PROMPT` ~L6129): add one rule — each command JSON MAY include a top-level `"reasoning"` string (≤20 words, why this command). ~15 extra output tokens/turn, no extra call.
3. **parseCommand** (~L2481): widen return to carry `reasoning?: string` when present; existing `{command,args}` destructures ignore it.
4. **runSheetAgent loop** (~L6518): capture `reasoning`; add local helper `const withReason = (s: AgentStep) => reasoning ? { ...s, reasoning } : s;` and wrap the **model-driven** yields (RunSQL, ExecuteFinalSQL, GetSchema, VerifyResult). Deterministic yields (anomaly/quality/dashboard) keep none.
5. **StepCard** (QueryPage ~L1322, after `summary`): render `{step.reasoning && <p className="mt-0.5 text-xs italic text-muted-foreground/80">{step.reasoning}</p>}`.

**Verify:** upload CSV, ask "top 5 X by Y" → italic reasoning under steps; existing queries still answer.

## Phase 1b — Live streaming thoughts
1. **llm-client.ts** (alongside `callAnthropic` ~L114, `callOpenAICompatible`): add `callLLMStream(...same args as callLLM..., onToken?)` → SSE parse for `anthropic` (`content_block_delta`) and openai-compatible (`choices[].delta.content`); **all other providers (querify/bedrock/huggingface/alibaba/...) just `return callLLM(...)`** (graceful no-op). Export `providerSupportsStreaming(provider)`.
2. **callLLMWithRetry** (~L2624): append optional `onToken`; when present + streaming-capable, use `callLLMStream` (backoff unchanged). Default undefined = identical to today.
3. **runSheetAgent**: append optional `onThought?: (delta: string) => void` to signature (after `datasetId`); pass into the planning `callLLMWithRetry` (~L6503). Out-of-band callback (generator can't yield mid-await) → AgentStep stream stays pure.
4. **QueryPage**: add `liveThought` state; pass `onThought` at the `runSheetAgent(...)` call (~L4154); reset on run start/end and per new model step; in the thinking block (~L5208) show `liveThought` in a small fading monospace panel, else fall back to today's spinner.

**Verify:** with OpenAI/Groq key tokens stream live; switch to `querify` free tier → spinner fallback, no errors.

## Phase 1c — Deeper data tools (additive)
1. **NEW `src/lib/data-tools.ts`** (pure fns over `Record<string,unknown>[]`, no LLM/IO, like `anomaly-detector.ts`): `seasonalForecast`, `correlationMatrix`, `profileColumns`.
2. **runSheetAgent switch** (after `RunSQL` ~L6558): add cases — `ProfileSchema` (reuse `buildQualityReport` from data-quality.ts), `CorrelationMatrix`, `Sample` (`SELECT * FROM "t" USING SAMPLE n ROWS` via `runSQL`), `ForecastSeasonal`, `CohortAnalysis` (SQL recipe in prompt like existing forecast recipe ~L6189). Each yields a non-final step + sets `llmInput` (same shape as RunSQL) so verification/insight still apply. Unknown commands already fall through to safe `default` (~L6684).
3. Document new commands in prompt; add `COMMAND_COLORS` entries (QueryPage ~L79) and `describeAgentStep` labels (~L486). Missing entries degrade gracefully.

**Verify:** "profile this dataset", "correlation matrix", "20-row sample", "seasonal forecast of sales" each produce results; existing aggregates unaffected.

## Phase 1d — Self-reflection (plan → act → reflect → revise), gated
1. Gate on existing `detectQueryComplexity(question, sheets)` (~L3079) near L6436: `reflectionEnabled = isComplex`. Simple queries skip all of this → no latency regression.
2. **Plan step**: if enabled, one cheap planning call (reuse `planningLlm`) before the loop, `yield` non-final `Plan` step (reuse orchestration's `PlanQuery` render pattern ~L6363).
3. **Reflect**: ENHANCE the existing verification turn (~L6592–6608), do not add a parallel loop. At the `ConfirmAnswer` branch (~L6522), if a critique string is present, yield a non-final `Reflect` step before `VerifyResult`; a corrected `ExecuteFinalSQL` reuses the existing `pendingFinal`/self-heal route.
4. **Bounded** by existing `maxTurns=12` (~L6438), `healAttempts>6` (~L6567), `verificationUsed` flag (~L6593). No new unbounded loop.

**Verify:** compound question shows Plan/Reflect in timeline; "how many rows?" shows neither and is as fast as before.

## Phase 2 — Native tool-use (capable providers, default-off then flip on)
1. **llm-client.ts**: `providerSupportsNativeTools(provider)` → true only for `anthropic`, `openai`. Add `callLLMTools(...same args + tools, onToken?)` returning `LLMResponse & { toolCall?: {name,args} }` (anthropic `tools`+`tool_choice:any` → `tool_use` block; openai `tools`+`tool_choice:required` → `tool_calls[0]`).
2. **agent.ts**: `SHEET_AGENT_TOOLS` = structured restatement of the 4 commands (RunSQL, ExecuteFinalSQL, AskUser, Answer). Before parse (~L6512) branch: if native tools enabled use `callLLMTools` → `{command,args}`; else `parseCommand`. Downstream `switch(command)` (~L6537) unchanged. Wrap in try/catch → fall back to prompt-JSON on any tool error.
3. Ship behind default-off flag; flip on for anthropic/openai after verification.

**Verify:** with Anthropic key, tool-driven commands flow through the same switch with identical results; forced tool error falls back to JSON.

---

## Regression safety (summary)
- Optional AgentStep fields; `callLLM` untouched; new llm-client fns are separate exports.
- Non-capable providers no-op streaming/tools → today's behavior exactly.
- Reflection gated by complexity; reuses existing verification/heal bounds.
- Deployed-chat (`hitlController` undefined), `runLegacyAgent`, `runDatabaseAgent` untouched.
- Each phase independently shippable/reversible; `npm run dev` + sample CSV after each.

## End-to-end verification
1. `npm run dev`, upload a sample CSV.
2. Per phase, run the checks above; confirm old flows (simple aggregate, dashboard build, quality report, clarification HITL) still work.
3. `npx vite build` must pass after each phase.
