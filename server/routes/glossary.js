// ─── Semantic Layer / Business Glossary (F9) ──────────────────────────────────
// Team-level definitions of business terms ("revenue" = SUM(amount) WHERE
// status='paid'). The agent expands these terms in every question BEFORE the
// LLM sees it, so the whole team gets consistent, governed metric definitions
// instead of per-user column guessing.

const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { orgContextMiddleware } = require("../lib/orgs");
const { logAudit } = require("../middleware/auditLogger");

const router = express.Router();
router.use(authMiddleware);
router.use(orgContextMiddleware);

// ─── List terms (org-wide; optional dataset filter) ───────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const filter = { orgId: req.orgId };
    if (typeof req.query.datasetId === "string" && req.query.datasetId) {
      filter.$or = [{ datasetId: req.query.datasetId }, { datasetId: null }];
    }
    const terms = await db.collection("glossary").find(filter).sort({ term: 1 }).limit(500).toArray();
    res.json(terms.map(({ _id, ...t }) => ({ id: _id, ...t })));
  } catch (err) {
    console.error("list glossary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Create a term ────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const term = String(req.body?.term || "").trim();
    const definition = String(req.body?.definition || "").trim();
    if (!term || term.length > 100) return res.status(400).json({ error: "term (1-100 chars) is required" });
    if (!definition || definition.length > 1000) return res.status(400).json({ error: "definition (1-1000 chars) is required" });

    const db = await getDb();
    const existing = await db.collection("glossary").findOne({
      orgId: req.orgId,
      termLower: term.toLowerCase(),
      datasetId: req.body?.datasetId || null,
    });
    if (existing) return res.status(409).json({ error: `"${term}" is already defined. Edit the existing entry instead.` });

    const doc = {
      _id: `gls_${crypto.randomBytes(8).toString("hex")}`,
      orgId: req.orgId,
      userId: req.userId,
      term,
      termLower: term.toLowerCase(),
      definition,
      sqlExpression: String(req.body?.sqlExpression || "").slice(0, 2000) || null,
      aliases: Array.isArray(req.body?.aliases)
        ? req.body.aliases.map((a) => String(a).trim()).filter(Boolean).slice(0, 10)
        : [],
      datasetId: req.body?.datasetId || null, // null = applies to all datasets
      createdBy: req.userEmail || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.collection("glossary").insertOne(doc);
    const { _id, ...rest } = doc;
    res.status(201).json({ id: _id, ...rest });
    logAudit(req.userId, req.userEmail || "", "glossary.create", { term }, "info");
  } catch (err) {
    console.error("create glossary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Update a term ────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const update = { updatedAt: new Date().toISOString() };
    if (typeof req.body?.definition === "string") update.definition = req.body.definition.slice(0, 1000);
    if (typeof req.body?.sqlExpression === "string") update.sqlExpression = req.body.sqlExpression.slice(0, 2000) || null;
    if (Array.isArray(req.body?.aliases)) update.aliases = req.body.aliases.map((a) => String(a).trim()).filter(Boolean).slice(0, 10);

    const result = await db.collection("glossary").updateOne({ _id: req.params.id, orgId: req.orgId }, { $set: update });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Term not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("update glossary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete a term ────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("glossary").deleteOne({ _id: req.params.id, orgId: req.orgId });
    res.json({ success: true });
  } catch (err) {
    console.error("delete glossary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
