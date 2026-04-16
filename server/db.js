const { MongoClient, ServerApiVersion } = require("mongodb");
// Vercel serverless environments provide their own DNS resolvers.
// Modifying them manually will cause FUNCTION_INVOCATION_FAILED.

const uri =
  "mongodb://manikantaganta015:Mani-1234@demo-shard-00-00.bjyen.mongodb.net:27017,demo-shard-00-01.bjyen.mongodb.net:27017,demo-shard-00-02.bjyen.mongodb.net:27017/?ssl=true&replicaSet=atlas-cc2h4z-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Demo";

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
