// ─── Usage Metering API ───────────────────────────────────────────────────────
const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { getUsageSummary } = require("../lib/metering");

const router = express.Router();
router.use(authMiddleware);

// ─── Aggregated usage summary (dashboard + billing foundation) ────────────────
router.get("/summary", async (req, res) => {
  try {
    const db = await getDb();
    const { from, to } = req.query;
    const summary = await getUsageSummary(db, req.userId, {
      from: typeof from === "string" ? from : undefined,
      to: typeof to === "string" ? to : undefined,
    });
    res.json(summary);
  } catch (err) {
    console.error("usage summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Raw usage events (paginated) ─────────────────────────────────────────────
router.get("/events", async (req, res) => {
  try {
    const db = await getDb();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const events = await db
      .collection("usage_events")
      .find({ userId: req.userId })
      .sort({ ts: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    res.json(events.map(({ _id, ...e }) => ({ id: _id.toString(), ...e })));
  } catch (err) {
    console.error("usage events error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
