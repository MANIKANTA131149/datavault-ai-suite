import { useEffect, useState } from "react";
import {
  CreditCard,
  Check,
  X,
  ArrowRight,
  Zap,
  Crown,
  Building2,
  Sparkles,
  Database,
  MessageSquare,
  Users,
  FileUp,
  Bookmark,
  Download,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { usePlanStore } from "@/stores/plan-store";
import { api } from "@/lib/api-client";
import {
  PLAN_DEFINITIONS,
  PLAN_TIERS,
  formatPlanLimit,
  formatFileSizeLimit,
  isUnlimited,
  type PlanTier,
  type PlanDefinition,
} from "@/lib/plans";

/* ─── Tier visual configuration ──────────────────────────────────────────── */

interface TierMeta {
  icon: typeof CreditCard;
  price: string;
  period: string;
  tagline: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
  popular?: boolean;
}

const TIER_META: Record<PlanTier, TierMeta> = {
  free: {
    icon: Zap,
    price: "Free",
    period: "",
    tagline: "Explore the platform with essential features",
    accent: "text-emerald-400",
    accentBg: "bg-emerald-500/10",
    accentBorder: "border-emerald-500/20",
  },
  standard: {
    icon: Sparkles,
    price: "$29",
    period: "/ month",
    tagline: "For individuals and small teams getting started",
    accent: "text-blue-400",
    accentBg: "bg-blue-500/10",
    accentBorder: "border-blue-500/20",
  },
  professional: {
    icon: Crown,
    price: "$79",
    period: "/ month",
    tagline: "Advanced capabilities for growing organizations",
    accent: "text-purple-400",
    accentBg: "bg-purple-500/10",
    accentBorder: "border-purple-500/20",
    popular: true,
  },
  enterprise: {
    icon: Building2,
    price: "Custom",
    period: "",
    tagline: "Unlimited scale with dedicated support",
    accent: "text-amber-400",
    accentBg: "bg-amber-500/10",
    accentBorder: "border-amber-500/20",
  },
};

/* ─── Feature comparison rows ────────────────────────────────────────────── */

interface ComparisonRow {
  label: string;
  icon: typeof Database;
  values: Record<PlanTier, string | boolean>;
}

function buildComparisonRows(): ComparisonRow[] {
  return [
    {
      label: "Monthly Queries",
      icon: MessageSquare,
      values: {
        free: formatPlanLimit(PLAN_DEFINITIONS.free.monthlyQueries),
        standard: formatPlanLimit(PLAN_DEFINITIONS.standard.monthlyQueries),
        professional: formatPlanLimit(PLAN_DEFINITIONS.professional.monthlyQueries),
        enterprise: formatPlanLimit(PLAN_DEFINITIONS.enterprise.monthlyQueries),
      },
    },
    {
      label: "Datasets",
      icon: Database,
      values: {
        free: formatPlanLimit(PLAN_DEFINITIONS.free.datasets),
        standard: formatPlanLimit(PLAN_DEFINITIONS.standard.datasets),
        professional: formatPlanLimit(PLAN_DEFINITIONS.professional.datasets),
        enterprise: formatPlanLimit(PLAN_DEFINITIONS.enterprise.datasets),
      },
    },
    {
      label: "File Size Limit",
      icon: FileUp,
      values: {
        free: formatFileSizeLimit(PLAN_DEFINITIONS.free.fileSizeLimitBytes),
        standard: formatFileSizeLimit(PLAN_DEFINITIONS.standard.fileSizeLimitBytes),
        professional: formatFileSizeLimit(PLAN_DEFINITIONS.professional.fileSizeLimitBytes),
        enterprise: formatFileSizeLimit(PLAN_DEFINITIONS.enterprise.fileSizeLimitBytes),
      },
    },
    {
      label: "Saved Insights",
      icon: Bookmark,
      values: {
        free: formatPlanLimit(PLAN_DEFINITIONS.free.insights),
        standard: formatPlanLimit(PLAN_DEFINITIONS.standard.insights),
        professional: formatPlanLimit(PLAN_DEFINITIONS.professional.insights),
        enterprise: formatPlanLimit(PLAN_DEFINITIONS.enterprise.insights),
      },
    },
    {
      label: "Team Members",
      icon: Users,
      values: {
        free: "0",
        standard: "1",
        professional: "3",
        enterprise: "Unlimited",
      },
    },
    {
      label: "CSV Export",
      icon: Download,
      values: { free: true, standard: true, professional: true, enterprise: true },
    },
    {
      label: "JSON Export",
      icon: Download,
      values: { free: true, standard: true, professional: true, enterprise: true },
    },
    {
      label: "PDF Export",
      icon: Download,
      values: { free: false, standard: true, professional: true, enterprise: true },
    },
    {
      label: "HTML Export",
      icon: Download,
      values: { free: false, standard: false, professional: true, enterprise: true },
    },
    {
      label: "Audit Export",
      icon: Shield,
      values: { free: false, standard: false, professional: false, enterprise: true },
    },
    {
      label: "Admin Panel",
      icon: Shield,
      values: { free: false, standard: true, professional: true, enterprise: true },
    },
  ];
}

/* ─── Usage gauge bar ────────────────────────────────────────────────────── */

function UsageBar({ label, used, limit, icon: Icon }: { label: string; used: number; limit: number | null; icon: typeof Database }) {
  const unlimited = isUnlimited(limit);
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / (limit as number)) * 100));
  const isNearLimit = !unlimited && pct >= 80;
  const isExhausted = !unlimited && pct >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
            <Icon size={12} />
          </div>
          <span className="text-[13px] font-medium text-foreground">{label}</span>
        </div>
        <span className="text-[12px] font-mono text-muted-foreground">
          {used.toLocaleString()} / {unlimited ? "Unlimited" : (limit as number).toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-background-secondary border border-border/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isExhausted
              ? "bg-rose-500"
              : isNearLimit
                ? "bg-amber-500"
                : "bg-primary"
            }`}
          style={{ width: unlimited ? "2%" : `${Math.max(2, pct)}%` }}
        />
      </div>
      {isExhausted && (
        <p className="text-[11px] text-rose-400 font-medium">Limit reached. Upgrade to continue.</p>
      )}
    </div>
  );
}

/* ─── Plan card ──────────────────────────────────────────────────────────── */

function PlanCard({ plan, currentTier }: { plan: PlanDefinition; currentTier: PlanTier }) {
  const meta = TIER_META[plan.tier];
  const Icon = meta.icon;
  const isCurrent = plan.tier === currentTier;
  const currentIdx = PLAN_TIERS.indexOf(currentTier);
  const thisIdx = PLAN_TIERS.indexOf(plan.tier);
  const isUpgrade = thisIdx > currentIdx;

  const handleUpgrade = () => {
    if (plan.tier === "enterprise") {
      toast.info("Enterprise inquiries", {
        description: "Contact gantamanikanta678@gmail.com for a custom enterprise plan tailored to your organization.",
      });
    } else {
      toast.info("Upgrade request received", {
        description: `Your request to upgrade to the ${plan.name} plan has been noted. The billing integration will be available soon. Please send your request to gantamanikanta678@gmail.com`,
      });
    }
  };

  return (
    <Card
      className={`relative p-6 flex flex-col justify-between h-full transition-all duration-200 hover:-translate-y-0.5 ${isCurrent
          ? "border-primary/50 shadow-[0_20px_50px_-28px_hsl(var(--primary)/0.9)]"
          : "hover:border-primary/30 hover:shadow-[0_18px_42px_-28px_hsl(var(--primary)/0.75)]"
        }`}
    >
      <div className="space-y-5 flex-1 flex flex-col">
        {/* Top Row: Icon & Badge inline to avoid absolute overlaps */}
        <div className="flex items-center justify-between">
          <div className={`w-10 h-10 rounded-xl ${meta.accentBg} ${meta.accent} ${meta.accentBorder} border flex items-center justify-center`}>
            <Icon size={18} />
          </div>
          {isCurrent ? (
            <Badge className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Current Plan
            </Badge>
          ) : meta.popular ? (
            <Badge className="bg-gradient-to-r from-primary to-accent text-primary-foreground border-0 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-md">
              Most Popular
            </Badge>
          ) : null}
        </div>

        {/* Plan name & Tagline */}
        <div className="space-y-1">
          <h3 className="text-lg font-black tracking-tight text-foreground">{plan.name}</h3>
          <p className="text-[12px] text-muted-foreground leading-normal min-h-[32px]">{meta.tagline}</p>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-1 py-1">
          <span className={`text-3xl font-black tracking-tight ${meta.accent}`}>{meta.price}</span>
          {meta.period && (
            <span className="text-[12px] text-muted-foreground font-mono font-bold">{meta.period}</span>
          )}
        </div>

        {/* Feature list */}
        <div className="space-y-2.5 pt-4 border-t border-border/60 flex-grow flex flex-col justify-start">
          {plan.features.map((feature) => (
            <div key={feature} className="flex items-start gap-2.5">
              <div className={`w-4 h-4 rounded-full ${meta.accentBg} ${meta.accent} flex items-center justify-center shrink-0 mt-0.5`}>
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="text-[13px] text-muted-foreground leading-snug">{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Button */}
      <div className="mt-6 pt-4 border-t border-border/40">
        {isCurrent ? (
          <Button
            disabled
            className="w-full text-xs font-bold tracking-wider opacity-65 cursor-not-allowed"
            variant="outline"
            size="lg"
          >
            Current Plan
          </Button>
        ) : isUpgrade ? (
          <Button
            onClick={handleUpgrade}
            className="w-full text-xs font-bold tracking-wider flex items-center justify-center gap-1.5"
            variant="default"
            size="lg"
          >
            {plan.tier === "enterprise" ? "Contact Sales" : "Upgrade"}
            <ArrowRight size={13} />
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled
            className="w-full text-xs font-semibold opacity-50 cursor-not-allowed"
            size="lg"
          >
            Included
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function PricingPage() {
  const { user } = useAuthStore();
  const { context, loading, fetchPlan } = usePlanStore();
  const [dailyTokens, setDailyTokens] = useState<{
    tokensUsed: number;
    limit: number;
    queriesUsed: number;
    queryLimit: number;
    percentage: number;
  } | null>(null);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  useEffect(() => {
    if (user?.planTier !== "free") return;
    api.get("/llm/token-usage")
      .then((data) => {
        if (data) setDailyTokens(data as any);
      })
      .catch((e) => console.error("Failed to fetch daily tokens on pricing page:", e));
  }, [user?.planTier]);

  const currentTier: PlanTier = (user?.planTier as PlanTier) || "free";
  const currentPlan = PLAN_DEFINITIONS[currentTier];
  const comparisonRows = buildComparisonRows();

  return (
    <div className="page-shell-narrow space-y-12 pb-16 text-left">
      {/* Header */}
      <PageHeader
        title="Plans & Pricing"
        titleIcon={CreditCard}
        info="Compare available tiers and manage your subscription. Upgrade to unlock higher limits, advanced exports, and team collaboration features."
        stats={[
          { label: "Current Plan", value: currentPlan.name, tone: "accent", live: true },
          { label: "Status", value: user?.planStatus === "active" ? "Active" : (user?.planStatus || "Active"), tone: "success" },
        ]}
      />

      {/* ─── CURRENT USAGE ───────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Zap size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground font-mono uppercase">Current Period Usage</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Resource consumption for the active billing cycle.</p>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-background-secondary border border-border text-muted-foreground px-2 py-0.5 rounded">
            {currentPlan.name} Tier
          </span>
        </div>

        <Card className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="ml-3 text-sm text-muted-foreground">Loading usage data...</span>
            </div>
          ) : context ? (
            <div className="grid gap-6 md:grid-cols-2">
              <UsageBar
                label={currentTier === "free" ? "Daily Bedrock Queries" : "Monthly Queries"}
                used={currentTier === "free" && dailyTokens ? dailyTokens.queriesUsed : context.usage.monthlyQueries}
                limit={currentTier === "free" && dailyTokens ? dailyTokens.queryLimit : currentPlan.monthlyQueries}
                icon={MessageSquare}
              />
              <UsageBar
                label="Datasets"
                used={context.usage.datasets}
                limit={currentPlan.datasets}
                icon={Database}
              />
              <UsageBar
                label={currentTier === "free" ? "Daily Bedrock Tokens" : "Monthly Tokens"}
                used={currentTier === "free" && dailyTokens ? dailyTokens.tokensUsed : context.usage.monthlyTokens}
                limit={currentTier === "free" && dailyTokens ? dailyTokens.limit : currentPlan.monthlyTokens}
                icon={Zap}
              />
              <UsageBar
                label="Saved Insights"
                used={context.usage.insights}
                limit={currentPlan.insights}
                icon={Bookmark}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Unable to load usage data. Refresh to try again.
            </p>
          )}
        </Card>
      </section>

      {/* ─── PLAN CARDS ──────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Crown size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground font-mono uppercase">Available Plans</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Select the tier that matches your operational requirements.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 items-stretch">
          {PLAN_TIERS.map((tier) => (
            <PlanCard key={tier} plan={PLAN_DEFINITIONS[tier]} currentTier={currentTier} />
          ))}
        </div>
      </section>

      {/* ─── FEATURE COMPARISON TABLE ────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Shield size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground font-mono uppercase">Feature Comparison</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Detailed breakdown of capabilities across all tiers.</p>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/70">
                  <th className="px-5 py-4 text-[12px] font-bold text-muted-foreground uppercase tracking-wider font-mono w-[200px]">
                    Feature
                  </th>
                  {PLAN_TIERS.map((tier) => {
                    const meta = TIER_META[tier];
                    return (
                      <th
                        key={tier}
                        className={`px-5 py-4 text-center text-[12px] font-bold uppercase tracking-wider font-mono ${tier === currentTier ? "text-primary" : "text-muted-foreground"
                          }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className={meta.accent}>{PLAN_DEFINITIONS[tier].name}</span>
                          {tier === currentTier && (
                            <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0 rounded font-semibold">
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
                      className={`border-b border-border/40 transition-colors hover:bg-background-secondary/30 ${idx % 2 === 0 ? "" : "bg-background-secondary/20"
                        }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <RowIcon size={11} />
                          </div>
                          <span className="text-[13px] font-medium text-foreground">{row.label}</span>
                        </div>
                      </td>
                      {PLAN_TIERS.map((tier) => {
                        const val = row.values[tier];
                        const isCurrentCol = tier === currentTier;
                        return (
                          <td
                            key={tier}
                            className={`px-5 py-3.5 text-center ${isCurrentCol ? "bg-primary/[0.03]" : ""}`}
                          >
                            {typeof val === "boolean" ? (
                              val ? (
                                <div className="flex justify-center">
                                  <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                                    <Check size={11} strokeWidth={3} />
                                  </div>
                                </div>
                              ) : (
                                <div className="flex justify-center">
                                  <div className="w-5 h-5 rounded-full bg-muted/50 text-muted-foreground/50 flex items-center justify-center">
                                    <X size={11} strokeWidth={3} />
                                  </div>
                                </div>
                              )
                            ) : (
                              <span className={`text-[13px] font-mono font-medium ${val === "Unlimited" || val === "No size limit"
                                  ? TIER_META[tier].accent
                                  : "text-foreground"
                                }`}>
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
      </section>
    </div>
  );
}
