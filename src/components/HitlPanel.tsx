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
}

export function HitlChoicePicker({ options, onSelect, pendingValue }: HitlChoicePickerProps) {
  return (
    <div className="flex flex-col gap-1.5" role="listbox" aria-label="Choose an option">
      {options.map((opt, idx) => {
        const isPending = pendingValue === opt;
        const shortcut = idx < 9 ? String(idx + 1) : null;
        return (
          <motion.button
            key={`${idx}-${opt.slice(0, 32)}`}
            type="button"
            role="option"
            disabled={!!pendingValue}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.03, duration: 0.18 }}
            onClick={() => onSelect(opt)}
            className={cn(
              "group relative w-full min-w-0 text-left rounded-lg border transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
              "px-2.5 py-2",
              isPending
                ? "border-primary bg-primary/10"
                : "border-border/60 bg-card/60 hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99]"
            )}
          >
            <span className="flex items-center gap-2 min-w-0 w-full">
              <span className={cn(
                "flex shrink-0 items-center justify-center rounded-md font-semibold tabular-nums text-[10px] h-5 w-5 transition-colors",
                isPending ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary"
              )}>
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : shortcut}
              </span>
              <span className="flex-1 min-w-0 text-xs font-medium leading-snug break-words [overflow-wrap:anywhere] text-foreground/90 group-hover:text-foreground">
                {opt}
              </span>
              {!isPending && <ChevronRight className="shrink-0 h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />}
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className="w-full min-w-0"
    >
      <div className={cn(
        "relative w-full min-w-0 overflow-hidden rounded-xl border backdrop-blur-sm",
        isClarification
          ? "border-primary/20 bg-card/95"
          : "border-amber-500/25 bg-card/95"
      )}>
        {/* Accent bar */}
        <div className={cn("h-[2px] w-full", isClarification ? "bg-primary" : "bg-amber-500")} />

        <div className="p-3 space-y-2.5 min-w-0 w-full">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className={cn(
                "flex shrink-0 items-center justify-center rounded-lg h-7 w-7 ring-1",
                isClarification
                  ? "bg-primary/10 text-primary ring-primary/15"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20"
              )}>
                {isClarification
                  ? <MessageSquare className="h-3.5 w-3.5" />
                  : <AlertTriangle className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">
                    {isClarification ? "Clarification needed" : "Approval needed"}
                  </span>
                  <span className={cn(
                    "inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider border",
                    isClarification
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                  )}>
                    Action needed
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onStop}
              className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Stop query"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Prompt */}
          <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <HelpCircle className="h-2.5 w-2.5 shrink-0" />
              {isClarification ? "Question" : "Prompt"}
            </p>
            <p className="text-xs leading-relaxed text-foreground break-words [overflow-wrap:anywhere]">
              {promptText || state.prompt}
            </p>
          </div>

          {/* Approval details */}
          {!isClarification && state.details && (
            <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 p-2.5 space-y-1.5 text-xs min-w-0">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Operation</span>
                <span className="font-medium text-foreground">{state.details.operation || "query"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Row count</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                  {state.details.rowCount?.toLocaleString() ?? "—"}
                </span>
              </div>
              {state.details.sql && (
                <pre className="max-h-20 overflow-auto rounded border border-border/40 bg-background/80 p-2 text-[10px] font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap break-all scrollbar-thin">
                  {state.details.sql}
                </pre>
              )}
            </div>
          )}

          {/* Choices */}
          {isClarification && choiceOptions.length > 0 && (
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold text-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary shrink-0" /> Options
                </p>
                <span className="text-[9px] text-muted-foreground">
                  Press <kbd className="hitl-kbd">1</kbd>–<kbd className="hitl-kbd">{Math.min(choiceOptions.length, 9)}</kbd>
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto overflow-x-hidden scrollbar-thin">
                <HitlChoicePicker options={choiceOptions} onSelect={handleChoice} pendingValue={pendingChoice} />
              </div>
            </div>
          )}

          {/* Custom reply */}
          {isClarification && (
            <div className="border-t border-border/30 pt-2 space-y-1.5 min-w-0">
              {choiceOptions.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowCustom((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors py-0.5"
                >
                  <span>Custom reply</span>
                  <ChevronRight className={cn("h-3 w-3 transition-transform duration-150", showCustom && "rotate-90")} />
                </button>
              ) : (
                <Label className="text-[10px] font-semibold text-muted-foreground">Your reply</Label>
              )}
              <AnimatePresence initial={false}>
                {(showCustom || choiceOptions.length === 0) && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    onSubmit={handleCustomSubmit}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-2 items-center min-w-0 pt-1">
                      <Input
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Type your answer..."
                        disabled={!!pendingChoice}
                        className="flex-1 min-w-0 h-8 text-xs rounded-lg border-border"
                        autoFocus={choiceOptions.length === 0}
                      />
                      <Button type="submit" disabled={!reply.trim() || !!pendingChoice} className="h-8 text-xs rounded-lg px-3 shrink-0">
                        {pendingChoice ? <Loader2 className="h-3 w-3 animate-spin" /> : <>Send <ArrowRight className="h-3 w-3 ml-1" /></>}
                      </Button>
                      <Button type="button" variant="outline" onClick={onStop} className="h-8 text-xs rounded-lg px-2.5 shrink-0 border-border">
                        Stop
                      </Button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Approval actions */}
          {!isClarification && (
            <div className="flex gap-2 pt-0.5">
              <Button
                type="button"
                onClick={() => onSubmit("approve")}
                className="flex-1 h-8 text-xs rounded-lg font-semibold text-white bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              >
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onSubmit("reject")}
                className="flex-1 h-8 text-xs rounded-lg font-semibold border-border"
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

export function HitlQuickChoices({ options, onSubmit }: HitlQuickChoicesProps) {
  const [pending, setPending] = useState<string | null>(null);
  return (
    <div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-3 space-y-2 min-w-0 overflow-hidden">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-primary" /> Continue with a quick pick
      </p>
      <HitlChoicePicker
        options={options}
        pendingValue={pending}
        onSelect={(v) => { setPending(v); window.setTimeout(() => onSubmit(v), 120); }}
      />
    </div>
  );
}
