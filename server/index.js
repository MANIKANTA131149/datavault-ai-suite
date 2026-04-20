require("./loadEnv");

const app = require("./app");
const { getDb } = require("./db");
const { startKeepAlive } = require("./keepAlive");

const PORT = process.env.PORT || 3001;

// ─── Start (warm up DB first) ─────────────────────────────────────────────────
getDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 DataVault API server → http://localhost:${PORT}`);
      console.log("   Press Ctrl+C to stop\n");
      startKeepAlive(PORT);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });

