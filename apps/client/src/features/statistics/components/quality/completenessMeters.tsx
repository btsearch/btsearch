import { useTranslation } from "react-i18next";

import type { CompletenessTotals } from "../../lib/chartData";
import { formatPercent, toPercent } from "../../lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type CompletenessMeter = { key: string; label: string; shortLabel: string; part: number; whole: number; detail: string };

const METER_GRID_CLASS = "grid grid-cols-2 gap-x-5 gap-y-4 @5xl:grid-cols-4 @5xl:gap-x-10";
const SKELETON_METER_COUNT = 4;

function useCompletenessMeters({ stations, cells }: CompletenessTotals): CompletenessMeter[] {
  const { t } = useTranslation("statistics");

  return [
    {
      key: "sectors",
      label: t("completeness.stationsWithSectors"),
      shortLabel: t("completeness.withSectors"),
      part: stations.withSectors,
      whole: stations.total,
      detail: t("completeness.stationsOf", { part: stations.withSectors, count: stations.total }),
    },
    {
      key: "identifiers",
      label: t("completeness.stationsWithExtraIds"),
      shortLabel: t("completeness.withExtraIds"),
      part: stations.withIdentifiers,
      whole: stations.total,
      detail: t("completeness.stationsOf", { part: stations.withIdentifiers, count: stations.total }),
    },
    {
      key: "lte",
      label: t("completeness.lteCellsWithPci"),
      shortLabel: t("completeness.lteWithPci"),
      part: cells.lte.withPci,
      whole: cells.lte.total,
      detail: t("completeness.cellsOf", { part: cells.lte.withPci, count: cells.lte.total }),
    },
    {
      key: "nr",
      label: t("completeness.nrCellsWithPci"),
      shortLabel: t("completeness.nrWithPci"),
      part: cells.nr.withPci,
      whole: cells.nr.total,
      detail: t("completeness.cellsOf", { part: cells.nr.withPci, count: cells.nr.total }),
    },
  ];
}

export function CompletenessMeters({ completeness }: { completeness: CompletenessTotals }) {
  const { t, i18n } = useTranslation("statistics");
  const meters = useCompletenessMeters(completeness);

  return (
    <div>
      <h3 className="text-sm leading-5 font-semibold">{t("completeness.title")}</h3>
      <div className={cn("mt-3.5 sm:mt-4", METER_GRID_CLASS)}>
        {meters.map((meter) => {
          const percent = toPercent(meter.part, meter.whole);
          return (
            <div key={meter.key} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[0.8125rem] leading-5">
                  <span className="@xl:hidden">{meter.shortLabel}</span>
                  <span className="@max-xl:hidden">{meter.label}</span>
                </span>
                <span className="text-base leading-5 font-bold tabular-nums">{formatPercent(percent, i18n.language, 0)}</span>
              </div>
              <div
                role="meter"
                aria-label={meter.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
                className="mt-2 h-1.5 overflow-hidden rounded-[3px] bg-muted"
              >
                <span className="block h-full rounded-[3px] bg-primary" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-1.5 truncate text-xs leading-4 text-muted-foreground tabular-nums">{meter.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CompletenessMetersSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-3.5 w-28" />
      <div className={cn("mt-4", METER_GRID_CLASS)}>
        {Array.from({ length: SKELETON_METER_COUNT }, (_, index) => (
          <div key={index}>
            <Skeleton className="h-3 w-32 max-w-full" />
            <Skeleton className="mt-3 h-1.5 w-full rounded-[3px]" />
            <Skeleton className="mt-2 h-2.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
