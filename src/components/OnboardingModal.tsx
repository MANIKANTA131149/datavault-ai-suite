import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Cable,
  FileSpreadsheet,
  Key,
  MessageSquare,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";

interface TourStep {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  bullets?: string[];
  route?: string;
  routeLabel?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Querify Agent",
    description:
      "Ask questions about your data in plain English. The AI agent writes and runs the queries for you, with a full reasoning trace you can inspect.",
    icon: Sparkles,
    bullets: [
      "No SQL knowledge required",
      "Works with files and live databases",
      "Every answer shows how it was computed",
    ],
  },
  {
    title: "Bring your data",
    description:
      "Upload CSV or Excel files on the Datasets page. Columns and types are detected automatically, and your data stays private.",
    icon: FileSpreadsheet,
    bullets: ["Drag and drop CSV, XLSX, or XLS", "Multi-sheet workbooks supported", "Tag, pin, and organize files"],
    route: "/app/datasets",
    routeLabel: "Open Datasets",
  },
  {
    title: "Or connect a live database",
    description:
      "Connect PostgreSQL, MySQL, Snowflake, BigQuery, MongoDB, and more. The agent queries them read-only and shows the exact SQL it ran.",
    icon: Cable,
    bullets: ["15+ database types", "Read-only and safe", "Test connections before querying"],
    route: "/app/connections",
    routeLabel: "Open Connections",
  },
  {
    title: "Add your AI provider",
    description:
      "Pick an LLM provider and paste your API key — OpenAI, Anthropic, Gemini, Groq, Mistral, Bedrock, and more. A free built-in option is available to start.",
    icon: Key,
    bullets: ["12+ providers supported", "Keys are encrypted in transit", "Switch models any time"],
    route: "/app/settings",
    routeLabel: "Open Settings",
  },
  {
    title: "Ask your first question",
    description:
      "Head to the Query workspace, select your data source, and type a question like \"What were the top 10 products by revenue last quarter?\"",
    icon: MessageSquare,
    bullets: ["Results render as tables and charts", "Export to CSV, PDF, or copy as a table", "Follow-up questions keep context"],
    route: "/app/query",
    routeLabel: "Open Query",
  },
  {
    title: "Save what matters",
    description:
      "Bookmark notable results as Insights, revisit past runs in History, and deploy a shareable chatbot for your dataset when you are ready.",
    icon: Bookmark,
    bullets: ["Insights catalog with tags and notes", "Full query history with traces", "One-click chatbot deployment"],
  },
];

export function OnboardingModal() {
  const { isFirstLogin, setFirstLoginDone } = useAuthStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  if (!isFirstLogin) return null;

  const current = TOUR_STEPS[step];
  const Icon = current.icon;
  const isLast = step === TOUR_STEPS.length - 1;
  const progress = ((step + 1) / TOUR_STEPS.length) * 100;

  const goTo = (route: string) => {
    setFirstLoginDone();
    navigate(route);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/85 backdrop-blur-sm" />
      <motion.div
        className="relative w-full max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border/55 bg-background-secondary/95 shadow-[0_24px_48px_-20px_hsl(var(--foreground)/0.2)] backdrop-blur-xl sm:max-w-lg"
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        {/* Progress bar */}
        <div className="h-1 w-full bg-muted/40">
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          />
        </div>

        <button
          onClick={setFirstLoginDone}
          aria-label="Skip tour"
          className="absolute right-4 top-5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <X size={15} />
        </button>

        <div className="p-6 sm:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Quick tour · {step + 1} of {TOUR_STEPS.length}
          </p>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div className="mt-4 flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                  <Icon size={20} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-snug text-foreground">{current.title}</h2>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{current.description}</p>
                </div>
              </div>

              {current.bullets && (
                <ul className="mt-4 space-y-1.5 pl-[60px]">
                  {current.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              {current.route && (
                <div className="mt-4 pl-[60px]">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => goTo(current.route!)}
                  >
                    {current.routeLabel} <ArrowRight size={12} className="ml-1.5" />
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Footer */}
          <div className="mt-7 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={setFirstLoginDone}
            >
              Skip tour
            </Button>

            <div className="flex items-center gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Go to step ${i + 1}`}
                  onClick={() => setStep(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="outline" size="sm" className="h-8" onClick={() => setStep(step - 1)}>
                  <ArrowLeft size={13} />
                </Button>
              )}
              <Button
                size="sm"
                className="h-8"
                onClick={() => {
                  if (isLast) setFirstLoginDone();
                  else setStep(step + 1);
                }}
              >
                {isLast ? "Start exploring" : "Next"}
                {!isLast && <ArrowRight size={13} className="ml-1" />}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
