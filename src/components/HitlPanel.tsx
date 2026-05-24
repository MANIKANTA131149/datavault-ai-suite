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
}

export function HitlPanel({ state, onSubmit, onStop }: HitlPanelProps) {
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="hitl-panel-root w-full min-w-0 px-0 sm:px-2"
    >
      <div
        className={cn(
          "relative w-full min-w-0 overflow-hidden rounded-2xl border shadow-xl backdrop-blur-xl",
          isClarification
            ? "border-primary/20 bg-gradient-to-b from-card via-card to-primary/[0.04] shadow-primary/10"
            : "border-amber-500/25 bg-gradient-to-b from-card via-card to-amber-500/[0.06] shadow-amber-500/10"
        )}
      >
        {/* Accent bar */}
        <div
          className={cn(
            "h-1 w-full",
            isClarification
              ? "bg-gradient-to-r from-primary/60 via-primary to-primary/60"
              : "bg-gradient-to-r from-amber-500/60 via-amber-500 to-amber-500/60"
          )}
        />

        <div className="p-4 sm:p-5 md:p-6 space-y-5 min-w-0">
          {/* Header — stacks on narrow screens */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4 min-w-0">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1",
                isClarification
                  ? "bg-primary/12 text-primary ring-primary/20"
                  : "bg-amber-500/12 text-amber-600 dark:text-amber-400 ring-amber-500/25"
              )}
            >
              {isClarification ? <MessageSquare className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
                  {isClarification ? "Help us narrow this down" : "Confirm large query"}
                </h3>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    isClarification
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25"
                  )}
                >
                  Your input needed
                </span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {isClarification
                  ? "Pick the closest match below — we’ll continue your query right away."
                  : "This operation touches a large dataset. Approve only if you’re ready to run it."}
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onStop}
              className="shrink-0 self-end sm:self-start h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Stop query"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Question */}
          <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3.5 sm:px-5 sm:py-4 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
              <HelpCircle className="h-3 w-3" />
              {isClarification ? "Question" : "Summary"}
            </p>
            {renderPlainPrompt(promptText || state.prompt)}
          </div>

          {/* Approval details */}
          {!isClarification && state.details && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 space-y-3 text-sm min-w-0">
              <div className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Operation</span>
                <span className="font-medium text-foreground">{state.details.operation || "query"}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Estimated rows</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                  {state.details.rowCount?.toLocaleString() ?? "—"}
                </span>
              </div>
              {state.details.sql && (
                <div className="space-y-2 min-w-0">
                  <span className="text-xs text-muted-foreground">SQL preview</span>
                  <pre className="max-h-40 overflow-auto rounded-lg border border-border/60 bg-background/80 p-3 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all scrollbar-thin">
                    {state.details.sql}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Choices */}
          {isClarification && choiceOptions.length > 0 && (
            <div className="space-y-3 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Suggested answers
                </p>
                <span className="text-[10px] text-muted-foreground">
                  Tap a card or press <kbd className="hitl-kbd">1</kbd>–<kbd className="hitl-kbd">{Math.min(choiceOptions.length, 9)}</kbd>
                </span>
              </div>
              <div className="max-h-[min(22rem,50vh)] overflow-y-auto overflow-x-hidden pr-0.5 scrollbar-thin -mr-0.5">
                <HitlChoicePicker
                  options={choiceOptions}
                  onSelect={handleChoice}
                  pendingValue={pendingChoice}
                />
              </div>
            </div>
          )}

          {/* Clarification: custom answer */}
          {isClarification && (
            <div className="space-y-3 min-w-0 border-t border-border/40 pt-4">
              {choiceOptions.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowCustom((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  <span>Something else?</span>
                  <ChevronRight
                    className={cn("h-4 w-4 transition-transform", showCustom && "rotate-90")}
                  />
                </button>
              ) : (
                <Label className="text-xs text-muted-foreground">Your answer</Label>
              )}

              <AnimatePresence initial={false}>
                {(showCustom || choiceOptions.length === 0) && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onSubmit={handleCustomSubmit}
                    className="overflow-hidden space-y-2"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center min-w-0">
                      <Input
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Type your own answer…"
                        disabled={!!pendingChoice}
                        className="flex-1 min-w-0 h-11 rounded-xl border-border/80 bg-background/80 text-sm"
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
                          className="h-11 flex-1 sm:flex-none rounded-xl gap-1.5 px-5"
                        >
                          {pendingChoice ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              Continue <ArrowRight className="h-4 w-4" />
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={onStop}
                          className="h-11 rounded-xl px-4"
                        >
                          Stop
                        </Button>
                      </div>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {choiceOptions.length > 0 && !showCustom && (
                <p className="text-[10px] text-center text-muted-foreground">
                  Or expand “Something else?” to type a custom reply
                </p>
              )}
            </div>
          )}

          {/* Approval actions */}
          {!isClarification && (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap pt-1">
              <Button
                type="button"
                onClick={() => onSubmit("approve")}
                className="h-12 flex-1 rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 text-sm font-semibold"
              >
                <ShieldCheck className="h-5 w-5" />
                Run query
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onSubmit("reject")}
                className="h-12 flex-1 rounded-xl border-border text-sm font-medium"
              >
                Cancel
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
