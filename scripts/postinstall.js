import { execSync } from "node:child_process";

// On Render / Amplify, install server deps after the frontend build to avoid
// competing with the frontend build for memory (or skip native server deps on Amplify).
if (process.env.RENDER === "true" || process.env.AWS_APP_ID) {
  process.exit(0);
}

execSync("npm --prefix server install --omit=dev", { stdio: "inherit" });
