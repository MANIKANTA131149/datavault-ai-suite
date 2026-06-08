import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════════════
   Premium toast system — Framer Motion powered, glassmorphism, drop-in
   compatible with the sonner API (toast.success/error/info/warning/loading/
   promise/dismiss + { description, action }).
   ════════════════════════════════════════════════════════════════════════ */

export type ToastType = "success" | "error" | "warning" | "info" | "loading" | "default";
export type ToastPosition = "top-right" | "top-center" | "bottom-right" | "bottom-center";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string | number;
  description?: ReactNode;
  duration?: number;
  action?: ToastAction;
  icon?: ReactNode;
}

interface ToastRecord {
  id: string | number;
  type: ToastType;
  title: ReactNode;
  description?: ReactNode;
  duration: number;
  action?: ToastAction;
  icon?: ReactNode;
  createdAt: number;
}

/* ─── External store (no React state churn for producers) ─────────────────── */

let store: ToastRecord[] = [];
const listeners = new Set<() => void>();
let counter = 0;

const DEFAULT_DURATION = 4500;
const ERROR_DURATION = 5500;

function notify() {
  store = store.slice();
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function getSnapshot() {
  return store;
}

function upsert(record: ToastRecord) {
  const idx = store.findIndex((t) => t.id === record.id);
  if (idx >= 0) store[idx] = record;
  else store.unshift(record); // newest first
  notify();
}

function removeToast(id: string | number) {
  store = store.filter((t) => t.id !== id);
  listeners.forEach((l) => l());
}

function create(type: ToastType, title: ReactNode, opts: ToastOptions = {}): string | number {
  const id = opts.id ?? `t${++counter}`;
  const duration =
    opts.duration ?? (type === "loading" ? Infinity : type === "error" ? ERROR_DURATION : DEFAULT_DURATION);
  upsert({
    id,
    type,
    title,
    description: opts.description,
    duration,
    action: opts.action,
    icon: opts.icon,
    createdAt: Date.now(),
  });
  return id;
}

type PromiseMessages<T> = {
  loading: ReactNode;
  success: ReactNode | ((data: T) => ReactNode);
  error: ReactNode | ((err: unknown) => ReactNode);
};

function resolveMsg<T>(msg: ReactNode | ((arg: T) => ReactNode), arg: T): ReactNode {
  return typeof msg === "function" ? (msg as (a: T) => ReactNode)(arg) : msg;
}

/* ─── Public API (sonner-compatible) ─────────────────────────────────────── */

function toastFn(title: ReactNode, opts?: ToastOptions) {
  return create("default", title, opts);
}

export const toast = Object.assign(toastFn, {
  success: (title: ReactNode, opts?: ToastOptions) => create("success", title, opts),
  error: (title: ReactNode, opts?: ToastOptions) => create("error", title, opts),
  warning: (title: ReactNode, opts?: ToastOptions) => create("warning", title, opts),
  info: (title: ReactNode, opts?: ToastOptions) => create("info", title, opts),
  loading: (title: ReactNode, opts?: ToastOptions) => create("loading", title, opts),
  message: (title: ReactNode, opts?: ToastOptions) => create("default", title, opts),
  custom: (title: ReactNode, opts?: ToastOptions) => create("default", title, opts),
  dismiss: (id?: string | number) => {
    if (id == null) {
      store = [];
      listeners.forEach((l) => l());
    } else {
      removeToast(id);
    }
  },
  promise: <T,>(promise: Promise<T> | (() => Promise<T>), msgs: PromiseMessages<T>) => {
    const p = typeof promise === "function" ? promise() : promise;
    const id = create("loading", msgs.loading);
    p.then((data) => create("success", resolveMsg(msgs.success, data), { id, duration: DEFAULT_DURATION }))
      .catch((err) => create("error", resolveMsg(msgs.error, err), { id, duration: ERROR_DURATION }));
    return p;
  },
});

/* ─── Visual config per type ─────────────────────────────────────────────── */

const TYPE_CONFIG: Record<
  ToastType,
  { Icon: typeof Info; chip: string; bar: string; glow: string; spin?: boolean }
> = {
  success: { Icon: CheckCircle2, chip: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25", bar: "bg-emerald-400", glow: "16,185,129" },
  error: { Icon: XCircle, chip: "bg-rose-500/15 text-rose-400 ring-rose-500/25", bar: "bg-rose-400", glow: "244,63,94" },
  warning: { Icon: AlertTriangle, chip: "bg-amber-500/15 text-amber-400 ring-amber-500/25", bar: "bg-amber-400", glow: "245,158,11" },
  info: { Icon: Info, chip: "bg-blue-500/15 text-blue-400 ring-blue-500/25", bar: "bg-blue-400", glow: "59,130,246" },
  loading: { Icon: Loader2, chip: "bg-primary/15 text-primary ring-primary/25", bar: "bg-primary", glow: "99,102,241", spin: true },
  default: { Icon: Info, chip: "bg-foreground/10 text-foreground ring-border", bar: "bg-foreground/40", glow: "148,163,184" },
};

/* ─── Single toast item ──────────────────────────────────────────────────── */

function ToastItem({
  data,
  position,
  onDismiss,
}: {
  data: ToastRecord;
  position: ToastPosition;
  onDismiss: (id: string | number) => void;
}) {
  const cfg = TYPE_CONFIG[data.type];
  const Icon = cfg.Icon;
  const isTop = position.startsWith("top");
  const finite = Number.isFinite(data.duration);

  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const remainingRef = useRef(data.duration);
  const startRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  };
  const run = (ms: number) => {
    if (!Number.isFinite(ms)) return;
    startRef.current = Date.now();
    timerRef.current = window.setTimeout(() => onDismiss(data.id), Math.max(ms, 0));
  };

  // (Re)start the auto-dismiss timer whenever duration/type changes (e.g. promise resolves).
  useEffect(() => {
    remainingRef.current = data.duration;
    setPaused(false);
    if (finite) run(data.duration);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.duration, data.type]);

  const pause = () => {
    if (!finite) return;
    clearTimer();
    remainingRef.current -= Date.now() - startRef.current;
    setPaused(true);
  };
  const resume = () => {
    if (!finite) return;
    run(remainingRef.current);
    setPaused(false);
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 480) {
      onDismiss(data.id);
    }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: isTop ? -22 : 22, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
      transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.85 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.5}
      dragSnapToOrigin
      onDragEnd={handleDragEnd}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDismiss(data.id);
      }}
      role={data.type === "error" ? "alert" : "status"}
      aria-live={data.type === "error" ? "assertive" : "polite"}
      tabIndex={0}
      className={cn(
        "group pointer-events-auto relative flex w-full cursor-grab touch-none items-start gap-3 overflow-hidden rounded-2xl px-4 py-3.5 pr-9",
        "border border-white/10 bg-[hsl(var(--card)/0.72)] backdrop-blur-xl",
        "outline-none ring-0 focus-visible:ring-2 focus-visible:ring-primary/50 active:cursor-grabbing",
      )}
      style={{
        boxShadow: `0 16px 50px -20px rgba(${cfg.glow},0.45), 0 8px 24px -16px rgba(0,0,0,0.7), inset 0 1px 0 0 rgba(255,255,255,0.06)`,
      }}
    >
      {/* soft accent glow on the left */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-6 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, rgba(${cfg.glow},0.22), transparent 70%)` }}
      />
      {/* top sheen */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      {/* icon */}
      <motion.span
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.05 }}
        className={cn("relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1", cfg.chip)}
      >
        <Icon size={16} strokeWidth={2.4} className={cfg.spin ? "animate-spin" : ""} />
      </motion.span>

      {/* content */}
      <div className="relative min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-semibold leading-snug text-foreground">{data.title}</p>
        {data.description ? (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{data.description}</p>
        ) : null}
        {data.action ? (
          <button
            type="button"
            onClick={() => {
              data.action?.onClick();
              onDismiss(data.id);
            }}
            className="mt-2.5 inline-flex items-center rounded-lg border border-border/60 bg-foreground/5 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
          >
            {data.action.label}
          </button>
        ) : null}
      </div>

      {/* close */}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(data.id)}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={13} />
      </button>

      {/* progress bar */}
      {finite ? (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-2xl">
          <span
            className={cn("toast-progress-bar block h-full rounded-full", cfg.bar)}
            data-paused={paused}
            style={{ animationDuration: `${data.duration}ms`, boxShadow: `0 0 10px rgba(${cfg.glow},0.6)` }}
          />
        </span>
      ) : null}
    </motion.li>
  );
}

/* ─── Toaster container ──────────────────────────────────────────────────── */

const POSITION_CLASSES: Record<ToastPosition, string> = {
  "top-right": "top-0 right-0 items-end",
  "top-center": "top-0 left-1/2 -translate-x-1/2 items-center",
  "bottom-right": "bottom-0 right-0 items-end",
  "bottom-center": "bottom-0 left-1/2 -translate-x-1/2 items-center",
};

export function PremiumToaster({
  position = "top-right",
  max = 4,
}: {
  position?: ToastPosition;
  max?: number;
}) {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const isTop = position.startsWith("top");

  const visible = toasts.slice(0, max);
  // Newest is first in the store. For top positions newest renders at the top;
  // for bottom positions we reverse so newest sits at the bottom (by the corner).
  const ordered = isTop ? visible : [...visible].reverse();

  return (
    <div
      role="region"
      aria-label="Notifications"
      className={cn(
        "pointer-events-none fixed z-[200] flex w-[min(420px,calc(100vw-1.5rem))] flex-col gap-3 p-4 sm:p-5",
        POSITION_CLASSES[position],
        // Mobile: right-anchored stacks become centered full-width for reachability.
        position.endsWith("right") && "max-sm:left-1/2 max-sm:right-auto max-sm:-translate-x-1/2",
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {ordered.map((t) => (
          <ToastItem key={t.id} data={t} position={position} onDismiss={removeToast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
