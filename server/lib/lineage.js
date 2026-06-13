// ─── Dataset Lineage Graph ────────────────────────────────────────────────────
// Tracks provenance edges between platform objects: dataset → derived dataset
// (duplicate), dataset → insight, dataset → deployment, dataset → dashboard,
// schedule → history run, etc. Populated as fire-and-forget side-effects in
// existing routes — no user action required, no request ever blocked by it.

const { getDb } = require("../db");

const NODE_TYPES = new Set(["dataset", "insight", "deployment", "dashboard", "schedule", "alert", "query", "export", "connection"]);
const RELATIONS = new Set(["derived_from", "used_in", "exported_as", "deployed_as", "scheduled_by", "monitored_by", "ingested_into"]);

/**
 * Record one lineage edge. Safe to call without awaiting.
 * @param {object} edge - { userId, sourceId, sourceType, targetId, targetType, relation, meta? }
 */
async function recordLineage(edge) {
  try {
    const { userId, sourceId, sourceType, targetId, targetType, relation, meta } = edge || {};
    if (!userId || !sourceId || !targetId) return;
    if (!NODE_TYPES.has(sourceType) || !NODE_TYPES.has(targetType) || !RELATIONS.has(relation)) return;
    const db = await getDb();
    await db.collection("lineage").updateOne(
      { userId, sourceId, targetId, relation },
      {
        $set: { sourceType, targetType, meta: meta || {}, updatedAt: new Date().toISOString() },
        $setOnInsert: { createdAt: new Date().toISOString() },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error("recordLineage failed (non-fatal):", err.message);
  }
}

/**
 * Return the lineage subgraph around a node: all edges where the node is
 * source or target, expanded one extra hop in each direction.
 */
async function getLineageGraph(db, userId, nodeId) {
  const direct = await db
    .collection("lineage")
    .find({ userId, $or: [{ sourceId: nodeId }, { targetId: nodeId }] })
    .limit(200)
    .toArray();

  const neighborIds = new Set();
  for (const e of direct) {
    neighborIds.add(e.sourceId);
    neighborIds.add(e.targetId);
  }
  neighborIds.delete(nodeId);

  const secondHop = neighborIds.size
    ? await db
        .collection("lineage")
        .find({
          userId,
          $or: [
            { sourceId: { $in: [...neighborIds] } },
            { targetId: { $in: [...neighborIds] } },
          ],
        })
        .limit(300)
        .toArray()
    : [];

  const seen = new Set();
  const edges = [];
  for (const e of [...direct, ...secondHop]) {
    const key = `${e.sourceId}→${e.targetId}:${e.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      sourceId: e.sourceId,
      sourceType: e.sourceType,
      targetId: e.targetId,
      targetType: e.targetType,
      relation: e.relation,
      meta: e.meta || {},
      createdAt: e.createdAt,
    });
  }

  const nodes = new Map();
  for (const e of edges) {
    nodes.set(e.sourceId, { id: e.sourceId, type: e.sourceType });
    nodes.set(e.targetId, { id: e.targetId, type: e.targetType });
  }
  return { nodes: [...nodes.values()], edges };
}

module.exports = { recordLineage, getLineageGraph };
