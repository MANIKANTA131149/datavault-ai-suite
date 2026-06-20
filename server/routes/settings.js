const express = require("express");
const { getDb } = require("../db");
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
            tracingEnabled: doc.tracingEnabled ?? false,
            providerConfigs: doc.providerConfigs ?? {},
            activeProvider: doc.activeProvider ?? undefined,
            activeModel: doc.activeModel ?? undefined,
            selectedDatasetId: doc.selectedDatasetId ?? "",
            selectedSheet: doc.selectedSheet ?? "",
            selectedTable: doc.selectedTable ?? "",
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
    const {
      theme,
      compactMode,
      codeFont,
      tracingEnabled,
      providerConfigs,
      activeProvider,
      activeModel,
      selectedDatasetId,
      selectedSheet,
      selectedTable,
    } = req.body;
    const db = await getDb();
    const $set = {
      userId: req.userId,
      theme,
      compactMode,
      codeFont,
      providerConfigs: providerConfigs ?? {},
      activeProvider,
      activeModel,
      selectedDatasetId,
      selectedSheet,
      selectedTable,
      updatedAt: new Date().toISOString(),
    };
    // Only persist tracingEnabled when the client actually sends it, so an
    // older client omitting the field doesn't clobber a saved preference.
    if (typeof tracingEnabled === "boolean") $set.tracingEnabled = tracingEnabled;
    await db.collection("settings").updateOne(
      { userId: req.userId },
      { $set },
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
      { _id: req.userId },
      { $set: { name: name.trim() } }
    );
    res.json({ success: true, name: name.trim() });
  } catch (err) {
    console.error("update profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
