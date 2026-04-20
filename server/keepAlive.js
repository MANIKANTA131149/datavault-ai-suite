const DEFAULT_INTERVAL_MS = 30 * 1000;

function getKeepAliveUrl(port) {
  if (process.env.KEEP_ALIVE_URL) return process.env.KEEP_ALIVE_URL;
  if (process.env.RENDER_EXTERNAL_URL) return `${process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "")}/api/health`;
  if (process.env.RENDER) return "https://datavault-ai-suite.onrender.com/api/health";
  return `http://localhost:${port}/api/health`;
}

function startKeepAlive(port) {
  const enabled = process.env.KEEP_ALIVE_ENABLED !== "false";
  if (!enabled) return;

  const url = getKeepAliveUrl(port);
  const intervalMs = Number(process.env.KEEP_ALIVE_INTERVAL_MS || DEFAULT_INTERVAL_MS);

  const ping = async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        console.warn(`Keep-alive ping failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.warn(`Keep-alive ping failed: ${err.message}`);
    }
  };

  setTimeout(ping, 5000);
  setInterval(ping, intervalMs);
  console.log(`Keep-alive ping enabled: ${url} every ${Math.round(intervalMs / 1000)}s`);
}

module.exports = { startKeepAlive };
