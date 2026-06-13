// ─── Public API Key Management ────────────────────────────────────────────────
// Keys look like "qfy_<40 hex chars>". Only the SHA-256 hash is stored —
// the plaintext key is shown exactly once at creation. Each key is scoped to
// the owning user and optionally to specific dataset/connection ids.

const crypto = require("crypto");

const KEY_PREFIX = "qfy_";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generateApiKey() {
  const secret = crypto.randomBytes(20).toString("hex");
  const key = `${KEY_PREFIX}${secret}`;
  return { key, keyHash: sha256Hex(key), keyPrefix: key.slice(0, 12) };
}

/**
 * Express middleware factory: authenticates requests via the
 * "Authorization: Bearer qfy_..." or "x-api-key" header. Attaches
 * req.apiKey (the DB record), req.userId and req.orgId.
 */
function apiKeyAuth() {
  const { getDb } = require("../db");
  return async function (req, res, next) {
    try {
      const header = req.headers.authorization || "";
      const raw = header.startsWith("Bearer ") ? header.slice(7) : req.headers["x-api-key"];
      if (!raw || !raw.startsWith(KEY_PREFIX)) {
        return res.status(401).json({ error: "Missing API key. Pass it as 'Authorization: Bearer qfy_...'" });
      }

      const db = await getDb();
      const record = await db.collection("api_keys").findOne({ keyHash: sha256Hex(raw), revoked: { $ne: true } });
      if (!record) return res.status(401).json({ error: "Invalid or revoked API key" });

      if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
        return res.status(401).json({ error: "API key has expired" });
      }

      req.apiKey = record;
      req.userId = record.userId;
      req.orgId = record.orgId || `personal:${record.userId}`;

      // Fire-and-forget last-used bookkeeping.
      db.collection("api_keys")
        .updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date().toISOString() }, $inc: { callCount: 1 } })
        .catch(() => {});

      next();
    } catch (err) {
      console.error("apiKeyAuth error:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

module.exports = { generateApiKey, apiKeyAuth, sha256Hex, KEY_PREFIX };
