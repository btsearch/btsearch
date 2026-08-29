import { memo } from "react";

import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { cn } from "@/lib/utils";

export const RAT_COLORS = {
  GSM: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  UMTS: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  LTE: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  NR: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
} as const;

export type Rat = keyof typeof RAT_COLORS;

interface RatBadgeProps {
  rat: string;
  className?: string;
  showTechName?: boolean;
}

export const RatBadge = memo(({ rat, className, showTechName }: RatBadgeProps) => {
  const color = RAT_COLORS[rat as Rat];
  if (!color) {
    return <span className="font-mono text-[10px] text-muted-foreground">{rat}</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium", color, className)}>
      <RatGenerationLabel rat={rat} className="text-[10px] text-current opacity-70" />
      {showTechName ? rat : null}
    </span>
  );
});
