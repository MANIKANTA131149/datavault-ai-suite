// ─── Server-Sent Events ────────────────────────────────────────────────────────
// Live push channel for notifications and scheduled-run/alert completions.
// Works fully on the long-lived Express server (self-hosted / local dev).
// Behind Lambda + API Gateway responses are buffered, so the stream closes
// quickly — clients (src/lib/events-client.ts) detect this and silently fall
// back to their existing polling. Either way nothing breaks.
//
// Auth: EventSource cannot set headers, so the Clerk token is passed as ?token=

const express = require("express");
const { verifyToken } = require("@clerk/backend");
const { getDb } = require("../db");

const router = express.Router();

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_MS = 25000;
const MAX_LIFETIME_MS = 10 * 60 * 1000; // re-handshake every 10 min

router.get("/stream", async (req, res) => {
  // CORS for the SSE response. The cors() middleware sets these, but the
  // res.writeHead() below replaces the whole header set — and the 401 path
  // returns before any middleware-set headers matter — so apply them here too.
  // EventSource never sends credentials, so echoing the allowed origin (not "*")
  // is the correct, safe value.
  const origin = req.headers.origin;
  const allowOrigin = req.app.locals.isAllowedOrigin;
  const corsHeaders = {};
  if (origin && (!allowOrigin || allowOrigin(origin))) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
    corsHeaders["Vary"] = "Origin";
  }

  let userId;
  try {
    const payload = await verifyToken(String(req.query.token || ""), { secretKey: CLERK_SECRET_KEY });
    userId = payload.sub;
  } catch {
    res.set(corsHeaders);
    return res.status(401).json({ error: "Unauthorized — invalid token" });
  }

  res.writeHead(200, {
    ...corsHeaders,
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
