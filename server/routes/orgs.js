// ─── Organizations (Multi-Tenant Workspaces) ──────────────────────────────────
const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { getOrgContext, listUserOrgs, personalOrgId } = require("../lib/orgs");
const { logAudit } = require("../middleware/auditLogger");

const router = express.Router();
router.use(authMiddleware);

// ─── Current org context ──────────────────────────────────────────────────────
router.get("/me", async (req, res) => {
  try {
    const db = await getDb();
    const ctx = await getOrgContext(db, req.userId, req.userEmail);
    res.json({
      orgId: ctx.orgId,
      name: ctx.org.name,
      type: ctx.org.type,
      role: ctx.role,
      settings: ctx.org.settings || {},
    });
  } catch (err) {
    console.error("get org context error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── List all orgs the user belongs to ────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    res.json(await listUserOrgs(db, req.userId));
  } catch (err) {
    console.error("list orgs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Create a shared organization ─────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name || name.length > 80) return res.status(400).json({ error: "Organization name (1-80 chars) is required" });

    const db = await getDb();
    const orgId = `org_${crypto.randomBytes(8).toString("hex")}`;
    await db.collection("organizations").insertOne({
      _id: orgId,
      name,
      type: "team",
      ownerId: req.userId,
      ownerEmail: req.userEmail || "",
      settings: {},
      createdAt: new Date().toISOString(),
    });
    await db.collection("org_members").insertOne({
      orgId,
      userId: req.userId,
      email: req.userEmail || "",
      role: "owner",
      status: "active",
      isDefault: false,
      joinedAt: new Date().toISOString(),
    });

    res.status(201).json({ id: orgId, name, type: "team", role: "owner" });
    logAudit(req.userId, req.userEmail || "", "org.create", { orgId, name }, "info");
  } catch (err) {
    console.error("create org error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── List members ─────────────────────────────────────────────────────────────
router.get("/:orgId/members", async (req, res) => {
  try {
    const db = await getDb();
    const isMember = await db.collection("org_members").findOne({ orgId: req.params.orgId, userId: req.userId, status: "active" });
    if (!isMember && req.params.orgId !== personalOrgId(req.userId)) {
      return res.status(403).json({ error: "Not a member of this organization" });
    }
    const members = await db.collection("org_members").find({ orgId: req.params.orgId }).toArray();
    res.json(members.map(({ _id, ...m }) => m));
  } catch (err) {
    console.error("list members error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Invite a member by email ─────────────────────────────────────────────────
router.post("/:orgId/members", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const role = ["admin", "analyst", "member", "viewer"].includes(req.body?.role) ? req.body.role : "member";
    if (!email) return res.status(400).json({ error: "email is required" });

    const db = await getDb();
    const me = await db.collection("org_members").findOne({ orgId: req.params.orgId, userId: req.userId, status: "active" });
    if (!me || !["owner", "admin"].includes(me.role)) {
      return res.status(403).json({ error: "Only org owners/admins can invite members" });
    }

    const invitee = await db.collection("users").findOne({ email });
    if (!invitee) return res.status(404).json({ error: "No Querify account exists for that email yet" });
    const inviteeId = invitee._id?.toString?.() || invitee.id;

    const existing = await db.collection("org_members").findOne({ orgId: req.params.orgId, userId: inviteeId });
    if (existing) return res.status(409).json({ error: "User is already a member of this organization" });

    await db.collection("org_members").insertOne({
      orgId: req.params.orgId,
      userId: inviteeId,
      email,
      role,
      status: "active",
      isDefault: false,
      invitedBy: req.userEmail || req.userId,
      joinedAt: new Date().toISOString(),
    });

    res.status(201).json({ success: true });
    logAudit(req.userId, req.userEmail || "", "org.member_invite", { orgId: req.params.orgId, email, role }, "info");
  } catch (err) {
    console.error("invite member error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Change a member's role (F-RBAC) — owner/admin only ───────────────────────
router.put("/:orgId/members/:userId/role", async (req, res) => {
  try {
    const role = ["admin", "analyst", "member", "viewer"].includes(req.body?.role) ? req.body.role : null;
    if (!role) return res.status(400).json({ error: "role must be one of: admin, analyst, member, viewer" });

    const db = await getDb();
    const me = await db.collection("org_members").findOne({ orgId: req.params.orgId, userId: req.userId, status: "active" });
    if (!me || !["owner", "admin"].includes(me.role)) {
      return res.status(403).json({ error: "Only org owners/admins can change roles" });
    }
    // Never let anyone demote the owner via this route.
    const target = await db.collection("org_members").findOne({ orgId: req.params.orgId, userId: req.params.userId });
    if (!target) return res.status(404).json({ error: "Member not found" });
    if (target.role === "owner") return res.status(403).json({ error: "The organization owner's role cannot be changed" });

    await db.collection("org_members").updateOne(
      { orgId: req.params.orgId, userId: req.params.userId },
      { $set: { role } }
    );
    res.json({ success: true });
    logAudit(req.userId, req.userEmail || "", "org.member_role_change", { orgId: req.params.orgId, userId: req.params.userId, role }, "info");
  } catch (err) {
    console.error("change role error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Remove a member — owner/admin only ───────────────────────────────────────
router.delete("/:orgId/members/:userId", async (req, res) => {
  try {
    const db = await getDb();
    const me = await db.collection("org_members").findOne({ orgId: req.params.orgId, userId: req.userId, status: "active" });
    if (!me || !["owner", "admin"].includes(me.role)) {
      return res.status(403).json({ error: "Only org owners/admins can remove members" });
    }
    const target = await db.collection("org_members").findOne({ orgId: req.params.orgId, userId: req.params.userId });
    if (!target) return res.status(404).json({ error: "Member not found" });
    if (target.role === "owner") return res.status(403).json({ error: "The organization owner cannot be removed" });

    await db.collection("org_members").deleteOne({ orgId: req.params.orgId, userId: req.params.userId });
    res.json({ success: true });
    logAudit(req.userId, req.userEmail || "", "org.member_remove", { orgId: req.params.orgId, userId: req.params.userId }, "info");
  } catch (err) {
    console.error("remove member error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Switch default (active) org ──────────────────────────────────────────────
router.put("/active", async (req, res) => {
  try {
    const orgId = String(req.body?.orgId || "");
    const db = await getDb();

    // Clear current default, then set the new one (personal org needs no membership row).
    await db.collection("org_members").updateMany({ userId: req.userId }, { $set: { isDefault: false } });
    if (orgId && orgId !== personalOrgId(req.userId)) {
      const result = await db.collection("org_members").updateOne(
        { orgId, userId: req.userId, status: "active" },
        { $set: { isDefault: true } }
      );
      if (result.matchedCount === 0) return res.status(403).json({ error: "Not a member of that organization" });
    }
    res.json({ success: true, activeOrgId: orgId || personalOrgId(req.userId) });
  } catch (err) {
    console.error("switch org error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
