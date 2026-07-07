// ─── At-rest field encryption (AES-256-GCM) ───────────────────────────────────
//
// Real confidentiality for sensitive fields stored in MongoDB — specifically
// external database connection credentials (host/user/PASSWORD for users' own
// databases). Unlike lib/crypto.js (RC4 transport obfuscation with a key that
// ships to the browser), this key NEVER leaves the server.
//
// Key: SECRET_ENCRYPTION_KEY env var (32+ random bytes, hex or base64 or raw).
// We derive a stable 32-byte key from it via SHA-256 so any sufficiently long
// secret works. Each value gets a fresh random IV; GCM auth tag prevents
// tampering. Stored format: "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>".
//
// Backwards compatible: decryptField() returns plaintext unchanged if it isn't
// in the v1 envelope, so existing plaintext rows keep working and get upgraded
// the next time they're written.

const crypto = require("crypto");

const ENVELOPE_PREFIX = "v1:";
const ALGO = "aes-256-gcm";

function getKey() {
  const raw = process.env.SECRET_ENCRYPTION_KEY || "";
  if (!raw) {
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      throw new Error(
        "SECRET_ENCRYPTION_KEY is not set. Refusing to handle credentials at rest " +
        "without an encryption key in a deployed environment."
      );
    }
    // Local dev fallback so the app runs; NEVER relied on in production (we throw above in Lambda).
    return crypto.createHash("sha256").update("datavault-local-dev-secret-key").digest();
  }
  // Derive a fixed 32-byte key from whatever the operator provided.
  return crypto.createHash("sha256").update(raw).digest();
}

function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(ENVELOPE_PREFIX);
}

function encryptField(plaintext) {
  if (plaintext === undefined || plaintext === null) return plaintext;
  const str = typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(str, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

function decryptField(value) {
  if (!isEncrypted(value)) return value; // plaintext / legacy — return as-is
  try {
    const [, ivB64, tagB64, ctB64] = value.split(":");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch (err) {
    throw new Error("Failed to decrypt stored secret (wrong SECRET_ENCRYPTION_KEY?)");
  }
}

// Sensitive keys inside a connection `config` object that must be encrypted at rest.
const SENSITIVE_CONFIG_KEYS = [
  "password", "pass", "secret", "secretAccessKey", "accessKeyId", "apiKey",
  "token", "privateKey", "serviceAccountJson", "connectionString", "url",
  "credentials", "key",
];

// Encrypt the sensitive keys of a connection config object (returns a copy).
function encryptConfig(config) {
  if (!config || typeof config !== "object") return config;
  const out = { ...config };
  for (const k of Object.keys(out)) {
    if (SENSITIVE_CONFIG_KEYS.includes(k) && typeof out[k] === "string" && out[k] && !isEncrypted(out[k])) {
      out[k] = encryptField(out[k]);
    }
  }
  return out;
}

// Decrypt the sensitive keys of a stored connection config (returns a copy).
function decryptConfig(config) {
  if (!config || typeof config !== "object") return config;
  const out = { ...config };
  for (const k of Object.keys(out)) {
    if (isEncrypted(out[k])) out[k] = decryptField(out[k]);
  }
  return out;
}

module.exports = {
  encryptField,
  decryptField,
  isEncrypted,
  encryptConfig,
  decryptConfig,
  SENSITIVE_CONFIG_KEYS,
};
