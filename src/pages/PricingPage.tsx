import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Bookmark,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Crown,
  Database,
  Download,
  FileUp,
  Globe,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { runCheckout, cashfreeApi, type PricingResponse, type PaymentRecord } from "@/lib/cashfree-client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { usePlanStore } from "@/stores/plan-store";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  PLAN_DEFINITIONS,
  PLAN_TIERS,
  formatPlanLimit,
  formatFileSizeLimit,
  isUnlimited,
  type PlanTier,
  type PlanDefinition,
} from "@/lib/plans";

/* ─── Animation constants ─────────────────────────────────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};

/* ─── Currency formatting ─────────────────────────────────────────────────── */

/** Format whole rupees as "₹1,500" (no decimals for clean tier pricing). */
function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/* ─── Tier visual configuration ──────────────────────────────────────────── */

interface TierMeta {
  icon: typeof CreditCard;
  price: string;
  annualPrice: string;
  period: string;
  tagline: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
  glow: string;
  popular?: boolean;
}

const TIER_META: Record<PlanTier, TierMeta> = {
  free: {
    icon: Zap,
    price: "Free",
    annualPrice: "Free",
    period: "",
    tagline: "Explore the platform with essential features",
    accent: "text-emerald-400",
    accentBg: "bg-emerald-500/10",
    accentBorder: "border-emerald-500/20",
    glow: "hover:shadow-[0_8px_28px_-10px_hsl(142_70%_45%/0.25)]",
  },
  standard: {
    icon: Sparkles,
    price: "₹1,500",
    annualPrice: "₹1,200",
    period: "/ month",
    tagline: "For individuals and small teams getting started",
    accent: "text-blue-400",
    accentBg: "bg-blue-500/10",
    accentBorder: "border-blue-500/20",
    glow: "hover:shadow-[0_8px_28px_-10px_hsl(214_70%_54%/0.3)]",
  },
  professional: {
    icon: Crown,
    price: "₹2,500",
    annualPrice: "₹2,000",
    period: "/ month",
    tagline: "Advanced capabilities for growing organizations",
    accent: "text-purple-400",
    accentBg: "bg-purple-500/10",
    accentBorder: "border-purple-500/20",
    glow: "hover:shadow-[0_8px_28px_-10px_hsl(270_70%_60%/0.3)]",
    popular: true,
  },
  enterprise: {
    icon: Building2,
    price: "Custom",
    annualPrice: "Custom",
    period: "",
    tagline: "Unlimited scale with dedicated support",
    accent: "text-amber-400",
    accentBg: "bg-amber-500/10",
    accentBorder: "border-amber-500/20",
    glow: "hover:shadow-[0_8px_28px_-10px_hsl(38_90%_55%/0.25)]",
  },
};

/* ─── Feature comparison rows ────────────────────────────────────────────── */

interface ComparisonRow {
  label: string;
  icon: typeof Database;
  values: Record<PlanTier, string | boolean>;
  category?: string;
}

