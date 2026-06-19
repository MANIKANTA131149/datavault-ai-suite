// ─── Template / Query / Dashboard Gallery (F-MKT) ─────────────────────────────
// A lightweight gallery that drives onboarding ("start from a template") and a
// viral fork loop. Publishing is authenticated; the public gallery is read-only.
// Forking clones a template's payload into the caller's workspace by reusing the
// existing dashboards/history create paths — it never executes foreign SQL on
// its own. Fully additive: a new `templates` collection only.

const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { logAudit } = require("../middleware/auditLogger");

const router = express.Router();

const TEMPLATE_TYPES = new Set(["query", "dashboard"]);
const MAX_PUBLISHED_PER_USER = 50;

function publicView(doc) {
  const { _id, authorUserId, ...rest } = doc;
  return { id: _id, ...rest, authorUserId: undefined };
}

// ─── Public gallery (no auth) — only approved, public templates ───────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, parseInt(req.query.limit) || 24));
    const skip = (page - 1) * limit;

    const filter = { public: true, status: "approved" };
    if (req.query.type && TEMPLATE_TYPES.has(req.query.type)) filter.type = req.query.type;
    if (req.query.q) filter.name = { $regex: String(req.query.q).slice(0, 60), $options: "i" };

    const [docs, total] = await Promise.all([
      db.collection("templates").find(filter).sort({ installs: -1, createdAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection("templates").countDocuments(filter),
    ]);
    res.json({ templates: docs.map(publicView), total, page, limit });
  } catch (err) {
    console.error("list templates error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get one public template ──────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection("templates").findOne({ _id: req.params.id, public: true, status: "approved" });
    if (!doc) return res.status(404).json({ error: "Template not found" });
    res.json(publicView(doc));
  } catch (err) {
    console.error("get template error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Everything below requires auth.
router.use(authMiddleware);

// ─── My published templates ───────────────────────────────────────────────────
router.get("/mine/list", async (req, res) => {
  try {
    const db = await getDb();
    const docs = await db.collection("templates").find({ authorUserId: req.userId }).sort({ createdAt: -1 }).toArray();
    res.json(docs.map(({ _id, ...d }) => ({ id: _id, ...d })));
  } catch (err) {
    console.error("my templates error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Publish a template (query or dashboard) ──────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { type, name, description, payload } = req.body || {};
    if (!TEMPLATE_TYPES.has(type)) return res.status(400).json({ error: "type must be 'query' or 'dashboard'" });
    if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
    if (!payload || typeof payload !== "object") return res.status(400).json({ error: "payload is required" });

    const db = await getDb();
    const count = await db.collection("templates").countDocuments({ authorUserId: req.userId });
    if (count >= MAX_PUBLISHED_PER_USER) {
      return res.status(403).json({ error: `Maximum of ${MAX_PUBLISHED_PER_USER} published templates reached` });
    }

    // Strip anything sensitive: never carry user-specific ids/credentials into a
    // shared template. Only the reusable shape (question, sql, chart, panels).
    const safePayload = JSON.parse(JSON.stringify(payload));
    delete safePayload.datasetId;
    delete safePayload.connectionId;
    delete safePayload.userId;

    const doc = {
      _id: `tpl_${crypto.randomBytes(8).toString("hex")}`,
      type,
      name: name.slice(0, 120),
      description: String(description || "").slice(0, 500),
      payload: safePayload,
      authorUserId: req.userId,
      authorName: req.userName || "Anonymous",
      // User submissions start unapproved; first-party seeds can be inserted
      // directly with status:"approved". Keeps untrusted content out of the
      // public gallery until reviewed.
      public: false,
      status: "pending",
      installs: 0,
      tags: Array.isArray(req.body?.tags) ? req.body.tags.slice(0, 8).map((t) => String(t).slice(0, 24)) : [],
      createdAt: new Date().toISOString(),
    };
    await db.collection("templates").insertOne(doc);
    const { _id, ...rest } = doc;
    res.status(201).json({ id: _id, ...rest });
    logAudit(req.userId, req.userEmail || "", "template.publish", { id: _id, type, name: doc.name }, "info");
  } catch (err) {
    console.error("publish template error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Fork a template into my workspace ────────────────────────────────────────
// Returns the cloned payload + (for dashboards) creates a dashboard the user can
// then bind to one of their own datasets — mirroring the existing "bind a
// dataset after the fact" flow in dashboards.js.
router.post("/:id/fork", async (req, res) => {
  try {
    const db = await getDb();
    const tpl = await db.collection("templates").findOne({ _id: req.params.id, public: true, status: "approved" });
    if (!tpl) return res.status(404).json({ error: "Template not found" });

    await db.collection("templates").updateOne({ _id: tpl._id }, { $inc: { installs: 1 } });

    if (tpl.type === "dashboard") {
      const id = `dsh_${crypto.randomBytes(8).toString("hex")}`;
      const panels = Array.isArray(tpl.payload?.panels) ? tpl.payload.panels.slice(0, 12) : [];
      const doc = {
        _id: id,
        userId: req.userId,
        name: `${tpl.name} (from template)`.slice(0, 120),
        description: String(tpl.description || "").slice(0, 500),
        datasetId: null,
        connectionId: null,
        sheetName: null,
        panels,
        sourceQuestion: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.collection("dashboards").insertOne(doc);
      logAudit(req.userId, req.userEmail || "", "template.fork", { id: tpl._id, type: "dashboard", into: id }, "info");
      return res.status(201).json({ type: "dashboard", id, dashboard: { id, ...doc, _id: undefined } });
    }

    // query template — hand the payload back; the client opens it in QueryPage.
    logAudit(req.userId, req.userEmail || "", "template.fork", { id: tpl._id, type: "query" }, "info");
    res.status(200).json({ type: "query", payload: tpl.payload });
  } catch (err) {
    console.error("fork template error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete my own template ───────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.collection("templates").deleteOne({ _id: req.params.id, authorUserId: req.userId });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("delete template error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
