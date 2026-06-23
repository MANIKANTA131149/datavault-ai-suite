// ─── Cashfree Payments routes ─────────────────────────────────────────────────
//
// Endpoints (all under /api/cashfree):
//   GET  /pricing                public-ish pricing table (auth'd, but no secrets)
//   POST /create-order           create a Cashfree order → returns payment_session_id
//   GET  /verify/:orderId        confirm payment status (frontend polls after pay)
//   POST /webhook                Cashfree → us (signature-verified, RAW body)
//
// The webhook is mounted SEPARATELY in app.js with express.raw() so the raw
// bytes survive for HMAC verification. Everything else uses the normal JSON +
// auth middleware stack.

const express = require("express");
const { getDb } = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { logAudit } = require("../middleware/auditLogger");
const cashfree = require("../lib/cashfree");
const {
  getPlanPrice,
  isPayableTier,
  normalizeCycle,
  getPublicPricing,
  BILLING_CYCLES,
} = require("../lib/pricing");
const { PLAN_TIERS } = require("../lib/plans");
const {
  newOrderId,
  stableCustomerId,
  createPaymentRecord,
  getPaymentRecord,
  applyPaidOrder,
  markOrderFailed,
} = require("../lib/subscriptions");

// ─── Authenticated router (pricing, create-order, verify) ─────────────────────
const router = express.Router();
router.use(authMiddleware);

// Where Cashfree should POST payment events. Prefer an explicit env so it works
// behind API Gateway; fall back to the request's own host.
function notifyUrlFor(req) {
  const base = (process.env.PUBLIC_API_URL || "").replace(/\/+$/, "");
  if (base) return `${base}/api/cashfree/webhook`;
  return `${req.protocol}://${req.get("host")}/api/cashfree/webhook`;
}

function returnUrlFor() {
  const base = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  // {order_id} is substituted by Cashfree on redirect.
  return `${base}/app/pricing?cf_order={order_id}`;
}

// GET /pricing — pricing table + Cashfree env/configured flag for the UI.
router.get("/pricing", (_req, res) => {
  res.json({
    ...getPublicPricing(),
    cashfree: {
      configured: cashfree.isConfigured(),
      env: cashfree.getConfig().env,
    },
  });
});

