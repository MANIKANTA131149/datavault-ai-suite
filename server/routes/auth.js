const express = require("express");
const { getDb } = require("../db");
const { logAudit } = require("../middleware/auditLogger");
const { authMiddleware, fetchClerkUser } = require("../middleware/auth");
const { defaultPlanFields, ensureUserPlan, getPlanContext } = require("../lib/plans");

const router = express.Router();

// Lazily upsert a Mongo user doc from Clerk session claims.
// Called on every /auth/me — creates the user on first sign-in, updates lastLogin thereafter.
async function ensureUserDoc(db, req) {
  const clerkId = req.userId;
  let email   = req.userEmail   || "";
  let name    = req.userName    || "";
  let picture = req.userPicture || "";

  // JWT claims may be missing name/email if JWT template hasn't been configured yet
  // — fall back to a direct Clerk API call so first-time users always get real data.
  if (!name || !email) {
    const clerkProfile = await fetchClerkUser(clerkId);
    if (clerkProfile) {
      name    = name    || clerkProfile.name;
      email   = email   || clerkProfile.email;
      picture = picture || clerkProfile.picture;
    }
  }
  name = name || email.split("@")[0] || "User";

  let user = await db.collection("users").findOne({ _id: clerkId });

  if (!user) {
    const now = new Date().toISOString();
    await db.collection("users").insertOne({
      _id: clerkId,
      name,
      email,
      picture,
      authProvider: "clerk",
      role: "viewer",
      status: "active",
      ...defaultPlanFields("clerk"),
      organizationId: clerkId,
      organizationOwnerId: clerkId,
      createdAt: now,
      lastLogin: now,
    });
    user = await db.collection("users").findOne({ _id: clerkId });
  } else {
    // Sync any profile changes + bump lastLogin
    const updates = { lastLogin: new Date().toISOString() };
    if (name    && name    !== user.name)    updates.name    = name;
    if (email   && email   !== user.email)   updates.email   = email;
    if (picture && picture !== user.picture) updates.picture = picture;
    await db.collection("users").updateOne({ _id: clerkId }, { $set: updates });
  }

  return user;
}

// ─── Get / hydrate current user ───────────────────────────────────────────────
// Called by ClerkAuthBridge on every sign-in and page reload.
// Creates the Mongo user doc on first call (lazy registration).
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    await ensureUserDoc(db, req);

    const hydratedUser = await ensureUserPlan(db, req.userId);
    const planContext = await getPlanContext(db, req.userId);

    res.json({
      name: hydratedUser.name,
      email: hydratedUser.email,
      id: hydratedUser._id.toString(),
      role: hydratedUser.role || "viewer",
      status: hydratedUser.status || "active",
      planTier: planContext.plan.tier,
      planStatus: planContext.planOwner.planStatus || "active",
      ownPlanTier: hydratedUser.planTier || "free",
      organizationId: hydratedUser.organizationId,
      organizationOwnerId: hydratedUser.organizationOwnerId,
      planOwnerId: planContext.planOwner._id.toString(),
      isPlanOwner: planContext.planOwner._id.toString() === hydratedUser._id.toString(),
    });
  } catch (err) {
    console.error("get me error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Sign Out — session-only, all data preserved ──────────────────────────────
router.post("/signout", authMiddleware, async (req, res) => {
  logAudit(req.userId, req.userEmail, "auth.logout", {}, "info");
  console.log("👋  User signed out — data preserved in MongoDB");
  res.json({ success: true });
});

module.exports = router;
