const PLAN_TIERS = ["free", "standard", "professional", "enterprise"];

const PLAN_DEFINITIONS = {
  free: {
    tier: "free",
    name: "Free",
    monthlyQueries: 25,
    monthlyTokens: 50000,
    datasets: 2,
    fileSizeLimitBytes: 1 * 1024 * 1024,
    insights: 3,
    members: 0,
    adminPage: false,
    exports: ["csv", "json"],
    features: ["25 monthly queries", "2 datasets", "1 MB files", "CSV and JSON exports"],
  },
  standard: {
    tier: "standard",
    name: "Standard",
    monthlyQueries: 500,
    monthlyTokens: 1000000,
    datasets: 20,
    fileSizeLimitBytes: 15 * 1024 * 1024,
    insights: 25,
    members: 1,
    adminPage: true,
    exports: ["csv", "json", "markdown", "pdf"],
    features: ["500 monthly queries", "20 datasets", "15 MB files", "1 shared member", "PDF exports", "Admin page"],
  },
  professional: {
    tier: "professional",
    name: "Professional",
    monthlyQueries: 2500,
    monthlyTokens: 5000000,
    datasets: 100,
    fileSizeLimitBytes: 35 * 1024 * 1024,
    insights: 100,
    members: 3,
    adminPage: true,
    exports: ["csv", "json", "markdown", "html", "pdf"],
    features: ["2,500 monthly queries", "100 datasets", "35 MB files", "3 shared members", "PDF exports"],
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise",
    monthlyQueries: null,
    monthlyTokens: null,
    datasets: null,
    fileSizeLimitBytes: null,
    insights: null,
    members: null,
    adminPage: true,
    exports: ["csv", "json", "markdown", "html", "pdf", "audit", "history"],
    features: ["Unlimited usage", "No file size limit", "Unlimited members", "All exports", "Audit and history export"],
  },
};

function normalizePlanTier(tier) {
  return PLAN_TIERS.includes(tier) ? tier : "free";
}

function getPlanDefinition(tier) {
  return PLAN_DEFINITIONS[normalizePlanTier(tier)];
}

function defaultPlanFields(actorId = "system") {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    planTier: "free",
    planStatus: "active",
    planSource: "manual",
    planAssignedBy: actorId,
    planAssignedAt: now.toISOString(),
    currentPeriodStart: periodStart.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
  };
}

function organizationPatchForUser(user, fallbackOwnerId) {
  const selfId = user?._id?.toString ? user._id.toString() : fallbackOwnerId;
  const organizationId = user?.organizationId || selfId;
  return {
    organizationId,
    organizationOwnerId: user?.organizationOwnerId || organizationId,
  };
}

function getMonthlyWindow(user = {}) {
  const now = new Date();
  const fallbackStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fallbackEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const start = user.currentPeriodStart || fallbackStart.toISOString();
  const end = user.currentPeriodEnd || fallbackEnd.toISOString();
  return { start, end };
}

function limitValue(plan, metric) {
  return plan[metric] === null || plan[metric] === undefined ? null : plan[metric];
}

function isUnlimited(value) {
  return value === null || value === undefined;
}

function allowedExport(plan, format) {
  return plan.exports.includes(format);
}

function buildLimitError(metric, plan, usageValue, attempted = 1) {
  const limit = limitValue(plan, metric);
  const label = {
    monthlyQueries: "Monthly query",
    monthlyTokens: "Monthly token",
    datasets: "Dataset",
    insights: "Saved insight",
    members: "Shared member",
  }[metric] || "Plan";
  return {
    error: `${label} limit reached for ${plan.name} plan`,
    code: "PLAN_LIMIT_REACHED",
    metric,
    planTier: plan.tier,
    planName: plan.name,
    usage: usageValue,
    attempted,
    limit,
  };
}

function canUseMetric(plan, metric, usageValue, attempted = 1) {
  const limit = limitValue(plan, metric);
  if (isUnlimited(limit)) return { allowed: true };
  const allowed = usageValue + attempted <= limit;
  return allowed
    ? { allowed: true }
    : { allowed: false, details: buildLimitError(metric, plan, usageValue, attempted) };
}

async function getUserById(db, userId) {
  const { ObjectId } = require("mongodb");
  try {
    return await db.collection("users").findOne({ _id: new ObjectId(userId) });
  } catch {
    return await db.collection("users").findOne({ _id: userId });
  }
}