// POST /create-order — body: { tier, cycle }
// Server computes the amount authoritatively; the client cannot set the price.
router.post("/create-order", async (req, res) => {
  try {
    const tier = String(req.body?.tier || "");
    const cycle = normalizeCycle(req.body?.cycle);

    if (!PLAN_TIERS.includes(tier)) {
      return res.status(400).json({ error: "Invalid plan tier" });
    }
    if (!isPayableTier(tier)) {
      return res.status(400).json({ error: "This plan is not available for self-serve checkout" });
    }
    if (!BILLING_CYCLES.includes(cycle)) {
      return res.status(400).json({ error: "Invalid billing cycle" });
    }
    if (!cashfree.isConfigured()) {
      return res.status(503).json({ error: "Payments are not configured. Please try again later." });
    }

    const price = getPlanPrice(tier, cycle);
    if (!price || price.amount <= 0) {
      return res.status(400).json({ error: "No price configured for this plan" });
    }

    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: req.userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const orderId = newOrderId(req.userId);

    // Record our intent BEFORE talking to Cashfree, so a successful payment is
    // never orphaned even if our process dies mid-flight.
    await createPaymentRecord(db, {
      userId: req.userId,
      orderId,
      tier,
      cycle,
      amount: price.amount,
      currency: price.currency,
    });

    let order;
    try {
      order = await cashfree.createOrder({
        orderId,
        amount: price.amount,
        currency: price.currency,
        customer: {
          id: user.cashfreeCustomerId || stableCustomerId(req.userId),
          email: user.email || req.userEmail || "",
          phone: user.phone || "9999999999",
          name: user.name || req.userName || "",
        },
        returnUrl: returnUrlFor(),
        notifyUrl: notifyUrlFor(req),
        note: `${tier}:${cycle}`,
        tags: { tier, cycle, userId: String(req.userId) },
      });
    } catch (cfErr) {
      await markOrderFailed(db, orderId, "CREATE_FAILED", cfErr.message);
      console.error("cashfree create-order failed:", cfErr.message, cfErr.details || "");
      return res.status(502).json({ error: "Could not start checkout. Please try again." });
    }

    if (!order?.payment_session_id) {
      await markOrderFailed(db, orderId, "CREATE_FAILED", "missing payment_session_id");
      return res.status(502).json({ error: "Checkout session could not be created." });
    }

    logAudit(req.userId, user.email || "", "billing.checkout_started", {
      orderId, tier, cycle, amount: price.amount,
    }, "info");

    res.json({
      orderId,
      paymentSessionId: order.payment_session_id,
      amount: price.amount,
      currency: price.currency,
      tier,
      cycle,
      env: cashfree.getConfig().env,
    });
  } catch (err) {
    console.error("create-order error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /payments — the signed-in user's own payment history (newest first).
// Read-only ledger view for the billing page. Never exposes other users' data.
router.get("/payments", async (req, res) => {
  try {
    const db = await getDb();
    const docs = await db.collection("payments")
      .find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(
      docs.map((p) => ({
        orderId: p.orderId,
        tier: p.tier,
        cycle: p.cycle,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        appliedToPlan: Boolean(p.appliedToPlan),
        createdAt: p.createdAt,
        periodStart: p.periodStart || null,
        periodEnd: p.periodEnd || null,
      }))
    );
  } catch (err) {
    console.error("list payments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /verify/:orderId — frontend calls this after the SDK closes.
// We re-fetch the order from Cashfree (don't trust the client) and, if PAID,
// apply it to the plan. Idempotent with the webhook.
router.get("/verify/:orderId", async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const db = await getDb();

    const payment = await getPaymentRecord(db, orderId);
    if (!payment) return res.status(404).json({ error: "Order not found" });
    // Authorization: a user may only verify their own orders.
    if (String(payment.userId) !== String(req.userId)) {
      return res.status(403).json({ error: "Not your order" });
    }

    if (payment.status === "PAID" && payment.appliedToPlan) {
      return res.json({ status: "PAID", tier: payment.tier, applied: true });
    }

    let order;
    try {
      order = await cashfree.getOrder(orderId);
    } catch (cfErr) {
      console.error("verify getOrder failed:", cfErr.message);
      return res.json({ status: payment.status || "PENDING", applied: false });
    }

    const orderStatus = order?.order_status; // ACTIVE | PAID | EXPIRED | TERMINATED
    if (orderStatus === "PAID") {
      const result = await applyPaidOrder(db, orderId, { source: "cashfree" });
      return res.json({
        status: "PAID",
        applied: Boolean(result.ok),
        tier: payment.tier,
      });
    }
    if (orderStatus === "EXPIRED" || orderStatus === "TERMINATED") {
      await markOrderFailed(db, orderId, "EXPIRED", `order_status=${orderStatus}`);
      return res.json({ status: orderStatus, applied: false });
    }
    return res.json({ status: orderStatus || "PENDING", applied: false });
  } catch (err) {
    console.error("verify error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Webhook router (separate — uses RAW body, NO auth middleware) ─────────────
const webhookRouter = express.Router();

webhookRouter.post(
  "/",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req, res) => {
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    const rawBody = req.body; // Buffer, thanks to express.raw()

    // Verify signature against the RAW bytes. Reject anything we can't trust.
    const valid = cashfree.verifyWebhookSignature(rawBody, timestamp, signature);
    if (!valid) {
      console.warn("cashfree webhook: signature verification FAILED");
      return res.status(401).json({ error: "invalid signature" });
    }

    let event;
    try {
      event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody));
    } catch {
      return res.status(400).json({ error: "invalid payload" });
    }

    // Always 200 quickly after we've verified + parsed, so Cashfree doesn't
    // retry-storm us; do the DB work, but never throw past this point.
    try {
      const db = await getDb();
      const type = event?.type || "";
      const data = event?.data || {};
      const order = data.order || {};
      const payment = data.payment || {};
      const orderId = order.order_id || payment.order_id;

      if (!orderId) {
        return res.status(200).json({ received: true, note: "no order_id" });
      }

      // Persist the raw event for audit/reconciliation (append-only).
      await db.collection("payment_events").insertOne({
        type,
        orderId,
        cfPaymentId: payment.cf_payment_id || null,
        paymentStatus: payment.payment_status || null,
        receivedAt: new Date().toISOString(),
        event,
      }).catch(() => {});

      if (type === "PAYMENT_SUCCESS_WEBHOOK" || payment.payment_status === "SUCCESS") {
        await applyPaidOrder(db, orderId, {
          cashfreePaymentId: payment.cf_payment_id || null,
          source: "cashfree",
        });
      } else if (
        type === "PAYMENT_FAILED_WEBHOOK" ||
        payment.payment_status === "FAILED"
      ) {
        await markOrderFailed(
          db,
          orderId,
          "FAILED",
          payment?.error_details?.error_reason || "payment_failed"
        );
      } else if (type === "PAYMENT_USER_DROPPED_WEBHOOK") {
        await markOrderFailed(db, orderId, "USER_DROPPED", "user_dropped");
      }
      // Other event types (refunds, disputes) are recorded above but don't
      // change plan state automatically — handle manually for safety.

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error("cashfree webhook processing error:", err);
      // Still 200: the event is verified & logged; a 500 would trigger retries
      // that could double-process. We have the raw event saved to replay.
      return res.status(200).json({ received: true, deferred: true });
    }
  }
);

module.exports = router;
module.exports.webhookRouter = webhookRouter;
