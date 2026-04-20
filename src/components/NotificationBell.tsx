import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck, Database, Trash2, X, Sparkles, Shield, AlertTriangle, BellOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotificationsStore, type Notification } from "@/stores/notifications-store";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, React.ElementType> = {
  dataset_upload: Database,
  query_complete: Sparkles,
  admin_action:   Shield,
  alert:          AlertTriangle,
  system:         Bell,
};

const TYPE_COLORS: Record<string, string> = {
  dataset_upload: "text-blue-400",
  query_complete: "text-purple-400",
  admin_action:   "text-amber-400",
  alert:          "text-red-400",
  system:         "text-muted-foreground",
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

function NotificationItem({ n, onRead, onDismiss }: { n: Notification; onRead: () => void; onDismiss: () => void }) {
  const navigate = useNavigate();
  const Icon = TYPE_ICONS[n.type] || Bell;
  const color = TYPE_COLORS[n.type] || "text-muted-foreground";

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      className={cn(
        "flex items-start gap-3 px-4 py-3 hover:bg-card/60 transition-colors cursor-pointer group border-b border-border/50 last:border-0",
        !n.read && "bg-primary/5"
      )}
      onClick={() => {
        if (!n.read) onRead();
        if (n.link) navigate(n.link);
      }}
    >
      <div className={cn("mt-0.5 shrink-0", color)}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-medium text-foreground", !n.read && "font-semibold")}>{n.title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{n.message}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {!n.read && (
          <button
            onClick={(e) => { e.stopPropagation(); onRead(); }}
            className="p-1 rounded hover:bg-card text-muted-foreground hover:text-primary"
            title="Mark as read"
          >
            <Check size={11} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="p-1 rounded hover:bg-card text-muted-foreground hover:text-destructive"
          title="Dismiss"
        >
          <X size={11} />
        </button>
      </div>
      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />}
    </motion.div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markRead, markAllRead, dismiss, clearAll, fetchNotifications } = useNotificationsStore();

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Refetch when opened
  useEffect(() => { if (open) fetchNotifications(); }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        id="notification-bell"
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-primary text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-background-secondary border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-foreground" />
                <span className="text-sm font-semibold text-foreground">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-medium">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="p-1.5 rounded hover:bg-card text-muted-foreground hover:text-primary transition-colors"
                    title="Mark all read"
                  >
                    <CheckCheck size={13} />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="p-1.5 rounded hover:bg-card text-muted-foreground hover:text-destructive transition-colors"
                    title="Clear all"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Notification list */}
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              <AnimatePresence>
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <BellOff size={28} className="text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No notifications yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">You're all caught up!</p>
                  </div>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
