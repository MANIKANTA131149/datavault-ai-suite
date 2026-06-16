// ─── Clerk Webhook Handler ────────────────────────────────────────────────────
// Receives signed webhook events from Clerk and syncs data to MongoDB.
//
// Events handled:
//   user.created  — should be rare (we lazy-create on /auth/me), but catch it just in case
//   user.updated  — sync name, email, profile image URL to Mongo
//   user.deleted  — mark user as deleted (soft-delete, data preserved)
//
// Webhook signature verification uses the Svix library that ships with @clerk/backend.
// Set CLERK_WEBHOOK_SECRET in .env (Clerk Dashboard → Webhooks → your endpoint → Signing Secret).
//
// Register this route BEFORE express.json() so req.body stays as raw Buffer.

const express = require("express");
const crypto = require("crypto");
const { getDb } = require("../db");
const { defaultPlanFields } = require("../lib/plans");
const { logAudit } = require("../middleware/auditLogger");

const router = express.Router();

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

// Verify Svix webhook signature without the svix package (uses raw crypto)
function verifyWebhookSignature(req) {
  if (!WEBHOOK_SECRET) {
    console.warn("CLERK_WEBHOOK_SECRET not set — skipping webhook signature verification");
    return true; // Allow in dev; set the secret in production
  }

  const svixId        = req.headers["svix-id"];
  const svixTimestamp = req.headers["svix-timestamp"];
  const svixSignature = req.headers["svix-signature"];

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Replay-attack prevention: reject events older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(svixTimestamp, 10)) > 300) return false;

  const body = req.body instanceof Buffer ? req.body.toString("utf8") : JSON.stringify(req.body);
  const toSign = `${svixId}.${svixTimestamp}.${body}`;

  // Secret is base64-encoded after the "whsec_" prefix
  const secret = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");
  const expectedSig = crypto.createHmac("sha256", secret).update(toSign).digest("base64");

  // svix-signature header may contain multiple comma-separated v1,<sig> pairs
  const signatures = String(svixSignature).split(" ");
  return signatures.some((s) => {
    const [version, sig] = s.split(",");
    return version === "v1" && sig === expectedSig;
  });
}

// POST /api/webhooks/clerk  (also mounted at /webhooks/clerk for direct Lambda access)
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  if (!verifyWebhookSignature(req)) {
    console.warn("Clerk webhook: signature verification failed");
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  let event;
  try {
    const raw = req.body instanceof Buffer ? req.body.toString("utf8") : JSON.stringify(req.body);
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  const { type, data } = event;
  const db = await getDb();

  try {
    if (type === "user.created") {
      const clerkId = data.id;
      const email = data.email_addresses?.find((e) => e.id === data.primary_email_address_id)?.email_address || "";
      const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || email.split("@")[0] || "User";
      const picture = data.image_url || null;

      const existing = await db.collection("users").findOne({ _id: clerkId });
      if (!existing) {
        const now = new Date().toISOString();
        await db.collection("users").insertOne({
          _id: clerkId,
          name,
          email,
          picture,
          authProvider: "clerk",
          role: "viewer",
          status: "active",
          ...defaultPlanFields("clerk"),
          organizationId: clerkId,
          organizationOwnerId: clerkId,
          createdAt: now,
          lastLogin: now,
        });
        logAudit(clerkId, email, "webhook.user.created", { provider: "clerk" }, "info");
      }
    }

    else if (type === "user.updated") {
      const clerkId = data.id;
      const email = data.email_addresses?.find((e) => e.id === data.primary_email_address_id)?.email_address || "";
      const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || email.split("@")[0];
      const picture = data.image_url || null;

      await db.collection("users").updateOne(
        { _id: clerkId },
        {
          $set: {
            ...(name ? { name } : {}),
            ...(email ? { email } : {}),
            ...(picture !== null ? { picture } : {}),
            updatedAt: new Date().toISOString(),
          },
        }
      );
      logAudit(clerkId, email, "webhook.user.updated", { provider: "clerk" }, "info");
    }

    else if (type === "user.deleted") {
      const clerkId = data.id;
      await db.collection("users").updateOne(
        { _id: clerkId },
        { $set: { status: "deleted", deletedAt: new Date().toISOString() } }
      );
      logAudit(clerkId, "", "webhook.user.deleted", { provider: "clerk" }, "warn");
    }

    else {
      // Unhandled event type — acknowledge to avoid Clerk retrying
      console.log(`Clerk webhook: unhandled event type "${type}"`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error(`Clerk webhook error (${type}):`, err?.message || err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

module.exports = router;
