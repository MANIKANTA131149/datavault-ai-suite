# Querify — Production Release Readiness Plan

Owner: CTO / Architecture. Status: pre-release audit, 2026-06-12.
Scope: React/Vite frontend (Amplify), Express-on-Lambda backend (API Gateway httpApi), MongoDB Atlas, Auth0 + password auth, user-supplied LLM keys, live DB connections, public deployed-chat endpoints.

Severity legend: **P0 = launch blocker**, **P1 = first two weeks**, **P2 = first quarter**.

---

## 1. Security — P0 (do not launch without these)

### 1.1 Lock down CORS (server/app.js:25-44)
Today the origin callback ends in `callback(null, true)` for **every** origin — the allowlist above it is decorative. With `credentials: true` this lets any website script call your API with users' credentials.
- Replace with a strict allowlist: `FRONTEND_URL`, `https://www.querify.in`, `https://querify.in`. Reject everything else (`callback(new Error("CORS"))`).
- Remove the wildcard `.vercel.app` / `.amplifyapp.com` matches (anyone can host on those domains).

### 1.2 Rate limiting — none exists today
Two layers:
- **Edge (cheapest, do first):** API Gateway throttling on the httpApi stage — e.g. 50 rps / 100 burst account-wide via `serverless.yml` (`httpApi.throttle`). Protects Lambda bill from floods.
- **App-level (per-IP / per-user):** `express-rate-limit` with tight buckets on the hot paths:
  - `POST /api/auth/login`, `/signup`, `/auth0-login`: 5–10/min per IP (brute-force defense — there is **no lockout today**).
  - `/api/llm/*` (token-spending routes): per-user quota, not just per-IP.
  - `/api/deployments/*` public chat: per-deployment + per-IP (these endpoints spend YOUR tokens unauthenticated).
  - Everything else: generous default (e.g. 300/min/IP).
  - Note Lambda is stateless — in-memory stores reset per container. Acceptable for v1 (per-container limiting still blunts attacks); move to a Mongo/Redis-backed store in P1.

### 1.3 NoSQL operator injection
`findOne({ email })` with `email` taken raw from the body: a payload like `{"email": {"$ne": null}}` matches arbitrary documents. Audit every route that puts request values into Mongo queries.
- Cheapest systemic fix: `express-mongo-sanitize` middleware (strips `$`/`.` keys) + explicit `typeof x === "string"` checks on auth routes.