async function ensureUserPlan(db, userId, actorId = "system") {
  const user = await getUserById(db, userId);
  if (!user) return null;

  const normalized = normalizePlanTier(user.planTier);
  const orgPatch = organizationPatchForUser(user, userId);
  const needsDefaults =
    !user.planTier ||
    user.planTier !== normalized ||
    !user.planStatus ||
    !user.planSource ||
    !user.currentPeriodStart ||
    !user.currentPeriodEnd ||
    !user.organizationId ||
    !user.organizationOwnerId;

  if (!needsDefaults) return { ...user, planTier: normalized, ...orgPatch };

  const patch = {
    ...defaultPlanFields(actorId),
    planTier: normalized,
    planAssignedBy: user.planAssignedBy || actorId,
    planAssignedAt: user.planAssignedAt || new Date().toISOString(),
    ...orgPatch,
  };
  await db.collection("users").updateOne({ _id: user._id }, { $set: patch });
  return { ...user, ...patch };
}

async function getOrganizationMembers(db, user) {
  const ensured = user.organizationId ? user : organizationPatchForUser(user);
  return db.collection("users")
    .find({ organizationId: ensured.organizationId }, { projection: { _id: 1, email: 1, role: 1, status: 1 } })
    .toArray();
}

async function getOrganizationMemberIds(db, user) {
  const members = await getOrganizationMembers(db, user);
  return members.map((member) => member._id.toString());
}

async function getPlanOwner(db, user) {
  const ownerId = user.organizationOwnerId || user.organizationId || user._id.toString();
  const owner = await ensureUserPlan(db, ownerId);
  return owner || user;
}

async function getUsage(db, user, planOwner = user) {
  const userIds = await getOrganizationMemberIds(db, user);
  const ownerId = planOwner._id?.toString ? planOwner._id.toString() : String(planOwner._id || user._id);
  const { start, end } = getMonthlyWindow(planOwner);
  const historyFilter = { userId: { $in: userIds }, date: { $gte: start, $lt: end } };

  const [queryCount, tokenAgg, datasetCount, insightCount, memberCount] = await Promise.all([
    db.collection("history").countDocuments(historyFilter),
    db.collection("history").aggregate([
      { $match: historyFilter },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$totalTokens", 0] } } } },
    ]).toArray(),
    db.collection("datasets").countDocuments({ userId: { $in: userIds }, archived: { $ne: true } }),
    db.collection("insights").countDocuments({ userId: { $in: userIds } }),
    db.collection("users").countDocuments({
      organizationId: user.organizationId,
      status: { $ne: "suspended" },
      $expr: { $ne: [{ $toString: "$_id" }, ownerId] },
    }),
  ]);

  return {
    monthlyQueries: queryCount,
    monthlyTokens: tokenAgg[0]?.total || 0,
    datasets: datasetCount,
    insights: insightCount,
    members: memberCount,
  };
}

async function getPlanContext(db, userId) {
  const user = await ensureUserPlan(db, userId);
  if (!user) return null;
  const planOwner = await getPlanOwner(db, user);
  const plan = getPlanDefinition(planOwner.planTier);
  const usage = await getUsage(db, user, planOwner);
  return { user, planOwner, plan, usage };
}

function isPlanOwner(user, planOwner) {
  const userId = user?._id?.toString ? user._id.toString() : String(user?._id || "");
  const ownerId = planOwner?._id?.toString ? planOwner._id.toString() : String(planOwner?._id || "");
  return Boolean(userId && ownerId && userId === ownerId);
}

async function canAccessAdmin(db, user) {
  const planOwner = await getPlanOwner(db, user);
  const plan = getPlanDefinition(planOwner?.planTier);
  return plan.adminPage && (isPlanOwner(user, planOwner) || user?.role === "admin");
}

function serializePlanContext(context) {
  const { user, planOwner, plan, usage } = context;
  return {
    plan,
    usage,
    planStatus: planOwner.planStatus || "active",
    planSource: planOwner.planSource || "manual",
    currentPeriodStart: planOwner.currentPeriodStart,
    currentPeriodEnd: planOwner.currentPeriodEnd,
    organizationId: user.organizationId,
    organizationOwnerId: user.organizationOwnerId,
    planOwnerId: planOwner._id?.toString ? planOwner._id.toString() : String(planOwner._id || ""),
    planOwnerEmail: planOwner.email,
    isPlanOwner: isPlanOwner(user, planOwner),
  };
}

module.exports = {
  PLAN_TIERS,
  PLAN_DEFINITIONS,
  normalizePlanTier,
  getPlanDefinition,
  defaultPlanFields,
  organizationPatchForUser,
  getMonthlyWindow,
  allowedExport,
  canUseMetric,
  ensureUserPlan,
  getPlanContext,
  getPlanOwner,
  isPlanOwner,
  getUsage,
  getOrganizationMembers,
  getOrganizationMemberIds,
  canAccessAdmin,
  serializePlanContext,
};
