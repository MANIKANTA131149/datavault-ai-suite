# Querify — Enterprise Modernization & Product Strategy

> A grounded strategy review for evolving Querify from a strong NL→SQL analytics product into a category-credible enterprise AI data platform — **additive only**, nothing existing removed or redesigned.

---

## 0. What Querify Actually Is Today (the honest baseline)

Before recommending anything, here is what the codebase **already has** — this is unusually mature, and most "AI platform checklists" would wrongly tell you to build things you already shipped. Read this section as the "do NOT rebuild" list.

| Capability | Where it lives | Status |
|---|---|---|
| NL→SQL agent, DuckDB-WASM, SQL-first | `src/lib/agent.ts` (`runSheetAgent`) | ✅ mature, verification turn + self-heal |
| Multi-agent orchestration (planner→sub-questions) | `src/lib/agent-orchestrator.ts` | ✅ gated, conservative |
| Native tool-calling (Bedrock Converse / Anthropic / OpenAI) | `agent.ts` + `llm-client.ts` | ✅ with JSON fallback |
| Visible reasoning + live streaming thoughts | `agent.ts` / `QueryPage.tsx` | ✅ shipped |
| Reflection / plan-act-reflect (complexity-gated) | `agent.ts` | ✅ shipped |
| Deeper deterministic data tools (forecast, correlation, profiling) | `src/lib/data-tools.ts` | ✅ shipped |
| Multi-tenant orgs (personal + shared, role per member) | `server/lib/orgs.js`, `server/routes/orgs.js` | ✅ backwards-compatible |
| Audit logs (paginated, filterable, CSV export, stats) | `server/routes/audit.js` | ✅ admin-gated |
| Usage metering (append-only `usage_events` ledger) | `server/lib/metering.js` | ✅ |
| Per-tier daily token caps (200k/400k/800k/∞) | `daily-token-tracker.js`, `llm.js` | ✅ enforced server-side |
| Public REST API v1 + API-key auth | `server/routes/api-v1.js`, `lib/api-keys.js` | ✅ keyed, metered |
| PII scanning, data lineage, glossary | `server/lib/pii-scanner.js`, `lineage.js`, `routes/glossary.js` | ✅ |
| Scheduled queries (EventBridge cron Lambda) | `server/routes/schedules.js`, `scheduler.js` | ✅ |
| Alerts, deployments, embed widget, SSE events | `routes/alerts.js`, `deployments.js`, `embed.js`, `events.js` | ✅ |
| Clerk auth (email + Google + GitHub) + Clerk Billing | `ClerkAuthBridge`, webhook plan-sync | ✅ |
| Agent memory + chat memory | `routes/agent-memory.js`, `chat-memory.js` | ✅ |
| Design system (shared components, dark/light tokens, command palette) | `src/components/shared/` | ✅ |

**Takeaway:** Querify already has ~70% of an enterprise checklist. The gap is **not features — it's depth, polish, governance proof, and a few high-leverage net-new surfaces.** The recommendations below are deliberately filtered to *only* what you don't already have or where the existing version is shallow.

---

## PHASE 1 — Competitor Analysis (positioned against your actual product)

Querify is **not** a Langflow/n8n-style visual workflow builder, and it shouldn't try to become one — that's a different product with a 10× larger surface area. Querify's wedge is **"ask your data in English, get verified SQL + charts + scheduled/embedded delivery, with governance."** The right comparables are therefore narrower:

