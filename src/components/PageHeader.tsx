import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type StatTone = "default" | "success" | "info" | "warning" | "danger" | "accent";

interface PageHeaderStat {
  label: string;
  value: ReactNode;
  tone?: StatTone;
  live?: boolean;
}

interface PageHeaderProps {
  title: ReactNode;
  titleIcon?: LucideIcon;
  info?: ReactNode;
  stats?: PageHeaderStat[];
  actions?: ReactNode;
  className?: string;
}

const toneClass: Record<StatTone, string> = {
  default: "text-foreground",
  success: "text-emerald-400",
  info:    "text-indigo-400",
  warning: "text-amber-400",
  danger:  "text-rose-400",
  accent:  "text-purple-400",
};

const toneIconBg: Record<StatTone, string> = {
  default: "bg-primary/10 text-primary border-primary/15",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
  info:    "bg-indigo-500/10 text-indigo-400 border-indigo-500/15",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/15",
  danger:  "bg-rose-500/10 text-rose-400 border-rose-500/15",
  accent:  "bg-purple-500/10 text-purple-400 border-purple-500/15",
};

export function PageHeader({
  title,
  titleIcon: TitleIcon,
  info,
  stats = [],
  actions,
  className,
}: PageHeaderProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden border-b border-border/50 pb-5",
        "before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/18 before:to-transparent",
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          {/* Title row */}
          <div className="flex min-w-0 items-center gap-3">
            {TitleIcon && (
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                  toneIconBg["default"],
                )}
              >
                <TitleIcon size={18} />
              </span>
            )}
            <h1 className="min-w-0 truncate text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[1.75rem]">
              {title}
            </h1>
            {info && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="About this page"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted/70 hover:text-muted-foreground"
                  >
                    <Info size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="text-xs leading-5">{info}</div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Stats row */}
          {stats.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {stats.map((stat) => (
                <span
                  key={stat.label}
                  className="inline-flex min-h-[28px] items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm"
                >
                  {stat.live && (
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                  )}
                  <span className="text-muted-foreground/80">{stat.label}</span>
                  <span className={cn("font-semibold tabular-nums", toneClass[stat.tone || "default"])}>
                    {stat.value}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto lg:shrink-0 lg:justify-end">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}
