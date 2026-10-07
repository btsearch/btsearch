import { useTranslation } from "react-i18next";

import { StationOverviewCardSkeleton } from "../overview/stationOverviewCard";
import { Skeleton } from "@/components/ui/skeleton";

const TABLE_CARDS = [1, 2];
const TABLE_ROWS = [1, 2, 3];

type StationBodySkeletonProps = {
  tabCount: number;
  showInfoCard: boolean;
};

export function StationBodySkeleton({ tabCount, showInfoCard }: StationBodySkeletonProps) {
  const { t } = useTranslation("common");

  return (
    <output className="block px-3 py-4 space-y-6 sm:p-6 sm:space-y-8" aria-label={t("actions.loading")}>
      <div
        className="grid gap-1 rounded-full bg-muted/60 p-1 ring-1 ring-inset ring-border/50"
        style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: tabCount }, (_, index) => (
          <div key={`skeleton-tab-${index}`} className="flex h-9 items-center justify-center gap-2 px-2 sm:px-3">
            <Skeleton className="size-5 rounded sm:size-4" />
            <Skeleton className="h-4 w-16 rounded hidden sm:block" />
          </div>
        ))}
      </div>
      <div className="space-y-8">
        {showInfoCard ? <StationOverviewCardSkeleton /> : null}
        <section>
          <div className="mb-3 flex h-5 items-center">
            <Skeleton className="h-4 w-24 rounded" />
          </div>
          <div className="space-y-4">
            {TABLE_CARDS.map((card) => (
              <div key={`skeleton-card-${card}`} className="rounded-xl border overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
                  <Skeleton className="size-4 rounded" />
                  <Skeleton className="h-4 w-12 rounded" />
                  <Skeleton className="h-3 w-16 rounded ml-auto" />
                </div>
                <div className="p-4 space-y-3">
                  {TABLE_ROWS.map((row) => (
                    <div key={`skeleton-row-${row}`} className="flex gap-4">
                      <Skeleton className="h-4 w-20 rounded" />
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-4 w-32 rounded" />
                      <Skeleton className="h-4 w-24 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </output>
  );
}