### 1.4 Security headers
No `helmet`. Add it (Express) with sane defaults; on the Amplify side add CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` via custom headers. CSP matters extra here because **user LLM API keys live in localStorage** — XSS = stolen OpenAI/Anthropic keys.

### 1.5 Be honest about the RC4 layer (src/lib/crypto.ts, server/lib/crypto.js)
RC4 with the key baked into the public JS bundle is obfuscation, not encryption — anyone can extract the key in 5 minutes. That's acceptable as a casual-scraping deterrent ONLY if you never claim it as a security feature.
- Do **not** market "encrypted payloads".
- Real confidentiality is TLS — enforce HTTPS-only (API GW does; verify no http:// fallbacks).
- P2: replace with request signing (HMAC of body + timestamp, key server-issued per session) if you want tamper-evidence, or drop the layer.

### 1.6 Secrets hygiene
- `JWT_SECRET`, `MONGODB_URI`, `API_ENCRYPTION_KEY`, `ANALYTICS_*`, `AUTH0_*` — all in GitHub Secrets ✔. Verify none are committed in `.env` history (`git log -p -- .env*`); if ever committed, **rotate them all** before launch.
- MongoDB Atlas: enable IP access list (Lambda NAT or 0.0.0.0/0 + strong auth at minimum), enable encryption at rest (default on Atlas), create a least-privilege DB user (readWrite on your DB only, not `admin`).
- Bedrock/Querify-provider credentials: confirm the server-side AWS role has only `bedrock:InvokeModel` on the allowed model ARNs.

### 1.7 Auth hardening
- JWT expiry is 7 days with no revocation. v1 acceptable, but: shorten to 24h + silent re-auth via Auth0, or add a token version claim per user (bump on password change/logout-all → check in auth middleware).
- bcrypt cost 10 → 12.
- Add password policy (min 8 + zxcvbn-style check on signup), generic error messages ("invalid credentials", never "user not found").
- Admin routes: verify every `/api/admin/*` and `/api/analytics/*` handler checks role server-side (not just hidden in the UI).

### 1.8 Live DB connections (connections.js / db-query.js) — SSRF & credential custody
Users give you their Postgres/MySQL/Snowflake credentials and you connect to arbitrary hosts/ports.
- **SSRF:** block connections to private ranges (127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254.169.254 — the AWS metadata endpoint!) and your own VPC CIDR. An attacker can otherwise use the "connect to my DB" feature to scan your internal network.
- **Credential custody:** connection passwords must be encrypted at rest in Mongo with a real cipher (AES-256-GCM, key in AWS KMS or at least a Lambda env var that is NOT the RC4 key). State this in the privacy policy.
- Enforce statement timeouts and read-only intent where feasible.

### 1.9 Public deployed-chat endpoints (/deploy/:deployId)
These are unauthenticated by design and spend the deployer's LLM quota.
- Per-deployment rate limit + daily token budget; kill switch per deployment.
- Prompt-injection containment: deployed chat must never expose other users' data — verify the deployment's context is scoped strictly to the deployed dataset/connection.

---

## 2. Abuse & cost controls — P0/P1

- **LLM spend caps (P0):** per-user daily token budgets enforced server-side for the Querify provider (free tier especially). One scripted user can otherwise drain the Bedrock bill overnight. You already track daily tokens — add a hard server-side reject, not just a UI meter.
- **Body size (P0):** `express.json({ limit: "50mb" })` is a DoS invitation on a 1024MB Lambda. Drop to 2–5mb globally; raise only on the dataset-upload route if uploads go through the API (large file parsing is client-side anyway).
- **Lambda guardrails (P1):** set `reservedConcurrency` (e.g. 50) so a flood can't run up unbounded concurrent executions; CloudWatch billing alarm + AWS Budget alert at 2 thresholds.
- **Signup abuse (P1):** email verification (Auth0 gives it free) or CAPTCHA on password signup; throttle signups per IP.

---

## 3. Reliability & operations — P1

- **Observability:** structured logs (request id, user id, route, latency) → CloudWatch; CloudWatch alarms on 5xx rate, p95 latency, Lambda errors/throttles; UptimeRobot/HealthCheck on `/api` + frontend. Add Sentry (frontend + backend) for stack traces — you currently debug via user screenshots.
- **Error budget for LLM providers:** timeouts + retries exist in `callLLMWithRetry` ✔; add circuit-breaker messaging when a provider is down.
- **Backups/DR:** Atlas continuous backup + tested restore (run one restore drill). Export of users/connections collections especially.
- **Runbook:** one page — how to roll back (re-run previous GitHub Action), rotate a leaked secret, disable a deployment, ban a user.
- **Staging environment:** a `dev` stage in serverless.yml + an Amplify preview branch; never test migrations in prod.
- **Mongo indexes:** ensure indexes on `users.email` (unique), `history.userId+createdAt`, `deployments.deployId` — Lambda cold queries on unindexed collections will bite at scale.

---

## 4. Data privacy & legal — P0 (cheap but mandatory)

- **Privacy policy + ToS accuracy:** strongest selling point — uploaded spreadsheets are processed **in the browser** (DuckDB-WASM) and not stored server-side; per-dataset agent memory is localStorage-only. Say this explicitly. Disclose what IS stored: account, query history text, connection configs (encrypted), audit logs.
- **LLM data flow disclosure:** user queries + data samples are sent to the selected LLM provider (Bedrock/OpenAI/etc.). Users bringing their own keys accept their provider's terms; Querify-provider traffic goes through your Bedrock account — document retention.
- **Data deletion:** "delete my account" must actually cascade (user doc, history, connections, deployments, audit). Verify it does.
- **If targeting EU users (P1):** GDPR basics — lawful basis, DPA with MongoDB/AWS (standard), data export endpoint.

---

## 5. Release engineering — P1

- **Pin CI:** `npm ci` ✔; add `npm audit --omit=dev --audit-level=high` as a non-blocking report first, blocking later.
- **Branch protection:** require PR + green build for `main` (it currently deploys straight to prod Lambda on push).
- **Versioned releases:** tag releases; keep the previous Lambda artifact for instant rollback (serverless keeps old versions — set `versionFunctions: true` + an alias, or just re-run the previous workflow).
- **Smoke test post-deploy:** workflow step that hits `/api/auth` health + one encrypted round-trip after deploy; fail loudly.
- **Golden eval set for the agent:** ~20 (dataset, question, expected answer) pairs run in CI so agent prompt changes can't silently regress accuracy.

---

## 6. Performance & scale checkpoints — P2

- API Gateway + Lambda will scale fine to thousands of users; the watch items are: Mongo connection storms (use cached client across invocations — verify db.js does), Bedrock model quotas (request limit raises ahead of growth), Lambda 250MB bundle ceiling (already trimmed; watch new deps).
- Frontend: `index.js` chunk is 791kB — code-split the heaviest routes later; not a blocker.
- DuckDB-WASM is client-side: zero server scale impact (good); ceiling ~1M rows/browser documented in-app.

---

## Suggested execution order (2 sprints)

**Sprint 1 (blockers):** CORS allowlist → helmet + mongo-sanitize → express-rate-limit on auth/llm/deploy → API GW throttle + reservedConcurrency → body limit 5mb → server-side token budgets → SSRF blocklist for connections → secrets rotation check → privacy policy/ToS truth pass → delete-account cascade verify.

**Sprint 2 (hardening):** Sentry + CloudWatch alarms + uptime checks → staging stage → branch protection + post-deploy smoke test → JWT shortening/version claim → bcrypt 12 + password policy → email verification → connection-credential AES-GCM at rest → Mongo indexes + restore drill → runbook.

**Quarter:** request signing or drop RC4 layer → Redis/Mongo-backed rate limit store → GDPR export → golden eval CI → load test (k6) at 10× expected traffic.

