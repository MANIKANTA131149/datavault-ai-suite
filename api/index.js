// Vercel Serverless entry point — exports the Express app as a handler.
// All /api/* requests on Vercel are routed here via vercel.json rewrites.
module.exports = require("../server/app");
