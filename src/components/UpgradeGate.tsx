import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import type { PlanTier } from "@/lib/plans";

const TIER_LABELS: Record<PlanTier, string> = {
  free: "Free",
  standard: "Standard",
  professional: "Professional",
  enterprise: "Enterprise",
};

interface UpgradeGateProps {
  /** Minimum plan required to see the content */
  requiredTier: PlanTier;
  /** Short feature name shown in the lock ("PDF Export", "Admin Panel", etc.) */
  feature: string;
  /** The content to render when unlocked */
  children: ReactNode;
  /** If true, renders a full-page overlay instead of an inline gate */
  fullPage?: boolean;
  className?: string;
}

const TIER_ORDER: PlanTier[] = ["free", "standard", "professional", "enterprise"];

function tierIndex(t: PlanTier) {
  return TIER_ORDER.indexOf(t);
}

export function UpgradeGate({ requiredTier, feature, children, fullPage, className }: UpgradeGateProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const currentTier = (user?.planTier ?? "free") as PlanTier;
  const hasAccess = tierIndex(currentTier) >= tierIndex(requiredTier);

  if (hasAccess) return <>{children}</>;

  const label = TIER_LABELS[requiredTier];

  if (fullPage) {
    return (
      <div className={cn("flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center", className)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-4"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Lock size={26} className="text-primary" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold text-foreground">{feature} requires {label}+</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Upgrade your plan to unlock {feature} and other advanced capabilities.
            </p>
          </div>
          <Button onClick={() => navigate("/app/pricing")} className="gap-2">
            View Plans <ArrowRight size={14} />
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)}>
      {/* Blurred preview of children */}
      <div className="pointer-events-none select-none blur-[3px] saturate-50 opacity-40" aria-hidden>
        {children}
      </div>
      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <Lock size={18} className="text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">{feature}</p>
          <p className="text-xs text-muted-foreground">Requires {label} plan or higher</p>
        </div>
        <Button size="sm" onClick={() => navigate("/app/pricing")} className="gap-1.5 text-xs">
          Upgrade <ArrowRight size={12} />
        </Button>
      </div>
    </div>
  );
}

/** Inline "locked" badge — use next to disabled buttons */
export function PlanLockBadge({ requiredTier }: { requiredTier: PlanTier }) {
  const { user } = useAuthStore();
  const currentTier = (user?.planTier ?? "free") as PlanTier;
  if (tierIndex(currentTier) >= tierIndex(requiredTier)) return null;
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0 text-[10px] font-semibold text-primary">
      <Lock size={8} strokeWidth={2.5} /> {TIER_LABELS[requiredTier]}+
    </span>
  );
}
