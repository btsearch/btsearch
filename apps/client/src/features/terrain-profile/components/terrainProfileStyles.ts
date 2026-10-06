import { cn } from "@/lib/utils";

export const FIGURE_SIZE_CLASS = { regular: "min-h-57 flex-1", compact: "h-53.5" } as const;
export const PLOT_SIZE_CLASS = { regular: "min-h-51 flex-1", compact: "h-47.5" } as const;

const STALE_TEXT_TRANSITION_CLASS = "transition-[color] duration-150 ease-[ease] motion-reduce:transition-none";
const STALE_FIGURE_TRANSITION_CLASS = "transition-[filter] duration-150 ease-[ease] motion-reduce:transition-none";

export function getStaleTextClassName(isStale: boolean, freshClassName?: string): string {
  return cn(STALE_TEXT_TRANSITION_CLASS, isStale ? "text-muted-foreground" : freshClassName);
}

export function getStaleFigureClassName(isStale: boolean): string {
  return cn(STALE_FIGURE_TRANSITION_CLASS, isStale ? "grayscale" : null);
}
