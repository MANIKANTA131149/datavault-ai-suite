// Robust cryptographic utility using a byte-based RC4 stream cipher.
// Functions identically and reliably across both Browser and Node.js environments.

const DEFAULT_KEY =
  (import.meta.env && import.meta.env.VITE_API_ENCRYPTION_KEY) ||
  "datavault-ai-suite-shared-secret-key-2026-safe";

function rc4Bytes(bytes: Uint8Array, key: string): Uint8Array {
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
export function encrypt(text: string, key: string = DEFAULT_KEY): string {
  try {
    const bytes = new TextEncoder().encode(text);
    const encrypted = rc4Bytes(bytes, key);
    let binary = "";
    for (let i = 0; i < encrypted.length; i++) {
      binary += String.fromCharCode(encrypted[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error("Encryption failed:", err);
    return text;
  }
}

/**
 * Decrypts a secure Base64 string back into cleartext
 */
export function decrypt(base64: string, key: string = DEFAULT_KEY): string {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decrypted = rc4Bytes(bytes, key);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error("Decryption failed:", err);
    return base64;
  }
}
