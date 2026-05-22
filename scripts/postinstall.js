import { execSync } from "node:child_process";

// On Render, install server deps after the Vite build (see render-build) to avoid
// competing with the frontend build for memory.
if (process.env.RENDER === "true") {
  process.exit(0);
}

execSync("npm --prefix server install --omit=dev", { stdio: "inherit" });
