import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════════════
   reactbits.dev-inspired animation toolkit (framer-motion powered)
   Respects prefers-reduced-motion by leaning on framer's reducedMotion.
   ════════════════════════════════════════════════════════════════════════ */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Reveal: scroll-triggered fade / blur / slide ───────────────────────── */

type RevealDirection = "up" | "down" | "left" | "right" | "none";

const offsetFor = (dir: RevealDirection, distance: number) => {
  switch (dir) {
    case "up": return { y: distance };
    case "down": return { y: -distance };
    case "left": return { x: distance };
    case "right": return { x: -distance };
    default: return {};
  }
};

export function Reveal({
  children,
  direction = "up",
  distance = 24,
  delay = 0,
  duration = 0.6,
  blur = true,
  once = true,
  className,
  as = "div",
}: {
  children: ReactNode;
  direction?: RevealDirection;
  distance?: number;
  delay?: number;
  duration?: number;
  blur?: boolean;
  once?: boolean;
  className?: string;
  as?: "div" | "section" | "span" | "li";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: "-80px" });
  const MotionTag = motion[as] as typeof motion.div;

  return (
    <MotionTag
      ref={ref as any}
      className={className}
      initial={{ opacity: 0, ...offsetFor(direction, distance), filter: blur ? "blur(8px)" : "blur(0px)" }}
      animate={inView ? { opacity: 1, x: 0, y: 0, filter: "blur(0px)" } : undefined}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </MotionTag>
  );
}

/* ─── Stagger container + items ──────────────────────────────────────────── */

export function Stagger({
  children,
  className,
  gap = 0.08,
  delay = 0.05,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  delay?: number;
  once?: boolean;
}) {
  const variants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: gap, delayChildren: delay } },
  };
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "-80px" }}
    >
      {children}
    </motion.div>
  );
}

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 22, filter: "blur(6px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: EASE } },
};

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerItemVariants}>
      {children}
    </motion.div>
  );
}

/* ─── CountUp: animate a number into view ────────────────────────────────── */

export function CountUp({
  to,
  from = 0,
  duration = 1.6,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
}: {
  to: number;
  from?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / (duration * 1000));
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(from + (to - from) * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, from, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* ─── SplitText: per-word reveal (great for hero headings) ───────────────── */

export function SplitText({
  text,
  className,
  wordClassName,
  delay = 0,
  stagger = 0.08,
  once = true,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  stagger?: number;
  once?: boolean;
}) {
  const words = text.split(" ");
  const container: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
  const word: Variants = {
    hidden: { opacity: 0, y: "0.5em", filter: "blur(8px)" },
    visible: { opacity: 1, y: "0em", filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
  };
  return (
    <motion.span
      className={cn("inline-block", className)}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once }}
    >
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="inline-block overflow-hidden align-bottom">
          <motion.span variants={word} className={cn("inline-block", wordClassName)}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/* ─── GradientText: animated flowing gradient ────────────────────────────── */

export function GradientText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("site-gradient-text", className)}>{children}</span>;
}

/* ─── ShinyText: shimmer sweep across text ───────────────────────────────── */

export function ShinyText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("site-shiny-text", className)}>{children}</span>;
}

/* ─── SpotlightCard: cursor-following radial glow ────────────────────────── */

export function SpotlightCard({
  children,
  className,
  spotlightColor = "hsl(var(--primary) / 0.16)",
}: {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  // Update the glow position by writing to the DOM directly (inside rAF) so
  // moving the mouse never triggers a React re-render — keeps scroll/hover smooth.
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    const glow = glowRef.current;
    if (!el || !glow) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      glow.style.background = `radial-gradient(380px circle at ${x}px ${y}px, ${spotlightColor}, transparent 62%)`;
    });
  };

  const setOpacity = (value: string) => {
    if (glowRef.current) glowRef.current.style.opacity = value;
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={() => setOpacity("1")}
      onMouseLeave={() => setOpacity("0")}
      className={cn("group/spot relative overflow-hidden", className)}
    >
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300"
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

/* ─── TiltCard: 3D tilt that follows the cursor ──────────────────────────── */

export function TiltCard({
  children,
  className,
  max = 10,
  scale = 1.02,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  scale?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 220, damping: 18 });
  const sry = useSpring(ry, { stiffness: 220, damping: 18 });
  const rotateX = useTransform(srx, (v) => `${v}deg`);
  const rotateY = useTransform(sry, (v) => `${v}deg`);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rx.set(-py * max * 2);
    ry.set(px * max * 2);
  };

  const reset = () => { rx.set(0); ry.set(0); };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", transformPerspective: 900 }}
      whileHover={{ scale }}
      transition={{ scale: { duration: 0.2 } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── MagneticButton: pulls slightly toward the cursor ───────────────────── */

export function Magnetic({
  children,
  className,
  strength = 0.35,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 20 });
  const sy = useSpring(y, { stiffness: 260, damping: 20 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
    y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{ x: sx, y: sy }}
      className={cn("inline-block", className)}
    >
      {children}
    </motion.div>
  );
}

/* ─── AuroraBackground: drifting gradient blobs ──────────────────────────── */

export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="site-aurora site-aurora-1" />
      <div className="site-aurora site-aurora-2" />
      <div className="site-aurora site-aurora-3" />
    </div>
  );
}

