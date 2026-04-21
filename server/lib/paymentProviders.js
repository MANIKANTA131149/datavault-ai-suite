async function createCheckout() {
  throw new Error("Manual plan management does not create checkout sessions.");
}

async function syncSubscription() {
  return { source: "manual", synced: true };
}

async function cancelSubscription() {
  throw new Error("Manual plan management cannot cancel external subscriptions.");
}

const paymentProviders = {
  manual: {
    createCheckout,
    syncSubscription,
    cancelSubscription,
  },
};

function getPaymentProvider(name = "manual") {
  return paymentProviders[name] || paymentProviders.manual;
}

module.exports = { getPaymentProvider, paymentProviders };
