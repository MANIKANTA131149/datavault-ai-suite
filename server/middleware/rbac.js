// ─── Resource-Scoped RBAC (F-RBAC) ────────────────────────────────────────────
// A static role→permission matrix layered on top of the existing org_members
// role. Designed to be ADDITIVE and lockout-safe:
//   • The personal workspace owner is always "owner" (full access) — unchanged.
//   • If role resolution fails for any reason, we DEFAULT TO ALLOW so existing
//     flows never break. RBAC tightens only where a route explicitly opts in
//     via requirePermission(...).
//
// Roles (highest → lowest): owner > admin > analyst > member > viewer.
// `member` maps to the historical default and keeps today's effective access.

const { getDb } = require("../db");
const { getOrgContext } = require("../lib/orgs");

// What each role may do. `member` intentionally retains broad access so nothing
// regresses for existing single-user/personal workspaces.
const ROLE_PERMISSIONS = {
  owner:   new Set(["*"]),
  admin:   new Set(["*"]),
  analyst: new Set(["query.run", "dataset.read", "dataset.create", "dashboard.read", "dashboard.create", "dashboard.update", "connection.read", "metric.read", "export"]),
  member:  new Set(["query.run", "dataset.read", "dataset.create", "dataset.delete", "dashboard.read", "dashboard.create", "dashboard.update", "dashboard.delete", "connection.read", "connection.create", "metric.read", "export"]),
  viewer:  new Set(["query.run", "dataset.read", "dashboard.read", "connection.read", "metric.read"]),
};

function roleCan(role, permission) {
  const set = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
  return set.has("*") || set.has(permission);
}

/**
 * Resolve and attach req.orgId / req.orgRole if not already present.
 * Never throws — falls back to personal-owner so requests don't break.
 */
async function attachOrgRole(req) {
  if (req.orgRole) return req.orgRole;
  try {
    const db = await getDb();
    const ctx = await getOrgContext(db, req.userId, req.userEmail);
    req.orgId = ctx.orgId;
    req.orgRole = ctx.role || "owner";
  } catch {
    req.orgId = `personal:${req.userId}`;
    req.orgRole = "owner";
  }
  return req.orgRole;
}

/**
 * Express middleware factory. Use on routes that should be permission-gated.
 * Opt-in: routes that don't use it behave exactly as before.
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const role = await attachOrgRole(req);
      if (roleCan(role, permission)) return next();
      return res.status(403).json({
        error: `Your role (${role}) does not allow this action`,
        code: "ROLE_FORBIDDEN",
        requiredPermission: permission,
        role,
      });
    } catch {
      // Lockout-safe: on resolution failure, allow (preserve legacy behavior).
      next();
    }
  };
}

module.exports = { requirePermission, roleCan, attachOrgRole, ROLE_PERMISSIONS };
