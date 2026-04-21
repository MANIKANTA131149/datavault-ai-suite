const express = require("express");
const bcrypt = require("bcryptjs");
const { getDb } = require("../db");
const { logAudit } = require("../middleware/auditLogger");
const { authMiddleware } = require("../middleware/auth");
const { defaultPlanFields, getPlanContext, canUseMetric, getOrganizationMemberIds, isPlanOwner } = require("../lib/plans");

const router = express.Router();
router.use(authMiddleware);

// ─── Middleware: require admin role ──────────────────────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const db = await getDb();
    const context = await getPlanContext(db, req.userId);
    const orgAdmin = context.user.role === "admin" || isPlanOwner(context.user, context.planOwner);
    if (!context || !orgAdmin || !context.plan.adminPage) {
      return res.status(403).json({
        error: "Admin access requires owning a Standard, Professional, or Enterprise organization",
        code: "PLAN_FEATURE_LOCKED",
        feature: "adminPage",
        planTier: context?.plan?.tier || "free",
        planName: context?.plan?.name || "Free",
      });
    }
    req.adminUser = context.user;
    req.planContext = context;
    next();
  } catch (err) {
    console.error("requireAdmin error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function requirePaidAdmin(req, res, next) {
  try {
    await requireAdmin(req, res, next);
  } catch (err) {
    console.error("requirePaidAdmin error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── GET /api/admin/users — list all users (admin only) ────────────────────
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const planContext = req.planContext || await getPlanContext(db, req.userId);
    const users = await db
      .collection("users")
      .find({ organizationId: req.adminUser.organizationId }, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    // Get per-user stats
    const [datasetCounts, historyCounts] = await Promise.all([
      db.collection("datasets").aggregate([
        { $match: { userId: { $in: users.map((u) => u._id.toString()) } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]).toArray(),
      db.collection("history").aggregate([
        { $match: { userId: { $in: users.map((u) => u._id.toString()) } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]).toArray(),
    ]);

    const dsMap = Object.fromEntries(datasetCounts.map((d) => [d._id, d.count]));
    const hMap = Object.fromEntries(historyCounts.map((h) => [h._id, h.count]));

    res.json(
      users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role || "viewer",
        status: u.status || "active",
        planTier: u.planTier || "free",
        planStatus: u.planStatus || "active",
        planSource: u.planSource || "manual",
        effectivePlanTier: planContext.plan.tier,
        organizationId: u.organizationId,
        organizationOwnerId: u.organizationOwnerId,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin || null,
        datasetCount: dsMap[u._id.toString()] || 0,
        queryCount: hMap[u._id.toString()] || 0,
      }))
    );
  } catch (err) {
    console.error("list users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /api/admin/users/:id/role — change user role (admin only) ──────────
router.put("/users/:id/role", requirePaidAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ["admin", "analyst", "viewer"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
    }

    const db = await getDb();
    const { ObjectId } = require("mongodb");
    const target = await db.collection("users").findOne({ _id: new ObjectId(req.params.id), organizationId: req.adminUser.organizationId });
    if (!target) return res.status(404).json({ error: "User not found in your organization" });

    // Prevent demoting the last admin
    if (role !== "admin") {
      const adminCount = await db.collection("users").countDocuments({ role: "admin", organizationId: req.adminUser.organizationId });
      if (target?.role === "admin" && adminCount <= 1) {
        return res.status(400).json({ error: "Cannot demote the last admin" });
      }
    }

    await db.collection("users").updateOne(
      { _id: new ObjectId(req.params.id), organizationId: req.adminUser.organizationId },
      { $set: { role } }
    );

    res.json({ success: true });
    logAudit(req.userId, "", "admin.role_change", { targetUserId: req.params.id, newRole: role }, "warn");
  } catch (err) {
    console.error("change role error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /api/admin/users/:id/status — suspend/activate user (admin only) ───
router.put("/users/:id/status", requirePaidAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be 'active' or 'suspended'" });
    }

    const db = await getDb();
    const { ObjectId } = require("mongodb");
    const target = await db.collection("users").findOne({ _id: new ObjectId(req.params.id), organizationId: req.adminUser.organizationId });
    if (!target) return res.status(404).json({ error: "User not found in your organization" });

    // Prevent self-suspension
    if (req.params.id === req.userId) {
      return res.status(400).json({ error: "Cannot suspend your own account" });
    }

    await db.collection("users").updateOne(
      { _id: new ObjectId(req.params.id), organizationId: req.adminUser.organizationId },
      { $set: { status } }
    );

    res.json({ success: true });
    logAudit(req.userId, "", "admin.status_change", { targetUserId: req.params.id, newStatus: status }, "warn");
  } catch (err) {
    console.error("change status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/admin/users/invite — invite new user (admin only) ────────────
router.post("/users/invite", requirePaidAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are required" });
    }

    const validRoles = ["admin", "analyst", "viewer"];
    const assignRole = validRoles.includes(role) ? role : "viewer";

    const db = await getDb();
    const planContext = await getPlanContext(db, req.userId);
    const memberCheck = canUseMetric(planContext.plan, "members", planContext.usage.members, 1);
    if (!memberCheck.allowed) return res.status(403).json(memberCheck.details);

    const existing = await db.collection("users").findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "User with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.collection("users").insertOne({
      name,
      email,
      passwordHash,
      role: assignRole,
      status: "active",
      ...defaultPlanFields(req.userId),
      organizationId: req.adminUser.organizationId,
      organizationOwnerId: req.adminUser.organizationOwnerId,
      invitedBy: req.userId,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ success: true });
    logAudit(req.userId, "", "admin.user_invite", { email, role: assignRole }, "info");
  } catch (err) {
    console.error("invite user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /api/admin/users/:id — delete user (admin only) ─────────────────
router.delete("/users/:id", requirePaidAdmin, async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");

    // Prevent self-deletion
    if (req.params.id === req.userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const db = await getDb();
    const id = new ObjectId(req.params.id);
    const userId = req.params.id;
    const target = await db.collection("users").findOne({ _id: id, organizationId: req.adminUser.organizationId });
    if (!target) return res.status(404).json({ error: "User not found in your organization" });

    // Delete user and all their data
    await Promise.all([
      db.collection("users").deleteOne({ _id: id, organizationId: req.adminUser.organizationId }),
      db.collection("datasets").deleteMany({ userId }),
      db.collection("history").deleteMany({ userId }),
      db.collection("settings").deleteMany({ userId }),
      db.collection("insights").deleteMany({ userId }),
    ]);

    res.json({ success: true });
    logAudit(req.userId, "", "admin.user_delete", { targetUserId: req.params.id }, "critical");
  } catch (err) {
    console.error("delete user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/admin/stats — system-wide stats (admin only) ──────────────────
router.get("/stats", requirePaidAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const orgUserIds = await getOrganizationMemberIds(db, req.adminUser);
    const [userCount, datasetCount, queryCount, insightCount] = await Promise.all([
      db.collection("users").countDocuments({ organizationId: req.adminUser.organizationId }),
      db.collection("datasets").countDocuments({ userId: { $in: orgUserIds } }),
      db.collection("history").countDocuments({ userId: { $in: orgUserIds } }),
      db.collection("insights").countDocuments({ userId: { $in: orgUserIds } }),
    ]);

    // Role distribution
    const roleDist = await db.collection("users").aggregate([
      { $match: { organizationId: req.adminUser.organizationId } },
      { $group: { _id: { $ifNull: ["$role", "viewer"] }, count: { $sum: 1 } } },
    ]).toArray();
    const planDist = await db.collection("users").aggregate([
      { $match: { organizationId: req.adminUser.organizationId } },
      { $group: { _id: { $ifNull: ["$planTier", "free"] }, count: { $sum: 1 } } },
    ]).toArray();

    res.json({
      userCount,
      datasetCount,
      queryCount,
      insightCount,
      roleDistribution: Object.fromEntries(roleDist.map((r) => [r._id, r.count])),
      planDistribution: Object.fromEntries(planDist.map((r) => [r._id, r.count])),
    });
  } catch (err) {
    console.error("admin stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


module.exports = router;
