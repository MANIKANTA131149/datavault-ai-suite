import { Rows3, Rows4 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type Density = "comfortable" | "compact";

interface DensityToggleProps {
  value: Density;
  onValueChange: (value: Density) => void;
  /** Hide the text label on tight toolbars. */
  showLabel?: boolean;
  className?: string;
}

export function DensityToggle({
  value,
  onValueChange,
  showLabel = true,
  className,
}: DensityToggleProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showLabel && (
        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
          Density
        </span>
      )}
      <ToggleGroup
        type="single"
        size="sm"
        value={value}
        onValueChange={(v) => {
          if (v) onValueChange(v as Density);
        }}
        className="rounded-lg border border-border/60 bg-background/50 p-0.5"
      >
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="comfortable"
              aria-label="Comfortable density"
              className="h-7 w-7 rounded-md p-0 data-[state=on]:bg-muted"
            >
              <Rows3 size={13} />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">Comfortable spacing</TooltipContent>
        </Tooltip>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="compact"
              aria-label="Compact density"
              className="h-7 w-7 rounded-md p-0 data-[state=on]:bg-muted"
            >
              <Rows4 size={13} />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">Compact spacing</TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </div>
  );
}
