import { execSync } from "node:child_process";

execSync("vite build", { stdio: "inherit" });

// On Render, install server deps after the frontend build to stay under memory limits.
if (process.env.RENDER === "true") {
  execSync("npm --prefix server install --omit=dev", { stdio: "inherit" });
}
