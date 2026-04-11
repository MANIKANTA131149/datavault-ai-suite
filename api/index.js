// Vercel Serverless entry point — exports the Express app as a handler.
// All /api/* requests on Vercel are routed here via vercel.json rewrites.
// CJS works here because root package.json no longer has "type":"module".
const app = require("../server/app");
module.exports = app;
