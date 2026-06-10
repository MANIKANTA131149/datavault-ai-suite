import { cn } from "@/lib/utils";

export type StatusValue =
  | "connected"
  | "active"
  | "success"
  | "completed"
  | "error"
  | "failed"
  | "disconnected"
  | "pending"
  | "running"
  | "warning"
  | "syncing"
  | "untested"
  | "neutral"
  | "draft"
  | "inactive";

interface StatusConfig {
  cls: string;
  dotCls: string;
  defaultLabel: string;
}

const STATUS_MAP: Record<StatusValue, StatusConfig> = {
  connected:    { cls: "status-badge-success", dotCls: "bg-success",              defaultLabel: "Connected" },
  active:       { cls: "status-badge-success", dotCls: "bg-success",              defaultLabel: "Active" },
  success:      { cls: "status-badge-success", dotCls: "bg-success",              defaultLabel: "Success" },
  completed:    { cls: "status-badge-success", dotCls: "bg-success",              defaultLabel: "Completed" },
  error:        { cls: "status-badge-error",   dotCls: "bg-destructive",          defaultLabel: "Error" },
  failed:       { cls: "status-badge-error",   dotCls: "bg-destructive",          defaultLabel: "Failed" },
  disconnected: { cls: "status-badge-error",   dotCls: "bg-destructive",          defaultLabel: "Disconnected" },
  pending:      { cls: "status-badge-warning", dotCls: "bg-warning",              defaultLabel: "Pending" },
  running:      { cls: "status-badge-warning", dotCls: "bg-warning",              defaultLabel: "Running" },
  warning:      { cls: "status-badge-warning", dotCls: "bg-warning",              defaultLabel: "Warning" },
  syncing:      { cls: "status-badge-warning", dotCls: "bg-warning",              defaultLabel: "Syncing" },
  untested:     { cls: "status-badge-warning", dotCls: "bg-warning",              defaultLabel: "Untested" },
  neutral:      { cls: "status-badge-neutral", dotCls: "bg-muted-foreground",     defaultLabel: "Unknown" },
  draft:        { cls: "status-badge-neutral", dotCls: "bg-muted-foreground",     defaultLabel: "Draft" },
  inactive:     { cls: "status-badge-neutral", dotCls: "bg-muted-foreground",     defaultLabel: "Inactive" },
};

interface StatusBadgeProps {
  status: StatusValue | string;
  label?: string;
  /** Animated live-dot for in-flight states (running, syncing). */
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({ status, label, pulse = false, className }: StatusBadgeProps) {
  const cfg = STATUS_MAP[(status as StatusValue)] ?? STATUS_MAP.neutral;

  return (
    <span className={cn(cfg.cls, className)}>
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {pulse && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", cfg.dotCls)} />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", cfg.dotCls)} />
      </span>
      {label ?? cfg.defaultLabel}
    </span>
  );
}
