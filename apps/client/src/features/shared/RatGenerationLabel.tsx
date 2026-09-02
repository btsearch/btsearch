import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { ratToGenLabel } from "./rat";

type GenerationTagProps = {
  children: ReactNode;
  active?: boolean;
  className?: string;
};

export function GenerationTag({ children, active = false, className }: GenerationTagProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm px-1 font-mono text-[10px] font-semibold leading-4",
        active ? "bg-primary-foreground text-primary" : "bg-foreground/10 text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

type RatGenerationLabelProps = {
  rat: string;
  className?: string;
};

export function RatGenerationLabel({ rat, className }: RatGenerationLabelProps) {
  const label = ratToGenLabel(rat);
  if (label === rat) return null;

  return <GenerationTag className={className}>{label}</GenerationTag>;
}
