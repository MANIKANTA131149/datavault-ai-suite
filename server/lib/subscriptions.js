// ─── Subscription lifecycle (authoritative plan state machine) ─────────────────
//
// All plan UPGRADES and DOWNGRADES that result from payments funnel through here.
// Keeping this in one place means the rules ("when to upgrade", "when to
// downgrade", "how long a paid period lasts", "grace period on late renewal")
// are defined exactly once and are easy to audit.
//
// Data model — added to the `users` doc (all additive, nothing removed):
//   planTier            current effective tier ("free" | "standard" | ...)
//   planStatus          "active" | "past_due" | "cancelled"
//   planSource          "cashfree" | "manual"
//   planCycle           "monthly" | "annual"   (null for free)
//   currentPeriodStart  ISO — start of the paid window
//   currentPeriodEnd    ISO — when access expires unless renewed
//   planGraceUntil      ISO — keep access this long past period end on late pay
//   cashfreeCustomerId  stable id we send to Cashfree
//
// Separate collections:
//   payments            append-only ledger of every Cashfree order we created
//                       and its terminal status. NEVER deleted — full audit
//                       trail for reconciliation & disputes.
//
// IMPORTANT: payments are the source of truth for money. We upgrade a user ONLY
// after we have independently confirmed (via Cashfree API or a verified webhook)
// that the matching order is PAID and the amount matches what we expected.

const crypto = require("crypto");
const { logAudit } = require("../middleware/auditLogger");
const { computePeriodEnd, RENEWAL_GRACE_DAYS, getPlanPrice } = require("./pricing");

function nowIso() {
  return new Date().toISOString();
}

function newOrderId(userId) {
  // Cashfree order_id: alphanumeric + _ - only, <= 50 chars. Make it unique &
  // traceable back to the user without leaking anything sensitive.
  const rand = crypto.randomBytes(6).toString("hex");
  const shortUser = String(userId).replace(/[^a-zA-Z0-9]/g, "").slice(-12);
  return `qf_${shortUser}_${Date.now()}_${rand}`.slice(0, 50);
}

function stableCustomerId(userId) {
  // Cashfree customer_id must be alphanumeric/_ only.
  return `cust_${String(userId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 40)}`;
}

