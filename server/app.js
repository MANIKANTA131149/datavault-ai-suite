const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");

const authRoutes = require("./routes/auth");
const datasetRoutes = require("./routes/datasets");
const historyRoutes = require("./routes/history");
const settingsRoutes = require("./routes/settings");
const insightsRoutes = require("./routes/insights");
const adminRoutes = require("./routes/admin");
const auditRoutes = require("./routes/audit");
const notificationsRoutes = require("./routes/notifications");
const planRoutes = require("./routes/plans");
const llmRoutes = require("./routes/llm");
const connectionsRoutes = require("./routes/connections");
const dbQueryRoutes = require("./routes/db-query");
const chatMemoryRoutes = require("./routes/chat-memory");
const deploymentsRoutes = require("./routes/deployments");
const analyticsRoutes = require("./routes/analytics");
const orgsRoutes = require("./routes/orgs");
const usageRoutes = require("./routes/usage");
const agentMemoryRoutes = require("./routes/agent-memory");
const glossaryRoutes = require("./routes/glossary");
const lineageRoutes = require("./routes/lineage");
const schedulesRoutes = require("./routes/schedules");
const alertsRoutes = require("./routes/alerts");
const apiKeysRoutes = require("./routes/api-keys");
const apiV1Routes = require("./routes/api-v1");
const dashboardsRoutes = require("./routes/dashboards");
const embedRoutes = require("./routes/embed");
const eventsRoutes = require("./routes/events");
const clerkWebhookRoutes = require("./routes/clerk-webhook");

const app = express();

// Behind API Gateway / Lambda the client IP arrives via X-Forwarded-For.
// Required for rate limiting to key on the real IP, not the proxy's.
app.set("trust proxy", 1);

// ─── Security headers ─────────────────────────────────────────────────────────
// CSP is disabled here because this Express app can also serve the SPA in
// self-hosted mode; the API responses themselves are JSON.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Strict allowlist: production domains + FRONTEND_URL + localhost (dev).
// Extra origins (e.g. an Amplify preview URL) via CORS_EXTRA_ORIGINS, comma-sep.
const STATIC_ALLOWED_ORIGINS = new Set([
  "https://querify.in",
  "https://www.querify.in",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.replace(/\/+$/, "")] : []),
  ...(process.env.CORS_EXTRA_ORIGINS || "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean),
]);

function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin / curl / server-to-server (no CORS applies)
  if (STATIC_ALLOWED_ORIGINS.has(origin.replace(/\/+$/, ""))) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") return true; // dev
  } catch { /* malformed origin header */ }
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
    exposedHeaders: ["x-encrypted-response"],
  })
);

// ─── Body parsing ──────────────────────────────────────────────────────────────
// 5mb default; only dataset uploads (workbook JSON) get the large limit.
const stdJson = express.json({ limit: "5mb" });
const bigJson = express.json({ limit: "50mb" });
app.use((req, res, next) =>
  /^\/(api\/)?datasets(\/|$)/.test(req.path) ? bigJson(req, res, next) : stdJson(req, res, next)
);

const encryptionMiddleware = require("./middleware/encryption");
app.use(encryptionMiddleware);

// Strip Mongo operators ($, .) from user input — blocks NoSQL operator
// injection like {"email": {"$ne": null}} across every route.
// MUST run after encryptionMiddleware: that's what produces the real
// (decrypted) req.body; before it there is only the opaque payload blob.
app.use(mongoSanitize());

// ─── Rate limiting ─────────────────────────────────────────────────────────────
// In-memory per Lambda container: not perfectly global, but it blunts
// brute-force and floods at zero cost. Move to a Mongo/Redis store later.
const rateLimitCommon = {
  standardHeaders: true,
  legacyHeaders: false,
  // trust proxy is intentionally enabled (API Gateway); silence the validator.
  validate: { trustProxy: false, xForwardedForHeader: false },
};
// Login/signup brute-force defense.
const authLimiter = rateLimit({
  ...rateLimitCommon,
  windowMs: 60 * 1000,
  limit: 10,
  message: { error: "Too many attempts. Please wait a minute and try again." },
});
// Public deployed-chat endpoints spend the deployer's LLM quota unauthenticated.
const publicChatLimiter = rateLimit({
  ...rateLimitCommon,
  windowMs: 60 * 1000,
  limit: 30,
  message: { error: "Too many requests. Please slow down." },
});
// Public REST API (key-authenticated): tighter than the app catch-all since
// each call may trigger a server-side LLM invocation on platform credentials.
const publicApiLimiter = rateLimit({
  ...rateLimitCommon,
  windowMs: 60 * 1000,
  limit: 60,
  message: { error: "API rate limit exceeded. Please slow down." },
});
// Catch-all for the rest of the API.
const apiLimiter = rateLimit({
  ...rateLimitCommon,
  windowMs: 60 * 1000,
  limit: 300,
  message: { error: "Too many requests. Please slow down." },
});

