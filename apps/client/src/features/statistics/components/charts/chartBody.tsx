import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ChartBodyProps = {
  heightClassName: string;
  isError: boolean;
  isEmpty: boolean;
  onRetry: () => unknown;
  isRetrying: boolean;
  children: ReactNode;
};

export function ChartBody({ heightClassName, isError, isEmpty, onRetry, isRetrying, children }: ChartBodyProps) {
  const { t } = useTranslation("common");

  if (isError) {
    return (
      <div className={cn("mt-4 flex items-center justify-center", heightClassName)}>
        <ErrorState onRetry={onRetry} isRetrying={isRetrying} className="w-full" />
      </div>
    );
  }
  if (isEmpty) {
    return <div className={cn("mt-4 flex items-center justify-center text-xs text-muted-foreground", heightClassName)}>{t("empty.data")}</div>;
  }
  return <div className="mt-4 min-w-0">{children}</div>;
}

export function ChartBlockSkeleton({ heightClassName }: { heightClassName: string }) {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-3.5 w-36" />
      <Skeleton className={cn("mt-5 w-full", heightClassName)} />
    </div>
  );
}
