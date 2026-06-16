const { verifyToken, createClerkClient } = require("@clerk/backend");

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const clerkClient = createClerkClient({ secretKey: CLERK_SECRET_KEY });

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized — missing token" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    req.userId = payload.sub;

    // Build name from JWT claims (requires JWT template to include first_name/last_name)
    const firstName = payload.first_name || "";
    const lastName  = payload.last_name  || "";
    req.userName    = [firstName, lastName].filter(Boolean).join(" ").trim();
    req.userEmail   = payload.email || "";
    req.userPicture = payload.image_url || "";
    req.userRole    = "viewer";
    next();
  } catch (err) {
    console.error("Clerk token verification failed:", err?.message);
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

// JWT_SECRET kept for analytics.js which uses its own auth scheme
const JWT_SECRET = process.env.JWT_SECRET || "datavault-secret-key-2024";

module.exports = { authMiddleware, fetchClerkUser, JWT_SECRET };
