// ─── Index & TTL Sweep ─────────────────────────────────────────────────────────
// Best-effort creation of the indexes that keep hot queries fast and bound the
// growth of append-only/cache collections via TTL. Runs once per process after
// the first DB connection. Entirely additive: createIndex is idempotent and any
// failure is logged and swallowed so it can never block startup or a request.

async function ensureIndexes(db) {
  const tasks = [
    // Hot read paths
    ["daily_token_logs", { userId: 1, dateStr: 1 }, {}],
    ["auditlogs", { userId: 1, ts: -1 }, {}],
    ["usage_events", { userId: 1, day: 1 }, {}],
    ["agent_traces", { userId: 1, ts: -1 }, {}],
    ["metrics", { orgId: 1 }, {}],
    ["templates", { public: 1, status: 1, installs: -1 }, {}],
    ["templates", { authorUserId: 1 }, {}],
    ["comments", { resourceType: 1, resourceId: 1, createdAt: 1 }, {}],
    ["shares", { resourceType: 1, resourceId: 1 }, {}],
    ["eval_cases", { userId: 1 }, {}],
    ["eval_runs", { userId: 1, ts: -1 }, {}],
    ["schedules", { enabled: 1, nextRun: 1 }, {}],

    // TTL: auto-expire cache + bound trace/usage growth.
    ["llm_cache", { expiresAt: 1 }, { expireAfterSeconds: 0 }],
    // 90-day retention on traces (TTL on an ISO-string date won't work; use a
    // real Date field. agent_traces stores `ts` as ISO string, so we add a
    // dedicated createdAtDate when writing is not guaranteed — instead expire
    // via a Date field only where present). Kept conservative: no destructive TTL
    // on existing business collections.
  ];

  for (const [coll, keys, opts] of tasks) {
    try {
      await db.collection(coll).createIndex(keys, opts);
    } catch (err) {
      console.warn(`ensureIndexes: ${coll} ${JSON.stringify(keys)} -> ${err.message}`);
    }
  }
}

module.exports = { ensureIndexes };
