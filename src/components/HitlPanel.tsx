import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HelpCircle,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Loader2,
  MessageSquare,
  X,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { parseOptionsFromText, cleanPromptText } from "@/lib/clarification-options";

function renderPlainPrompt(text: string) {
  if (typeof text !== "string" || !text.trim()) return null;
  return (
    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {text}
    </p>
  );
}

export interface HitlPanelState {
  kind: "clarification" | "approval";
  prompt: string;
  options?: string[];
  details?: { rowCount?: number; operation?: string; sql?: string; options?: string[] };
}

interface HitlChoicePickerProps {
  options: string[];
  onSelect: (value: string) => void;
  pendingValue?: string | null;
  compact?: boolean;
}

export function HitlChoicePicker({ options, onSelect, pendingValue, compact }: HitlChoicePickerProps) {
  const useGrid = options.length >= 4 && !compact;

  return (
    <div
      className={cn(
        "gap-2.5",
        useGrid ? "grid grid-cols-1 sm:grid-cols-2" : "flex flex-col"
      )}
      role="listbox"
      aria-label="Choose an option"
    >
      {options.map((opt, idx) => {
        const isPending = pendingValue === opt;
        const shortcut = idx < 9 ? String(idx + 1) : null;

        return (
          <motion.button
            key={`${idx}-${opt.slice(0, 32)}`}
            type="button"
            role="option"
            disabled={!!pendingValue}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.22 }}
            onClick={() => onSelect(opt)}
            className={cn(
              "group relative w-full min-w-0 text-left rounded-xl border transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              compact ? "px-3 py-2.5" : "px-4 py-3.5 min-h-[3.25rem]",
              isPending
                ? "border-primary bg-primary/15 shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                : "border-border/70 bg-card/80 hover:border-primary/45 hover:bg-primary/[0.07] hover:shadow-md hover:shadow-primary/5 active:scale-[0.99]"
            )}
          >
            <span className="flex items-center gap-3 min-w-0 w-full">
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-lg font-semibold tabular-nums transition-colors",
                  compact ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs",
                  isPending
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary"
                )}
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : shortcut}
              </span>
              <span
                className={cn(
                  "flex-1 min-w-0 font-medium leading-snug break-words [overflow-wrap:anywhere]",
                  compact ? "text-xs" : "text-sm",
                  isPending ? "text-foreground" : "text-foreground/90 group-hover:text-foreground"
                )}
              >
                {opt}
              </span>
              {!isPending && (
                <ChevronRight
                  className={cn(
                    "shrink-0 text-muted-foreground/50 transition-all duration-200",
                    "group-hover:text-primary group-hover:translate-x-0.5",
                    compact ? "h-3.5 w-3.5" : "h-4 w-4"
                  )}
                />
              )}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

interface HitlPanelProps {
  state: HitlPanelState;
  onSubmit: (value: string) => void;
  onStop: () => void;
  compact?: boolean;
}

export function HitlPanel({ state, onSubmit, onStop, compact = true }: HitlPanelProps) {
  const [reply, setReply] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);

  const isClarification = state.kind === "clarification";

  const choiceOptions = useMemo(() => {
    if (!isClarification) return [];
    if (state.options?.length) return state.options;
    if (state.details?.options?.length) return state.details.options;
    return parseOptionsFromText(state.prompt);
  }, [isClarification, state.options, state.details?.options, state.prompt]);

  const promptText = useMemo(() => {
    if (!isClarification) return state.prompt;
    return cleanPromptText(state.prompt, choiceOptions);
  }, [isClarification, state.prompt, choiceOptions]);

  const handleChoice = (value: string) => {
    setPendingChoice(value);
    window.setTimeout(() => onSubmit(value), 120);
  };

  const handleCustomSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!reply.trim()) return;
    setPendingChoice(reply.trim());
    window.setTimeout(() => onSubmit(reply.trim()), 120);
  };

  const isSubmitDisabled = !reply.trim() || !!pendingChoice;

  useEffect(() => {
    if (!isClarification || choiceOptions.length === 0 || pendingChoice) return;

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const num = parseInt(e.key, 10);
      const option = num >= 1 && num <= 9 ? choiceOptions[num - 1] : undefined;
      if (!option) return;
      e.preventDefault();
      setPendingChoice(option);
      window.setTimeout(() => onSubmit(option), 120);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isClarification, choiceOptions, pendingChoice, onSubmit]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="hitl-panel-root w-full min-w-0 px-0 sm:px-1"
    >
      <div
        className={cn(
          "relative w-full min-w-0 overflow-hidden rounded-xl border shadow-lg backdrop-blur-md transition-all duration-200",
          isClarification
            ? "border-primary/20 bg-card/95 shadow-primary/5 dark:shadow-none"
            : "border-amber-500/25 bg-card/95 shadow-amber-500/5 dark:shadow-none"
        )}
      >
        {/* Accent bar */}
        <div
          className={cn(
            "h-[3px] w-full",
            isClarification
              ? "bg-primary"
              : "bg-amber-500"
          )}
        />

        <div className={cn("min-w-0 w-full", compact ? "p-3.5 space-y-3.5" : "p-5 sm:p-6 space-y-5")}>
          {/* Header */}
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-lg ring-1",
                  compact ? "h-8 w-8" : "h-10 w-10",
                  isClarification
                    ? "bg-primary/10 text-primary ring-primary/15"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20"
                )}
              >
                {isClarification ? (
                  <MessageSquare className={cn("shrink-0", compact ? "h-4 w-4" : "h-5 w-5")} />
                ) : (
                  <AlertTriangle className={cn("shrink-0", compact ? "h-4 w-4" : "h-5 w-5")} />
                )}
              </div>

              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={cn("font-bold text-foreground tracking-tight", compact ? "text-xs sm:text-sm" : "text-base")}>
                    {isClarification ? "Help us clarify" : "Large query approval"}
                  </h3>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                      isClarification
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                    )}
                  >
                    Action Needed
                  </span>
                </div>
                {!compact && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isClarification
                      ? "Select one of the choices or type a custom reply."
                      : "Confirm whether you wish to execute this large-scale query."}
                  </p>
                )}
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onStop}
              className={cn("shrink-0 rounded-full text-muted-foreground hover:text-foreground", compact ? "h-7 w-7" : "h-9 w-9")}
              aria-label="Stop query"
            >
              <X className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
            </Button>
          </div>

          {/* Question / Prompt Box */}
          <div
            className={cn(
              "rounded-lg border min-w-0",
              compact
                ? "border-border/40 bg-muted/10 px-3 py-2.5"
                : "border-border/60 bg-muted/20 px-4 py-3.5"
            )}
          >
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
              <HelpCircle className="h-3 w-3 shrink-0" />
              {isClarification ? "Agent Clarification Question" : "Database Gate Prompt"}
            </p>
            <div className={cn("leading-relaxed text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]", compact ? "text-xs font-medium" : "text-sm")}>
              {promptText || state.prompt}
            </div>
          </div>

          {/* Approval details */}
          {!isClarification && state.details && (
            <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-3 space-y-2 text-xs min-w-0">
              <div className="flex justify-between gap-2 border-b border-border/40 pb-1.5">
                <span className="text-muted-foreground">Operation type</span>
                <span className="font-medium text-foreground">{state.details.operation || "query"}</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-border/40 pb-1.5">
                <span className="text-muted-foreground">Approx. row count</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                  {state.details.rowCount?.toLocaleString() ?? "—"}
                </span>
              </div>
              {state.details.sql && (
                <div className="space-y-1.5 min-w-0">
                  <span className="text-[10px] font-semibold text-muted-foreground">SQL Query Preview</span>
                  <pre className="max-h-28 overflow-auto rounded-md border border-border/40 bg-background/90 p-2 text-[10px] font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap break-all scrollbar-thin">
                    {state.details.sql}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Choices */}
          {isClarification && choiceOptions.length > 0 && (
            <div className="space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("font-bold text-foreground flex items-center gap-1", compact ? "text-[11px]" : "text-xs")}>
                  <Sparkles className="h-3 w-3 text-primary shrink-0" />
                  Suggested Options
                </p>
                <span className="text-[9px] text-muted-foreground font-medium">
                  Press keys <kbd className="hitl-kbd">1</kbd>–<kbd className="hitl-kbd">{Math.min(choiceOptions.length, 9)}</kbd>
                </span>
              </div>
              <div className={cn("overflow-y-auto overflow-x-hidden pr-0.5 scrollbar-thin", compact ? "max-h-48" : "max-h-64")}>
                <HitlChoicePicker
                  options={choiceOptions}
                  onSelect={handleChoice}
                  pendingValue={pendingChoice}
                  compact={compact}
                />
              </div>
            </div>
          )}

          {/* Custom user answer inputs */}
          {isClarification && (
            <div className={cn("space-y-2 min-w-0 border-t border-border/40", compact ? "pt-2.5" : "pt-4")}>
              {choiceOptions.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowCustom((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors py-1 focus:outline-none"
                >
                  <span>Or enter custom reply</span>
                  <ChevronRight
                    className={cn("h-3 w-3 transition-transform duration-200", showCustom && "rotate-90")}
                  />
                </button>
              ) : (
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Your custom reply</Label>
              )}

              <AnimatePresence initial={false}>
                {(showCustom || choiceOptions.length === 0) && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onSubmit={handleCustomSubmit}
                    className="overflow-hidden space-y-2"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center min-w-0">
                      <Input
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Type standard or custom answer here..."
                        disabled={!!pendingChoice}
                        className={cn(
                          "flex-1 min-w-0 border-border bg-background focus-visible:ring-1 focus-visible:ring-primary",
                          compact ? "h-9 text-xs rounded-lg" : "h-11 text-sm rounded-xl"
                        )}
                        autoFocus={choiceOptions.length === 0}
                        onKeyDown={(e) => {
                          const num = parseInt(e.key, 10);
                          if (e.key >= "1" && e.key <= "9" && choiceOptions[num - 1]) {
                            e.preventDefault();
                            handleChoice(choiceOptions[num - 1]);
                          }
                        }}
                      />
                      <div className="flex gap-2 shrink-0">
                        <Button
                          type="submit"
                          disabled={isSubmitDisabled}
                          className={cn("font-bold", compact ? "h-9 text-xs rounded-lg px-3.5" : "h-11 text-sm rounded-xl px-5")}
                        >
                          {pendingChoice ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              Submit <ArrowRight className="h-3 w-3 ml-1 shrink-0" />
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={onStop}
                          className={cn("font-semibold border-border", compact ? "h-9 text-xs rounded-lg px-3" : "h-11 text-sm rounded-xl px-4")}
                        >
                          Stop
                        </Button>
                      </div>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {choiceOptions.length > 0 && !showCustom && (
                <p className="text-[9px] text-center text-muted-foreground">
                  Press keys 1–{Math.min(choiceOptions.length, 9)} to instantly select an option, or expand above to enter custom text
                </p>
              )}
            </div>
          )}

          {/* Large Query Approval Actions */}
          {!isClarification && (
            <div className={cn("flex flex-col gap-2 sm:flex-row pt-1", compact ? "" : "sm:flex-wrap")}>
              <Button
                type="button"
                onClick={() => onSubmit("approve")}
                className={cn(
                  "flex-1 font-bold text-white shadow-md bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10",
                  compact ? "h-9.5 text-xs rounded-lg gap-1.5" : "h-12 text-sm rounded-xl gap-2 shadow-lg shadow-emerald-600/20"
                )}
              >
                <ShieldCheck className={cn("shrink-0", compact ? "h-4 w-4" : "h-5 w-5")} />
                Approve & Execute
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onSubmit("reject")}
                className={cn("flex-1 font-semibold border-border", compact ? "h-9.5 text-xs rounded-lg" : "h-12 text-sm rounded-xl")}
              >
                Cancel Query
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface HitlQuickChoicesProps {
  options: string[];
  onSubmit: (value: string) => void;
}

/** Compact follow-up choices on completed results */
export function HitlQuickChoices({ options, onSubmit }: HitlQuickChoicesProps) {
  const [pending, setPending] = useState<string | null>(null);

  return (
    <div className="mt-4 rounded-xl border border-primary/15 bg-gradient-to-b from-primary/[0.06] to-transparent p-4 space-y-3 min-w-0 overflow-hidden">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Continue with a quick pick
      </p>
      <HitlChoicePicker
        options={options}
        compact
        pendingValue={pending}
        onSelect={(v) => {
          setPending(v);
          window.setTimeout(() => onSubmit(v), 120);
        }}
      />
    </div>
  );
}
