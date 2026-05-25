const express = require("express");
const cors = require("cors");
const path = require("path");

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

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow localhost (dev) and any *.vercel.app domain (production)
app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.includes(".vercel.app") ||
        origin.includes(".amplifyapp.com") ||
        (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL)
      ) {
        callback(null, true);
      } else {
        callback(null, true); // permissive — tighten if needed
      }
    },
    credentials: true,
    exposedHeaders: ["x-encrypted-response"],
  })
);

app.use(express.json({ limit: "50mb" }));

const encryptionMiddleware = require("./middleware/encryption");
app.use(encryptionMiddleware);

// ─── Routes ───────────────────────────────────────────────────────────────────
function mountApiRoutes(basePath) {
  app.use(`${basePath}/auth`, authRoutes);
  app.use(`${basePath}/datasets`, datasetRoutes);
  app.use(`${basePath}/history`, historyRoutes);
  app.use(`${basePath}/settings`, settingsRoutes);
  app.use(`${basePath}/insights`, insightsRoutes);
  app.use(`${basePath}/plans`, planRoutes);
  app.use(`${basePath}/admin`, adminRoutes);
  app.use(`${basePath}/audit`, auditRoutes);
  app.use(`${basePath}/notifications`, notificationsRoutes);
  app.use(`${basePath}/llm`, llmRoutes);
  app.use(`${basePath}/connections`, connectionsRoutes);
  app.use(`${basePath}/db-query`, dbQueryRoutes);
  app.use(`${basePath}/chat-memory`, chatMemoryRoutes);
  app.use(`${basePath}/deployments`, deploymentsRoutes);
}

// Primary API routes.
mountApiRoutes("/api");
// Some API Gateway / reverse-proxy setups strip the `/api` base path before forwarding to the app.
// Mounting at root keeps the same handlers reachable as `/<route>` (e.g. `/llm/alibaba/chat`).
mountApiRoutes("");

app.get(["/api/health", "/health"], (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// ─── 404 ──────────────────────────────────────────────────────────────────────
const clientDistPath = path.join(__dirname, "..", "dist");
app.use(express.static(clientDistPath));

app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

module.exports = app;
