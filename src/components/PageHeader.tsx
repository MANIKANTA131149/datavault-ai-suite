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
  info: "text-indigo-400",
  warning: "text-amber-400",
  danger: "text-rose-400",
  accent: "text-purple-400",
};

export function PageHeader({ title, titleIcon: TitleIcon, info, stats = [], actions, className }: PageHeaderProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden border-b border-border/60 pb-5",
        "before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/35 before:to-transparent",
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {TitleIcon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                <TitleIcon size={18} />
              </span>
            )}
            <h1 className="min-w-0 truncate text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            {info && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="About this page"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                  >
                    <Info size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="text-xs leading-5">{info}</div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {stats.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {stats.map((stat) => (
                <span
                  key={stat.label}
                  className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-border/60 bg-background/55 px-3 py-1.5 text-xs text-muted-foreground shadow-[0_10px_24px_-22px_hsl(var(--foreground)/0.75)] backdrop-blur-sm"
                >
                  {stat.live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_hsl(160_84%_39%/0.12)]" />}
                  <span>{stat.label}</span>
                  <span className={cn("font-semibold", toneClass[stat.tone || "default"])}>{stat.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto lg:justify-end">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}
