import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, Settings, ArrowRight, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";

const STEPS = [
  {
    title: "Welcome to Querify Agent",
    description: "Your AI-powered data analytics platform. Query your data in plain English with full reasoning trace.",
    icon: null,
    iconComponent: Sparkles,
  },
  {
    title: "Upload your first file",
    description: "Go to Datasets and upload a CSV or Excel file. We'll parse it automatically and detect column types.",
    icon: null,
    iconComponent: Upload,
  },
  {
    title: "Configure your LLM provider",
    description: "Head to the Query page and enter your API key for Groq, OpenAI, Google Gemini, Anthropic, or any supported provider.",
    icon: null,
    iconComponent: Settings,
  },
];

export function OnboardingModal() {
  const { isFirstLogin, setFirstLoginDone } = useAuthStore();
  const [step, setStep] = useState(0);

  if (!isFirstLogin) return null;

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
      <motion.div
        className="relative w-full max-w-[calc(100vw-2rem)] rounded-2xl border border-border/55 bg-background-secondary/95 p-5 shadow-[0_24px_48px_-20px_hsl(var(--foreground)/0.2)] backdrop-blur-xl sm:max-w-md sm:p-6"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <button
          onClick={setFirstLoginDone}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X size={16} />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            {current.icon ? (
              <span className="text-2xl">{current.icon}</span>
            ) : current.iconComponent ? (
              <current.iconComponent size={24} className="text-primary" />
            ) : null}
          </div>
          <h2 className="text-lg font-semibold text-foreground">{current.title}</h2>
          <p className="text-sm text-muted-foreground mt-2">{current.description}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" className="text-muted-foreground sm:order-1" onClick={setFirstLoginDone}>
            Skip
          </Button>
          <div className="flex justify-center gap-1.5 sm:order-2">
            {STEPS.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === step ? "bg-primary" : "bg-border"}`} />
            ))}
          </div>
          <Button
            className="sm:order-3"
            onClick={() => {
              if (step < STEPS.length - 1) setStep(step + 1);
              else setFirstLoginDone();
            }}
          >
            {step < STEPS.length - 1 ? "Next" : "Get Started"}
            <ArrowRight size={14} className="ml-1" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
