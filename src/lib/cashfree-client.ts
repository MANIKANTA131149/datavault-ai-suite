// ─── Cashfree checkout client (frontend) ──────────────────────────────────────
//
// Loads the Cashfree JS SDK v3 from CDN on demand and drives the inline
// (drop-in modal) checkout. We never touch card data — the SDK renders
// Cashfree's own secure modal over the page and reports back when it closes.
//
// Flow used by PricingPage:
//   1. POST /cashfree/create-order  → { paymentSessionId, orderId, env }
//   2. openCheckout({ paymentSessionId, env })  → resolves when modal closes
//   3. GET  /cashfree/verify/:orderId  → server confirms PAID & upgrades plan
//
// We deliberately treat the modal result as advisory only — the server's
// /verify call (which re-checks with Cashfree) is the source of truth.

import { api } from "@/lib/api-client";

const SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";

type CashfreeMode = "sandbox" | "production";

interface CashfreeInstance {
  checkout: (opts: {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_modal";
  }) => Promise<CheckoutResult>;
}

interface CheckoutResult {
  error?: { message?: string };
  redirect?: boolean;
  paymentDetails?: { paymentMessage?: string };
}

declare global {
  interface Window {
    Cashfree?: (opts: { mode: CashfreeMode }) => CashfreeInstance;
  }
}

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.Cashfree) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load payment SDK")));
      if (window.Cashfree) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null; // allow a retry on next attempt
      reject(new Error("Failed to load payment SDK"));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export interface CreateOrderResponse {
  orderId: string;
  paymentSessionId: string;
  amount: number;
  currency: string;
  tier: string;
  cycle: string;
  env: CashfreeMode;
}

export interface VerifyResponse {
  status: string; // PAID | PENDING | EXPIRED | TERMINATED | FAILED | ...
  applied: boolean;
  tier?: string;
}

export interface PricingResponse {
  currency: string;
  plans: Record<
    string,
    {
      tier: string;
      paid: boolean;
      contactSales: boolean;
      currency: string;
      monthly: { amount: number };
      annual: { amount: number; perMonth: number; savingsPct: number };
    }
  >;
  cashfree: { configured: boolean; env: CashfreeMode };
}

export interface PaymentRecord {
  orderId: string;
  tier: string;
  cycle: string;
  amount: number;
  currency: string;
  status: string;
  appliedToPlan: boolean;
  createdAt: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export const cashfreeApi = {
  pricing: () => api.get<PricingResponse>("/cashfree/pricing"),
  createOrder: (tier: string, cycle: "monthly" | "annual") =>
    api.post<CreateOrderResponse>("/cashfree/create-order", { tier, cycle }),
  verify: (orderId: string) => api.get<VerifyResponse>(`/cashfree/verify/${orderId}`),
  payments: () => api.get<PaymentRecord[]>("/cashfree/payments"),
};

// Opens the inline Cashfree modal. Resolves when the modal closes (regardless of
// outcome) — callers MUST then call cashfreeApi.verify(orderId) to learn the
// real result from the server.
export async function openCheckout(opts: {
  paymentSessionId: string;
  env: CashfreeMode;
}): Promise<CheckoutResult> {
  await loadSdk();
  if (!window.Cashfree) throw new Error("Payment SDK unavailable");

  const cashfree = window.Cashfree({ mode: opts.env });
  return cashfree.checkout({
    paymentSessionId: opts.paymentSessionId,
    redirectTarget: "_modal",
  });
}

// Full helper: create order → open modal → verify. Returns the final verify
// result. Throws on hard failures (network, not configured) so the caller can
// toast an error.
export async function runCheckout(
  tier: string,
  cycle: "monthly" | "annual",
  opts?: { onModalClosed?: () => void },
): Promise<VerifyResponse> {
  const order = await cashfreeApi.createOrder(tier, cycle);
  await openCheckout({ paymentSessionId: order.paymentSessionId, env: order.env });
  opts?.onModalClosed?.();
  // Verify with the server (source of truth). Poll briefly in case the webhook
  // and our redirect race — Cashfree may take a moment to mark the order PAID.
  let last: VerifyResponse = { status: "PENDING", applied: false };
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await cashfreeApi.verify(order.orderId);
    if (last.status === "PAID" || last.status === "FAILED" || last.status === "EXPIRED") break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}
