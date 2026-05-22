import { execSync } from "node:child_process";

// Use npm script so node_modules/.bin is on PATH (raw `vite` fails on Render).
execSync("npm run build:local", { stdio: "inherit", env: process.env });

// On Render, install server deps after the frontend build to stay under memory limits.
if (process.env.RENDER === "true") {
  execSync("npm --prefix server install --omit=dev", { stdio: "inherit" });
}
