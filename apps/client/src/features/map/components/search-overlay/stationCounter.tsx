import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { MapCountries } from "../../data/mapCountries";
import { countryStatisticsQueryOptions, readMapDataDates } from "../../statsApi";
import { RelativeTime } from "@/components/ui/relative-time";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import i18n from "@/i18n/config";
import { formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StationSource } from "@/types/station";

type StationCounterProps = {
  locationCount: number;
  totalCount: number;
  radioLineCount: number;
  radioLineTotalCount: number;
  isRadioLinesFetching: boolean;
  showStations: boolean;
  zoom?: number;
  source: StationSource;
  mapCountries: MapCountries;
  onSourceChange: (source: StationSource) => void;
};

const SOURCE_CELL_CLASS = "px-2 py-1.5 flex items-center gap-1.5";
const SOURCE_LABEL_CLASS = "text-[8px] uppercase font-bold leading-none whitespace-nowrap";
const SOURCE_SURFACE_CLASS: Record<StationSource, string> = {
  internal: "bg-emerald-500/10",
  uke: "bg-violet-500/10",
};
const SOURCE_SWITCH_CLASS: Record<StationSource, string> = {
  internal: "cursor-pointer transition-colors hover:bg-emerald-500/20",
  uke: "cursor-pointer transition-colors hover:bg-violet-500/20",
};
const SOURCE_TEXT_CLASS: Record<StationSource, string> = {
  internal: "text-emerald-700 dark:text-emerald-400",
  uke: "text-violet-600 dark:text-violet-400",
};

export function StationCounter({
  locationCount,
  totalCount,
  radioLineCount,
  radioLineTotalCount,
  isRadioLinesFetching,
  showStations,
  zoom,
  source,
  mapCountries,
  onSourceChange,
}: StationCounterProps) {
  const { t } = useTranslation("main");
  const { t: tCommon } = useTranslation("common");
  const hasMoreLocations = totalCount > locationCount;
  const hasMoreRadioLines = radioLineTotalCount > radioLineCount;
  const showRadioLines = radioLineCount > 0 || isRadioLinesFetching;
  const { isRegisterOnScreen } = mapCountries;

  const { data: statistics } = useQuery({ ...countryStatisticsQueryOptions(), enabled: isRegisterOnScreen });
  const dataDates = readMapDataDates(statistics, mapCountries.onScreen);

  const sourceItems: { label: string; date: string | null; value: StationSource }[] = [
    { label: t("stats.internalData"), date: dataDates.database, value: "internal" },
    { label: tCommon("labels.ukePermits"), date: dataDates.register, value: "uke" },
  ];

  const sourceLabelClass = cn(SOURCE_LABEL_CLASS, SOURCE_TEXT_CLASS[source]);
  const zoomLabel = (
    <span className={sourceLabelClass}>
      {t("overlay.zoom")} {zoom?.toFixed(1) || "-"}
    </span>
  );

  function handleSourceSwitch() {
    onSourceChange(source === "internal" ? "uke" : "internal");
  }

  return (
    <div className="flex items-stretch shadow-xl rounded-lg overflow-hidden border bg-background/95 backdrop-blur-md">
      {showStations ? (
        <Tooltip>
          <TooltipTrigger
            className={cn("px-2 py-1.5 flex items-center gap-2 border-r border-border/50", hasMoreLocations && "cursor-help")}
            disabled={!hasMoreLocations}
          >
            <div className="flex items-baseline gap-1">
              <span className={cn("text-sm font-bold tabular-nums leading-none tracking-tight", hasMoreLocations && "text-amber-500")}>
                {locationCount.toLocaleString(i18n.language)}
              </span>
              <span className="text-[9px] font-bold text-muted-foreground leading-none uppercase tracking-wider">
                {t("overlay.locations", { count: locationCount })}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("overlay.moreStations", { total: totalCount, shown: locationCount })}</TooltipContent>
        </Tooltip>
      ) : null}
      {showRadioLines ? (
        <Tooltip>
          <TooltipTrigger
            className={cn("px-2 py-1.5 flex items-center gap-2 border-r border-border/50", hasMoreRadioLines && "cursor-help")}
            disabled={!hasMoreRadioLines}
          >
            <div className="flex items-baseline gap-1">
              <span className={cn("text-sm font-bold tabular-nums leading-none tracking-tight", hasMoreRadioLines && "text-amber-500")}>
                {radioLineCount.toLocaleString(i18n.language)}
              </span>
              <span className="text-[9px] font-bold text-muted-foreground leading-none uppercase tracking-wider">
                {t("overlay.radiolinesCount", { count: radioLineCount })}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("overlay.moreRadiolines", {
              total: radioLineTotalCount,
              shown: radioLineCount,
            })}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {isRegisterOnScreen ? (
        <Tooltip>
          <TooltipTrigger
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleSourceSwitch}
            className={cn(SOURCE_CELL_CLASS, SOURCE_SURFACE_CLASS[source], SOURCE_SWITCH_CLASS[source])}
          >
            <span className={sourceLabelClass}>{sourceItems.find((item) => item.value === source)?.label}</span>
            <span aria-hidden="true" className="w-px h-2 bg-border/60" />
            {zoomLabel}
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {sourceItems.map(({ label, date, value }) => (
              <p key={value} className={cn(source === value && "font-semibold")}>
                {label}: {date === null ? tCommon("status.never") : <RelativeTime date={date} />}
                {date === null ? null : <span className="text-background/60"> · {formatFullDate(date, i18n.language)}</span>}
              </p>
            ))}
          </TooltipContent>
        </Tooltip>
      ) : (
        <div className={cn(SOURCE_CELL_CLASS, SOURCE_SURFACE_CLASS[source])}>{zoomLabel}</div>
      )}
    </div>
  );
}
