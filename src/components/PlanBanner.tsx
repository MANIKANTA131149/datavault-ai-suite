import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X, Zap } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { usePlanStore } from "@/stores/plan-store";
import { PLAN_DEFINITIONS, isUnlimited } from "@/lib/plans";
import { cn } from "@/lib/utils";

interface PlanBannerProps {
  dailyTokens?: {
    tokensUsed: number;
    limit: number;
    queriesUsed: number;
    queryLimit: number;
    percentage: number;
  } | null;
}

export function PlanBanner({ dailyTokens }: PlanBannerProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { context } = usePlanStore();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !user || !context) return null;

  const plan = PLAN_DEFINITIONS[user.planTier as keyof typeof PLAN_DEFINITIONS] ?? PLAN_DEFINITIONS.free;
  const usage = context.usage;

  type Alert = { label: string; pct: number; exhausted: boolean };
  const alerts: Alert[] = [];

  const addAlert = (label: string, used: number, limit: number | null) => {
    if (isUnlimited(limit) || !limit) return;
    const pct = Math.round((used / limit) * 100);
    if (pct >= 80) alerts.push({ label, pct: Math.min(pct, 100), exhausted: pct >= 100 });
  };

  addAlert("Monthly queries",  usage.monthlyQueries, plan.monthlyQueries);
  addAlert("Monthly tokens",   usage.monthlyTokens,  plan.monthlyTokens);
  addAlert("Datasets",         usage.datasets,        plan.datasets);
  addAlert("Saved insights",   usage.insights,        plan.insights);

  if (user.planTier === "free" && dailyTokens) {
    addAlert("Daily tokens",   dailyTokens.tokensUsed,  dailyTokens.limit);
    addAlert("Daily queries",  dailyTokens.queriesUsed, dailyTokens.queryLimit);
  }

  if (alerts.length === 0) return null;

  const worst = alerts.sort((a, b) => b.pct - a.pct)[0];
  const isExhausted = worst.exhausted;

  return (
    <AnimatePresence>
      <motion.div
        key="plan-banner"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
        role="status"
        aria-live="polite"
      >
        <div className={cn(
          "flex items-center justify-between gap-3 px-4 py-2.5 text-xs font-medium border-b",
          isExhausted
            ? "bg-destructive/10 border-destructive/20 text-destructive"
            : "bg-[hsl(var(--warning)/0.12)] border-[hsl(var(--warning)/0.25)] text-[hsl(var(--warning))]",
        )}>
          <div className="flex items-center gap-2 min-w-0">
            <Zap size={13} className="shrink-0" />
            <span className="truncate">
              {isExhausted
                ? `${worst.label} limit reached — queries are paused.`
                : `${worst.label} at ${worst.pct}% — approaching your ${PLAN_DEFINITIONS[user.planTier as keyof typeof PLAN_DEFINITIONS]?.name ?? "plan"} limit.`}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => navigate("/app/pricing")}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                isExhausted
                  ? "hover:bg-destructive/15"
                  : "hover:bg-[hsl(var(--warning)/0.15)]",
              )}
            >
              Upgrade <ArrowRight size={10} />
            </button>
            <button
              type="button"
              aria-label="Dismiss banner"
              onClick={() => setDismissed(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg opacity-60 hover:opacity-100 transition-opacity"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
