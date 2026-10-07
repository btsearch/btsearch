import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import type { FloatingDialogPanelFrameProps } from "@/features/floating-dialogs/types";
import { cn } from "@/lib/utils";

export function AntennaDialogFallback({ className, contentClassName, style, headerDragProps }: FloatingDialogPanelFrameProps) {
  const { t } = useTranslation("common");

  return (
    <div className={cn("relative", className)} style={style}>
      <div
        className={cn(
          "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl bg-background shadow-2xl",
          contentClassName,
        )}
      >
        <div {...headerDragProps} className={cn("shrink-0 space-y-2 border-b px-4 py-3 sm:px-6 sm:py-3.5", headerDragProps?.className)}>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-28" />
        </div>
        <output className="block space-y-3 p-4" aria-label={t("actions.loading")}>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </output>
      </div>
    </div>
  );
}
