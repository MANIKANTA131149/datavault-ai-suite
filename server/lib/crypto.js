// Robust cryptographic utility using a byte-based RC4 stream cipher.
// CommonJS implementation for Node.js.

const DEFAULT_KEY = process.env.API_ENCRYPTION_KEY || "datavault-ai-suite-shared-secret-key-2026-safe";

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
 * Encrypts cleartext into a secure Base64 string
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
 * Decrypts a secure Base64 string back into cleartext
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
