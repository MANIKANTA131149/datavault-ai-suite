/**
 * Analytics routes — standalone, NOT tied to the regular user auth system.
 *
 * Mounted at /api/analytics (NOT under /admin to avoid authMiddleware conflict).
 *
 * Required .env variables:
 *   ANALYTICS_USERNAME        — login username for the audit team
 *   ANALYTICS_PASSWORD        — login password for the audit team
 *   ANALYTICS_TOKEN_SECRET    (optional) separate JWT secret; falls back to JWT_SECRET
 */

const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { getDb } = require("../db");

// Constant-time string compare to avoid leaking credential length/content via timing.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const router = express.Router();

// Tight brute-force limiter for the analytics login (separate creds, no Clerk).
// 5 attempts/min/IP — the surrounding apiLimiter (300/min) is far too loose for
// a password endpoint.
const analyticsLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  message: { error: "Too many login attempts. Please wait a minute and try again." },
});

function getAnalyticsSecret() {
  const secret = process.env.ANALYTICS_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    // In a deployed environment, refuse to sign/verify with a public default —
    // that would let anyone forge analytics tokens. Fail closed.
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      throw new Error("ANALYTICS_TOKEN_SECRET or JWT_SECRET must be set in production");
    }
    return "analytics-fallback-secret-dev-only";
  }
  return secret;
}

// ── POST /api/admin/analytics/login ───────────────────────────────────────────
router.post("/login", analyticsLoginLimiter, (req, res) => {
  const { username, password } = req.body || {};

  const expectedUser = process.env.ANALYTICS_USERNAME;
  const expectedPass = process.env.ANALYTICS_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return res.status(503).json({
      error:
        "Analytics credentials not configured. Add ANALYTICS_USERNAME and ANALYTICS_PASSWORD to your .env file.",
    });
  }

  if (!safeEqual(username, expectedUser) || !safeEqual(password, expectedPass)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ analyticsViewer: true }, getAnalyticsSecret(), {
    expiresIn: "8h",
  });

  res.json({ token });
});

// ── Analytics auth middleware (separate from user JWT) ────────────────────────
function analyticsAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Analytics token required" });
  }
  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, getAnalyticsSecret());
    if (!payload.analyticsViewer) throw new Error("Not an analytics token");
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired analytics token" });
  }
}

