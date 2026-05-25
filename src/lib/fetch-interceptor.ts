import { getApiBaseUrl } from "./api-base";
import { encrypt, decrypt } from "./crypto";

const originalFetch = window.fetch;

export function setupFetchInterceptor() {
  const apiBase = getApiBaseUrl();
  let apiOrigin = "";
  let apiPathname = "";

  try {
    const apiBaseUrlObj = new URL(apiBase, window.location.origin);
    apiOrigin = apiBaseUrlObj.origin;
    apiPathname = apiBaseUrlObj.pathname;
  } catch (err) {
    console.error("Failed to parse API base URL:", err);
    apiOrigin = window.location.origin;
    apiPathname = "/api";
  }

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlString =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    let reqUrl: URL;
    try {
      reqUrl = new URL(urlString, window.location.origin);
    } catch {
      return originalFetch(input, init);
    }

    // Check if the request is targeting our backend API (handles absolute URLs and relative paths)
    const isTargetApi =
      (reqUrl.origin === apiOrigin && reqUrl.pathname.startsWith(apiPathname)) ||
      (reqUrl.origin === window.location.origin &&
        (reqUrl.pathname.startsWith("/api/") ||
          reqUrl.pathname.startsWith("/auth/") ||
          reqUrl.pathname.startsWith("/llm/")));

    if (!isTargetApi) {
      return originalFetch(input, init);
    }

    const cleanInit: RequestInit = init ? { ...init } : {};

    // 1. Resolve and Encrypt Authorization Header
    let headers: Record<string, string> = {};
    if (cleanInit.headers) {
      if (cleanInit.headers instanceof Headers) {
        cleanInit.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(cleanInit.headers)) {
        cleanInit.headers.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        headers = { ...cleanInit.headers } as Record<string, string>;
      }
    } else if (input instanceof Request) {
      input.headers.forEach((value, key) => {
        headers[key] = value;
      });
    }

    let authValue = "";
    let providerKeyVal = "";
    const headerKeys = Object.keys(headers);
    for (const key of headerKeys) {
      if (key.toLowerCase() === "authorization") {
        authValue = headers[key];
        delete headers[key];
      } else if (key.toLowerCase() === "x-provider-api-key") {
        providerKeyVal = headers[key];
        delete headers[key];
      }
    }

    if (authValue) {
      headers["x-encrypted-auth"] = encrypt(authValue);
    }
    if (providerKeyVal) {
      headers["x-encrypted-provider-key"] = encrypt(providerKeyVal);
    }

    // 2. Encrypt Body (for POST, PUT, DELETE, PATCH)
    const method = (cleanInit.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      let bodyText = "";
      const rawBody = cleanInit.body !== undefined ? cleanInit.body : (input instanceof Request ? input.body : undefined);

      if (typeof rawBody === "string") {
        bodyText = rawBody;
      } else if (rawBody instanceof ArrayBuffer || ArrayBuffer.isView(rawBody)) {
        const decoder = new TextDecoder();
        bodyText = decoder.decode(rawBody);
      }

      // Only encrypt valid JSON payloads (starting with { or [)
      if (bodyText && (bodyText.trim().startsWith("{") || bodyText.trim().startsWith("["))) {
        const encryptedBody = encrypt(bodyText);
        cleanInit.body = JSON.stringify({ payload: encryptedBody });
        headers["x-encrypted-body"] = "true";
        headers["Content-Type"] = "application/json";
      }
    }

    cleanInit.headers = headers;

    // Call native fetch
    const response = await originalFetch(input, cleanInit);

    // 3. Decrypt Response if Encrypted
    const isEncryptedResponseHeader =
      response.headers.get("x-encrypted-response") === "true";

    // Use response.clone() to safely inspect the body even if headers are blocked by CORS policies
    const clonedResponse = response.clone();
    try {
      const text = await clonedResponse.text();
      if (text) {
        let payload = "";
        let hasPayloadSignature = false;

        try {
          if (text.trim().startsWith("{")) {
            const json = JSON.parse(text);
            if (json && typeof json.payload === "string" && Object.keys(json).length === 1) {
              payload = json.payload;
              hasPayloadSignature = true;
            }
          }
        } catch {
          // Ignore JSON parse errors for non-JSON responses
        }

        const shouldDecrypt = isEncryptedResponseHeader || hasPayloadSignature;

        if (shouldDecrypt) {
          if (!payload) {
            payload = text;
          }

          const decryptedText = decrypt(payload);
          
          const resHeaders = new Headers(response.headers);
          resHeaders.delete("x-encrypted-response");

          return new Response(decryptedText, {
            status: response.status,
            statusText: response.statusText,
            headers: resHeaders,
          });
        }
      }
    } catch (err) {
      console.error("Failed to decrypt API response:", err);
    }

    return response;
  };
}
