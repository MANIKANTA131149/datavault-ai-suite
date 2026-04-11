const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDb } = require("../db");
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

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.collection("users").insertOne({
      name,
      email,
      passwordHash,
      createdAt: new Date().toISOString(),
    });

    const token = jwt.sign(
      { userId: result.insertedId.toString(), email, name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ token, user: { name, email } });
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

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return res.status(401).json({ error: "Invalid email or password" });

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user: { name: user.name, email: user.email } });
  } catch (err) {
    console.error("signin error:", err);
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
