import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-input/80 bg-background/70 px-3 py-2 text-base",
          "shadow-[inset_0_1px_0_hsl(var(--foreground)/0.03)]",
          "ring-offset-background backdrop-blur-sm",
          "transition-[border-color,box-shadow] duration-150",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground/55",
          "hover:border-input focus-visible:outline-none",
          "focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2",
          "focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.12)]",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
