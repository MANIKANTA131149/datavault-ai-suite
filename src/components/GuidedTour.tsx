import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";

// ─── Step config ──────────────────────────────────────────────────────────────
// Each step optionally targets a real element (via a [data-tour] selector) and
// optionally navigates to a route first. When no target resolves (e.g. the
// element is off-screen on mobile), the step falls back to a centered card.
interface TourStep {
  title: string;
  description: string;
  /** [data-tour] value to spotlight. Omit for an intro/outro centered card. */
  target?: string;
  /** Navigate here before showing the step (auto-walk). */
  route?: string;
  /** Preferred tooltip placement relative to the target. */
  placement?: "top" | "bottom" | "left" | "right";
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to Querify Agent",
    description:
      "Let's take a 30-second walk through the workspace. You can skip anytime — we'll only show this once.",
  },
  {
    title: "Start with your data",
    description:
      "Upload CSV or Excel files here. Columns and types are detected automatically, and your data stays private.",
    target: "nav:/app/datasets",
    route: "/app/datasets",
    placement: "right",
  },
  {
    title: "Or connect a live database",
    description:
      "Connect PostgreSQL, MySQL, Snowflake, BigQuery and more. The agent queries them read-only and shows the exact SQL it ran.",
    target: "nav:/app/connections",
    route: "/app/connections",
    placement: "right",
  },
  {
    title: "Ask in plain English",
    description:
      "This is your workspace. Pick a data source and just type a question — the agent writes and runs the queries for you.",
    target: "query-composer",
    route: "/app/query",
    placement: "top",
  },
  {
    title: "Build reports & automate",
    description:
      'Ask the agent to "build me a dashboard" and it lands in Reports. Schedule queries and set alerts under Automations.',
    target: "nav:/app/dashboards",
    route: "/app/dashboards",
    placement: "right",
  },
  {
    title: "Revisit anything in History",
    description:
      "Every run is saved with its full reasoning trace, so you can review, replay, or export past answers.",
    target: "nav:/app/history",
    route: "/app/history",
    placement: "right",
  },
  {
    title: "You're all set",
    description:
      "That's the tour. Head to the Query workspace whenever you're ready to ask your first question.",
    route: "/app/query",
  },
];

const PAD = 8;            // spotlight padding around the target
const TOOLTIP_W = 320;    // tooltip width budget for positioning math
const GAP = 14;           // gap between target and tooltip
const MARGIN = 12;        // viewport edge margin

interface Rect { top: number; left: number; width: number; height: number; }

/** Find a [data-tour] element's viewport rect, retrying briefly while the
 *  (lazily-loaded) page mounts. Resolves null if it never appears. */