// ── GET /api/admin/analytics ──────────────────────────────────────────────────
router.get("/", analyticsAuth, async (req, res) => {
  try {
    const db = await getDb();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgoStr = thirtyDaysAgo.slice(0, 10);
    const todayPrefix = `${todayStr}T00:00:00`;

    const [
      userCounts,
      userByPlan,
      userByRole,
      userDailyTrend,
      queryFacet,
      dailyQueryTrend,
      dailyTokenTrend,
      topUsersRaw,
      connectionStats,
      datasetCount,
      datasetToday,
      recentActivity,
      systemPing,
    ] = await Promise.all([
      // 1. User totals
      db.collection("users").aggregate([
        {
          $facet: {
            total: [{ $count: "n" }],
            newToday: [
              { $match: { createdAt: { $gte: todayPrefix } } },
              { $count: "n" },
            ],
          },
        },
      ]).toArray(),

      // 2. Users by plan tier
      db.collection("users").aggregate([
        { $group: { _id: "$planTier", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),

      // 3. Users by role
      db.collection("users").aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]).toArray(),

      // 4. New users per day (last 30 days)
      db.collection("users").aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $substr: ["$createdAt", 0, 10] },
            newUsers: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray(),

      // 5. Query stats facet
      db.collection("history").aggregate([
        {
          $facet: {
            total: [{ $count: "n" }],
            today: [
              { $match: { date: { $gte: todayPrefix } } },
              { $count: "n" },
            ],
            byStatus: [
              { $group: { _id: "$status", count: { $sum: 1 } } },
            ],
            byProvider: [
              {
                $group: {
                  _id: "$provider",
                  count: { $sum: 1 },
                  tokens: { $sum: "$totalTokens" },
                },
              },
              { $sort: { count: -1 } },
            ],
            activeToday: [
              { $match: { date: { $gte: todayPrefix } } },
              { $group: { _id: "$userId" } },
              { $count: "n" },
            ],
            avgStats: [
              {
                $group: {
                  _id: null,
                  avgDurationMs: { $avg: "$durationMs" },
                  avgTurns: { $avg: "$turns" },
                  totalTokens: { $sum: "$totalTokens" },
                },
              },
            ],
          },
        },
      ]).toArray(),

      // 6. Daily query trend (last 30 days)
      db.collection("history").aggregate([
        { $match: { date: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $substr: ["$date", 0, 10] },
            count: { $sum: 1 },
            errors: {
              $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] },
            },
            avgDuration: { $avg: "$durationMs" },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray(),

      // 7. Daily token trend (last 30 days)
      db.collection("daily_token_logs").aggregate([
        { $match: { dateStr: { $gte: thirtyDaysAgoStr } } },
        {
          $group: {
            _id: "$dateStr",
            tokens: { $sum: "$tokensUsed" },
            queries: { $sum: "$queriesUsed" },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray(),

      // 8. Top 10 users by query count
      db.collection("history").aggregate([
        {
          $group: {
            _id: "$userId",
            queryCount: { $sum: 1 },
            totalTokens: { $sum: "$totalTokens" },
            errorCount: {
              $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] },
            },
            lastQuery: { $max: "$date" },
          },
        },
        { $sort: { queryCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "users",
            let: { uid: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: [{ $toString: "$_id" }, "$$uid"] },
                },
              },
              { $project: { name: 1, email: 1, planTier: 1 } },
            ],
            as: "userDoc",
          },
        },
      ]).toArray(),

      // 9. Connections by DB type
      db.collection("connections").aggregate([
        { $group: { _id: "$dbType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),

      // 10. Total datasets
      db.collection("datasets").countDocuments(),

      // 11. Datasets uploaded today
      db.collection("datasets").countDocuments({
        uploadDate: { $gte: todayPrefix },
      }),

      // 12. Recent 20 queries
      db.collection("history")
        .find(
          {},
          {
            projection: {
              query: 1,
              status: 1,
              provider: 1,
              model: 1,
              turns: 1,
              totalTokens: 1,
              durationMs: 1,
              date: 1,
            },
          }
        )
        .sort({ date: -1 })
        .limit(20)
        .toArray(),

      // 13. MongoDB health
      db.command({ ping: 1 }).then(() => true).catch(() => false),
    ]);

    // ── Unpack facet results ─────────────────────────────────────────────────
    const uc = userCounts[0] || {};
    const qf = queryFacet[0] || {};
    const avgStats = (qf.avgStats || [])[0] || {};
    const byStatus = qf.byStatus || [];
    const successCount = (byStatus.find((s) => s._id === "success") || {}).count || 0;
    const errorCount   = (byStatus.find((s) => s._id === "error")   || {}).count || 0;
    const totalQueries = ((qf.total || [])[0] || {}).n || 0;

    const topUsers = topUsersRaw.map((u) => {
      const userDoc = (u.userDoc || [])[0] || {};
      return {
        userId:      u._id,
        name:        userDoc.name     || "Unknown",
        email:       userDoc.email    || u._id,
        planTier:    userDoc.planTier || "free",
        queryCount:  u.queryCount,
        totalTokens: u.totalTokens || 0,
        errorCount:  u.errorCount  || 0,
        lastQuery:   u.lastQuery,
      };
    });

    res.json({
      generatedAt: now.toISOString(),
      users: {
        total:       ((uc.total   || [])[0] || {}).n || 0,
        newToday:    ((uc.newToday|| [])[0] || {}).n || 0,
        activeToday: ((qf.activeToday || [])[0] || {}).n || 0,
        byPlan: userByPlan.map((p) => ({ tier: p._id || "unknown", count: p.count })),
        byRole: userByRole.map((r) => ({ role: r._id || "viewer",  count: r.count })),
        dailyTrend: userDailyTrend.map((d) => ({ date: d._id, newUsers: d.newUsers })),
      },
      queries: {
        total:        totalQueries,
        today:        ((qf.today || [])[0] || {}).n || 0,
        successCount,
        errorCount,
        successRate:  totalQueries > 0 ? parseFloat((successCount / totalQueries).toFixed(3)) : 1,
        avgDurationMs: Math.round(avgStats.avgDurationMs || 0),
        avgTurns:      parseFloat((avgStats.avgTurns || 0).toFixed(1)),
        totalTokens:   avgStats.totalTokens || 0,
        byProvider: (qf.byProvider || []).map((p) => ({
          provider: p._id || "unknown",
          count:    p.count,
          tokens:   p.tokens || 0,
        })),
      },
      trends: {
        dailyQueries: dailyQueryTrend.map((d) => ({
          date:         d._id,
          count:        d.count,
          errors:       d.errors,
          success:      d.count - d.errors,
          avgDurationMs: Math.round(d.avgDuration || 0),
        })),
        dailyTokens: dailyTokenTrend.map((d) => ({
          date:    d._id,
          tokens:  d.tokens,
          queries: d.queries,
        })),
        dailyUsers: userDailyTrend.map((d) => ({ date: d._id, newUsers: d.newUsers })),
      },
      topUsers,
      connections: {
        total:  connectionStats.reduce((s, c) => s + c.count, 0),
        byType: connectionStats.map((c) => ({ type: c._id || "unknown", count: c.count })),
      },
      datasets: { total: datasetCount, uploadedToday: datasetToday },
      recentActivity: recentActivity.map((r) => ({
        query:       typeof r.query === "string" ? r.query.slice(0, 90) : "",
        status:      r.status    || "unknown",
        provider:    r.provider  || "",
        model:       (r.model || "").split(".").pop() || r.model || "",
        turns:       r.turns     || 0,
        totalTokens: r.totalTokens || 0,
        durationMs:  r.durationMs  || 0,
        date:        r.date,
      })),
      system: {
        mongoConnected: systemPing,
        uptimeSeconds:  Math.round(process.uptime()),
      },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/analytics/users — paginated, sortable all-users table ────────────
// Starts from the users collection so ALL users appear (not just those with history).
// History stats (queryCount, totalTokens, errorCount, lastQuery) default to 0/null
// for users who have never run a query.
router.get("/users", analyticsAuth, async (req, res) => {
  const page     = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 25));
  const validSort = ["queryCount", "totalTokens", "errorCount", "lastQuery", "createdAt", "name"];
  const sortBy   = validSort.includes(req.query.sortBy) ? req.query.sortBy : "queryCount";
  const order    = req.query.order === "asc" ? 1 : -1;

  try {
    const db = await getDb();

    const [total, rows] = await Promise.all([
      // Count ALL users (not just those with history)
      db.collection("users").countDocuments(),

      // Paginated users with left-joined history stats
      db.collection("users").aggregate([
        // Left-join: for each user, aggregate their history rows
        {
          $lookup: {
            from: "history",
            let: { uid: { $toString: "$_id" } },
            pipeline: [
              { $match: { $expr: { $eq: ["$userId", "$$uid"] } } },
              {
                $group: {
                  _id: null,
                  queryCount:  { $sum: 1 },
                  totalTokens: { $sum: "$totalTokens" },
                  errorCount:  { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
                  lastQuery:   { $max: "$date" },
                },
              },
            ],
            as: "stats",
          },
        },
        // Flatten stats (default to 0 / null when no history)
        {
          $addFields: {
            queryCount:  { $ifNull: [{ $arrayElemAt: ["$stats.queryCount",  0] }, 0]    },
            totalTokens: { $ifNull: [{ $arrayElemAt: ["$stats.totalTokens", 0] }, 0]    },
            errorCount:  { $ifNull: [{ $arrayElemAt: ["$stats.errorCount",  0] }, 0]    },
            lastQuery:   { $ifNull: [{ $arrayElemAt: ["$stats.lastQuery",   0] }, null] },
          },
        },
        { $project: { stats: 0, password: 0, __v: 0 } },
        { $sort: { [sortBy]: order, _id: 1 } },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
      ]).toArray(),
    ]);

    res.json({
      users: rows.map((u) => ({
        userId:      String(u._id),
        name:        u.name        || "Unknown",
        email:       u.email       || String(u._id),
        planTier:    u.planTier    || "free",
        createdAt:   u.createdAt   || null,
        queryCount:  u.queryCount,
        totalTokens: u.totalTokens,
        errorCount:  u.errorCount,
        lastQuery:   u.lastQuery   || null,
      })),
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error("Analytics users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
