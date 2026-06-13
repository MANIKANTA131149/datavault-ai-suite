// ─── Persistent Agent Memory (F2) ─────────────────────────────────────────────
// Server-side copy of the per-dataset agent memory (glossary of answered
// clarifications + verified SQL examples). The browser keeps localStorage as
// a fast cache; this collection makes memory survive new devices, browsers
// and incognito sessions. Merge strategy: union by normalized key, newest ts
// wins, capped to the same limits as the client.

const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

const MAX_EXAMPLES = 25;
const MAX_GLOSSARY = 15;

function sanitizeEntries(list, fields, maxLen, cap) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && typeof e === "object" && fields.every((f) => typeof e[f] === "string" && e[f].trim()))
    .map((e) => {
      const out = { ts: Number(e.ts) || Date.now() };
      for (const f of fields) out[f] = String(e[f]).slice(0, maxLen);
      return out;
    })
    .slice(-cap);
}

function mergeByKey(existing, incoming, keyField, cap) {
  const byKey = new Map();
  for (const e of [...existing, ...incoming]) {
    const key = e[keyField].trim().toLowerCase();
    const prev = byKey.get(key);
    if (!prev || (e.ts || 0) >= (prev.ts || 0)) byKey.set(key, e);
  }
  return [...byKey.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-cap);
}

// ─── Fetch memory for a dataset ───────────────────────────────────────────────
router.get("/:datasetKey", async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection("agent_memory").findOne({ userId: req.userId, datasetKey: req.params.datasetKey });
    res.json({
      glossary: doc?.glossary || [],
      examples: doc?.examples || [],
      updatedAt: doc?.updatedAt || null,
    });
  } catch (err) {
    console.error("get agent memory error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Merge-upsert memory for a dataset ────────────────────────────────────────
router.put("/:datasetKey", async (req, res) => {
  try {
    const incomingGlossary = sanitizeEntries(req.body?.glossary, ["asked", "answer"], 300, MAX_GLOSSARY);
    const incomingExamples = sanitizeEntries(req.body?.examples, ["question", "sql"], 2000, MAX_EXAMPLES);

    const db = await getDb();
    const filter = { userId: req.userId, datasetKey: req.params.datasetKey };
    const existing = (await db.collection("agent_memory").findOne(filter)) || { glossary: [], examples: [] };

    const glossary = mergeByKey(existing.glossary || [], incomingGlossary, "asked", MAX_GLOSSARY);
    const examples = mergeByKey(existing.examples || [], incomingExamples, "question", MAX_EXAMPLES);

    await db.collection("agent_memory").updateOne(
      filter,
      {
        $set: { glossary, examples, updatedAt: new Date().toISOString() },
        $setOnInsert: { createdAt: new Date().toISOString() },
      },
      { upsert: true }
    );

    res.json({ glossary, examples });
  } catch (err) {
    console.error("put agent memory error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Forget a dataset's memory ────────────────────────────────────────────────
router.delete("/:datasetKey", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("agent_memory").deleteOne({ userId: req.userId, datasetKey: req.params.datasetKey });
    res.json({ success: true });
  } catch (err) {
    console.error("delete agent memory error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