| Comparable | What they do that you don't | Should you copy it? |
|---|---|---|
| **Hex / Mode / Count** | Notebook + SQL + chart canvas, shareable "data apps", parameterized reports | **Partial** — you have dashboards & deployments; copy *parameterization* + *shareable app links*, not the notebook. |
| **ThoughtSpot Sage / Snowflake Cortex Analyst** | Semantic layer / metrics governance so NL maps to *certified* metrics | **Yes — highest leverage.** A semantic/metrics layer is your biggest credibility gap (see F-SEM below). |
| **Retool** | Resizable panels, query-result-bound components, RBAC on actions | **Partial** — copy panel ergonomics & per-action RBAC, not the app builder. |
| **Datadog / Langfuse / Arize Phoenix** | LLM observability: traces, token/cost dashboards, eval scores | **Yes** — you have audit + metering; you lack a *trace/eval* surface (see F-OBS, F-EVAL). |
| **Zapier AI / n8n** | Triggers → multi-step automations | **You already have schedules + alerts.** Extend, don't rebuild — add "on-result-condition → action" (F-AUTO). |
| **Relevance AI / Copilot Studio** | Reusable "skills"/tools marketplace, agent templates | **Light version** — a query/template gallery is a cheap viral loop (F-MKT). |

### Genuine gaps vs. these comparables (ranked)

1. **No semantic/metrics layer** — NL→SQL is ungrounded against *certified business definitions* ("revenue", "active user"). Every serious enterprise data-NL product has this. **#1 differentiator + accuracy multiplier.**
2. **No LLM observability/trace surface** — you log audit + meter tokens, but there's no per-query trace timeline with token/cost/latency/tool-calls for *debugging the agent*.
3. **No evaluation pipeline** — no golden-question regression suite to prove the agent didn't regress after a model/prompt change. This is the single thing that lets you change models safely.
4. **No shareable/parameterized report apps** — dashboards exist but aren't parameterized public "data apps."
5. **No result-driven automation** ("when this query crosses X, do Y") — alerts exist but aren't composable into actions.
6. **Collaboration is org-level, not document-level** — no per-dataset/dashboard sharing, comments, or @mentions.
7. **RBAC is coarse** (`admin` vs member, plan-gated) — no resource-scoped roles or per-action permissions.
8. **No template/query gallery** — nothing to drive the viral "fork this" loop.

---

## OUTPUT FORMAT — Per-feature recommendations (only the genuinely-missing, high-leverage ones)

For each: *why it matters · user/business impact · complexity · FE/BE/DevOps/DB/API changes · UX · stack · enterprise value · rollout · risk · scalability.* Existing patterns are reused so nothing breaks.

---

### F-SEM · Semantic / Metrics Layer ("Certified Metrics") — **TOP PRIORITY**

