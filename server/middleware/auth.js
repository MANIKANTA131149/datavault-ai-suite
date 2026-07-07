const { verifyToken, createClerkClient } = require("@clerk/backend");
const { getDb } = require("../db");

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const clerkClient = createClerkClient({ secretKey: CLERK_SECRET_KEY });

// Short-lived cache of suspended user ids so we don't hit Mongo on every request.
// A newly-suspended user is locked out within SUSPEND_CACHE_TTL_MS. Only the
// "is this user suspended?" boolean is cached, keyed by userId.
const SUSPEND_CACHE_TTL_MS = 60 * 1000;
const suspendCache = new Map(); // userId -> { suspended: boolean, ts: number }

async function isSuspended(userId) {
  const cached = suspendCache.get(userId);
  if (cached && Date.now() - cached.ts < SUSPEND_CACHE_TTL_MS) return cached.suspended;
  try {
    const db = await getDb();
    const u = await db.collection("users").findOne(
      { _id: userId },
      { projection: { status: 1 } }
    );
    const suspended = u?.status === "suspended";
    suspendCache.set(userId, { suspended, ts: Date.now() });
    return suspended;
  } catch {
    // On a DB hiccup, fail open (don't lock everyone out) — token was still valid.
    return false;
  }
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized — missing token" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    req.userId = payload.sub;

    // Block suspended accounts even though their Clerk token is still valid.
    if (await isSuspended(req.userId)) {
      return res.status(403).json({ error: "Your account has been suspended.", code: "ACCOUNT_SUSPENDED" });
    }

    // Build name from JWT claims (requires JWT template to include first_name/last_name)
    const firstName = payload.first_name || "";
    const lastName  = payload.last_name  || "";
    req.userName    = [firstName, lastName].filter(Boolean).join(" ").trim();
    req.userEmail   = payload.email || "";
    req.userPicture = payload.image_url || "";
    req.userRole    = "viewer";
    next();
  } catch (err) {
    // An expired token is routine: Clerk tokens live ~60s and the client
    // auto-refreshes, so the occasional request races past expiry. Log it
    // quietly and signal "expired" so the client knows to retry with a fresh
    // token rather than treating it as a hard auth failure.
    const message = err?.message || "";
    const isExpired = /expired/i.test(message);
    if (isExpired) {
      console.warn("Clerk token expired (client will refresh & retry)");
      return res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    }
    console.error("Clerk token verification failed:", message);
    return res.status(401).json({ error: "Unauthorized — invalid token" });
  }
}

// Fetch full user profile from Clerk API (used when JWT claims are missing name/email)
async function fetchClerkUser(clerkId) {
  try {
    const u = await clerkClient.users.getUser(clerkId);
    const email = u.emailAddresses?.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress || "";
    const name  = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || email.split("@")[0] || "User";
    return { name, email, picture: u.imageUrl || "" };
  } catch {
    return null;
  }
}

// Drop a user's cached suspension state so an admin's suspend/reactivate takes
// effect immediately rather than after the TTL.
function invalidateSuspendCache(userId) {
  suspendCache.delete(userId);
}

// JWT_SECRET kept for analytics.js which uses its own auth scheme
const JWT_SECRET = process.env.JWT_SECRET || "datavault-secret-key-2024";

module.exports = { authMiddleware, fetchClerkUser, JWT_SECRET, invalidateSuspendCache };
