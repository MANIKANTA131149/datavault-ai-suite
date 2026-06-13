// ─── Server-Sent Events (F6) ──────────────────────────────────────────────────
// Live push channel for notifications and scheduled-run/alert completions.
// Works fully on the long-lived Express server (self-hosted / local dev).
// Behind Lambda + API Gateway responses are buffered, so the stream closes
// quickly — clients (src/lib/events-client.ts) detect this and silently fall
// back to their existing polling. Either way nothing breaks.
//
// Auth: EventSource cannot set headers, so the JWT is passed as ?token=...

const express = require("express");
const jwt = require("jsonwebtoken");
const { getDb } = require("../db");
const { JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_MS = 25000;
const MAX_LIFETIME_MS = 10 * 60 * 1000; // re-handshake every 10 min

router.get("/stream", async (req, res) => {
  let userId;
  try {
    const payload = jwt.verify(String(req.query.token || ""), JWT_SECRET);
    userId = payload.userId;
  } catch {
    return res.status(401).json({ error: "Unauthorized — invalid token" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);

  let lastCheck = new Date().toISOString();
  let closed = false;

  const poll = setInterval(async () => {
    if (closed) return;
    try {
      const db = await getDb();
      const fresh = await db
        .collection("notifications")
        .find({ userId, createdAt: { $gt: lastCheck } })
        .sort({ createdAt: 1 })
        .limit(20)
        .toArray();
      if (fresh.length > 0) {
        lastCheck = fresh[fresh.length - 1].createdAt;
        for (const n of fresh) {
          const { _id, ...rest } = n;
          res.write(`event: notification\ndata: ${JSON.stringify({ id: _id.toString(), ...rest })}\n\n`);
        }
      }
    } catch (err) {
      console.error("SSE poll error:", err.message);
    }
  }, POLL_INTERVAL_MS);

  const heartbeat = setInterval(() => {
    if (!closed) res.write(`: heartbeat ${Date.now()}\n\n`);
  }, HEARTBEAT_MS);

  const lifetime = setTimeout(() => cleanup(), MAX_LIFETIME_MS);

  function cleanup() {
    if (closed) return;
    closed = true;
    clearInterval(poll);
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    try { res.end(); } catch { /* already gone */ }
  }

  req.on("close", cleanup);
});

module.exports = router;