// ─── Create a pending payment record (before redirecting to checkout) ──────────
async function createPaymentRecord(db, { userId, orderId, tier, cycle, amount, currency }) {
  const doc = {
    _id: orderId, // we use the Cashfree order_id as the primary key
    orderId,
    userId,
    tier,
    cycle,
    amount,
    currency,
    status: "PENDING", // PENDING → PAID | FAILED | EXPIRED
    appliedToPlan: false, // becomes true once we actually upgrade the user
    cashfreePaymentId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await db.collection("payments").insertOne(doc);
  return doc;
}

// ─── Find the payment record for an order ─────────────────────────────────────
async function getPaymentRecord(db, orderId) {
  return db.collection("payments").findOne({ _id: orderId });
}

// ─── Apply a confirmed, paid order to the user's plan (idempotent) ─────────────
// Safe to call multiple times for the same order (webhook + verify race): the
// `appliedToPlan` guard ensures the period only advances once per payment.
async function applyPaidOrder(db, orderId, { cashfreePaymentId, source = "cashfree" } = {}) {
  const payment = await getPaymentRecord(db, orderId);
  if (!payment) {
    return { ok: false, reason: "payment_record_not_found" };
  }

  // Idempotency: if we already applied this exact order, do nothing further.
  if (payment.appliedToPlan && payment.status === "PAID") {
    return { ok: true, alreadyApplied: true, payment };
  }

  // Re-derive the authoritative price for this tier+cycle and confirm the amount
  // we recorded matches it. Defends against a tampered or stale record.
  const expected = getPlanPrice(payment.tier, payment.cycle);
  if (!expected || Number(expected.amount) !== Number(payment.amount)) {
    await db.collection("payments").updateOne(
      { _id: orderId },
      { $set: { status: "AMOUNT_MISMATCH", updatedAt: nowIso() } }
    );
    return { ok: false, reason: "amount_mismatch" };
  }

  const user = await db.collection("users").findOne({ _id: payment.userId });
  if (!user) return { ok: false, reason: "user_not_found" };

  const start = new Date();
  const end = computePeriodEnd(expected.months, start);
  const graceUntil = new Date(end);
  graceUntil.setDate(graceUntil.getDate() + RENEWAL_GRACE_DAYS);

  // Upgrade the user. planOwner is keyed by the user themselves for self-serve.
  await db.collection("users").updateOne(
    { _id: payment.userId },
    {
      $set: {
        planTier: payment.tier,
        planStatus: "active",
        planSource: source,
        planCycle: payment.cycle,
        planAssignedBy: source,
        planAssignedAt: nowIso(),
        currentPeriodStart: start.toISOString(),
        currentPeriodEnd: end.toISOString(),
        planGraceUntil: graceUntil.toISOString(),
        cashfreeCustomerId: user.cashfreeCustomerId || stableCustomerId(payment.userId),
      },
    }
  );

  // Mark the payment applied (the money→plan link, for audit & idempotency).
  await db.collection("payments").updateOne(
    { _id: orderId },
    {
      $set: {
        status: "PAID",
        appliedToPlan: true,
        cashfreePaymentId: cashfreePaymentId || payment.cashfreePaymentId || null,
        appliedAt: nowIso(),
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        updatedAt: nowIso(),
      },
    }
  );

  logAudit(payment.userId, user.email || "", "billing.plan_upgraded", {
    orderId,
    tier: payment.tier,
    cycle: payment.cycle,
    amount: payment.amount,
    currency: payment.currency,
    source,
    periodEnd: end.toISOString(),
  }, "info");

  return { ok: true, applied: true, tier: payment.tier, periodEnd: end.toISOString() };
}

// ─── Mark an order failed/expired (no plan change) ────────────────────────────
async function markOrderFailed(db, orderId, status = "FAILED", reason = null) {
  const payment = await getPaymentRecord(db, orderId);
  if (!payment) return { ok: false, reason: "payment_record_not_found" };
  // Never overwrite a PAID record with a failure (late/duplicate webhook).
  if (payment.status === "PAID") return { ok: true, alreadyPaid: true };
  await db.collection("payments").updateOne(
    { _id: orderId },
    { $set: { status, failureReason: reason, updatedAt: nowIso() } }
  );
  return { ok: true };
}

// ─── Downgrade expired paid plans to free (run by the scheduler) ──────────────
// A user is downgraded when: they're on a paid, cashfree-sourced plan AND the
// grace window past currentPeriodEnd has fully elapsed AND no newer paid order
// has extended them. Manual (admin-granted) plans are NEVER auto-downgraded.
async function downgradeExpiredPlans(db, now = new Date()) {
  const nowStr = now.toISOString();
  const expired = await db.collection("users").find({
    planSource: "cashfree",
    planTier: { $ne: "free" },
    planStatus: { $ne: "cancelled" },
    planGraceUntil: { $lt: nowStr },
  }).limit(500).toArray();

  let downgraded = 0;
  for (const user of expired) {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await db.collection("users").updateOne(
      { _id: user._id, planGraceUntil: user.planGraceUntil }, // guard against a concurrent renewal
      {
        $set: {
          planTier: "free",
          planStatus: "active",
          planSource: "cashfree",
          planCycle: null,
          planAssignedBy: "system_expiry",
          planAssignedAt: nowStr,
          currentPeriodStart: periodStart.toISOString(),
          currentPeriodEnd: periodEnd.toISOString(),
          planGraceUntil: null,
          planDowngradedFrom: user.planTier,
          planDowngradedAt: nowStr,
        },
      }
    );
    downgraded++;
    logAudit(String(user._id), user.email || "", "billing.plan_expired_downgrade", {
      from: user.planTier,
      to: "free",
      expiredAt: user.currentPeriodEnd,
      graceUntil: user.planGraceUntil,
    }, "warn");

    // Notify the user so a lapse is never silent.
    try {
      await db.collection("notifications").insertOne({
        userId: user._id,
        type: "plan_expired",
        title: "Your plan has expired",
        message: `Your ${user.planTier} plan ended and your account is now on the Free plan. Renew anytime from the Billing page.`,
        icon: "credit-card",
        link: "/app/pricing",
        read: false,
        createdAt: nowStr,
      });
    } catch { /* non-fatal */ }
  }
  return downgraded;
}

// ─── Flag plans whose paid period ended but are still inside the grace window ──
// Sets planStatus = "past_due" so the UI can nudge the user to renew without
// cutting them off yet.
async function flagPastDuePlans(db, now = new Date()) {
  const nowStr = now.toISOString();
  const res = await db.collection("users").updateMany(
    {
      planSource: "cashfree",
      planTier: { $ne: "free" },
      planStatus: "active",
      currentPeriodEnd: { $lt: nowStr },
      planGraceUntil: { $gte: nowStr },
    },
    { $set: { planStatus: "past_due" } }
  );
  return res.modifiedCount || 0;
}

module.exports = {
  newOrderId,
  stableCustomerId,
  createPaymentRecord,
  getPaymentRecord,
  applyPaidOrder,
  markOrderFailed,
  downgradeExpiredPlans,
  flagPastDuePlans,
};
