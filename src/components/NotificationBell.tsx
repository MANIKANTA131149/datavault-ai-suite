import { useState, useEffect } from "react";
import { Bell, Check, CheckCheck, Database, Trash2, X, Sparkles, Shield, AlertTriangle, BellOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotificationsStore, type Notification } from "@/stores/notifications-store";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const TYPE_ICONS: Record<string, React.ElementType> = {
  dataset_upload: Database,
  query_complete: Sparkles,
  admin_action:   Shield,
  alert:          AlertTriangle,
  system:         Bell,
};

const TYPE_COLORS: Record<string, string> = {
  dataset_upload: "text-blue-400 bg-blue-500/10",
  query_complete: "text-purple-400 bg-purple-500/10",
  admin_action:   "text-amber-400 bg-amber-500/10",
  alert:          "text-red-400 bg-red-500/10",
  system:         "text-muted-foreground bg-muted/50",
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotificationItem({
  n,
  onRead,
  onDismiss,
}: {
  n: Notification;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const Icon = TYPE_ICONS[n.type] || Bell;
  const colorClass = TYPE_COLORS[n.type] || "text-muted-foreground bg-muted/50";

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, height: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "group flex cursor-pointer items-start gap-3 border-b border-border/40 px-4 py-3",
        "transition-colors duration-100 hover:bg-card/60",
        "last:border-0",
        !n.read && "bg-primary/[0.03]",
      )}
      onClick={() => {
        if (!n.read) onRead();
        if (n.link) navigate(n.link);
      }}
    >
      {/* Icon */}
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", colorClass)}>
        <Icon size={13} />
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className={cn("text-[12.5px] leading-snug text-foreground", !n.read ? "font-semibold" : "font-medium")}>
          {n.title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.message}</p>
        <p className="mt-1 text-[10px] tabular-nums text-muted-foreground/50">{timeAgo(n.createdAt)}</p>
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        {!n.read && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRead(); }}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-card hover:text-primary"
            title="Mark as read"
          >
            <Check size={11} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-card hover:text-destructive"
          title="Dismiss"
        >
          <X size={11} />
        </button>
      </div>

      {/* Unread dot */}
      {!n.read && (
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      )}
    </motion.div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead, dismiss, clearAll, fetchNotifications } =
    useNotificationsStore();

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live push (F6): refresh instantly when the server streams a notification
  // (scheduled runs, alerts firing). Silently inert where SSE is unavailable —
  // the open-on-click fetch above keeps working exactly as before.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    import("@/lib/events-client")
      .then(({ subscribeToServerEvents }) => {
        unsubscribe = subscribeToServerEvents(() => fetchNotifications());
      })
      .catch(() => {});
    return () => unsubscribe?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id="notification-bell"
          type="button"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-card/80 hover:text-foreground"
        >
          <Bell size={15} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-border/70 bg-popover p-0 shadow-[0_20px_44px_-24px_hsl(var(--foreground)/0.5)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 bg-card/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell size={13} className="text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-primary"
                title="Mark all as read"
              >
                <CheckCheck size={13} />
              </button>
            )}
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-destructive"
                title="Clear all notifications"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Notification list */}
        <div className="max-h-[min(70dvh,26rem)] overflow-y-auto scrollbar-thin">
          <AnimatePresence initial={false}>
            {notifications.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-card/60">
                  <BellOff size={20} className="text-muted-foreground/40" />
                </span>
                <p className="text-[13px] font-medium text-muted-foreground">All caught up</p>
                <p className="mt-0.5 text-xs text-muted-foreground/60">No new notifications</p>
              </motion.div>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  n={n}
                  onRead={() => markRead(n.id)}
                  onDismiss={() => dismiss(n.id)}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  );
}
