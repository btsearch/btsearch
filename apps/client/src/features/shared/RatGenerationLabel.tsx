import { cn } from "@/lib/utils";

import { ratToGenLabel } from "./rat";

type RatGenerationLabelProps = {
  rat: string;
  className?: string;
};

export function RatGenerationLabel({ rat, className }: RatGenerationLabelProps) {
  const label = ratToGenLabel(rat);
  if (label === rat) return null;

  return <span className={cn("shrink-0 text-xs font-medium text-muted-foreground", className)}>{label}</span>;
}
