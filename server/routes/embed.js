// ─── Embeddable Chat Widget (F8) ──────────────────────────────────────────────
// GET /api/embed/:deployId/config — public widget configuration for a deployed
// chat (brand, title, theme). The widget loader script (public/embed.js on the
// frontend) calls this, then mounts an iframe to /deploy/:deployId?embed=1.
// Usage is metered against the deployment owner as "embed_query" events.

const express = require("express");
const { getDb } = require("../db");
const { recordUsage } = require("../lib/metering");

const router = express.Router();

router.get("/:deployId/config", async (req, res) => {
  try {
    const db = await getDb();
    const deployment = await db.collection("deployments").findOne({ deployId: req.params.deployId });
    if (!deployment || deployment.status === "broken" || deployment.status === "disabled") {
      return res.status(404).json({ error: "Deployment not found or inactive" });
    }

    const embed = deployment.embed || {};
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({
      deployId: deployment.deployId,
      title: embed.title || deployment.name || "Querify Assistant",
      welcomeMessage: embed.welcomeMessage || "Ask a question about this data.",
      primaryColor: embed.primaryColor || "#3b82f6",
      position: ["bottom-right", "bottom-left"].includes(embed.position) ? embed.position : "bottom-right",
      logoUrl: embed.logoUrl || null,
    });

    recordUsage({
      userId: deployment.userId,
      eventType: "embed_query",
      units: 0, // config load — actual queries metered via the public chat route
      metadata: { deployId: deployment.deployId, kind: "config_load", referer: req.headers.referer || "" },
    });
  } catch (err) {
    console.error("embed config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
