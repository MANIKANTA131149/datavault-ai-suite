import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Global keyboard-shortcuts reference. Opens on "?" (Shift+/) when the user
 * isn't typing in a field. Purely additive — it reflects shortcuts that the
 * app already wires up elsewhere (command palette, navigation), it does not
 * register or change any of them.
 */

const SHORTCUT_GROUPS: { heading: string; items: { keys: string[]; label: string }[] }[] = [
  {
    heading: "General",
    items: [
      { keys: ["⌘", "K"], label: "Open command palette" },
      { keys: ["⌘", "Q"], label: "New query" },
      { keys: ["?"], label: "Show this shortcuts panel" },
      { keys: ["Esc"], label: "Close dialogs & panels" },
    ],
  },
  {
    heading: "Navigation",
    items: [
      { keys: ["↑", "↓"], label: "Move through command palette" },
      { keys: ["↵"], label: "Open the highlighted result" },
    ],
  },
  {
    heading: "Query workspace",
    items: [
      { keys: ["⌘", "↵"], label: "Run the current query" },
      { keys: ["⌘", "C"], label: "Copy a selected result cell" },
    ],
  },
];

export function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // "?" is Shift + "/". Ignore while typing.
      if (e.key !== "?") return;
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t?.isContentEditable
      ) return;
      e.preventDefault();
      setOpen((p) => !p);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-background-secondary border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Keyboard size={14} className="text-primary" />
            </span>
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>Move faster across the workspace.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="type-label mb-2">{group.heading}</p>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="flex h-6 min-w-[24px] items-center justify-center rounded-md border border-border/60 bg-card px-1.5 font-mono text-[11px] font-medium text-foreground shadow-card-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
