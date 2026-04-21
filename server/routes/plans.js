const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { logAudit } = require("../middleware/auditLogger");
const {
  PLAN_DEFINITIONS,
  PLAN_TIERS,
  allowedExport,
  canUseMetric,
  getPlanContext,
  serializePlanContext,
} = require("../lib/plans");

const router = express.Router();
router.use(authMiddleware);

router.get("/definitions", (_req, res) => {
  res.json({ tiers: PLAN_TIERS, plans: PLAN_DEFINITIONS });
});

function formatExportName(format) {
  const names = {
    csv: "CSV",
    json: "JSON",
    markdown: "Markdown",
    html: "HTML",
    pdf: "PDF",
    audit: "Audit",
    history: "History",
  };
  return names[format] || String(format || "Export");
}

function formatAllowedPlanNames(format) {
  const names = PLAN_TIERS
    .map((tier) => PLAN_DEFINITIONS[tier])
    .filter((plan) => plan.exports.includes(format))
    .map((plan) => plan.name);
  if (names.length <= 1) return names[0] || "a higher";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

router.get("/me", async (req, res) => {
  try {
    const db = await getDb();
    const context = await getPlanContext(db, req.userId);
    if (!context) return res.status(404).json({ error: "User not found" });
    res.json(serializePlanContext(context));
  } catch (err) {
    console.error("get plan context error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/check", async (req, res) => {
  try {
    const { action, metric, attempted = 1, format } = req.body || {};
    const db = await getDb();
    const context = await getPlanContext(db, req.userId);
    if (!context) return res.status(404).json({ error: "User not found" });

    const { plan, usage } = context;
    if (action === "export") {
      if (!allowedExport(plan, format)) {
        return res.status(403).json({
          error: `${formatExportName(format)} export requires ${formatAllowedPlanNames(format)} plan`,
          code: "PLAN_FEATURE_LOCKED",
          feature: `export:${format}`,
          planTier: plan.tier,
          planName: plan.name,
        });
      }
      return res.json({ allowed: true, plan, usage });
    }

    const usageMetric = metric || action;
    if (!Object.prototype.hasOwnProperty.call(usage, usageMetric)) {
      return res.status(400).json({ error: "Unknown plan metric" });
    }

    const check = canUseMetric(plan, usageMetric, usage[usageMetric], Number(attempted) || 1);
    if (!check.allowed) return res.status(403).json(check.details);
    res.json({ allowed: true, plan, usage });
  } catch (err) {
    console.error("plan check error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/exports/check", async (req, res) => {
  try {
    const { format } = req.body || {};
    const db = await getDb();
    const context = await getPlanContext(db, req.userId);
    if (!context) return res.status(404).json({ error: "User not found" });
    if (!allowedExport(context.plan, format)) {
      return res.status(403).json({
        error: `${formatExportName(format)} export requires ${formatAllowedPlanNames(format)} plan`,
        code: "PLAN_FEATURE_LOCKED",
        feature: `export:${format}`,
        planTier: context.plan.tier,
        planName: context.plan.name,
      });
    }
    res.json({ allowed: true });
  } catch (err) {
    console.error("export check error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/record", async (req, res) => {
  // Kept as a provider-agnostic hook for later payment/proxy integrations.
  const { usage } = req.body || {};
  res.json({ success: true, source: "manual", usage: usage || null });
});

router.put("/users/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const { tier } = req.body || {};
    if (!PLAN_TIERS.includes(tier)) {
      return res.status(400).json({ error: `Invalid plan. Must be one of: ${PLAN_TIERS.join(", ")}` });
    }

    const db = await getDb();
    const actor = await db.collection("users").findOne({ _id: new ObjectId(req.userId) });
    if (!actor || actor.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    const actorContext = await getPlanContext(db, req.userId);

    const targetId = new ObjectId(req.params.id);
    const target = await db.collection("users").findOne({
      _id: targetId,
      organizationId: actorContext.user.organizationId,
    });
    if (!target) return res.status(404).json({ error: "User not found in your organization" });

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await db.collection("users").updateOne(
      { _id: targetId },
      {
        $set: {
          planTier: tier,
          planStatus: "active",
          planSource: "manual",
          planAssignedBy: req.userId,
          planAssignedAt: now.toISOString(),
          currentPeriodStart: periodStart.toISOString(),
          currentPeriodEnd: periodEnd.toISOString(),
        },
      }
    );

    logAudit(req.userId, actor.email || "", "admin.plan_change", {
      targetUserId: req.params.id,
      targetEmail: target.email,
      oldPlan: target.planTier || "free",
      newPlan: tier,
    }, "warn");

    res.json({ success: true, tier });
  } catch (err) {
    console.error("manual plan change error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
