import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Caller passes its own button wired to an existing handler. */
  action?: ReactNode;
  secondaryAction?: ReactNode;
  /** Tighter spacing for in-panel empties (result panes, list sections). */
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
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
            "mb-4 flex items-center justify-center rounded-2xl border border-border/50 bg-muted/40 text-muted-foreground",
            compact ? "h-10 w-10" : "h-14 w-14",
          )}
        >
          <Icon size={compact ? 18 : 24} strokeWidth={1.75} />
        </div>
      )}
      <p className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-base")}>
        {title}
      </p>
      {description && (
        <p className={cn("mt-1.5 max-w-sm text-muted-foreground", compact ? "text-xs" : "text-sm")}>
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
