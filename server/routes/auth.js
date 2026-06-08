const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDb } = require("../db");
const { logAudit } = require("../middleware/auditLogger");
const { authMiddleware, JWT_SECRET } = require("../middleware/auth");
const { defaultPlanFields, ensureUserPlan, getPlanContext } = require("../lib/plans");

const router = express.Router();

// ─── Sign Up ──────────────────────────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "name, email and password are required" });

    const db = await getDb();
    const existing = await db.collection("users").findOne({ email });
    if (existing)
      return res.status(409).json({ error: "An account with that email already exists" });

    const role = "viewer";

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.collection("users").insertOne({
      name,
      email,
      passwordHash,
      role,
      status: "active",
      ...defaultPlanFields("signup"),
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    });
    await db.collection("users").updateOne(
      { _id: result.insertedId },
      {
        $set: {
          organizationId: result.insertedId.toString(),
          organizationOwnerId: result.insertedId.toString(),
        },
      }
    );

    const token = jwt.sign(
      { userId: result.insertedId.toString(), email, name, role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: {
        name,
        email,
        id: result.insertedId.toString(),
        role,
        planTier: "free",
        planStatus: "active",
        ownPlanTier: "free",
        organizationId: result.insertedId.toString(),
        organizationOwnerId: result.insertedId.toString(),
      },
    });
  } catch (err) {
    console.error("signup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Sign In ──────────────────────────────────────────────────────────────────
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "email and password are required" });

    const db = await getDb();
    const user = await db.collection("users").findOne({ email });
    if (!user)
      return res.status(404).json({ error: "Account does not exist" });

    // Check if user is suspended
    if (user.status === "suspended")
      return res.status(403).json({ error: "Your account has been suspended. Contact your administrator." });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return res.status(401).json({ error: "Invalid credentials" });

    const hydratedUser = await ensureUserPlan(db, user._id.toString());
    const planContext = await getPlanContext(db, user._id.toString());
    const role = hydratedUser.role || "viewer";

    // Update last login
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date().toISOString() } }
    );

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email, name: user.name, role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        name: hydratedUser.name,
        email: hydratedUser.email,
        id: hydratedUser._id.toString(),
        role,
        planTier: planContext.plan.tier,
        planStatus: planContext.planOwner.planStatus || "active",
        ownPlanTier: hydratedUser.planTier || "free",
        organizationId: hydratedUser.organizationId,
        organizationOwnerId: hydratedUser.organizationOwnerId,
        planOwnerId: planContext.planOwner._id.toString(),
        isPlanOwner: planContext.planOwner._id.toString() === hydratedUser._id.toString(),
      },
    });
    logAudit(user._id.toString(), user.email, "auth.login", { method: "password" }, "info");
  } catch (err) {
    console.error("signin error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Auth0 Social Login ───────────────────────────────────────────────────────
router.post("/auth0-login", async (req, res) => {
  // Verify the token FIRST in its own scope. Keeping verification separate from
  // the database/plan logic below ensures a downstream error is never reported
  // to the user as a "token verification failed" message.
  let auth0User;
  try {
    const { idToken } = req.body;
    if (!idToken)
      return res.status(400).json({ error: "idToken is required" });

    let auth0Domain = process.env.AUTH0_DOMAIN;
    if (!auth0Domain)
      return res.status(500).json({ error: "Auth0 is not configured on the server" });

    // Normalize: accept the domain with or without scheme / trailing slash so a
    // misconfigured env var (e.g. "https://tenant.auth0.com/") still works.
    auth0Domain = auth0Domain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");

    let decoded;
    try {
      // Decode the token header to get the key id (kid)
      const segments = idToken.split(".");
      if (segments.length !== 3) throw new Error("Malformed JWT (expected 3 segments)");
      const tokenHeader = JSON.parse(Buffer.from(segments[0], "base64url").toString());

      // Fetch the JWKS keys directly from Auth0 using native Node 20 fetch
      const jwksRes = await fetch(`https://${auth0Domain}/.well-known/jwks.json`);
      if (!jwksRes.ok) throw new Error(`JWKS fetch failed (HTTP ${jwksRes.status})`);
      const jwks = await jwksRes.json();

      // Find the key matching the kid from the token header
      const jwk = (jwks.keys || []).find((key) => key.kid === tokenHeader.kid);
      if (!jwk) throw new Error(`No JWKS key matches token kid: ${tokenHeader.kid}`);

      // Import the JWK directly into a native Node.js public key
      const crypto = require("crypto");
      const publicKey = crypto.createPublicKey({ format: "jwk", key: jwk }).export({
        type: "spki",
        format: "pem",
      });

      // Verify the ID token signature and claims. clockTolerance absorbs minor
      // skew between the Auth0 issuer clock and this server.
      decoded = jwt.verify(idToken, publicKey, {
        algorithms: ["RS256"],
        issuer: `https://${auth0Domain}/`,
        clockTolerance: 30,
      });
    } catch (verifyErr) {
      // Log the real reason (name + message) so failures are diagnosable.
      console.error(`auth0 token verification failed [${verifyErr.name || "Error"}]:`, verifyErr.message);
      const expired = verifyErr.name === "TokenExpiredError";
      return res.status(401).json({
        error: expired
          ? "Your social login session expired. Please sign in again."
          : "Auth0 token verification failed",
      });
    }

    // Extract user info from the verified token
    auth0User = {
      sub: decoded.sub,
      email: decoded.email,
      name: decoded.name || decoded.nickname || decoded.email?.split("@")[0],
      picture: decoded.picture || null,
    };

    if (!auth0User.email) {
      return res.status(400).json({ error: "Auth0 profile does not include an email address" });
    }

    const db = await getDb();
    let user = await db.collection("users").findOne({ email: auth0User.email });

    if (!user) {
      // New user — create account automatically
      const result = await db.collection("users").insertOne({
        name: auth0User.name,
        email: auth0User.email,
        auth0Sub: auth0User.sub,
        authProvider: auth0User.sub?.split("|")[0] || "auth0",
        picture: auth0User.picture,
        role: "viewer",
        status: "active",
        ...defaultPlanFields("auth0"),
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });
      await db.collection("users").updateOne(
        { _id: result.insertedId },
        {
          $set: {
            organizationId: result.insertedId.toString(),
            organizationOwnerId: result.insertedId.toString(),
          },
        }
      );
      user = await db.collection("users").findOne({ _id: result.insertedId });
    } else {
      // Existing user — update last login and link Auth0 identity
      await db.collection("users").updateOne(
        { _id: user._id },
        {
          $set: {
            lastLogin: new Date().toISOString(),
            auth0Sub: auth0User.sub,
            authProvider: auth0User.sub?.split("|")[0] || user.authProvider || "password",
            ...(auth0User.picture && !user.picture ? { picture: auth0User.picture } : {}),
          },
        }
      );
    }

    const hydratedUser = await ensureUserPlan(db, user._id.toString());
    const planContext = await getPlanContext(db, user._id.toString());
    const role = hydratedUser.role || "viewer";

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email, name: hydratedUser.name, role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        name: hydratedUser.name,
        email: hydratedUser.email,
        id: hydratedUser._id.toString(),
        role,
        planTier: planContext.plan.tier,
        planStatus: planContext.planOwner.planStatus || "active",
        ownPlanTier: hydratedUser.planTier || "free",
        organizationId: hydratedUser.organizationId,
        organizationOwnerId: hydratedUser.organizationOwnerId,
        planOwnerId: planContext.planOwner._id.toString(),
        isPlanOwner: planContext.planOwner._id.toString() === hydratedUser._id.toString(),
      },
    });
    logAudit(user._id.toString(), user.email, "auth.login", { method: "auth0", provider: auth0User.sub?.split("|")[0] }, "info");
  } catch (err) {
    // The token already verified above; anything here is a server-side
    // (DB / plan / signing) failure and must NOT be reported as a token error.
    console.error("auth0 login (post-verification) error:", err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ─── Get current user info (for role hydration after page reload) ────────────
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { ObjectId } = require("mongodb");

    let user = null;

    // Try ObjectId lookup first (standard case)
    try {
      user = await db.collection("users").findOne(
        { _id: new ObjectId(req.userId) },
        { projection: { passwordHash: 0 } }
      );
    } catch {
      // userId isn't a valid ObjectId — fall back to email lookup
    }

    // Fallback: look up by email (handles legacy or non-ObjectId session tokens)
    if (!user && req.userEmail) {
      user = await db.collection("users").findOne(
        { email: req.userEmail },
        { projection: { passwordHash: 0 } }
      );
    }

    if (!user) return res.status(404).json({ error: "User not found" });

    const hydratedUser = await ensureUserPlan(db, user._id.toString());
    const planContext = await getPlanContext(db, user._id.toString());
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

// ─── Sign Out — session only, data preserved in MongoDB ─────────────────────
router.post("/signout", authMiddleware, async (_req, res) => {
  // Data intentionally NOT deleted — it persists in MongoDB so the user
  // can pick up exactly where they left off on next login.
  console.log("👋  User signed out — data preserved in MongoDB");
  res.json({ success: true });
});

module.exports = router;
