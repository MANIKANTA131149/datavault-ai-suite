// ─── Agent Trace Writer (F-OBS) ───────────────────────────────────────────────
// Persists a compact, queryable record of one agent run: the ordered steps,
// token/cost/latency totals, model and status. Mirrors the fire-and-forget
// contract of metering.recordUsage — a trace write must NEVER slow down or fail
// a user-facing request. Fully additive: a brand-new `agent_traces` collection,
// nothing existing is touched.

const crypto = require("crypto");
const { getDb } = require("../db");

// Keep individual fields bounded so a runaway agent can't bloat a document.
const MAX_STEPS = 60;
const MAX_FIELD = 5000;

function clip(v, n = MAX_FIELD) {
  if (v === null || v === undefined) return v;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) : s;
}

function sanitizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.slice(0, MAX_STEPS).map((s, i) => ({
    index: i,
    command: clip(s?.command || s?.type || "step", 80),
    summary: clip(s?.summary || s?.label || "", 500),
    reasoning: clip(s?.reasoning || "", 1000),
    sql: clip(s?.sql || s?.args?.sql || "", MAX_FIELD),
    rows: typeof s?.rows === "number" ? s.rows : (Array.isArray(s?.result) ? s.result.length : undefined),
    final: !!s?.final,
    tokens: typeof s?.tokens === "number" ? s.tokens : undefined,
    latencyMs: typeof s?.latencyMs === "number" ? s.latencyMs : undefined,
  }));
}

/**
 * Record one agent trace. Safe to call without awaiting.
 * @param {object} t - { userId, orgId?, question, steps[], totalTokens?, costUsd?, latencyMs?, model?, status?, provider?, datasetId?, connectionId? }
 * @returns {Promise<string|null>} the trace id (best-effort)
 */
async function recordTrace(t) {
  try {
    const { userId } = t || {};
    if (!userId) return null;
    const db = await getDb();
    const id = `trc_${crypto.randomBytes(8).toString("hex")}`;
    await db.collection("agent_traces").insertOne({
      _id: id,
      userId,
      orgId: t.orgId || `personal:${userId}`,
      question: clip(t.question || "", 2000),
      steps: sanitizeSteps(t.steps),
      stepCount: Array.isArray(t.steps) ? t.steps.length : 0,
      totalTokens: Number(t.totalTokens) || 0,
      costUsd: Number(t.costUsd) || 0,
      latencyMs: Number(t.latencyMs) || 0,
      model: clip(t.model || "", 120),
      provider: clip(t.provider || "", 60),
      status: clip(t.status || "ok", 40),
      datasetId: t.datasetId || null,
      connectionId: t.connectionId || null,
      ts: new Date().toISOString(),
      day: new Date().toISOString().slice(0, 10),
    });
    return id;
  } catch (err) {
    console.error("recordTrace failed (non-fatal):", err.message);
    return null;
  }
}

module.exports = { recordTrace };
