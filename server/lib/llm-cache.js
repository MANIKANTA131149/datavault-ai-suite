// ─── LLM Response & Schema Cache (cost optimization) ──────────────────────────
// A bounded, TTL-expiring cache for deterministic-ish server LLM work
// (NL→SQL generation for a given question + schema + model). Cuts tokens and
// latency on repeated questions. Backed by a Mongo TTL collection so there is
// no new infrastructure; swap for Redis/Momento later without touching callers.
//
// Fully additive and OPTIONAL — callers fall back to a live call on any miss or
// error, so behavior is identical when the cache is empty or unavailable.

const crypto = require("crypto");
const { getDb } = require("../db");

const COLLECTION = "llm_cache";
const DEFAULT_TTL_SECONDS = 60 * 60 * 6; // 6h

function cacheKey(parts) {
  const h = crypto.createHash("sha256");
  h.update(JSON.stringify(parts));
  return h.digest("hex");
}

async function getCached(parts) {
  try {
    const db = await getDb();
    const key = cacheKey(parts);
    const doc = await db.collection(COLLECTION).findOne({ _id: key });
    if (!doc) return null;
    if (doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now()) return null;
    return doc.value;
  } catch {
    return null;
  }
}

async function setCached(parts, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  try {
    const db = await getDb();
    const key = cacheKey(parts);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await db.collection(COLLECTION).updateOne(
      { _id: key },
      { $set: { value, expiresAt, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  } catch { /* non-fatal */ }
}

module.exports = { getCached, setCached, cacheKey, COLLECTION };