function buildComparisonRows(): ComparisonRow[] {
  return [
    { label: "Daily Tokens", icon: MessageSquare, values: { free: formatPlanLimit(PLAN_DEFINITIONS.free.monthlyTokens), standard: formatPlanLimit(PLAN_DEFINITIONS.standard.monthlyTokens), professional: formatPlanLimit(PLAN_DEFINITIONS.professional.monthlyTokens), enterprise: formatPlanLimit(PLAN_DEFINITIONS.enterprise.monthlyTokens) } },
    { label: "Datasets", icon: Database, values: { free: formatPlanLimit(PLAN_DEFINITIONS.free.datasets), standard: formatPlanLimit(PLAN_DEFINITIONS.standard.datasets), professional: formatPlanLimit(PLAN_DEFINITIONS.professional.datasets), enterprise: formatPlanLimit(PLAN_DEFINITIONS.enterprise.datasets) } },
    { label: "File Size Limit", icon: FileUp, values: { free: formatFileSizeLimit(PLAN_DEFINITIONS.free.fileSizeLimitBytes), standard: formatFileSizeLimit(PLAN_DEFINITIONS.standard.fileSizeLimitBytes), professional: formatFileSizeLimit(PLAN_DEFINITIONS.professional.fileSizeLimitBytes), enterprise: formatFileSizeLimit(PLAN_DEFINITIONS.enterprise.fileSizeLimitBytes) } },
    { label: "Saved Insights", icon: Bookmark, values: { free: formatPlanLimit(PLAN_DEFINITIONS.free.insights), standard: formatPlanLimit(PLAN_DEFINITIONS.standard.insights), professional: formatPlanLimit(PLAN_DEFINITIONS.professional.insights), enterprise: formatPlanLimit(PLAN_DEFINITIONS.enterprise.insights) } },
    { label: "Team Members", icon: Users, values: { free: "0", standard: "1", professional: "3", enterprise: "Unlimited" } },
    { label: "CSV Export", icon: Download, values: { free: true, standard: true, professional: true, enterprise: true } },
    { label: "JSON Export", icon: Download, values: { free: true, standard: true, professional: true, enterprise: true } },
    { label: "PDF Export", icon: Download, values: { free: false, standard: true, professional: true, enterprise: true } },
    { label: "HTML Export", icon: Download, values: { free: false, standard: false, professional: true, enterprise: true } },
    { label: "Audit Export", icon: Shield, values: { free: false, standard: false, professional: false, enterprise: true } },
    { label: "Admin Panel", icon: Shield, values: { free: false, standard: true, professional: true, enterprise: true } },
  ];
}

/* ─── FAQ data ────────────────────────────────────────────────────────────── */

const FAQ_ITEMS = [
  {
    q: "Can I switch plans at any time?",
    a: "Yes. You can upgrade your plan at any time and the new limits take effect immediately. Downgrades are processed at the end of your current billing cycle.",
  },
  {
    q: "What happens when I hit my daily token limit?",
    a: "Querying pauses until your daily allowance resets at 00:00 UTC, or you upgrade to a higher tier. You'll see a clear warning as you approach the limit so you're never caught off guard.",
  },
  {
    q: "Is my data secure on the platform?",
    a: "All data is encrypted in transit (TLS 1.3) and at rest (AES-256). Datasets are isolated per user — no cross-tenant access is possible by design.",
  },
  {
    q: "Do you offer annual billing with a discount?",
    a: "Yes. Annual billing saves ~20% compared to monthly. The prices shown with the Annual toggle reflect the per-month cost billed as a single annual payment.",
  },
  {
    q: "What does the Enterprise plan include?",
    a: "Enterprise includes unlimited tokens, datasets, and team members, plus dedicated onboarding, SLA-backed uptime, audit logging, and a direct support channel. Contact us to discuss a custom arrangement.",
  },
  {
    q: "Can I try the platform before upgrading?",
    a: "The Free tier is fully functional with no credit card required. You can evaluate all core NL-to-SQL features before deciding whether a paid tier is right for you.",
  },
];

/* ─── Plan card ──────────────────────────────────────────────────────────── */