function useTargetRect(target: string | undefined, stepKey: number): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  const measure = useCallback(() => {
    if (!target) { setRect(null); return true; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`);
    if (!el) { setRect(null); return false; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { setRect(null); return false; }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    return true;
  }, [target]);

  // Poll for the target after a step change (page may still be mounting).
  useEffect(() => {
    if (!target) { setRect(null); return; }
    let tries = 0;
    let raf = 0;
    const tick = () => {
      if (measure() || tries > 40) return; // ~1.3s max
      tries++;
      raf = window.setTimeout(tick, 32);
    };
    tick();
    return () => window.clearTimeout(raf);
  }, [target, stepKey, measure]);

  // Keep the spotlight glued to the target on scroll/resize.
  useEffect(() => {
    if (!target) return;
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [target, measure]);

  return rect;
}

export function GuidedTour() {
  const { isFirstLogin, setFirstLoginDone } = useAuthStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  const current = STEPS[step];
  const rect = useTargetRect(current?.target, step);

  // Navigate to the step's route when entering it. A short delay lets the
  // current tooltip content fade out first, so the page transition feels
  // deliberate and smooth rather than an instant jump.
  useEffect(() => {
    if (!isFirstLogin) return;
    setMounted(true);
    if (!current?.route) return;
    if (window.location.pathname === current.route) return; // already there
    const t = window.setTimeout(() => navigate(current.route!), 220);
    return () => window.clearTimeout(t);
  }, [step, isFirstLogin]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(() => {
    setFirstLoginDone();
    setMounted(false);
  }, [setFirstLoginDone]);

  // Allow Escape to skip, arrow keys to navigate.
  useEffect(() => {
    if (!isFirstLogin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, STEPS.length - 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFirstLogin, finish]);

  if (!isFirstLogin || !mounted) return null;

  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return createPortal(
    <TourOverlay
      key={step}
      step={step}
      total={STEPS.length}
      title={current.title}
      description={current.description}
      placement={current.placement}
      rect={rect}
      isFirst={isFirst}
      isLast={isLast}
      onSkip={finish}
      onBack={() => setStep((s) => Math.max(s - 1, 0))}
      onNext={() => (isLast ? finish() : setStep((s) => s + 1))}
      onDot={(i) => setStep(i)}
    />,
    document.body,
  );
}

// ─── Overlay (spotlight + tooltip) ─────────────────────────────────────────────
function TourOverlay({
  step, total, title, description, placement, rect,
  isFirst, isLast, onSkip, onBack, onNext, onDot,
}: {
  step: number;
  total: number;
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right";
  rect: Rect | null;
  isFirst: boolean;
  isLast: boolean;
  onSkip: () => void;
  onBack: () => void;
  onNext: () => void;
  onDot: (i: number) => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; place: string }>({ top: 0, left: 0, place: "center" });

  // Recompute after the tooltip measures its real size (long copy wraps taller
  // on narrow screens). A small reflow tick makes the first paint accurate.
  const [measureTick, setMeasureTick] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMeasureTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [rect, title, step]);

  // Compute tooltip position relative to the spotlight (or center if no target).
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tip = tooltipRef.current;
    const tw = tip?.offsetWidth || Math.min(TOOLTIP_W, vw - 24);
    const th = tip?.offsetHeight || 180;

    if (!rect) {
      setPos({ top: Math.max(MARGIN, vh / 2 - th / 2), left: Math.max(MARGIN, vw / 2 - tw / 2), place: "center" });
      return;
    }

    const sTop = rect.top - PAD, sLeft = rect.left - PAD;
    const sW = rect.width + PAD * 2, sH = rect.height + PAD * 2;
    const spaceRight = vw - (sLeft + sW);
    const spaceLeft = sLeft;
    const spaceBelow = vh - (sTop + sH);
    const spaceAbove = sTop;
    const fits = { right: spaceRight >= tw + GAP, left: spaceLeft >= tw + GAP, bottom: spaceBelow >= th + GAP, top: spaceAbove >= th + GAP };

    // On narrow screens, side placement almost never fits — go vertical.
    const narrow = vw < 640;
    const order: Array<"bottom" | "top" | "right" | "left"> = narrow
      ? ["bottom", "top", "right", "left"]
      : [(placement || "bottom"), "bottom", "top", "right", "left"].filter((v, i, a) => a.indexOf(v) === i) as any;

    let place = order.find((p) => fits[p]) || "below-edge";

    let top = 0, left = 0;
    if (place === "right") { left = sLeft + sW + GAP; top = sTop + sH / 2 - th / 2; }
    else if (place === "left") { left = sLeft - tw - GAP; top = sTop + sH / 2 - th / 2; }
    else if (place === "top") { top = sTop - th - GAP; left = sLeft + sW / 2 - tw / 2; }
    else if (place === "bottom") { top = sTop + sH + GAP; left = sLeft + sW / 2 - tw / 2; }
    else {
      // Nothing fits (target fills the screen): dock to whichever vertical gap
      // is larger so the tooltip never sits on top of the spotlight.
      if (spaceBelow >= spaceAbove) { top = vh - th - MARGIN; place = "bottom"; }
      else { top = MARGIN; place = "top"; }
      left = sLeft + sW / 2 - tw / 2;
    }

    // Clamp into the viewport.
    left = Math.min(Math.max(MARGIN, left), vw - tw - MARGIN);
    top = Math.min(Math.max(MARGIN, top), vh - th - MARGIN);
    setPos({ top, left, place });
  }, [rect, placement, title, step, measureTick]);

  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Onboarding tour">
      {/* Dim layer with a spotlight cutout via an SVG mask */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <mask id="tour-spot">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <motion.rect
                initial={false}
                animate={{ x: rect.left - PAD, y: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 190, damping: 30, mass: 0.9 }}
                rx={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="hsl(var(--background) / 0.78)" mask="url(#tour-spot)" />
      </svg>

      {/* Click-catcher: clicking the dim area advances; clicking the cutout passes through */}
      <button
        aria-label="Continue tour"
        className="absolute inset-0 cursor-default"
        onClick={onNext}
      />

      {/* Highlight ring around the target */}
      {rect && (
        <motion.div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary/70"
          initial={false}
          animate={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
          style={{ boxShadow: "0 0 0 9999px transparent, 0 0 24px -2px hsl(var(--primary) / 0.5)" }}
        />
      )}

      {/* Tooltip card — glides smoothly between positions; content cross-fades */}
      <motion.div
        ref={tooltipRef}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1, top: pos.top, left: pos.left }}
        transition={reduce
          ? { duration: 0 }
          : { type: "spring", stiffness: 210, damping: 30, mass: 0.9, opacity: { duration: 0.4 } }}
        className="absolute w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/60 bg-background-secondary/95 shadow-[0_24px_48px_-20px_hsl(var(--foreground)/0.3)] backdrop-blur-xl"
      >
          {/* Progress bar */}
          <div className="h-1 w-full bg-muted/40">
            <motion.div
              className="h-full bg-primary"
              initial={false}
              animate={{ width: `${((step + 1) / total) * 100}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>

          {/* Content cross-fades per step while the card stays put */}
          <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                  <Sparkles size={14} className="text-primary" />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                  Step {step + 1} of {total}
                </p>
              </div>
              <button
                onClick={onSkip}
                aria-label="Skip tour"
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>

            <h2 className="mt-3 text-base font-semibold leading-snug text-foreground">{title}</h2>
            <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{description}</p>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                onClick={onSkip}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: total }).map((_, i) => (
                  <button
                    key={i}
                    aria-label={`Go to step ${i + 1}`}
                    onClick={() => onDot(i)}
                    className={`h-1.5 rounded-full transition-all ${i === step ? "w-4 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40"}`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                {!isFirst && (
                  <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={onBack} aria-label="Previous step">
                    <ArrowLeft size={13} />
                  </Button>
                )}
                <Button size="sm" className="h-7 text-xs" onClick={onNext}>
                  {isLast ? "Done" : "Next"}
                  {!isLast && <ArrowRight size={12} className="ml-1" />}
                </Button>
              </div>
            </div>
          </div>
          </motion.div>
          </AnimatePresence>
        </motion.div>
    </div>
  );
}
