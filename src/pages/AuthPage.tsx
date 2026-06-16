import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SignIn, SignUp, useAuth } from "@clerk/react";
import { motion } from "framer-motion";
import { BarChart2, Brain, Layers, Moon, Sun, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";

const FEATURES = [
  { label: "Multi-LLM Support", icon: Brain },
  { label: "CSV & Excel Native", icon: Layers },
  { label: "Agent Reasoning Trace", icon: BarChart2 },
];

export default function AuthPage() {
  const navigate  = useNavigate();
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { user: storeUser } = useAuthStore();
  const { theme, setTheme, saveSettings, hasFetched } = useSettingsStore();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  useEffect(() => {
    if (!hasFetched) setTheme("light");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (clerkLoaded && isSignedIn && storeUser) navigate("/app/dashboard", { replace: true });
  }, [clerkLoaded, isSignedIn, storeUser, navigate]);

  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const handleToggleTheme = async () => {
    const next = isDark ? "light" : "dark";
    setTheme(next);
    try { await saveSettings(); } catch { /* not logged in */ }
  };

  // Clerk appearance — strips its own card shell so OUR container is the card.
  // We also override key element colours to match the active theme variables.
  const clerkAppearance = {
    elements: {
      rootBox:  "w-full",
      // Remove Clerk's card chrome entirely
      card:     "w-full shadow-none border-0 !bg-transparent p-0 m-0 gap-4",
      cardBox:  "w-full shadow-none border-0 !bg-transparent",
      // Header
      headerTitle:    "!text-foreground text-lg font-semibold",
      headerSubtitle: "!text-muted-foreground text-sm",
      // Social buttons — match our button style
      socialButtonsBlockButton:
        "!border !border-border !bg-card hover:!bg-muted !text-foreground text-sm font-medium rounded-xl transition-colors w-full",
      socialButtonsBlockButtonText: "!text-foreground font-medium",
      socialButtonsBlockButtonArrow: "hidden",
      // Divider
      dividerRow:  "my-2",
      dividerLine: "!bg-border",
      dividerText: "!text-muted-foreground text-xs",
      // Form
      formFieldRow:   "gap-y-1",
      formFieldLabel: "!text-foreground text-sm font-medium",
      formFieldInput:
        "!bg-muted/50 !border-border !text-foreground placeholder:!text-muted-foreground rounded-xl text-sm focus:!ring-2 focus:!ring-primary/30 focus:!border-primary/50 transition-all",
      formFieldInputShowPasswordButton: "!text-muted-foreground hover:!text-foreground",
      // Primary button
      formButtonPrimary:
        "!bg-primary hover:!bg-primary/90 !text-primary-foreground rounded-xl text-sm font-semibold transition-colors w-full",
      // Footer
      footerActionText: "!text-muted-foreground text-sm",
      footerActionLink: "!text-primary hover:!text-primary/80 font-semibold",
      footer:           "!bg-transparent mt-2",
      footerPages:      "!bg-transparent",
      // Identity preview
      identityPreviewText:       "!text-foreground text-sm",
      identityPreviewEditButton: "!text-primary hover:!text-primary/80 text-sm",
      // OTP inputs
      otpCodeFieldInput:
        "!bg-muted/50 !border-border !text-foreground rounded-xl text-center font-bold text-lg focus:!ring-2 focus:!ring-primary/30",
      // Alert/error
      alert:        "!bg-destructive/10 !border-destructive/20 rounded-xl p-3",
      alertText:    "!text-destructive text-sm",
      // "Secured by Clerk" branding strip — keep it but make it blend
      footer:       "!bg-muted/20 rounded-b-xl mt-0",
    },
    layout: {
      socialButtonsPlacement: "top" as const,
      showOptionalFields: false,
    },
  };

  return (
    <div className="relative min-h-dvh bg-background">
      {/* Subtle gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,hsl(var(--primary)/0.12),transparent)]" />

      {/* Theme toggle */}
      <Button
        type="button" variant="ghost" size="icon"
        onClick={handleToggleTheme}
        className="absolute right-4 top-4 z-50 h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </Button>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-7xl flex-col xl:flex-row">

        {/* ── Left marketing panel (xl only) ────────────────────────────── */}
        <section className="hidden xl:flex xl:flex-1 xl:flex-col xl:justify-between xl:border-r xl:border-border xl:px-14 xl:py-14">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Logo */}
            <div className="mb-12 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 overflow-hidden">
                <img src="/logo.png" alt="Querify" className="h-full w-full object-contain" />
              </div>
              <span className="text-xl font-semibold text-foreground">Querify Agent</span>
            </div>

            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/70">
              Analytics workspace
            </p>
            <h1 className="type-display text-foreground">
              Query your data<br />in plain English.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
              Upload CSV or Excel files, connect your preferred LLM, and get instant insights with a full reasoning trace — on any device.
            </p>

            {/* Feature pills */}
            <div className="mt-7 flex flex-wrap gap-2">
              {FEATURES.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground"
                >
                  <Icon size={13} className="text-primary" />
                  {label}
                </span>
              ))}
            </div>

            {/* Stat cards */}
            <div className="mt-10 grid grid-cols-3 gap-4">
              {[
                { end: "12+", label: "LLM Providers", icon: Brain },
                { end: "8",   label: "Export Formats", icon: Layers },
                { end: "99%", label: "Uptime SLA",     icon: Zap },
              ].map(({ end, label, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-card-xs transition-shadow hover:shadow-card">
                  <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                    <Icon size={15} className="text-primary" />
                  </div>
                  <span className="stat-number block">{end}</span>
                  <p className="mt-0.5 type-caption">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Bottom info cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Datasets",  value: "CSV, XLSX, XLS" },
              { label: "Providers", value: "OpenAI, Gemini, Bedrock+" },
              { label: "Output",    value: "Answers, history, insights" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border bg-card p-4 shadow-card-xs transition-shadow hover:shadow-card">
                <p className="type-label">{item.label}</p>
                <p className="mt-1.5 text-sm font-medium text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Right auth panel ──────────────────────────────────────────── */}
        <section className="relative flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-8">

          {/* Mobile logo */}
          <motion.div
            className="mb-8 flex items-center gap-2.5 xl:hidden"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 overflow-hidden">
              <img src="/logo.png" alt="Querify" className="h-full w-full object-contain" />
            </div>
            <span className="text-lg font-semibold text-foreground">Querify Agent</span>
          </motion.div>

          <motion.div
            className="w-full max-w-[380px]"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            {/* Our card — one clean container */}
            <div className="rounded-2xl border border-border bg-card shadow-lg shadow-black/5">
              {/* Tab switcher */}
              <div className="flex border-b border-border">
                {(["sign-in", "sign-up"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={[
                      "flex-1 py-3.5 text-sm font-medium transition-colors first:rounded-tl-2xl last:rounded-tr-2xl",
                      mode === m
                        ? "bg-card text-foreground border-b-2 border-primary"
                        : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70",
                    ].join(" ")}
                  >
                    {m === "sign-in" ? "Log in" : "Sign up"}
                  </button>
                ))}
              </div>

              {/* Clerk form — sits inside our card, its own card chrome is stripped */}
              <div className="p-6">
                {mode === "sign-in" ? (
                  <SignIn
                    routing="hash"
                    appearance={clerkAppearance}
                    fallbackRedirectUrl="/app/dashboard"
                    signUpUrl="/auth"
                  />
                ) : (
                  <SignUp
                    routing="hash"
                    appearance={clerkAppearance}
                    fallbackRedirectUrl="/app/dashboard"
                    signInUrl="/auth"
                  />
                )}
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              By continuing you agree to our{" "}
              <button
                type="button"
                className="text-primary hover:underline underline-offset-2"
                onClick={() => navigate("/terms-and-conditions")}
              >
                Terms
              </button>
              {" "}and{" "}
              <button
                type="button"
                className="text-primary hover:underline underline-offset-2"
                onClick={() => navigate("/privacy-policy")}
              >
                Privacy Policy
              </button>
            </p>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
