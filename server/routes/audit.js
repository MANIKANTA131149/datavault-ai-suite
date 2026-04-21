const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { getPlanContext, allowedExport, getOrganizationMemberIds, isPlanOwner } = require("../lib/plans");

const router = express.Router();
router.use(authMiddleware);

// ─── Require Admin ────────────────────────────────────────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const db = await getDb();
    const context = await getPlanContext(db, req.userId);
    const plan = context.plan;
    const orgAdmin = context.user.role === "admin" || isPlanOwner(context.user, context.planOwner);
    if (!orgAdmin || !plan.adminPage) {
      return res.status(403).json({
        error: "Admin access requires owning a Standard, Professional, or Enterprise organization",
        code: "PLAN_FEATURE_LOCKED",
        feature: "adminPage",
        planTier: plan.tier,
        planName: plan.name,
      });
    }
    req.adminPlan = plan;
    req.adminUser = context.user;
    next();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── GET /api/audit — paginated, filterable audit log (admin only) ────────────
router.get("/", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const {
      page = 1,
      limit = 50,
      action,
      userId,
      severity,
      from,
      to,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const orgUserIds = await getOrganizationMemberIds(db, req.adminUser);
    const filter = {};
    if (action)   filter.action   = { $regex: action, $options: "i" };
    filter.userId = userId || { $in: orgUserIds };
    if (severity) filter.severity = severity;
    if (from || to) {
      filter.ts = {};
      if (from) filter.ts.$gte = from;
      if (to)   filter.ts.$lte = to;
    }

    const [logs, total] = await Promise.all([
      db.collection("auditlogs")
        .find(filter)
        .sort({ ts: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection("auditlogs").countDocuments(filter),
    ]);

    res.json({ logs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error("audit log error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/audit/export — download audit log as CSV (admin only) ───────────
router.get("/export", requireAdmin, async (req, res) => {
  try {
    if (!allowedExport(req.adminPlan, "audit")) {
      return res.status(403).json({
        error: "Audit export requires Enterprise plan",
        code: "PLAN_FEATURE_LOCKED",
        feature: "export:audit",
        planTier: req.adminPlan.tier,
        planName: req.adminPlan.name,
      });
    }
    const db = await getDb();
    const orgUserIds = await getOrganizationMemberIds(db, req.adminUser);
    const logs = await db.collection("auditlogs")
      .find({ userId: { $in: orgUserIds } })
      .sort({ ts: -1 })
      .limit(5000)
      .toArray();

    const header = "Timestamp,User Email,User ID,Action,Severity,Details\n";
    const rows = logs.map((l) =>
      [
        l.ts,
        l.userEmail,
        l.userId,
        l.action,
        l.severity,
        JSON.stringify(l.details || {}).replace(/"/g, '""'),
      ]
        .map((v) => `"${v}"`)
        .join(",")
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${Date.now()}.csv"`);
    res.send(header + rows.join("\n"));
  } catch (err) {
    console.error("audit export error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/audit/stats — action frequency stats (admin only) ──────────────
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const orgUserIds = await getOrganizationMemberIds(db, req.adminUser);
    const stats = await db.collection("auditlogs").aggregate([
      { $match: { userId: { $in: orgUserIds } } },
      { $group: { _id: "$action", count: { $sum: 1 }, lastSeen: { $max: "$ts" } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]).toArray();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
