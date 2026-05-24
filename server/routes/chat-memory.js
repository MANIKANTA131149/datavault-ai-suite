/**
 * /api/chat-memory  — LangChain-style short-term memory backed by MongoDB
 *
 * Design: one "session" = one dataset/connection × user.
 * Each session stores the last MAX_TURNS Q→A pairs.
 * Routes
 *   GET  /?sessionId=<id>         → { turns: [{question,answer,ts},...] }
 *   POST /                        → upsert turn  body: { sessionId, question, answer }
 *   DELETE /?sessionId=<id>       → clear session
 */

const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

const MAX_TURNS = 3;          // last 3 Q/A pairs passed as context
const MAX_CONTENT_LEN = 600;  // truncate long answers to save tokens

function trimContent(text) {
  if (typeof text !== "string") return String(text ?? "").slice(0, MAX_CONTENT_LEN);
  return text.length > MAX_CONTENT_LEN ? text.slice(0, MAX_CONTENT_LEN) + "\u2026" : text;
}

// ── GET: fetch memory for a session ──────────────────────────────────────────
router.get("/", async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  try {
    const db = await getDb();
    const doc = await db.collection("chat_memory").findOne({
      userId: req.userId,
      sessionId,
    });
    res.json({ turns: doc?.turns ?? [] });
  } catch (err) {
    console.error("chat-memory GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST: append a turn (keep last MAX_TURNS) ─────────────────────────────────
router.post("/", async (req, res) => {
  const { sessionId, question, answer } = req.body;
  if (!sessionId || !question) return res.status(400).json({ error: "sessionId and question required" });

  const newTurn = {
    question: trimContent(question),
    answer: trimContent(answer ?? ""),
    ts: new Date(),
  };

  try {
    const db = await getDb();
    const coll = db.collection("chat_memory");

    const doc = await coll.findOne({ userId: req.userId, sessionId });
    const existing = doc?.turns ?? [];
    const updated = [...existing, newTurn].slice(-MAX_TURNS);

    await coll.updateOne(
      { userId: req.userId, sessionId },
      {
        $set: {
          userId: req.userId,
          sessionId,
          turns: updated,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    res.status(200).json({ success: true, storedTurns: updated.length });
  } catch (err) {
    console.error("chat-memory POST error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE: clear session memory ──────────────────────────────────────────────
router.delete("/", async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  try {
    const db = await getDb();
    await db.collection("chat_memory").deleteOne({ userId: req.userId, sessionId });
    res.json({ success: true });
  } catch (err) {
    console.error("chat-memory DELETE error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
