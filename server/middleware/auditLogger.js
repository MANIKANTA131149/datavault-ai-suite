const { getDb } = require("../db");

/**
 * Log an audit event to MongoDB.
 * Append-only — never update or delete audit logs.
 *
 * @param {string} userId       - Actor's user ID
 * @param {string} userEmail    - Actor's email (denormalised for readability)
 * @param {string} action       - e.g. "login", "dataset.upload", "user.role_change"
 * @param {object} details      - Extra context (target userId, old/new values, etc.)
 * @param {"info"|"warn"|"critical"} severity
 */
async function logAudit(userId, userEmail, action, details = {}, severity = "info") {
  try {
    const db = await getDb();
    await db.collection("auditlogs").insertOne({
      userId:    userId    || "system",
      userEmail: userEmail || "system",
      action,
      details,
      severity,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    // Never crash the main request because audit logging failed
    console.error("auditLogger failed:", err.message);
  }
}

module.exports = { logAudit };
