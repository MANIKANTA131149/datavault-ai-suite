// ─── Multi-Tenant Organization Foundation ─────────────────────────────────────
// Every user implicitly belongs to a personal organization (orgId =
// "personal:<userId>"). Users can additionally create/join shared orgs.
// All NEW collections key on orgId; existing collections are untouched, so
// this is fully backwards-compatible — nothing breaks for existing users.

const { getDb } = require("../db");

function personalOrgId(userId) {
  return `personal:${userId}`;
}

/**
 * Resolve the active org context for a user. Lazily creates the personal org
 * document on first access. Returns { orgId, org, role }.
 */
async function getOrgContext(db, userId, userEmail = "") {
  const database = db || (await getDb());

  // A user may have an explicitly selected active org in their settings.
  const membership = await database.collection("org_members").findOne({
    userId,
    status: "active",
    isDefault: true,
  });

  if (membership) {
    const org = await database.collection("organizations").findOne({ _id: membership.orgId });
    if (org) return { orgId: org._id, org, role: membership.role || "member" };
  }

  // Fall back to (and lazily create) the personal org.
  const pid = personalOrgId(userId);
  let org = await database.collection("organizations").findOne({ _id: pid });
  if (!org) {
    org = {
      _id: pid,
      name: "Personal Workspace",
      type: "personal",
      ownerId: userId,
      ownerEmail: userEmail,
      settings: {},
      createdAt: new Date().toISOString(),
    };
    // Race-safe: ignore duplicate-key when two requests create it concurrently.
    await database.collection("organizations").insertOne(org).catch((err) => {
      if (err.code !== 11000) throw err;
    });
  }
  return { orgId: pid, org, role: "owner" };
}

/**
 * Express middleware: attaches req.orgId / req.orgRole after authMiddleware.
 * Never fails the request — falls back to the personal org id on any error.
 */
async function orgContextMiddleware(req, _res, next) {
  try {
    const db = await getDb();
    const ctx = await getOrgContext(db, req.userId, req.userEmail);
    req.orgId = ctx.orgId;
    req.orgRole = ctx.role;
  } catch (err) {
    console.error("orgContext failed (falling back to personal):", err.message);
    req.orgId = personalOrgId(req.userId);
    req.orgRole = "owner";
  }
  next();
}

/** List all orgs a user belongs to (personal + shared memberships). */
async function listUserOrgs(db, userId) {
  const memberships = await db
    .collection("org_members")
    .find({ userId, status: "active" })
    .toArray();
  const orgIds = [personalOrgId(userId), ...memberships.map((m) => m.orgId)];
  const orgs = await db
    .collection("organizations")
    .find({ _id: { $in: orgIds } })
    .toArray();
  const roleByOrg = new Map(memberships.map((m) => [m.orgId, m.role || "member"]));
  return orgs.map((o) => ({
    id: o._id,
    name: o.name,
    type: o.type,
    role: o._id === personalOrgId(userId) ? "owner" : roleByOrg.get(o._id) || "member",
    createdAt: o.createdAt,
  }));
}

module.exports = { personalOrgId, getOrgContext, orgContextMiddleware, listUserOrgs };
