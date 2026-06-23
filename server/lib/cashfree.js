// ─── Cashfree Payment Gateway client (server-side) ────────────────────────────
//
// Thin, dependency-free wrapper over the Cashfree PG REST API (v2023-08-01).
// We call the REST API directly with fetch rather than pulling in the SDK so the
// Lambda bundle stays small and we control exactly what is sent.
//
// Auth: every authenticated call needs three headers —
//   x-client-id      = CASHFREE_APP_ID
//   x-client-secret  = CASHFREE_SECRET_KEY
//   x-api-version    = 2023-08-01
//
// Webhook auth is SEPARATE: Cashfree signs each webhook with
//   signature = Base64( HMAC-SHA256( timestamp + rawBody, CASHFREE_SECRET_KEY ) )
// sent in the `x-webhook-signature` header with `x-webhook-timestamp`. We verify
// against the RAW request body (not the parsed JSON) — see verifyWebhookSignature.

const crypto = require("crypto");

const API_VERSION = "2023-08-01";

function getConfig() {
  const env = (process.env.CASHFREE_ENV || "sandbox").toLowerCase();
  const baseUrl =
    env === "production"
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";
  return {
    env,
    baseUrl,
    appId: process.env.CASHFREE_APP_ID || "",
    secretKey: process.env.CASHFREE_SECRET_KEY || "",
  };
}

function isConfigured() {
  const { appId, secretKey } = getConfig();
  return Boolean(appId && secretKey);
}

function authHeaders() {
  const { appId, secretKey } = getConfig();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-version": API_VERSION,
    "x-client-id": appId,
    "x-client-secret": secretKey,
  };
}

async function cashfreeRequest(method, path, body) {
  const { baseUrl } = getConfig();
  if (!isConfigured()) {
    const err = new Error("Cashfree is not configured (missing CASHFREE_APP_ID / CASHFREE_SECRET_KEY)");
    err.code = "CASHFREE_NOT_CONFIGURED";
    throw err;
  }

  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    const err = new Error(`Cashfree network error: ${netErr.message}`);
    err.code = "CASHFREE_NETWORK_ERROR";
    throw err;
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(json?.message || `Cashfree API error (${res.status})`);
    err.code = json?.code || "CASHFREE_API_ERROR";
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

// ─── Create an order ──────────────────────────────────────────────────────────
// Returns the full order incl. payment_session_id (what the JS SDK needs).
async function createOrder({
  orderId,
  amount,
  currency,
  customer,
  returnUrl,
  notifyUrl,
  note,
  tags,
}) {
  const body = {
    order_id: orderId,
    order_amount: Number(amount),
    order_currency: currency || "INR",
    customer_details: {
      customer_id: customer.id,
      customer_email: customer.email || undefined,
      customer_phone: customer.phone || "9999999999", // Cashfree requires a phone; placeholder if unknown
      customer_name: customer.name || undefined,
    },
    order_meta: {
      return_url: returnUrl,
      notify_url: notifyUrl,
    },
    ...(note ? { order_note: note } : {}),
    ...(tags ? { order_tags: tags } : {}),
  };
  return cashfreeRequest("POST", "/orders", body);
}

// ─── Fetch an order's current status ──────────────────────────────────────────
async function getOrder(orderId) {
  return cashfreeRequest("GET", `/orders/${encodeURIComponent(orderId)}`, null);
}

// ─── Fetch all payments for an order (for richer status / failure reason) ──────
async function getOrderPayments(orderId) {
  return cashfreeRequest("GET", `/orders/${encodeURIComponent(orderId)}/payments`, null);
}

// ─── Webhook signature verification ───────────────────────────────────────────
// `rawBody` MUST be the exact bytes Cashfree sent (Buffer or string), NOT the
// re-serialized parsed object. Uses a timing-safe comparison.
function verifyWebhookSignature(rawBody, timestamp, signature) {
  const { secretKey } = getConfig();
  if (!secretKey) return false;
  if (!timestamp || !signature) return false;

  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const payload = `${timestamp}${bodyStr}`;
  const expected = crypto
    .createHmac("sha256", secretKey)
    .update(payload, "utf8")
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = {
  API_VERSION,
  getConfig,
  isConfigured,
  createOrder,
  getOrder,
  getOrderPayments,
  verifyWebhookSignature,
};
