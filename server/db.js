const { MongoClient, ServerApiVersion } = require("mongodb");
// Vercel serverless environments provide their own DNS resolvers.
// Modifying them manually will cause FUNCTION_INVOCATION_FAILED.

const uri = process.env.MONGODB_URI;

let db = null;
let client = null;

async function getDb() {
  if (db) return db;
  if (!uri) throw new Error("MONGODB_URI environment variable is required");

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  db = client.db("DataVault");
  console.log("✅ Connected to MongoDB Atlas (DataVault)");
  return db;
}

module.exports = { getDb };