- **Why it matters:** NL→SQL is only as trustworthy as the definitions behind it. A semantic layer lets an admin define *"Revenue = SUM(net_amount) WHERE status='paid'"* once; the agent then maps "show revenue by month" to the certified definition instead of guessing. This is what separates a toy from a product an enterprise will pay for.
- **User impact:** Consistent, trustworthy answers; "✓ Certified metric" badge on results. **Business impact:** unlocks Enterprise deals, becomes the #1 retention moat, reduces hallucinated aggregations.
- **Complexity:** Medium-High (it's mostly additive data + prompt context).
- **Frontend:** New `MetricsPage.tsx` (admin/owner) — CRUD of metrics & dimensions, reusing `shared/` components (`FilterToolbar`, `EmptyState`, `ConfirmDialog`). A "✓ Certified" `StatusBadge` on `QueryPage` results when the answer used a certified metric.
- **Backend:** New `server/routes/metrics.js` (CRUD, org-scoped, owner-gated like `audit.js`'s `requireAdmin`). Inject the metric catalog into the agent's schema context (it already builds a schema description string — append a "Certified metrics" block).
- **DevOps:** None — same Lambda.
- **Database:** New `metrics` collection keyed on `orgId` (additive; nothing else touched): `{ _id, orgId, name, expression, dimensions[], description, datasetId|connectionId, certifiedBy, createdAt }`.
- **APIs:** `GET/POST/PUT/DELETE /api/metrics`; agent reads them via existing schema-builder path.
- **UX:** Metric cards with the SQL expression shown read-only; "Test" button runs it through the existing `validateReadOnlySql` + query-runner.
- **Stack:** Existing (Express + Mongo + your agent). No new infra.
- **Enterprise value:** Very high — this is the governance + accuracy story buyers ask for.
- **Rollout:** Ship CRUD dark (owner-only) → wire into agent context behind a per-org flag → enable by default once eval suite (F-EVAL) confirms no regression.
- **Risk:** Low/contained — if the metric block is empty the agent behaves exactly as today. Guard prompt-size growth (cap injected metrics, prioritize by relevance).
- **Scalability:** Cap injected metrics per query (top-N by name/embedding match) so prompt size stays bounded.

---

### F-OBS · Agent Trace & Token/Cost Observability ("Querify Traces")

- **Why it matters:** When an answer is wrong, today you can't *see* why — which tool ran, what SQL, how many tokens, how long. This is Langfuse/Datadog for your own agent and is the thing that makes the agent debuggable and the platform trustworthy.
- **User/business impact:** Faster debugging, premium "observability" upsell (Professional+), proof for enterprise procurement.
- **Complexity:** Medium. You already emit `AgentStep`s and already meter tokens — this is mostly *persisting* what you stream.
- **Frontend:** New `TracesPage.tsx` — list of runs; click → vertical timeline of steps (reuse the `StepCard` render you already have) with token/cost/latency per step and the SQL/tool inputs. A "View trace" link from history.
- **Backend:** A trace-writer that the agent's step emission feeds (fire-and-forget, like `metering.recordUsage`). `GET /api/traces`, `GET /api/traces/:id`.
- **DevOps:** Optional TTL index to auto-expire traces (cost control).
- **Database:** New `agent_traces` collection: `{ _id, userId, orgId, question, steps[], totalTokens, costUsd, latencyMs, model, status, ts }` with a TTL index (e.g. 30/90 days by plan).
- **APIs:** read-only trace endpoints; write is internal.
- **UX:** Datadog-flame-style timeline; copy-SQL, re-run, "open in Query" actions.
- **Stack:** Existing. (If volume explodes later, move traces to S3 + Athena — not now.)
- **Enterprise value:** High — observability is a line-item in enterprise RFPs.
- **Rollout:** Persist traces silently first (build the data) → ship read UI → gate detailed traces by plan.
- **Risk:** Low — purely additive, fire-and-forget write must never block a response.
- **Scalability:** TTL + per-plan retention; sample verbose fields for high-volume orgs.

---

### F-EVAL · Evaluation Pipeline ("Golden Questions") — **enables safe model changes**

- **Why it matters:** You said "for now Bedrock = deepseek.v3.2, later we can change the model." You **cannot safely change models** without a regression suite. This is the prerequisite for every future AI change.
- **User/business impact:** Confidence to upgrade models; "answer quality" metric for marketing; prevents silent regressions that churn users.
- **Complexity:** Medium.
- **Frontend:** New `EvalPage.tsx` (admin) — manage golden {question, dataset, expected-SQL-or-result-shape}; "Run suite" → pass/fail grid with diff.
- **Backend:** `server/routes/eval.js` + an eval runner that calls the existing server-side NL→SQL path (`server-llm.js` / api-v1 query path) and compares result shape/rows. Reuse `validateReadOnlySql` + `query-runner`.
- **DevOps:** Optional: a GitHub Action that runs the suite on PRs touching `agent.ts`/prompts and posts a pass-rate comment.
- **Database:** `eval_cases`, `eval_runs` collections (org-scoped).
- **APIs:** `GET/POST /api/eval/cases`, `POST /api/eval/run`, `GET /api/eval/runs/:id`.
- **UX:** Green/red grid; click a failure → see expected vs actual SQL + rows (reuse trace timeline from F-OBS).
- **Stack:** Existing; exact-match + fuzzy row-set comparison (no LLM judge needed at first; add LLM-judge later).
- **Enterprise value:** High (quality SLAs).
- **Rollout:** Internal-only seed suite (10–20 cases) → admin UI → CI gate.
- **Risk:** Low. Eval runs cost tokens — meter & cap them; run on-demand/CI, not continuously.
- **Scalability:** Batch + cap concurrency; cache results per (model, prompt-hash, case).

---

### F-AUTO · Result-Driven Automations ("When → Then")

- **Why it matters:** You have *schedules* (run SQL on cron) and *alerts*, but they aren't composable into actions. n8n/Zapier's whole value is "when condition, do thing." You're one small layer away.
- **User/business impact:** Turns Querify from "ask" into "watch & act" — strong retention/daily-active driver.
- **Complexity:** Low-Medium (extends `schedules.js` + `alerts.js`).
- **Frontend:** Extend `AutomationsPage.tsx` — add a "Then" step: condition (`result > X`, `row count changed`, `new rows`) → action (email, webhook, Slack via webhook, create notification).
- **Backend:** Extend the scheduler Lambda: after a scheduled run, evaluate the condition, dispatch the action (reuse `notifications.js`; add an outbound-webhook sender behind `net-guard.js` SSRF protection).
- **DevOps:** None new (same EventBridge cron).
- **Database:** Extend the `schedules` doc with optional `condition` + `action` fields (additive — existing schedules ignore them).
- **APIs:** Extend existing schedule create/update payloads.
- **UX:** A compact "IF result … THEN …" builder; no canvas needed.
- **Stack:** Existing.
- **Enterprise value:** Medium-High (ops use cases).
- **Rollout:** Ship "notification" + "email" actions first; webhook/Slack next (behind `net-guard`).
- **Risk:** Outbound webhooks = SSRF surface → **must** route through `net-guard.js` allow/deny. Cap action rate.
- **Scalability:** Already cron-batched; add a per-org action quota.

---

### F-RBAC · Resource-Scoped Roles & Per-Action Permissions

- **Why it matters:** Today it's effectively `admin` vs member + plan gating. Enterprises need "Analyst can query but not delete datasets," "Viewer can only see dashboards." You already have `org_members` with a `role` field — extend it, don't replace.
- **User/business impact:** Unblocks larger teams/Enterprise; reduces accidental destructive actions.
- **Complexity:** Medium (mostly middleware + UI).
- **Frontend:** Role management in the org/admin UI (owner/admin/analyst/viewer); disable/hide actions by role (you already gate features by plan — same pattern).
- **Backend:** A `requireRole(...)`/`can(action)` middleware layered on top of existing `authMiddleware` + `orgContextMiddleware`; apply to write routes (datasets, dashboards, connections, deployments).
- **DevOps:** None.
- **Database:** Use existing `org_members.role`; optionally add a `permissions[]` override array (additive).
- **APIs:** No new routes — wrap existing ones with the guard.
- **UX:** Greyed actions with a tooltip ("Requires Analyst role"); consistent with current plan-lock UX.
- **Stack:** Existing.
- **Enterprise value:** High.
- **Rollout:** Define a fixed role→permission matrix first (owner > admin > analyst > viewer); enforce on destructive routes; expand gradually.
- **Risk:** Lock-out risk — default everyone to current effective permissions; never tighten silently. Owner always full.
- **Scalability:** Static matrix scales fine; move to ABAC only if customers demand it.

---

### F-MKT · Query / Template / Dashboard Gallery (viral loop) — **quick win**

- **Why it matters:** Cheapest growth loop you have. "Fork this dashboard," "use this query template" gets shared and pulls new users in.
- **User/business impact:** Onboarding accelerant (empty-state → "start from a template"), viral sharing, retention.
- **Complexity:** Low.
- **Frontend:** A "Templates" gallery (cards), and a "Publish to gallery" action on dashboards/saved queries; "Fork" copies into the user's workspace.
- **Backend:** `server/routes/templates.js` — public read, authed publish; "fork" clones into the caller's org (reuse existing dashboard/dataset create paths).
- **DevOps:** None.
- **Database:** `templates` collection `{ _id, type:'query'|'dashboard', payload, authorOrgId, public, installs, createdAt }`.
- **APIs:** `GET /api/templates`, `POST /api/templates`, `POST /api/templates/:id/fork`.
- **UX:** Notion-template-gallery feel; "Used by N teams" social proof.
- **Stack:** Existing.
- **Enterprise value:** Medium (internal org template libraries are an Enterprise feature too).
- **Rollout:** Seed with 8–10 first-party templates → allow user publishing (moderated) later.
- **Risk:** User-published content = moderation + injection surface → sanitize, require review before `public:true`, never auto-execute foreign SQL without the user's own dataset.
- **Scalability:** Cache the public gallery (CDN/edge); paginate.

---

### F-COLLAB · Document-Level Collaboration (comments, sharing, @mentions)

- **Why it matters:** Orgs exist but collaboration is implicit. Hex/Mode's stickiness is comments + shared docs.
- **Complexity:** Medium.
- **Frontend:** Comment thread panel on dashboards/queries; share dialog (link + role); `@mention` → notification.
- **Backend:** `comments` + `shares` collections (org-scoped); reuse `notifications.js` for mentions.
- **DB/API:** additive collections + `GET/POST /api/comments`, `POST /api/shares`.
- **Enterprise value:** Medium-High (team retention). **Risk:** low; **Rollout:** comments first, sharing-by-link second.

---

## PHASE 2 — Enterprise UI/UX Improvements (you already have a design system — this is *polish*, not redesign)

You already have: charcoal dark theme + muted primary, command palette, shared components, keyboard shortcuts, BrandLoader, skeletons, density toggle. So the asks below are the **remaining 20%** that read as "Linear-smooth":

1. **Resizable + collapsible panels on QueryPage** — `react-resizable-panels` is already a dependency. Make the result/SQL/chart panes resizable & collapsible (Retool ergonomics) with persisted layout (localStorage). *Low effort, high "pro" feel.*
2. **Breadcrumbs + workspace switcher** — you have orgs but no visible org switcher/breadcrumb. Add a compact breadcrumb (`Workspace / Dataset / Query`) and an org switcher in the top bar.
3. **Command palette → action-rich** — extend the existing `cmdk` palette with "Run query," "New dashboard," "Open trace," "Switch workspace," recent items.
4. **Streaming UX consistency** — you have live thoughts; standardize "AI thinking" states (skeleton → streaming tokens → result) across QueryPage *and* deployed chat for one coherent feel.
5. **Execution visualization** — the F-OBS trace timeline doubles as the "execution visualization" / minimap ask.
6. **Intelligent empty states** — wire the F-MKT gallery into empty states ("No datasets yet → start from a template").
7. **Mobile/tablet** — you've done reports mobile view; audit QueryPage + Settings for <768px (resizable panels must collapse to tabs on mobile).
8. **Accessibility pass** — Radix gives you a head start; add a focus-visible audit, `aria-live` on the streaming thought panel, and color-contrast check on the muted primary in light mode.

*No palette/branding change. All built from existing tokens + `shared/` components.*

---

## PHASE 3 — AI / Agentic Enhancements (you have the core — these are the next rungs)

You already ship: planner→sub-questions, native tool-calling + JSON fallback, reflection (complexity-gated), self-heal, streaming, agent/chat memory. Next, in priority order:

1. **Semantic-layer grounding (F-SEM)** — biggest accuracy lever; feed certified metrics into the agent context.
2. **Multi-model routing + fallback** — you abstracted providers in `llm-client.ts`; add a thin router: cost/latency-aware default + automatic fallback model on provider error (you already self-heal on *API* failure — extend to *provider* failover). Gate model choice by plan.
3. **Confidence scoring + "low-confidence" banner** — the verification turn already critiques; surface a confidence signal and show "I'm not fully sure — here's why" instead of a confident wrong answer. Pure-UX safety win.
4. **Eval-driven prompt/version management (F-EVAL)** — version prompts; every change runs the golden suite.
5. **MCP (Model Context Protocol) tool integration** — *later, premium.* Lets enterprises plug their own tools/data sources into the agent. High differentiation, medium effort; design it as another `ToolSchema` source feeding your existing native-tool path — so it reuses the machinery you already built.
6. **Long-term semantic memory** — you have agent/chat memory; add an embedding-backed "what this user/org usually asks" recall to pre-warm context (cost-aware, opt-in).

**Guardrails (AI safety) — net-new but cheap:** prompt-injection screening on user input + uploaded data (you already have `pii-scanner.js` — add an injection heuristic pass); never let the agent execute non-read-only SQL (already enforced via `validateReadOnlySql` ✅); add output moderation only if you open user-published templates (F-MKT).

---

## PHASE 4 — Backend / DevOps (Lambda-native — don't over-engineer toward k8s)

**Reality check:** you're on **AWS Lambda + API Gateway + Serverless Framework + MongoDB Atlas + Bedrock**. A Kafka/k8s/Celery recommendation would be malpractice for this architecture. Lambda *is* your autoscaling and serverless story. So the right moves are Lambda-appropriate:

1. **Caching layer (highest ROI):** add an LLM **response cache** (hash of model+prompt+schema → answer) and a **schema cache** to cut tokens & latency. MongoDB TTL collection now; **MomentoCache or Upstash Redis** (serverless-friendly, no idle cost) when you outgrow it. *Direct cost reduction — pairs with your token caps.*
2. **Cold-start mitigation:** provisioned concurrency on the hot LLM Lambda only (cost-controlled); keep DuckDB in the browser (you already do — that's a great cost decision, keep it).
3. **Async/background jobs:** you have EventBridge cron (schedules). For longer agent runs or eval suites, use **SQS + a worker Lambda** (not Celery/Kafka) — fits the stack, no servers.
4. **Observability stack:** **CloudWatch + AWS X-Ray** (native, zero infra) for traces; structured JSON logs already in routes. Add **OpenTelemetry** export only if a customer needs Datadog/Grafana. Your F-OBS app-level traces complement (not replace) infra traces.
5. **MongoDB optimization:** ensure compound indexes on hot queries (`{userId, dateStr}` on `daily_token_logs`, `{userId, ts}` on `auditlogs`/`history`, `{orgId}` on new collections). Add TTL indexes on `agent_traces`, `usage_events` (retention by plan).
6. **CI/CD:** you have `aws-backend-deploy.yml`. Add: (a) the F-EVAL golden-suite gate on agent/prompt changes, (b) a **staging stage** in `serverless.yml` (`--stage staging`) for prod separation, (c) `node --check` + `vite build` as required PR checks.
7. **Rate limiting:** API Gateway usage plans + per-API-key throttling on `api-v1` (you meter; add throttle). Protects cost.
8. **Edge/CDN:** Amplify already fronts the SPA; ensure long-cache immutable assets + the gallery (F-MKT) public reads are CDN-cached.

---

## PHASE 5 — Security & Enterprise Governance (you're closer than you think)

**Already have:** audit logs + CSV export, PII scanner, metering ledger, read-only SQL enforcement, SSRF guard (`net-guard.js`), encrypted credentials (`crypto.js`), Clerk SSO (Google/GitHub), API-key auth, multi-tenant org isolation.

**Genuinely missing / to deepen:**

1. **Resource-scoped RBAC (F-RBAC)** — covered above; this is the #1 governance gap.
2. **SSO/SAML + SCIM for Enterprise** — Clerk supports SAML/SCIM; this is mostly *configuration + plan-gating*, not new code. Document it as an Enterprise capability.
3. **Audit coverage audit** — make sure *every* destructive/sensitive action calls `logAudit` (you do for schedules; sweep datasets/connections/deployments/api-keys/orgs). Cheap, high trust value.
4. **Prompt-injection defense** — heuristic screen on inputs + uploaded sheets before they enter agent context (extend `pii-scanner.js`).
5. **Credential masking in logs/UI** — verify connection strings & API keys are never echoed (you already store no creds in `/api/v1/connections` — sweep the rest).
6. **SOC 2 / GDPR readiness as a doc, not code** — you already have the technical primitives (audit, encryption, isolation, data export, deletion via clear-db). Write the **data-flow + retention + DPA** docs and a **"Trust Center" page**; add a user **data-export + delete-my-data** self-serve endpoint (GDPR DSAR) reusing existing per-user deletes.
7. **Tenant isolation tests** — add automated tests asserting org A can never read org B's datasets/traces/metrics (you isolate by `userId`/`orgId` — *prove* it in CI).

---

## PHASE 6 — Growth & Monetization (lean into what's already metered)

**Already have:** Clerk Billing, 4 tiers, per-tier daily token caps, metering ledger, plan-gated features.

1. **Template/Agent gallery (F-MKT)** — the viral loop. *Quick win.*
2. **Usage-based add-on ("top-up tokens")** — you meter tokens & cap daily; sell overage packs (Clerk Billing one-time charges). Natural upsell when the 75% banner fires.
3. **Premium observability (F-OBS) + eval (F-EVAL)** — gate detailed traces/longer retention/eval to Professional+. Observability-as-upsell is proven (Datadog model).
4. **Team/collaboration plan (F-COLLAB)** — seats + shared workspaces = per-seat revenue, the highest-LTV SaaS motion.
5. **White-label / embed tier** — you have the embed widget + deployments; package "remove Querify branding + custom domain" as Enterprise.
6. **Feature-adoption analytics** — you have audit + metering; build an internal admin dashboard (funnel: signup → first dataset → first query → first dashboard → first share) to find drop-off. Drives the roadmap.
7. **Referral loop** — "invite a teammate, both get +X daily tokens" — ties growth to your existing token-cap system.

---

## Roadmaps

### Quick wins (≤1 week each, low effort / high impact)
- **F-MKT** gallery seeded with first-party templates (viral + onboarding).
- **Resizable/collapsible QueryPage panels** (dependency already installed).
- **Breadcrumbs + org switcher** in the top bar.
- **Audit-coverage sweep** (`logAudit` on all destructive routes).
- **Confidence banner** on low-confidence answers (reuse verification critique).
- **MongoDB index + TTL sweep** (cost + latency).

### 30-day roadmap
1. **F-SEM (Semantic/Metrics layer)** — CRUD + agent grounding (the differentiator).
2. **F-OBS (Traces)** — persist + read UI.
3. **F-EVAL (Golden questions)** — seed suite + CI gate (so you can change models safely).
4. **LLM response + schema cache** (cost reduction).
5. Quick wins above.

### 90-day roadmap
1. **F-RBAC** (resource-scoped roles) + SSO/SAML/SCIM enablement docs.
2. **F-AUTO** (when→then automations on schedules).
3. **F-COLLAB** (comments + sharing).
4. **Multi-model routing + fallback** with eval-gated rollout.
5. **Staging stage** in serverless + SQS worker for long jobs.
6. **Trust Center + GDPR self-serve export/delete.**

### Enterprise roadmap (sales-unblocking)
Semantic layer · RBAC + SAML/SCIM · audit completeness · observability/traces · eval/quality SLAs · white-label/embed · tenant-isolation tests · SOC 2 docs · org template libraries.

### Premium differentiators / WOW factor
- **Certified Metrics** ("✓ Certified" answers) — *nobody expects this from an NL→SQL tool.*
- **Agent trace flame-timeline** — Datadog-grade observability for *your own agent*.
- **MCP tool plug-in** (later) — enterprises connect their own tools to your agent.
- **Eval dashboard** — "we can prove our answer quality didn't regress."

### Retention drivers
Automations (daily-active) · collaboration/comments · templates · referral token-bonus · scheduled-report email digests.

---

## Guiding principle (so nothing breaks)
Every recommendation above is **additive**: new collections keyed on `orgId`/`userId`, new routes layered on existing `authMiddleware`/`orgContextMiddleware`, new agent context blocks that are no-ops when empty, new UI built from the existing `shared/` components and design tokens. No existing API signature, schema, workflow, or screen is modified — exactly matching how `orgs.js`, `metering.js`, and the agent upgrades were already shipped.
