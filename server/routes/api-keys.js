// ─── API Key Management (F7) ──────────────────────────────────────────────────
// Authenticated users create/revoke keys for the public REST API. The
// plaintext key is returned exactly once at creation; only its hash persists.

const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { generateApiKey } = require("../lib/api-keys");
const { logAudit } = require("../middleware/auditLogger");

const router = express.Router();
router.use(authMiddleware);

const MAX_KEYS_PER_USER = 10;

// ─── List keys (never returns hashes) ─────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const keys = await db.collection("api_keys").find({ userId: req.userId }).sort({ createdAt: -1 }).toArray();
    res.json(
      keys.map((k) => ({
        id: k._id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes || [],
        revoked: !!k.revoked,
        lastUsedAt: k.lastUsedAt || null,
        callCount: k.callCount || 0,
        expiresAt: k.expiresAt || null,
        createdAt: k.createdAt,
      }))
    );
  } catch (err) {
    console.error("list api keys error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Create a key ─────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name || "API key").slice(0, 80);
    const db = await getDb();
    const count = await db.collection("api_keys").countDocuments({ userId: req.userId, revoked: { $ne: true } });
    if (count >= MAX_KEYS_PER_USER) return res.status(403).json({ error: `Maximum of ${MAX_KEYS_PER_USER} active keys reached` });

    const { key, keyHash, keyPrefix } = generateApiKey();
    const doc = {
      _id: `key_${crypto.randomBytes(8).toString("hex")}`,
      userId: req.userId,
      orgId: req.orgId || `personal:${req.userId}`,
      name,
      keyHash,
      keyPrefix,
      scopes: Array.isArray(req.body?.scopes) ? req.body.scopes.map(String).slice(0, 20) : [],
      revoked: false,
      callCount: 0,
      lastUsedAt: null,
      expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt).toISOString() : null,
      createdAt: new Date().toISOString(),
    };
    await db.collection("api_keys").insertOne(doc);

    // The ONLY time the plaintext key is ever returned.
    res.status(201).json({ id: doc._id, name, key, keyPrefix, createdAt: doc.createdAt });
    logAudit(req.userId, req.userEmail || "", "apikey.create", { id: doc._id, name }, "info");
  } catch (err) {
    console.error("create api key error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Revoke a key ─────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("api_keys").updateOne(
      { _id: req.params.id, userId: req.userId },
      { $set: { revoked: true, revokedAt: new Date().toISOString() } }
    );
    res.json({ success: true });
    logAudit(req.userId, req.userEmail || "", "apikey.revoke", { id: req.params.id }, "warn");
  } catch (err) {
    console.error("revoke api key error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
