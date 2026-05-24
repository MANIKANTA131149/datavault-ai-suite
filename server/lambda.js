const serverlessExpress = require("@codegenie/serverless-express");
const app = require("./app");
const { getDb } = require("./db");

let serverlessExpressInstance;

async function setup(event, context) {
  try {
    // Ensure the database connection is warm before handling any requests
    await getDb();
  } catch (err) {
    console.error("Failed to connect to MongoDB in Lambda:", err.message);
  }
  serverlessExpressInstance = serverlessExpress({ app });
  return serverlessExpressInstance(event, context);
}

exports.handler = async (event, context) => {
  // If the serverless adapter is already initialized, reuse it to save cold-start time
  if (serverlessExpressInstance) {
    return serverlessExpressInstance(event, context);
  }
  return setup(event, context);
};
