/**
 * Shared filter toolbar + active-filter chips.
 *
 * Fully controlled: all search/filter state stays in the page's existing
 * useState/store. This component holds zero state of its own.
 *
 * Table conventions used across the app:
 *   <div className="page-table-wrap data-table-sticky"> > shadcn <Table>
 *   > data-table-header/row/cell classes
 *   > <EmptyState compact> when zero rows
 *   > ui/pagination.tsx footer when paginated.
 */
import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Value treated as "no filter" — chip hidden, default "all". */
  allValue?: string;
}

interface FilterToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  /** The page's existing filter state object, unchanged. */
  values?: Record<string, string>;
  onValueChange?: (key: string, value: string) => void;
  onClearAll?: () => void;
  /** Density toggle, view switch, primary action button, etc. */
  trailing?: ReactNode;
  className?: string;
}

export function FilterToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters = [],
  values = {},
  onValueChange,
  onClearAll,
  trailing,
  className,
}: FilterToolbarProps) {
  const activeFilters = filters.filter(
    (f) => values[f.key] && values[f.key] !== (f.allValue ?? "all"),
  );
  const hasActive = activeFilters.length > 0 || search.trim().length > 0;

  return (
    <div className={cn("toolbar-panel space-y-3", className)}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
        {/* Search wrapped in input-group for enhanced focus ring */}
        <div className="input-group relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 border-0 bg-transparent pl-9 pr-8 shadow-none focus-visible:ring-0"
          />
          {search.trim().length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter selects */}
        {filters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((f) => (
              <Select
                key={f.key}
                value={values[f.key] ?? (f.allValue ?? "all")}
                onValueChange={(v) => onValueChange?.(f.key, v)}
              >
                <SelectTrigger className="h-9 w-auto min-w-[120px] gap-1.5 text-xs">
                  <span className="text-muted-foreground">{f.label}:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          </div>
        )}

        {/* Trailing actions + active filter count badge */}
        <div className="flex shrink-0 items-center gap-2">
          {activeFilters.length > 0 && (
            <span className="status-badge-neutral tabular-nums">
              {activeFilters.length} filter{activeFilters.length !== 1 ? "s" : ""}
            </span>
          )}
          {trailing}
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <ActiveFilterChips
          chips={activeFilters.map((f) => ({
            key: f.key,
            label: f.label,
            value:
              f.options.find((o) => o.value === values[f.key])?.label ?? values[f.key],
          }))}
          onDismiss={(key) => {
            const def = filters.find((f) => f.key === key);
            onValueChange?.(key, def?.allValue ?? "all");
          }}
          onClearAll={hasActive && onClearAll ? onClearAll : undefined}
        />
      )}
    </div>
  );
}

interface ActiveFilterChipsProps {
  chips: { key: string; label: string; value: string }[];
  onDismiss: (key: string) => void;
  onClearAll?: () => void;
  className?: string;
}

export function ActiveFilterChips({
  chips,
  onDismiss,
  onClearAll,
  className,
}: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip) => (
        <span key={chip.key} className="filter-chip">
          <span className="text-muted-foreground">{chip.label}:</span>
          <span>{chip.value}</span>
          <button
            type="button"
            aria-label={`Remove ${chip.label} filter`}
            onClick={() => onDismiss(chip.key)}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      {onClearAll && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
