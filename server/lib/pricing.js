// ─── Pricing — single source of truth (server-side, authoritative) ────────────
//
// EVERYTHING about what a plan costs lives here. To change a price, edit ONE
// number below — the checkout amount, the UI, and the receipts all read from
// this. The frontend fetches these values from GET /api/cashfree/pricing so the
// browser can never tamper with the amount that gets charged (the server always
// recomputes the amount from this table at order-creation time).
//
// Amounts are in the smallest sensible unit for the currency's display — for INR
// we use whole rupees (Cashfree expects rupees as a decimal, e.g. 1500.00).
//
// `cycles.annual.amount` is the TOTAL charged once per year (already discounted).
// We derive the "per month, billed annually" figure for display from it.

const CURRENCY = "INR";

// Number of free days you grant if a renewal payment is late before downgrading.
// Keeps a paying customer from being cut off the instant a webhook is delayed.
const RENEWAL_GRACE_DAYS = 3;

// Editable price table. tier → billing cycle → amount + period length.
const PRICING = {
  free: {
    paid: false,
    cycles: {
      monthly: { amount: 0, months: 1 },
      annual: { amount: 0, months: 12 },
    },
  },
  standard: {
    paid: true,
    cycles: {
      monthly: { amount: 1500, months: 1 },
      // 20% off: 1500 * 12 = 18000 → 14400/yr
      annual: { amount: 14400, months: 12 },
    },
  },
  professional: {
    paid: true,
    cycles: {
      monthly: { amount: 2500, months: 1 },
      // 20% off: 2500 * 12 = 30000 → 24000/yr
      annual: { amount: 24000, months: 12 },
    },
  },
  enterprise: {
    // Sales-led: no self-serve checkout. Handled manually by an admin.
    paid: false,
    contactSales: true,
    cycles: {
      monthly: { amount: 0, months: 1 },
      annual: { amount: 0, months: 12 },
    },
  },
};

const BILLING_CYCLES = ["monthly", "annual"];

function isPayableTier(tier) {
  return Boolean(PRICING[tier] && PRICING[tier].paid);
}

function normalizeCycle(cycle) {
  return BILLING_CYCLES.includes(cycle) ? cycle : "monthly";
}

// Authoritative amount the server will actually charge. Never trust a
// client-supplied amount — always look it up here.
function getPlanPrice(tier, cycle) {
  const normalizedCycle = normalizeCycle(cycle);
  const entry = PRICING[tier];
  if (!entry) return null;
  const cycleEntry = entry.cycles[normalizedCycle];
  if (!cycleEntry) return null;
  return {
    tier,
    cycle: normalizedCycle,
    amount: cycleEntry.amount,
    currency: CURRENCY,
    months: cycleEntry.months,
  };
}

// Compute when a paid period ends, from a given start (defaults to now).
function computePeriodEnd(months, start = new Date()) {
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  return end;
}

// Public, non-sensitive pricing view for the frontend. Includes derived
// per-month figures so the UI never has to do pricing math itself.
function getPublicPricing() {
  const plans = {};
  for (const tier of Object.keys(PRICING)) {
    const entry = PRICING[tier];
    const monthly = entry.cycles.monthly;
    const annual = entry.cycles.annual;
    const annualPerMonth = annual.months ? Math.round(annual.amount / annual.months) : 0;
    const annualSavingsPct =
      monthly.amount > 0
        ? Math.round((1 - annual.amount / (monthly.amount * 12)) * 100)
        : 0;
    plans[tier] = {
      tier,
      paid: Boolean(entry.paid),
      contactSales: Boolean(entry.contactSales),
      currency: CURRENCY,
      monthly: { amount: monthly.amount },
      annual: {
        amount: annual.amount,
        perMonth: annualPerMonth,
        savingsPct: annualSavingsPct,
      },
    };
  }
  return { currency: CURRENCY, plans };
}

module.exports = {
  CURRENCY,
  PRICING,
  BILLING_CYCLES,
  RENEWAL_GRACE_DAYS,
  isPayableTier,
  normalizeCycle,
  getPlanPrice,
  computePeriodEnd,
  getPublicPricing,
};
