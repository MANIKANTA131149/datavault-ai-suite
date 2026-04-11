const app = require("./app");
const { getDb } = require("./db");

const PORT = process.env.PORT || 3001;

// ─── Start (warm up DB first) ─────────────────────────────────────────────────
getDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 DataVault API server → http://localhost:${PORT}`);
      console.log("   Press Ctrl+C to stop\n");
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });

