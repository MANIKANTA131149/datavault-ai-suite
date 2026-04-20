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
        (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL)
      ) {
        callback(null, true);
      } else {
        callback(null, true); // permissive — tighten if needed
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/datasets", datasetRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/notifications", notificationsRoutes);


app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", ts: new Date().toISOString() })
);

// ─── 404 ──────────────────────────────────────────────────────────────────────
const clientDistPath = path.join(__dirname, "..", "dist");
app.use(express.static(clientDistPath));

app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

module.exports = app;
