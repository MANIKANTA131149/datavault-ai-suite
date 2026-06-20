const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = process.env.MONGODB_URI;
// Database name is configurable via .env (MONGODB_DB). Falls back to the
// historical default "DataVault" so existing deployments are unaffected.
const DB_NAME = process.env.MONGODB_DB || "DataVault";

// ── Singleton state ──────────────────────────────────────────────────────────
let db = null;
let client = null;
let connectPromise = null; // prevents concurrent connection races

// ── Connection options ───────────────────────────────────────────────────────
function makeClient() {
  return new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    // Pool settings
    maxPoolSize: 10,
    minPoolSize: 1,
    // Keep idle connections alive so Atlas doesn't kill them after ~10 min
    heartbeatFrequencyMS: 10_000,
    // Per-socket timeouts
    socketTimeoutMS: 45_000,
    connectTimeoutMS: 10_000,
    // Driver-level retries (covers transient ECONNRESET on writes/reads)
    retryWrites: true,
    retryReads: true,
    serverSelectionTimeoutMS: 15_000,
  });
}

// ── Internal connect ─────────────────────────────────────────────────────────
async function doConnect() {
  if (!uri) throw new Error("MONGODB_URI environment variable is required");

  const c = makeClient();

  // Reset the singleton whenever the topology closes so the NEXT call to
  // getDb() creates a fresh client rather than reusing a broken reference.
  c.on("topologyClosed", () => {
    if (client === c) {
      db = null;
      client = null;
      connectPromise = null;
      console.warn("⚠️  MongoDB topology closed — will reconnect on next request");
    }
  });

  // Swallow client-level network errors so Node doesn't treat them as
  // unhandled exceptions.  The driver retries automatically; only fatal
  // errors (auth, bad URI) surface to the caller via the thrown error.
  c.on("error", (err) => {
    console.error("MongoDB client error:", err.message);
    if (client === c) {
      db = null;
      client = null;
      connectPromise = null;
    }
  });

  await c.connect();
  client = c;
  db = c.db(DB_NAME);
  console.log(`✅ Connected to MongoDB Atlas (${DB_NAME})`);

  // Best-effort, non-blocking index/TTL sweep. Never affects request latency
  // or startup success — failures are logged and swallowed inside.
  try {
    const { ensureIndexes } = require("./lib/ensure-indexes");
    ensureIndexes(db).catch((e) => console.warn("ensureIndexes failed (non-fatal):", e.message));
  } catch { /* lib missing — ignore */ }

  return db;
}

// ── Public API ───────────────────────────────────────────────────────────────
// Returns a ready-to-use Db instance.  Multiple concurrent callers during
// the first connection share a single Promise (no duplicate connections).
async function getDb() {
  if (db) return db;

  if (!connectPromise) {
    connectPromise = doConnect().catch((err) => {
      // Clear state so a subsequent call retries instead of waiting on a
      // rejected promise forever.
      db = null;
      client = null;
      connectPromise = null;
      throw err;
    });
  }

  return connectPromise;
}

module.exports = { getDb };