/* ─── DotGrid: subtle animated dotted background ─────────────────────────── */

export function DotGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("site-dot-grid pointer-events-none absolute inset-0", className)}
    />
  );
}

/* ─── ScrollProgress: top reading-progress bar ───────────────────────────── */

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  return <motion.div className="site-scroll-progress" style={{ scaleX }} />;
}

/* ─── SiteBackground: fixed cinematic mesh + grid + noise ─────────────────── */

export function SiteBackground() {
  return (
    <div className="site-bg" aria-hidden>
      <div className="site-bg-mesh" />
      <div className="site-bg-grid" />
      <div className="site-noise" />
    </div>
  );
}

/* ─── CursorGlow: ambient glow that trails the pointer (desktop only) ─────── */

export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Skip on touch / coarse pointers and when reduced motion is requested.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;
    let idle = false;
    el.style.opacity = "1";

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (idle) { idle = false; raf = requestAnimationFrame(loop); }
    };
    const loop = () => {
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      // transform (compositor-only) instead of left/top (layout) per frame
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
      // Stop the loop once we've effectively caught up to the cursor.
      if (Math.abs(tx - cx) < 0.3 && Math.abs(ty - cy) < 0.3) {
        idle = true;
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="site-cursor-glow" style={{ opacity: 0 }} aria-hidden />;
}

/* ─── FloatingOrbs: soft drifting light blobs for hero depth ──────────────── */

export function FloatingOrbs({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="site-float absolute -left-10 top-10 h-56 w-56 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--brand-2) / 0.35), transparent 70%)" }}
      />
      <div
        className="site-float-slow absolute right-0 top-1/3 h-64 w-64 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--brand-1) / 0.3), transparent 70%)" }}
      />
      <div
        className="site-float absolute bottom-0 left-1/3 h-52 w-52 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--brand-3) / 0.25), transparent 70%)" }}
      />
    </div>
  );
}

/* ─── ParallaxY: translate child as it scrolls through the viewport ───────── */

export function ParallaxY({
  children,
  amount = 60,
  className,
}: {
  children: ReactNode;
  amount?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [amount, -amount]);
  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

/* ─── GlowCard: spotlight + animated glow border + reveal in one ──────────── */

export function GlowCard({
  children,
  className,
  spotlight = true,
}: {
  children: ReactNode;
  className?: string;
  spotlight?: boolean;
}) {
  const inner = spotlight ? (
    <SpotlightCard className="h-full rounded-[1.25rem]">{children}</SpotlightCard>
  ) : (
    children
  );
  return <div className={cn("site-glow-border h-full", className)}>{inner}</div>;
}

/* ─── Marquee: infinite scrolling row ────────────────────────────────────── */

export function Marquee({
  children,
  speed = 38,
  reverse = false,
  className,
  pauseOnHover = true,
}: {
  children: ReactNode;
  speed?: number;
  reverse?: boolean;
  className?: string;
  pauseOnHover?: boolean;
}) {
  const style = { "--marquee-duration": `${speed}s` } as CSSProperties;
  return (
    <div className={cn("site-marquee", pauseOnHover && "site-marquee-hoverable", className)} style={style}>
      <div className={cn("site-marquee-track", reverse && "site-marquee-reverse")}>
        {children}
        {children}
      </div>
    </div>
  );
}
