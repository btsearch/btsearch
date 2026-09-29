import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
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

type StationInfoItemSkeletonProps = {
  valueClassName: string;
  lineClassName?: string;
};

export function StationInfoItemSkeleton({ valueClassName, lineClassName = "h-5" }: StationInfoItemSkeletonProps) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Skeleton className="mt-0.5 size-4 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-16 rounded" />
        </div>
        <div className={cn("mt-0.5 flex items-center", lineClassName)}>
          <Skeleton className={cn("h-4 rounded", valueClassName)} />
        </div>
      </div>
    </div>
  );
}
