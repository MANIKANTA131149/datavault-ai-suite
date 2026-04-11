const { MongoClient, ServerApiVersion } = require("mongodb");
const dns = require("dns");

// Use Google public DNS — the local DNS may not support SRV record lookups
// required by the REDACTED connection string.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const uri =
  "REDACTED

let db = null;
let client = null;

async function getDb() {
  if (db) return db;

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
