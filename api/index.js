// Vercel runs this as ESM (root package.json has "type":"module").
// We bridge to the CommonJS server/app.js using createRequire.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const app = require("../server/app");
export default app;
