import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateTone = "default" | "success" | "warning" | "error";

const TONE_CLS: Record<EmptyStateTone, string> = {
  default: "border-border/50 bg-muted/40 text-muted-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  error:   "border-destructive/30 bg-destructive/10 text-destructive",
};

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Caller passes its own button wired to an existing handler. */
  action?: ReactNode;
  secondaryAction?: ReactNode;
  /** Tighter spacing for in-panel empties (result panes, list sections). */
  compact?: boolean;
  /** Tints the icon container — default keeps existing neutral appearance. */
  tone?: EmptyStateTone;
  /** Short pill displayed above the title (e.g. "0 datasets"). */
  badge?: string;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  tone = "default",
  badge,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "empty-panel page-enter flex flex-col items-center justify-center",
        compact && "rounded-2xl px-4 py-8",
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            "mb-4 flex items-center justify-center rounded-2xl border",
            compact ? "h-10 w-10" : "h-14 w-14 glass-elevated shadow-card-xs",
            TONE_CLS[tone],
          )}
        >
          <Icon size={compact ? 18 : 24} strokeWidth={1.75} />
        </div>
      )}
      {badge && (
        <span className="status-badge-neutral mb-2">{badge}</span>
      )}
      <p className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-base")}>
        {title}
      </p>
      {description && (
        <p className={cn("mt-1.5 max-w-sm text-center text-muted-foreground", compact ? "text-xs" : "text-sm")}>
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className={cn("flex flex-wrap items-center justify-center gap-2", compact ? "mt-4" : "mt-6")}>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
