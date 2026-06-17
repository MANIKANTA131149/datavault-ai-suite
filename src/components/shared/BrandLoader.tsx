import { cn } from "@/lib/utils";

interface BrandLoaderProps {
  /** Optional caption shown beneath the wordmark (e.g. "Loading workspace…"). */
  label?: string;
  /**
   * "page"  — fills the viewport, used as the route-level Suspense fallback.
   * "inline" — fills the parent container (min 40vh), used inside layouts.
   */
  variant?: "page" | "inline";
  className?: string;
}

/**
 * Branded loading state — logo + wordmark + a slim indeterminate progress bar.
 * Deliberately restrained (no bouncing dots / gradients) to read as enterprise
 * rather than playful. Used as the global route fallback and protected-route gate.
 */
export function BrandLoader({ label, variant = "page", className }: BrandLoaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5",
        variant === "page" ? "min-h-screen w-full bg-background" : "min-h-[40vh] w-full",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Logo mark */}
      <div className="logo-pulse flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-card/80 p-2.5 backdrop-blur-xl">
        <img src="/logo.png" alt="" className="h-full w-full object-contain" />
      </div>

      {/* Wordmark + optional caption */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Querify Agent
        </span>
        {label && (
          <span className="text-xs text-muted-foreground">{label}</span>
        )}
      </div>

      {/* Indeterminate progress bar */}
      <div className="loader-track progress-bar-glow h-[3px] w-40" />

      <span className="sr-only">Loading…</span>
    </div>
  );
}

export default BrandLoader;
