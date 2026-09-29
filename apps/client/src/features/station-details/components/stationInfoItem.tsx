import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StationInfoItemProps = {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  className?: string;
};

export function StationInfoItem({ icon, label, children, className }: StationInfoItemProps) {
  return (
    <div className={cn("flex min-w-0 items-start gap-3", className)}>
      <span className="mt-0.5 flex shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <span className="block text-xs leading-4 text-muted-foreground">{label}</span>
        <div className="group/copy mt-0.5 flex min-h-5 min-w-0 flex-wrap items-center gap-1.5 text-sm font-medium">{children}</div>
      </div>
    </div>
  );
}
