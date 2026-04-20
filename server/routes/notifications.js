const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

// ─── GET /api/notifications — get notifications for current user ──────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const notifications = await db.collection("notifications")
      .find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.json(notifications.map(({ _id, ...n }) => ({ id: _id.toString(), ...n })));
  } catch (err) {
    console.error("get notifications error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/notifications/unread-count ─────────────────────────────────────
router.get("/unread-count", async (req, res) => {
  try {
    const db = await getDb();
    const count = await db.collection("notifications")
      .countDocuments({ userId: req.userId, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /api/notifications/:id/read — mark one as read ──────────────────────
router.put("/:id/read", async (req, res) => {
  try {
    const db = await getDb();
    const { ObjectId } = require("mongodb");
    await db.collection("notifications").updateOne(
      { _id: new ObjectId(req.params.id), userId: req.userId },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /api/notifications/read-all — mark all as read ──────────────────────
router.put("/read-all", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("notifications").updateMany(
      { userId: req.userId, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /api/notifications/:id — dismiss one ─────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const { ObjectId } = require("mongodb");
    await db.collection("notifications").deleteOne(
      { _id: new ObjectId(req.params.id), userId: req.userId }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /api/notifications — clear all ───────────────────────────────────
router.delete("/", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("notifications").deleteMany({ userId: req.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Internal helper — used by other routes to create notifications ───────────
// POST /api/notifications/internal (no auth — called server-side)
async function createNotification(db, userId, { type, title, message, icon = "bell", link = null }) {
  try {
    await db.collection("notifications").insertOne({
      userId,
      type,   // "dataset_upload" | "query_complete" | "admin_action" | "alert" | "system"
      title,
      message,
      icon,
      link,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("createNotification failed:", err.message);
  }
}

module.exports = router;
module.exports.createNotification = createNotification;
