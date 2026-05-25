// Express middleware to transparently handle payload decryption and response encryption.
const { decrypt, encrypt } = require("../lib/crypto");

function encryptionMiddleware(req, res, next) {
  // 1. Decrypt Authorization Header
  const encAuth = req.headers["x-encrypted-auth"];
  if (encAuth) {
    try {
      const decAuth = decrypt(encAuth);
      req.headers.authorization = decAuth;
    } catch (err) {
      console.error("Failed to decrypt authorization header:", err);
    }
  }

  // 1.1 Decrypt Provider API Key Header
  const encProviderKey = req.headers["x-encrypted-provider-key"];
  if (encProviderKey) {
    try {
      const decProviderKey = decrypt(encProviderKey);
      req.headers["x-provider-api-key"] = decProviderKey;
    } catch (err) {
      console.error("Failed to decrypt provider API key header:", err);
    }
  }

  // 2. Decrypt Body
  const isEncBody = req.headers["x-encrypted-body"] === "true";
  if (isEncBody && req.body && req.body.payload) {
    try {
      const decryptedBodyText = decrypt(req.body.payload);
      req.body = JSON.parse(decryptedBodyText);
    } catch (err) {
      console.error("EncryptionMiddleware: Decryption or parsing failed!");
      console.error("EncryptionMiddleware: Raw payload:", req.body.payload);
      console.error("EncryptionMiddleware: Error detail:", err);
      return res.status(400).json({ error: "Invalid encrypted payload" });
    }
  }

  // Only encrypt responses for clients that support encryption
  const clientSupportsEncryption = isEncBody || !!encAuth;

  if (clientSupportsEncryption) {
    // 3. Override res.json and res.send
    const originalJson = res.json;
    const originalSend = res.send;

    res.json = function (body) {
      // If header is already set, it's already encrypted
      if (res.getHeader("x-encrypted-response") === "true") {
        return originalJson.call(this, body);
      }

      try {
        const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
        const encryptedBody = encrypt(bodyStr);
        res.setHeader("x-encrypted-response", "true");
        res.setHeader("Content-Type", "application/json");
        return originalJson.call(this, { payload: encryptedBody });
      } catch (err) {
        console.error("Failed to encrypt JSON response:", err);
        return originalJson.call(this, body);
      }
    };

    res.send = function (body) {
      // If header is already set, it's already encrypted
      if (res.getHeader("x-encrypted-response") === "true") {
        return originalSend.call(this, body);
      }

      try {
        let bodyStr = body;
        if (typeof body === "object" && body !== null) {
          bodyStr = JSON.stringify(body);
        } else if (Buffer.isBuffer(body)) {
          bodyStr = body.toString("utf8");
        }

        // Only encrypt if it represents a JSON payload
        if (typeof bodyStr === "string" && (bodyStr.trim().startsWith("{") || bodyStr.trim().startsWith("["))) {
          const encryptedBody = encrypt(bodyStr);
          res.setHeader("x-encrypted-response", "true");
          res.setHeader("Content-Type", "application/json");
          return originalSend.call(this, JSON.stringify({ payload: encryptedBody }));
        }
      } catch (err) {
        console.error("Failed to encrypt send response:", err);
      }

      return originalSend.call(this, body);
    };
  }

  next();
}

module.exports = encryptionMiddleware;
