import { cn } from "@/lib/utils";

export function ColorBar({ color, className }: { color: string; className: string }) {
  return <span aria-hidden="true" style={{ backgroundColor: color }} className={cn("w-[3px] shrink-0 rounded-[2px]", className)} />;
}