// ─── Routes ───────────────────────────────────────────────────────────────────
function mountApiRoutes(basePath) {
  app.use(`${basePath}/auth`, authLimiter, authRoutes);
  app.use(`${basePath}/datasets`, apiLimiter, datasetRoutes);
  app.use(`${basePath}/history`, apiLimiter, historyRoutes);
  app.use(`${basePath}/settings`, apiLimiter, settingsRoutes);
  app.use(`${basePath}/insights`, apiLimiter, insightsRoutes);
  app.use(`${basePath}/plans`, apiLimiter, planRoutes);
  app.use(`${basePath}/admin`, apiLimiter, adminRoutes);
  app.use(`${basePath}/audit`, apiLimiter, auditRoutes);
  app.use(`${basePath}/notifications`, apiLimiter, notificationsRoutes);
  app.use(`${basePath}/llm`, apiLimiter, llmRoutes);
  app.use(`${basePath}/connections`, apiLimiter, connectionsRoutes);
  app.use(`${basePath}/db-query`, apiLimiter, dbQueryRoutes);
  app.use(`${basePath}/chat-memory`, apiLimiter, chatMemoryRoutes);
  app.use(`${basePath}/deployments`, publicChatLimiter, deploymentsRoutes);
  app.use(`${basePath}/analytics`, apiLimiter, analyticsRoutes);
  app.use(`${basePath}/orgs`, apiLimiter, orgsRoutes);
  app.use(`${basePath}/usage`, apiLimiter, usageRoutes);
  app.use(`${basePath}/agent-memory`, apiLimiter, agentMemoryRoutes);
  app.use(`${basePath}/glossary`, apiLimiter, glossaryRoutes);
  app.use(`${basePath}/lineage`, apiLimiter, lineageRoutes);
  app.use(`${basePath}/schedules`, apiLimiter, schedulesRoutes);
  app.use(`${basePath}/alerts`, apiLimiter, alertsRoutes);
  app.use(`${basePath}/api-keys`, apiLimiter, apiKeysRoutes);
  app.use(`${basePath}/v1`, publicApiLimiter, apiV1Routes);
  app.use(`${basePath}/dashboards`, apiLimiter, dashboardsRoutes);
  app.use(`${basePath}/embed`, publicChatLimiter, embedRoutes);
  app.use(`${basePath}/events`, apiLimiter, eventsRoutes);
}

// Clerk webhooks — must be mounted BEFORE general JSON body parsing touches the path.
// The handler uses its own express.raw() to read the raw Buffer for signature verification.
app.use("/api/webhooks/clerk", clerkWebhookRoutes);
app.use("/webhooks/clerk", clerkWebhookRoutes);

// Primary API routes.
mountApiRoutes("/api");
// Some API Gateway / reverse-proxy setups strip the `/api` base path before forwarding to the app.
// Mounting at root keeps the same handlers reachable as `/<route>` (e.g. `/llm/alibaba/chat`).
mountApiRoutes("");

app.get(["/api/health", "/health"], (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

app.get("/sitemap.xml", (req, res) => {
  const origin = `${req.protocol}://${req.get("host")}`;
  const pages = ["/auth", "/app/get-started", "/pricing", "/deploy"];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map((page) => `  <url>\n    <loc>${origin}${page}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`)
    .join("\n")}\n</urlset>`;

  res.type("application/xml");
  res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  res.send(sitemap);
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
const clientDistPath = path.join(__dirname, "..", "dist");
app.use(
  express.static(clientDistPath, {
    maxAge: 0,
    setHeaders(res, pathName) {
      if (pathName.endsWith(".html")) {
        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
      } else if (/.+\.(js|mjs|css|svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf|eot|json)$/i.test(pathName)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

app.get(/^\/(?!api).*/, (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  res.sendFile(path.join(clientDistPath, "index.html"));
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

module.exports = app;
