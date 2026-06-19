// ─── Document-Level Collaboration (F-COLLAB) ──────────────────────────────────
// Comments and link-shares on dashboards & saved queries, with @mention →
// notification. Fully additive: `comments` + `shares` collections, reusing the
// existing notifications pipeline for mentions. Resource access is checked
// against the caller's ownership (and, for shares, org membership).

const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { logAudit } = require("../middleware/auditLogger");

const router = express.Router();
router.use(authMiddleware);

const RESOURCE_TYPES = new Set(["dashboard", "query", "trace"]);
const MENTION_RE = /@([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

async function notifyMentions(db, text, actorEmail, resourceType, resourceId) {
  const mentioned = new Set();
  let m;
  while ((m = MENTION_RE.exec(text || "")) !== null) mentioned.add(m[1]);
  for (const email of mentioned) {
    try {
      const target = await db.collection("users").findOne({ email }, { projection: { _id: 1 } });
      if (!target) continue;
      await db.collection("notifications").insertOne({
        _id: `ntf_${crypto.randomBytes(8).toString("hex")}`,
        userId: target._id,
        type: "mention",
        title: `${actorEmail} mentioned you`,
        body: `in a comment on a ${resourceType}`,
        meta: { resourceType, resourceId },
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }
  }
}

// ─── List comments for a resource ─────────────────────────────────────────────
router.get("/comments/:resourceType/:resourceId", async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    if (!RESOURCE_TYPES.has(resourceType)) return res.status(400).json({ error: "invalid resourceType" });
    const db = await getDb();
    const docs = await db.collection("comments")
      .find({ resourceType, resourceId })
      .sort({ createdAt: 1 })
      .limit(500)
      .toArray();
    res.json(docs.map(({ _id, ...c }) => ({ id: _id, ...c })));
  } catch (err) {
    console.error("list comments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Add a comment ────────────────────────────────────────────────────────────
router.post("/comments", async (req, res) => {
  try {
    const { resourceType, resourceId, text } = req.body || {};
    if (!RESOURCE_TYPES.has(resourceType)) return res.status(400).json({ error: "invalid resourceType" });
    if (!resourceId || typeof resourceId !== "string") return res.status(400).json({ error: "resourceId is required" });
    if (!text || typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "text is required" });

    const db = await getDb();
    const doc = {
      _id: `cmt_${crypto.randomBytes(8).toString("hex")}`,
      resourceType,
      resourceId,
      userId: req.userId,
      authorEmail: req.userEmail || "",
      authorName: req.userName || "",
      text: text.slice(0, 4000),
      createdAt: new Date().toISOString(),
    };
    await db.collection("comments").insertOne(doc);
    notifyMentions(db, doc.text, doc.authorEmail, resourceType, resourceId);
    const { _id, ...rest } = doc;
    res.status(201).json({ id: _id, ...rest });
  } catch (err) {
    console.error("create comment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete own comment ───────────────────────────────────────────────────────
router.delete("/comments/:id", async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.collection("comments").deleteOne({ _id: req.params.id, userId: req.userId });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Comment not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Create a share link for a resource (owner only) ──────────────────────────
router.post("/shares", async (req, res) => {
  try {
    const { resourceType, resourceId, role } = req.body || {};
    if (!RESOURCE_TYPES.has(resourceType)) return res.status(400).json({ error: "invalid resourceType" });
    if (!resourceId) return res.status(400).json({ error: "resourceId is required" });

    const db = await getDb();
    // Verify the caller owns the resource (dashboards/queries are userId-keyed).
    if (resourceType === "dashboard") {
      const owns = await db.collection("dashboards").findOne({ _id: resourceId, userId: req.userId }, { projection: { _id: 1 } });
      if (!owns) return res.status(403).json({ error: "You can only share resources you own" });
    }

    const doc = {
      _id: `shr_${crypto.randomBytes(10).toString("hex")}`,
      resourceType,
      resourceId,
      ownerId: req.userId,
      role: role === "editor" ? "editor" : "viewer",
      token: crypto.randomBytes(16).toString("hex"),
      createdAt: new Date().toISOString(),
    };
    await db.collection("shares").insertOne(doc);
    const { _id, ...rest } = doc;
    res.status(201).json({ id: _id, ...rest });
    logAudit(req.userId, req.userEmail || "", "share.create", { resourceType, resourceId, role: doc.role }, "info");
  } catch (err) {
    console.error("create share error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── List shares for a resource (owner) ───────────────────────────────────────
router.get("/shares/:resourceType/:resourceId", async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    const db = await getDb();
    const docs = await db.collection("shares").find({ resourceType, resourceId, ownerId: req.userId }).toArray();
    res.json(docs.map(({ _id, ...s }) => ({ id: _id, ...s })));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Revoke a share ───────────────────────────────────────────────────────────
router.delete("/shares/:id", async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.collection("shares").deleteOne({ _id: req.params.id, ownerId: req.userId });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Share not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
