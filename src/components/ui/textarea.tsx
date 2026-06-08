import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-xl border border-input/80 bg-background/70 px-3 py-2 text-sm",
        "shadow-[inset_0_1px_0_hsl(var(--foreground)/0.03)]",
        "ring-offset-background backdrop-blur-sm",
        "transition-[border-color,box-shadow] duration-150 resize-y",
        "placeholder:text-muted-foreground/55",
        "hover:border-input",
        "focus-visible:outline-none focus-visible:border-primary/50",
        "focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2",
        "focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.12)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
