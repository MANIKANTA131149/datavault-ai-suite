const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDb } = require("../db");
const { logAudit } = require("../middleware/auditLogger");
const { authMiddleware, JWT_SECRET } = require("../middleware/auth");

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

    // First user becomes admin automatically
    const userCount = await db.collection("users").countDocuments();
    const role = userCount === 0 ? "admin" : "viewer";

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.collection("users").insertOne({
      name,
      email,
      passwordHash,
      role,
      status: "active",
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    });

    const token = jwt.sign(
      { userId: result.insertedId.toString(), email, name, role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ token, user: { name, email, role } });
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
      return res.status(401).json({ error: "Invalid email or password" });

    // Check if user is suspended
    if (user.status === "suspended")
      return res.status(403).json({ error: "Your account has been suspended. Contact your administrator." });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return res.status(401).json({ error: "Invalid email or password" });

    const role = user.role || "viewer";

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

    res.json({ token, user: { name: user.name, email: user.email, role } });
    logAudit(user._id.toString(), user.email, "auth.login", { method: "password" }, "info");
  } catch (err) {
    console.error("signin error:", err);
    res.status(500).json({ error: "Internal server error" });
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

    res.json({
      name: user.name,
      email: user.email,
      role: user.role || "viewer",
      status: user.status || "active",
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
