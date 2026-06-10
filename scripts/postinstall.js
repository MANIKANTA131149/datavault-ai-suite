import { execSync } from "node:child_process";

// On Amplify, install server deps are skipped after the frontend build to avoid
// competing with the frontend build for memory.
if (process.env.AWS_APP_ID) {
  process.exit(0);
}

execSync("npm --prefix server install --omit=dev --ignore-scripts", { stdio: "inherit" });