function PlanCard({
  plan,
  currentTier,
  billingCycle,
  pricing,
  paymentsReady,
  onUpgraded,
}: {
  plan: PlanDefinition;
  currentTier: PlanTier;
  billingCycle: "monthly" | "annual";
  pricing: PricingResponse | null;
  paymentsReady: boolean;
  onUpgraded: () => void;
}) {
  const meta = TIER_META[plan.tier];
  const Icon = meta.icon;
  const isCurrent = plan.tier === currentTier;
  const currentIdx = PLAN_TIERS.indexOf(currentTier);
  const thisIdx = PLAN_TIERS.indexOf(plan.tier);
  const isUpgrade = thisIdx > currentIdx;
  const [processing, setProcessing] = useState(false);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // Prices come from the server (single source of truth). Fall back to the
  // static TIER_META strings only until the live pricing has loaded.
  const livePlan = pricing?.plans?.[plan.tier];
  let displayPrice = billingCycle === "annual" ? meta.annualPrice : meta.price;
  if (livePlan) {
    if (plan.tier === "free") displayPrice = "Free";
    else if (livePlan.contactSales) displayPrice = "Custom";
    else if (billingCycle === "annual") displayPrice = formatINR(livePlan.annual.perMonth);
    else displayPrice = formatINR(livePlan.monthly.amount);
  }

  const annualSavingsPct = livePlan?.annual.savingsPct ?? 20;
  const monthlyForStrike = livePlan ? formatINR(livePlan.monthly.amount) : meta.price;
  const hasAnnualDiscount =
    billingCycle === "annual" && plan.tier !== "free" && !livePlan?.contactSales && displayPrice !== "Custom";

  // Step 1: Upgrade click → validate eligibility, then open the phone dialog.
  const handleUpgrade = () => {
    if (plan.tier === "enterprise" || livePlan?.contactSales) {
      toast.info("Enterprise inquiries", {
        description: "Contact gantamanikanta678@gmail.com for a custom enterprise plan tailored to your organization.",
      });
      return;
    }
    if (!paymentsReady) {
      toast.error("Payments are not available right now", {
        description: "Please try again in a moment or contact support.",
      });
      return;
    }
    setPhoneError("");
    setPhoneDialogOpen(true);
  };

  // Step 2: Phone submitted → validate, then run the real Cashfree checkout.
  const handlePhoneSubmit = async () => {
    const digits = phone.replace(/\D/g, "").replace(/^(91|0)/, "");
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setPhoneError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setPhoneDialogOpen(false);
    setProcessing(true);
    try {
      const result = await runCheckout(plan.tier, billingCycle, digits);
      if (result.status === "PAID" && result.applied) {
        toast.success(`Upgraded to ${plan.name}`, {
          description: "Your new plan is active. Enjoy the higher limits!",
        });
        onUpgraded();
      } else if (result.status === "PAID") {
        toast.success("Payment received", {
          description: "We're activating your plan — it'll update shortly.",
        });
        onUpgraded();
      } else if (result.status === "PENDING") {
        toast.info("Payment is processing", {
          description: "We'll update your plan automatically once it's confirmed.",
        });
      } else {
        toast.error("Payment not completed", {
          description: "No charge was made. You can try again anytime.",
        });
      }
    } catch (err) {
      toast.error("Checkout failed", {
        description: (err as Error).message || "Something went wrong. Please try again.",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <motion.div variants={fadeUp} className="h-full">
      <Card
        className={cn(
          "relative flex h-full flex-col justify-between p-6 transition-all duration-200",
          meta.glow,
          isCurrent
            ? "border-primary/40 shadow-[0_8px_28px_-12px_hsl(var(--primary)/0.35)]"
            : "hover:-translate-y-0.5 hover:border-primary/25",
        )}
      >
        {meta.popular && !isCurrent && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="border-0 bg-gradient-to-r from-primary to-accent px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-md">
              Most Popular
            </Badge>
          </div>
        )}

        <div className="flex flex-1 flex-col space-y-5">
          <div className="flex items-center justify-between">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", meta.accentBg, meta.accent, meta.accentBorder)}>
              <Icon size={18} />
            </div>
            {isCurrent && (
              <Badge className="border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Current Plan
              </Badge>
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-black tracking-tight text-foreground">{plan.name}</h3>
            <p className="min-h-[32px] text-[12px] leading-normal text-muted-foreground">{meta.tagline}</p>
          </div>

          <div className="flex items-baseline gap-1 py-1">
            <span className={cn("text-3xl font-black tracking-tight", meta.accent)}>{displayPrice}</span>
            {meta.period && (
              <span className="font-mono text-[12px] font-bold text-muted-foreground">{meta.period}</span>
            )}
            {hasAnnualDiscount && (
              <span className="ml-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0 text-[10px] font-bold text-emerald-400">
                −{annualSavingsPct}%
              </span>
            )}
          </div>
          {hasAnnualDiscount && (
            <p className="mt-[-12px] text-[11px] text-muted-foreground">
              <span className="line-through">{monthlyForStrike}/mo</span>
              {" · "}billed annually
            </p>
          )}

          <div className="flex flex-grow flex-col justify-start space-y-2.5 border-t border-border/60 pt-4">
            {plan.features.map((feature) => (
              <div key={feature} className="flex items-start gap-2.5">
                <div className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full", meta.accentBg, meta.accent)}>
                  <Check size={10} strokeWidth={3} />
                </div>
                <span className="text-[13px] leading-snug text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-border/40 pt-4">
          {isCurrent ? (
            <Button disabled className="w-full cursor-not-allowed text-xs font-bold tracking-wider opacity-65" variant="outline" size="lg">
              Current Plan
            </Button>
          ) : isUpgrade ? (
            <Button onClick={handleUpgrade} disabled={processing} className="w-full gap-1.5 text-xs font-bold tracking-wider" variant="default" size="lg">
              {processing ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  {plan.tier === "enterprise" ? "Contact Sales" : "Upgrade"}
                  <ArrowRight size={13} />
                </>
              )}
            </Button>
          ) : (
            <Button variant="outline" disabled className="w-full cursor-not-allowed text-xs font-semibold opacity-50" size="lg">
              Included
            </Button>
          )}
        </div>
      </Card>

      {/* Phone collection — required by the payment gateway before checkout */}
      <Dialog open={phoneDialogOpen} onOpenChange={(o) => { setPhoneDialogOpen(o); if (!o) setPhoneError(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Phone size={14} className="text-primary" />
              </span>
              Mobile number
            </DialogTitle>
            <DialogDescription>
              We need your mobile number to process the payment for the {plan.name} plan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="cf-phone" className="text-xs">Mobile number</Label>
            <div className="flex items-center gap-2">
              <span className="flex h-10 shrink-0 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground">+91</span>
              <Input
                id="cf-phone"
                inputMode="numeric"
                autoFocus
                placeholder="10-digit number"
                value={phone}
                maxLength={14}
                onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePhoneSubmit(); }}
              />
            </div>
            {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhoneDialogOpen(false)} className="text-xs">Cancel</Button>
            <Button onClick={handlePhoneSubmit} className="gap-1.5 text-xs font-semibold">
              Continue to payment <ArrowRight size={13} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

/* ─── Section heading ─────────────────────────────────────────────────────── */

function SectionHeading({ icon: Icon, title, subtitle }: { icon: typeof Shield; title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <Icon size={16} />
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Billing history ─────────────────────────────────────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  PAID: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  PENDING: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  FAILED: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  EXPIRED: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
  USER_DROPPED: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
  CREATE_FAILED: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  AMOUNT_MISMATCH: "border-rose-500/30 bg-rose-500/10 text-rose-400",
};

function prettyStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function BillingHistory({ refreshKey }: { refreshKey: number }) {
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);

  useEffect(() => {
    cashfreeApi.payments()
      .then(setPayments)
      .catch(() => setPayments([]));
  }, [refreshKey]);

  if (payments === null) {
    return (
      <Card className="rounded-[18px] p-6">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </Card>
    );
  }

  if (payments.length === 0) {
    return (
      <Card className="rounded-[18px] p-8 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <CreditCard size={18} className="text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">No payments yet</p>
          <p className="text-xs text-muted-foreground">
            When you upgrade to a paid plan, your receipts and billing history will appear here.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-[18px]">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-semibold">Date</th>
              <th className="px-5 py-3 font-semibold">Plan</th>
              <th className="px-5 py-3 font-semibold">Cycle</th>
              <th className="px-5 py-3 font-semibold">Amount</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Valid until</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.orderId} className="border-b border-border/40 last:border-0">
                <td className="px-5 py-3 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-3 font-medium capitalize text-foreground">{p.tier}</td>
                <td className="px-5 py-3 capitalize text-muted-foreground">{p.cycle}</td>
                <td className="px-5 py-3 font-mono text-foreground">{formatINR(p.amount)}</td>
                <td className="px-5 py-3">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", STATUS_STYLES[p.status] || STATUS_STYLES.EXPIRED)}>
                    {prettyStatus(p.status)}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {p.periodEnd ? new Date(p.periodEnd).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="divide-y divide-border/40 sm:hidden">
        {payments.map((p) => (
          <div key={p.orderId} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold capitalize text-foreground">{p.tier} · <span className="font-normal capitalize text-muted-foreground">{p.cycle}</span></p>
              <p className="mt-0.5 text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</p>
              {p.periodEnd && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">Valid until {new Date(p.periodEnd).toLocaleDateString()}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="font-mono text-sm font-semibold text-foreground">{formatINR(p.amount)}</span>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", STATUS_STYLES[p.status] || STATUS_STYLES.EXPIRED)}>
                {prettyStatus(p.status)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─── FAQ accordion item ─────────────────────────────────────────────────── */

function FaqItem({ item, open, onToggle }: { item: { q: string; a: string }; open: boolean; onToggle: () => void }) {
  return (
    <div className={cn("rounded-[18px] border border-border/60 bg-card/70 transition-colors", open && "border-primary/30 bg-primary/[0.03]")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-medium text-foreground">{item.q}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-muted-foreground">
          <ChevronDown size={16} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-4 text-[13px] leading-relaxed text-muted-foreground">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function PricingPage() {
  const { user } = useAuthStore();
  const { context, loading, fetchPlan } = usePlanStore();
  const { hydrateRole } = useAuthStore();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [billingRefresh, setBillingRefresh] = useState(0);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  // Live pricing + Cashfree availability from the server (single source of truth).
  useEffect(() => {
    cashfreeApi.pricing()
      .then(setPricing)
      .catch((e) => console.error("Failed to load pricing:", e));
  }, []);

  // Refresh both the plan context and the auth-store user (tier badge) after a
  // successful upgrade so the UI reflects the new plan immediately.
  const refreshAfterUpgrade = () => {
    fetchPlan();
    hydrateRole();
    setBillingRefresh((n) => n + 1);
  };

  // Handle the redirect-fallback case: if the modal redirected away and back,
  // Cashfree appends ?cf_order=<id>. Verify it and clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("cf_order");
    if (!orderId || orderId.includes("{")) return;
    cashfreeApi.verify(orderId)
      .then((res) => {
        if (res.status === "PAID") {
          toast.success("Payment successful", { description: "Your plan has been upgraded." });
          refreshAfterUpgrade();
        }
      })
      .catch(() => {})
      .finally(() => {
        params.delete("cf_order");
        const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
        window.history.replaceState({}, "", clean);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentTier: PlanTier = (user?.planTier as PlanTier) || "free";
  const currentPlan = PLAN_DEFINITIONS[currentTier];
  const comparisonRows = buildComparisonRows();

  return (
    <div className="page-shell-narrow page-enter space-y-12 pb-16 text-left">
      <PageHeader
        title="Plans & Pricing"
        titleIcon={CreditCard}
        info="Compare available tiers and manage your subscription. Upgrade to unlock higher limits, advanced exports, and team collaboration features."
        stats={[
          { label: "Current Plan", value: currentPlan.name, tone: "accent", live: true },
          { label: "Status", value: user?.planStatus === "active" ? "Active" : (user?.planStatus || "Active"), tone: "success" },
        ]}
      />

      {/* ─── PLAN CARDS ──────────────────────────────────────────────────── */}
      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        className="space-y-6"
      >
        <motion.div variants={fadeUp}>
          <SectionHeading
            icon={Crown}
            title="Available Plans"
            subtitle="Select the tier that matches your operational requirements."
          />
        </motion.div>

        {/* Billing toggle */}
        <motion.div variants={fadeUp} className="flex items-center justify-center">
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1">
            {(["monthly", "annual"] as const).map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBillingCycle(cycle)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
                  billingCycle === cycle
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {cycle === "monthly" ? "Monthly" : "Annual"}
                {cycle === "annual" && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0 text-[10px] font-bold transition-colors",
                    billingCycle === "annual"
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-emerald-500/15 text-emerald-400",
                  )}>
                    −20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          variants={stagger}
          className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 xl:grid-cols-4"
        >
          {PLAN_TIERS.map((tier) => (
            <PlanCard
              key={tier}
              plan={PLAN_DEFINITIONS[tier]}
              currentTier={currentTier}
              billingCycle={billingCycle}
              pricing={pricing}
              paymentsReady={Boolean(pricing?.cashfree?.configured)}
              onUpgraded={refreshAfterUpgrade}
            />
          ))}
        </motion.div>
      </motion.section>

      {/* ─── BILLING HISTORY ─────────────────────────────────────────────── */}
      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        className="space-y-6"
      >
        <motion.div variants={fadeUp}>
          <SectionHeading
            icon={CreditCard}
            title="Billing History"
            subtitle="Your past payments, receipts, and the period each one covered."
          />
        </motion.div>
        <motion.div variants={fadeUp}>
          <BillingHistory refreshKey={billingRefresh} />
        </motion.div>
      </motion.section>

      {/* ─── FEATURE COMPARISON TABLE ────────────────────────────────────── */}
      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        className="space-y-6"
      >
        <motion.div variants={fadeUp}>
          <SectionHeading
            icon={Shield}
            title="Feature Comparison"
            subtitle="Detailed breakdown of capabilities across all tiers."
          />
        </motion.div>

        <motion.div variants={fadeUp}>
          <Card className="overflow-hidden rounded-[18px]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="w-[200px] px-5 py-4 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Feature
                    </th>
                    {PLAN_TIERS.map((tier) => {
                      const meta = TIER_META[tier];
                      return (
                        <th
                          key={tier}
                          className={cn(
                            "px-5 py-4 text-center text-[12px] font-semibold uppercase tracking-wider",
                            tier === currentTier ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className={meta.accent}>{PLAN_DEFINITIONS[tier].name}</span>
                            {tier === currentTier && (
                              <span className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0 text-[9px] font-semibold text-primary">
                                ACTIVE
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row, idx) => {
                    const RowIcon = row.icon;
                    return (
                      <tr
                        key={row.label}
                        className={cn(
                          "border-b border-border/40 transition-colors hover:bg-background-secondary/30",
                          idx % 2 !== 0 && "bg-background-secondary/20",
                        )}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                              <RowIcon size={11} />
                            </div>
                            <span className="text-[13px] font-medium text-foreground">{row.label}</span>
                          </div>
                        </td>
                        {PLAN_TIERS.map((tier) => {
                          const val = row.values[tier];
                          return (
                            <td
                              key={tier}
                              className={cn("px-5 py-3.5 text-center", tier === currentTier && "bg-primary/[0.03]")}
                            >
                              {typeof val === "boolean" ? (
                                val ? (
                                  <div className="flex justify-center">
                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                                      <Check size={11} strokeWidth={3} />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex justify-center">
                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted/50 text-muted-foreground/50">
                                      <X size={11} strokeWidth={3} />
                                    </div>
                                  </div>
                                )
                              ) : (
                                <span
                                  className={cn(
                                    "font-mono text-[13px] font-medium",
                                    val === "Unlimited" || val === "No size limit"
                                      ? TIER_META[tier].accent
                                      : "text-foreground",
                                  )}
                                >
                                  {val}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      </motion.section>

      {/* ─── FAQ ─────────────────────────────────────────────────────────── */}
      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        className="space-y-6"
      >
        <motion.div variants={fadeUp}>
          <SectionHeading
            icon={MessageSquare}
            title="Frequently Asked Questions"
            subtitle="Answers to the most common questions about plans and billing."
          />
        </motion.div>

        <motion.div variants={stagger} className="grid gap-2 md:grid-cols-2">
          {FAQ_ITEMS.map((item, idx) => (
            <motion.div key={idx} variants={fadeUp}>
              <FaqItem
                item={item}
                open={openFaq === idx}
                onToggle={() => setOpenFaq(openFaq === idx ? null : idx)}
              />
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* ─── ENTERPRISE CTA ──────────────────────────────────────────────── */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        variants={fadeUp}
      >
        <Card className="overflow-hidden rounded-[22px] border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card/80 to-card/60 p-8">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-400">
                <Building2 size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Need a custom Enterprise plan?</h3>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Unlimited queries, dedicated infrastructure, SSO, audit logs, SLA guarantees, and a direct support line — all scoped to your organization's exact needs.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Unlimited scale", "Custom SLA", "Dedicated support", "SSO / SAML"].map((feat) => (
                    <span key={feat} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <Button
                className="gap-2 bg-amber-500 text-white hover:bg-amber-400"
                onClick={() =>
                  toast.info("Enterprise inquiry", {
                    description: "Contact gantamanikanta678@gmail.com to discuss a custom enterprise arrangement.",
                  })
                }
              >
                <Mail size={14} /> Contact Sales
              </Button>
              <p className="text-[11px] text-muted-foreground">Usually responds within 24 hours</p>
            </div>
          </div>
        </Card>
      </motion.section>
    </div>
  );
}
