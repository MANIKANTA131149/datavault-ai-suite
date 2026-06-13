// ─── Usage Metering Infrastructure ────────────────────────────────────────────
// Append-only usage_events collection: the single source of truth for billable
// units (LLM tokens, query executions, exports, public API calls, scheduled
// runs). Fire-and-forget writes — metering must never slow down or fail a
// user-facing request.

const { getDb } = require("../db");

const EVENT_TYPES = new Set([
  "llm_tokens",
  "query_execution",
  "export",
  "api_call",
  "scheduled_run",
  "alert_evaluation",
  "embed_query",
]);

/**
 * Record one usage event. Safe to call without awaiting.
 * @param {object} evt - { userId, orgId?, eventType, units, metadata? }
 */
async function recordUsage(evt) {
  try {
    const { userId, orgId, eventType, units, metadata } = evt || {};
    if (!userId || !EVENT_TYPES.has(eventType)) return;
    const db = await getDb();
    await db.collection("usage_events").insertOne({
      userId,
      orgId: orgId || `personal:${userId}`,
      eventType,
      units: Number(units) || 0,
      metadata: metadata || {},
      ts: new Date().toISOString(),
      day: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("recordUsage failed (non-fatal):", err.message);
  }
}

/**
 * Aggregate usage for a user over a date range, grouped by day + eventType.
 * Powers the usage dashboard and (later) Stripe metered billing reports.
 */
async function getUsageSummary(db, userId, { from, to } = {}) {
  const match = { userId };
  if (from || to) {
    match.day = {};
    if (from) match.day.$gte = from;
    if (to) match.day.$lte = to;
  }
  const rows = await db
    .collection("usage_events")
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: { day: "$day", eventType: "$eventType" },
          units: { $sum: "$units" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.day": 1 } },
    ])
    .toArray();

  const byDay = {};
  const totals = {};
  for (const r of rows) {
    const { day, eventType } = r._id;
    byDay[day] = byDay[day] || {};
    byDay[day][eventType] = { units: r.units, count: r.count };
    totals[eventType] = totals[eventType] || { units: 0, count: 0 };
    totals[eventType].units += r.units;
    totals[eventType].count += r.count;
  }
  return { byDay, totals };
}

module.exports = { recordUsage, getUsageSummary, EVENT_TYPES };
