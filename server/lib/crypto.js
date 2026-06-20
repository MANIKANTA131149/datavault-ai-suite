// Request/response OBFUSCATION layer using a byte-based RC4 stream cipher.
//
// IMPORTANT: this is NOT confidentiality. The same key ships in the frontend
// bundle, so anyone can extract it. Treat this purely as a lightweight
// obfuscation/tamper-nuisance layer on top of TLS — TLS is what actually
// protects the payload in transit. Do not describe this as "encryption" in
// any user-facing or compliance context.
//
// In production the key MUST be set explicitly (API_ENCRYPTION_KEY) and match
// the frontend's VITE_API_ENCRYPTION_KEY. The hardcoded fallback exists only so
// local dev works out of the box; using it in a deployed environment is a
// misconfiguration and we fail fast on it below.
const FALLBACK_DEV_KEY = "datavault-ai-suite-shared-secret-key-2026-safe";
const DEFAULT_KEY = process.env.API_ENCRYPTION_KEY || FALLBACK_DEV_KEY;

const usingFallbackKey = !process.env.API_ENCRYPTION_KEY;
const inLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

if (usingFallbackKey) {
  if (inLambda) {
    // Refuse to run in a deployed environment with the public default key.
    throw new Error(
      "API_ENCRYPTION_KEY is not set. Refusing to start with the public default " +
      "obfuscation key in a deployed environment. Set API_ENCRYPTION_KEY (and the " +
      "matching frontend VITE_API_ENCRYPTION_KEY)."
    );
  }
  console.warn(
    "⚠️  API_ENCRYPTION_KEY is not set — using the public dev fallback key. " +
    "This is fine for local dev only; set it before deploying."
  );
}

function rc4Bytes(bytes, key) {
  const s = new Array(256);
  for (let i = 0; i < 256; i++) {
    s[i] = i;
  }
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
  }
  let i = 0;
  j = 0;
  const result = new Uint8Array(bytes.length);
  for (let y = 0; y < bytes.length; y++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
    const k = s[(s[i] + s[j]) % 256];
    result[y] = bytes[y] ^ k;
  }
  return result;
}

/**
 * Obfuscates cleartext into a Base64 string (RC4 + base64). Not confidentiality
 * — see the file header. TLS is the real protection in transit.
 */
function encrypt(text, key = DEFAULT_KEY) {
  try {
    const bytes = new TextEncoder().encode(text);
    const encrypted = rc4Bytes(bytes, key);
    return Buffer.from(encrypted).toString("base64");
  } catch (err) {
    console.error("Encryption failed:", err);
    return text;
  }
}

/**
 * Reverses the obfuscation: Base64 string back into cleartext.
 */
function decrypt(base64, key = DEFAULT_KEY) {
  try {
    const buffer = Buffer.from(base64, "base64");
    const bytes = new Uint8Array(buffer);
    const decrypted = rc4Bytes(bytes, key);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error("Decryption failed:", err);
    return base64;
  }
}

module.exports = {
  encrypt,
  decrypt,
  DEFAULT_KEY
};
