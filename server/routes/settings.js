const express = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

// ─── GET /api/settings — load user preferences ────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection("settings").findOne({ userId: req.userId });
    res.json(
      doc
        ? {
            theme: doc.theme ?? "dark",
            compactMode: doc.compactMode ?? false,
            codeFont: doc.codeFont ?? "jetbrains",
            providerConfigs: doc.providerConfigs ?? {},
          }
        : {}
    );
  } catch (err) {
    console.error("get settings error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /api/settings — upsert user preferences ─────────────────────────────
router.put("/", async (req, res) => {
  try {
    const { theme, compactMode, codeFont, providerConfigs } = req.body;
    const db = await getDb();
    await db.collection("settings").updateOne(
      { userId: req.userId },
      {
        $set: {
          userId: req.userId,
          theme,
          compactMode,
          codeFont,
          providerConfigs: providerConfigs ?? {},
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("save settings error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /api/settings/profile — update display name ─────────────────────────
router.put("/profile", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });
    const db = await getDb();
    await db.collection("users").updateOne(
      { _id: new ObjectId(req.userId) },
      { $set: { name: name.trim() } }
    );
    res.json({ success: true, name: name.trim() });
  } catch (err) {
    console.error("update profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
