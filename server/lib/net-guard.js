// ─── SSRF guard for user-supplied database hosts ─────────────────────────────
// Users provide arbitrary host/URL values for live DB connections. Without this
// check, the "connect to my database" feature can be pointed at internal
// targets: the AWS metadata endpoint (169.254.169.254 — credential theft),
// localhost services, or private VPC ranges (network scanning).
//
// Enforcement is automatic on Lambda (AWS_LAMBDA_FUNCTION_NAME is set) and can
// be forced anywhere with ENFORCE_NET_GUARD=1. Local self-hosted dev stays
// unrestricted so developers can connect to their own localhost databases.

const dns = require("dns").promises;
const net = require("net");

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;          // this-net, RFC1918, loopback
  if (a === 169 && b === 254) return true;                    // link-local incl. AWS metadata
  if (a === 172 && b >= 16 && b <= 31) return true;           // RFC1918
  if (a === 192 && b === 168) return true;                    // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true;          // CGNAT
  return false;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;          // unspecified / loopback
  if (lower.startsWith("fe80:")) return true;                  // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
  const v4 = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);     // IPv4-mapped
  if (v4) return isPrivateIPv4(v4[1]);
  return false;
}

function guardEnabled() {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) || process.env.ENFORCE_NET_GUARD === "1";
}

const BLOCKED_MESSAGE = "Connections to private or internal network addresses are not allowed.";

/**
 * Throws if the host (bare hostname, IP, or URL) points at a private/internal
 * address. Resolves DNS so `evil.com → 169.254.169.254` is also caught.
 * No-op outside Lambda unless ENFORCE_NET_GUARD=1.
 */
async function assertPublicHost(rawHost) {
  if (!guardEnabled()) return;
  if (!rawHost || typeof rawHost !== "string") return;
  let host = rawHost.trim();
  if (!host) return;

  // Accept full URLs / connection strings ("https://es.example:9200",
  // "mongodb+srv://user:pass@cluster/db") as well as bare hosts.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) {
    try { host = new URL(host).hostname; } catch { /* fall through with raw value */ }
  }
  host = host.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal")) {
    throw new Error(BLOCKED_MESSAGE);
  }

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error(BLOCKED_MESSAGE);
    return;
  }

  // Resolve and check every address — DNS rebinding to a private IP is the
  // classic bypass. Unresolvable hosts pass through; the DB driver will fail
  // with its own (clearer) connection error.
  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return;
  }
  for (const r of records) {
    if (isPrivateIp(r.address)) throw new Error(BLOCKED_MESSAGE);
  }
}

module.exports = { assertPublicHost, isPrivateIp };
