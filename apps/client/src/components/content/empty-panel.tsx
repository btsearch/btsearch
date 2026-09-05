import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyPanelProps = {
  children: ReactNode;
  className?: string;
};

export function EmptyPanel({ children, className }: EmptyPanelProps) {
  return (
    <div
      className={cn("border rounded-xl h-full min-h-32 flex items-center justify-center text-sm text-muted-foreground text-center px-4", className)}
    >
      {children}
    </div>
  );
}
